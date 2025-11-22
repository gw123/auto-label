import React, { useRef, useState, MouseEvent, useEffect, useCallback } from 'react';
import { Undo, Redo } from 'lucide-react';
import { BBox, LoadedImage, LabelClass, ToolMode } from '../types';
import { yoloToSvg, svgToYolo } from '../services/yoloService';

interface CanvasProps {
  image: LoadedImage;
  currentLabelId: string;
  labels: LabelClass[];
  mode: ToolMode;
  zoom: number;
  pan: { x: number; y: number };
  onUpdateAnnotations: (annotations: BBox[]) => void;
  onPanChange: (x: number, y: number) => void;
  onSelectAnnotation: (id: string | null) => void;
  selectedAnnotationId: string | null;
  snapPixelDistance: number;
}

type ResizeHandleType = 'tl' | 'tr' | 'bl' | 'br';

export const Canvas: React.FC<CanvasProps> = ({
  image,
  currentLabelId,
  labels,
  mode,
  zoom,
  pan,
  onUpdateAnnotations,
  onPanChange,
  onSelectAnnotation,
  selectedAnnotationId,
  snapPixelDistance,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  
  // Creation State
  const [activeCreation, setActiveCreation] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  
  // Edit State
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandleType | null>(null);
  
  // Snapping State
  const [activeSnapLines, setActiveSnapLines] = useState<{x: number | null, y: number | null}>({x: null, y: null});
  const [initialMoveRect, setInitialMoveRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);

  // --- History State ---
  const [undoStack, setUndoStack] = useState<BBox[][]>([]);
  const [redoStack, setRedoStack] = useState<BBox[][]>([]);
  
  // Refs to track state for "smart" history (avoiding rapid updates during drag)
  const prevAnnotationsRef = useRef<BBox[]>(image.annotations);
  const prevImageIdRef = useRef<string>(image.id);
  const isHistoryAction = useRef<boolean>(false);
  const dragStartAnnotationsRef = useRef<BBox[]>(image.annotations);
  const isUndoRedo = useRef<boolean>(false);

  const SNAP_DIST_PX = snapPixelDistance; 

  // --- History Logic ---
  useEffect(() => {
    // 1. Image Switch: Reset History
    if (image.id !== prevImageIdRef.current) {
      setUndoStack([]);
      setRedoStack([]);
      prevImageIdRef.current = image.id;
      prevAnnotationsRef.current = image.annotations;
      return;
    }

    // 2. Change Detection
    if (image.annotations !== prevAnnotationsRef.current) {
      // If we are currently dragging (modifying), we suppress the automatic history push
      // We will manually push the start-state to history on MouseUp instead.
      if (isHistoryAction.current) {
        return;
      }

      // If this change wasn't caused by our own undo/redo function (e.g. Delete key, Auto Label, Draw)
      if (!isUndoRedo.current) {
         setUndoStack(prev => [...prev, prevAnnotationsRef.current]);
         setRedoStack([]);
      }

      prevAnnotationsRef.current = image.annotations;
      isUndoRedo.current = false;
    }
  }, [image.id, image.annotations]);

  const performUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevState = undoStack[undoStack.length - 1];
    
    isUndoRedo.current = true;
    setRedoStack(prev => [...prev, image.annotations]);
    setUndoStack(prev => prev.slice(0, -1));
    onUpdateAnnotations(prevState);
  }, [undoStack, image.annotations, onUpdateAnnotations]);

  const performRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    
    isUndoRedo.current = true;
    setUndoStack(prev => [...prev, image.annotations]);
    setRedoStack(prev => prev.slice(0, -1));
    onUpdateAnnotations(nextState);
  }, [redoStack, image.annotations, onUpdateAnnotations]);

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
       if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

       if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
         e.preventDefault();
         e.stopPropagation();
         if (e.shiftKey) performRedo();
         else performUndo();
       }
       else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
         e.preventDefault();
         e.stopPropagation();
         performRedo();
       }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performUndo, performRedo]);


  // --- Helper: Get all relevant snap lines (x and y) ---
  const getSnapLines = (excludeId: string | null) => {
    const xLines: number[] = [0, image.width];
    const yLines: number[] = [0, image.height];
    
    image.annotations.forEach(ann => {
      if (ann.id === excludeId) return;
      const rect = yoloToSvg(ann, image.width, image.height);
      xLines.push(rect.x, rect.x + rect.w);
      yLines.push(rect.y, rect.y + rect.h);
    });
    return { xLines, yLines };
  };

  // --- Helper: Find closest snap line within threshold ---
  const getClosestSnap = (val: number, lines: number[], threshold: number) => {
    if (SNAP_DIST_PX <= 0) return { val, snapped: false };
    let closest = val;
    let snapped = false;
    let minD = threshold;
    lines.forEach(line => {
      const d = Math.abs(val - line);
      if (d < minD) {
        minD = d;
        closest = line;
        snapped = true;
      }
    });
    return { val: closest, snapped };
  };

  // Mouse events for the drawing area
  const getMousePos = (e: MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  const handleMouseDown = (e: MouseEvent) => {
    const { x, y } = getMousePos(e);

    // Start History Action Snapshot
    // For DRAW or SELECT (drag), we flag that an interaction started.
    // This prevents useEffect from pushing intermediate states during drag.
    if (mode === ToolMode.DRAW || mode === ToolMode.SELECT) {
        dragStartAnnotationsRef.current = image.annotations;
        isHistoryAction.current = true; 
    }

    if (mode === ToolMode.PAN) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY }); 
      return;
    }

    if (mode === ToolMode.DRAW || mode === ToolMode.MAGIC_BOX) {
      setIsDragging(true);
      setActiveCreation({ x, y, w: 0, h: 0 });
      setDragStart({ x, y }); 
      onSelectAnnotation(null);
    } else if (mode === ToolMode.SELECT) {
      onSelectAnnotation(null);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (mode === ToolMode.PAN && isDragging && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      onPanChange(pan.x + dx, pan.y + dy);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const { x, y } = getMousePos(e);
    const threshold = SNAP_DIST_PX / zoom;
    
    let snapXVisual: number | null = null;
    let snapYVisual: number | null = null;

    if (mode === ToolMode.DRAW && isDragging && dragStart) {
      const { xLines, yLines } = getSnapLines(null);
      const sx = getClosestSnap(x, xLines, threshold);
      const sy = getClosestSnap(y, yLines, threshold);
      if (sx.snapped) snapXVisual = sx.val;
      if (sy.snapped) snapYVisual = sy.val;
      const currentX = sx.val;
      const currentY = sy.val;
      const minX = Math.min(dragStart.x, currentX);
      const minY = Math.min(dragStart.y, currentY);
      const w = Math.abs(currentX - dragStart.x);
      const h = Math.abs(currentY - dragStart.y);
      setActiveCreation({ x: minX, y: minY, w, h });
      setActiveSnapLines({ x: snapXVisual, y: snapYVisual });
      return;
    }

    if (mode === ToolMode.SELECT && resizeHandle && selectedAnnotationId) {
      const ann = image.annotations.find(a => a.id === selectedAnnotationId);
      if (ann) {
        const rect = yoloToSvg(ann, image.width, image.height);
        const { xLines, yLines } = getSnapLines(selectedAnnotationId);
        let newX = rect.x, newY = rect.y, newW = rect.w, newH = rect.h;
        const sx = getClosestSnap(x, xLines, threshold);
        const sy = getClosestSnap(y, yLines, threshold);
        if (sx.snapped) snapXVisual = sx.val;
        if (sy.snapped) snapYVisual = sy.val;
        const mx = sx.val, my = sy.val;

        if (resizeHandle === 'tl') { newW = (rect.x + rect.w) - mx; newH = (rect.y + rect.h) - my; newX = mx; newY = my; }
        else if (resizeHandle === 'tr') { newW = mx - rect.x; newH = (rect.y + rect.h) - my; newY = my; }
        else if (resizeHandle === 'bl') { newW = (rect.x + rect.w) - mx; newH = my - rect.y; newX = mx; }
        else if (resizeHandle === 'br') { newW = mx - rect.x; newH = my - rect.y; }

        if (newW > 0 && newH > 0) {
          const newYolo = svgToYolo(newX, newY, newW, newH, image.width, image.height);
          const updated = image.annotations.map(a => a.id === selectedAnnotationId ? { ...a, ...newYolo } : a);
          onUpdateAnnotations(updated);
        }
        setActiveSnapLines({ x: snapXVisual, y: snapYVisual });
      }
      return;
    }

    if (mode === ToolMode.SELECT && draggingAnnotationId && initialMoveRect && dragStart) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      let newX = initialMoveRect.x + dx;
      let newY = initialMoveRect.y + dy;
      const { xLines, yLines } = getSnapLines(draggingAnnotationId);
      const snapL = getClosestSnap(newX, xLines, threshold);
      const snapR = getClosestSnap(newX + initialMoveRect.w, xLines, threshold);
      const snapT = getClosestSnap(newY, yLines, threshold);
      const snapB = getClosestSnap(newY + initialMoveRect.h, yLines, threshold);
      if (snapL.snapped) { newX = snapL.val; snapXVisual = snapL.val; }
      else if (snapR.snapped) { newX = snapR.val - initialMoveRect.w; snapXVisual = snapR.val; }
      if (snapT.snapped) { newY = snapT.val; snapYVisual = snapT.val; }
      else if (snapB.snapped) { newY = snapB.val - initialMoveRect.h; snapYVisual = snapB.val; }

      const newYolo = svgToYolo(newX, newY, initialMoveRect.w, initialMoveRect.h, image.width, image.height);
      const updated = image.annotations.map(a => a.id === draggingAnnotationId ? { ...a, ...newYolo } : a);
      onUpdateAnnotations(updated);
      setActiveSnapLines({ x: snapXVisual, y: snapYVisual });
    }

    if (!isDragging && !resizeHandle && !draggingAnnotationId) {
        setActiveSnapLines({ x: null, y: null });
    }
  };

  const handleMouseUp = () => {
    // Commit History for Move/Resize interactions
    if (isHistoryAction.current) {
        // If the annotations actually changed during this drag
        if (image.annotations !== dragStartAnnotationsRef.current) {
             setUndoStack(prev => [...prev, dragStartAnnotationsRef.current]);
             setRedoStack([]);
             // Manually update prevAnnotations so useEffect doesn't double-add
             prevAnnotationsRef.current = image.annotations;
        }
        isHistoryAction.current = false;
    }

    if (mode === ToolMode.DRAW && activeCreation) {
      if (activeCreation.w > 5 && activeCreation.h > 5) {
        const newYolo = svgToYolo(activeCreation.x, activeCreation.y, activeCreation.w, activeCreation.h, image.width, image.height);
        const newAnn: BBox = {
          id: crypto.randomUUID(),
          labelId: currentLabelId,
          ...newYolo
        };
        onUpdateAnnotations([...image.annotations, newAnn]);
        onSelectAnnotation(newAnn.id);
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setActiveCreation(null);
    setDraggingAnnotationId(null);
    setResizeHandle(null);
    setInitialMoveRect(null);
    setActiveSnapLines({x: null, y: null});
  };

  const handleAnnotationMouseDown = (e: MouseEvent, id: string) => {
    if (mode !== ToolMode.SELECT) return;
    e.stopPropagation();
    onSelectAnnotation(id);
    
    const ann = image.annotations.find(a => a.id === id);
    if (ann) {
      // Start Drag History
      dragStartAnnotationsRef.current = image.annotations;
      isHistoryAction.current = true;

      setDraggingAnnotationId(id);
      const rect = yoloToSvg(ann, image.width, image.height);
      setInitialMoveRect(rect);
      const { x, y } = getMousePos(e);
      setDragStart({ x, y });
    }
  };

  const handleResizeMouseDown = (e: MouseEvent, handle: ResizeHandleType, id: string) => {
    if (mode !== ToolMode.SELECT) return;
    e.stopPropagation();
    
    // Start Resize History
    dragStartAnnotationsRef.current = image.annotations;
    isHistoryAction.current = true;

    setResizeHandle(handle);
    setDraggingAnnotationId(null);
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#111] cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div 
        className="absolute transform-gpu origin-top-left"
        style={{ 
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: image.width,
          height: image.height
        }}
      >
        <img 
          src={image.url} 
          alt="work" 
          className="w-full h-full object-contain pointer-events-none select-none" 
          draggable={false}
        />

        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          {image.annotations.map(ann => {
            const rect = yoloToSvg(ann, image.width, image.height);
            const label = labels.find(l => l.id === ann.labelId);
            const isSelected = ann.id === selectedAnnotationId;
            const color = label?.color || '#fff';

            return (
              <g key={ann.id} className="pointer-events-auto" onMouseDown={(e) => handleAnnotationMouseDown(e, ann.id)}>
                {isSelected && (
                   <rect x={rect.x-2} y={rect.y-2} width={rect.w+4} height={rect.h+4} fill="none" stroke="white" strokeWidth="2" opacity="0.5" />
                )}
                <rect 
                  x={rect.x} y={rect.y} width={rect.w} height={rect.h} 
                  fill={color} fillOpacity={isSelected ? 0.2 : 0.1}
                  stroke={color} strokeWidth={isSelected ? 2 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <g transform={`translate(${rect.x}, ${rect.y - 4})`}>
                   <rect x="0" y="-16" width={label?.name.length ? label.name.length * 8 + 10 : 40} height="16" fill={color} rx="2" />
                   <text x="4" y="-4" fill="white" fontSize="10" fontWeight="bold" fontFamily="monospace">{label?.name}</text>
                </g>

                {isSelected && mode === ToolMode.SELECT && (
                  <>
                    <circle cx={rect.x} cy={rect.y} r={4 / zoom} fill="white" stroke={color} strokeWidth={1} className="cursor-nw-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'tl', ann.id)} />
                    <circle cx={rect.x + rect.w} cy={rect.y} r={4 / zoom} fill="white" stroke={color} strokeWidth={1} className="cursor-ne-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'tr', ann.id)} />
                    <circle cx={rect.x} cy={rect.y + rect.h} r={4 / zoom} fill="white" stroke={color} strokeWidth={1} className="cursor-sw-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'bl', ann.id)} />
                    <circle cx={rect.x + rect.w} cy={rect.y + rect.h} r={4 / zoom} fill="white" stroke={color} strokeWidth={1} className="cursor-se-resize" onMouseDown={(e) => handleResizeMouseDown(e, 'br', ann.id)} />
                  </>
                )}
              </g>
            );
          })}

          {activeCreation && (
            <rect 
              x={activeCreation.x} y={activeCreation.y} width={activeCreation.w} height={activeCreation.h}
              fill="none" stroke="white" strokeWidth="1" strokeDasharray="4"
            />
          )}
          
          {activeSnapLines.x !== null && (
            <line 
                x1={activeSnapLines.x} y1={0} x2={activeSnapLines.x} y2={image.height} 
                stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="6 4" 
            />
          )}
          {activeSnapLines.y !== null && (
            <line 
                x1={0} y1={activeSnapLines.y} x2={image.width} y2={activeSnapLines.y} 
                stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="6 4" 
            />
          )}
        </svg>
      </div>

      {/* Undo/Redo Floating Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-neutral-800/90 backdrop-blur border border-neutral-700 p-1.5 rounded-full flex gap-2 z-20 shadow-xl">
        <button 
            className={`p-2 rounded-full hover:bg-white/10 transition-colors ${undoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
            onClick={(e) => { e.stopPropagation(); performUndo(); }}
            disabled={undoStack.length === 0}
            title="Undo (Ctrl+Z)"
        >
            <Undo size={16} className="text-neutral-200" />
        </button>
        <div className="w-px bg-neutral-600 h-6 my-auto"></div>
        <button 
            className={`p-2 rounded-full hover:bg-white/10 transition-colors ${redoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
            onClick={(e) => { e.stopPropagation(); performRedo(); }}
            disabled={redoStack.length === 0}
            title="Redo (Ctrl+Shift+Z)"
        >
            <Redo size={16} className="text-neutral-200" />
        </button>
      </div>
    </div>
  );
};