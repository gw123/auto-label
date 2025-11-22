import React, { useRef, useState, MouseEvent } from 'react';
import { BBox, DatasetImage, LabelClass, ToolMode } from '../types';
import { yoloToSvg, svgToYolo } from '../services/yoloService';

interface CanvasProps {
  image: DatasetImage;
  currentLabelId: string;
  labels: LabelClass[];
  mode: ToolMode;
  zoom: number;
  pan: { x: number; y: number };
  onUpdateAnnotations: (annotations: BBox[]) => void;
  onPanChange: (x: number, y: number) => void;
  onSelectAnnotation: (id: string | null) => void;
  selectedAnnotationId: string | null;
  onMagicBoxSelect?: (rect: {x: number, y: number, w: number, h: number}) => void;
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
  onMagicBoxSelect
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
  
  const SNAP_DIST_PX = 12; // Snap distance in screen pixels

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
    // Sort for easier debugging/logic if needed, though not strictly required for finder
    return { xLines, yLines };
  };

  // --- Helper: Find closest snap line within threshold ---
  const getClosestSnap = (val: number, lines: number[], threshold: number) => {
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
    // Adjust for zoom and pan to get Image Space Coordinates
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  const handleMouseDown = (e: MouseEvent) => {
    const { x, y } = getMousePos(e);

    if (mode === ToolMode.PAN) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY }); // Screen coords for panning
      return;
    }

    // If clicking on empty space for creation
    if (mode === ToolMode.DRAW || mode === ToolMode.MAGIC_BOX) {
      setIsDragging(true);
      // For drawing, we start with 0 dims
      setActiveCreation({ x, y, w: 0, h: 0 });
      setDragStart({ x, y }); // Image coords for drawing
      onSelectAnnotation(null);
    } else if (mode === ToolMode.SELECT) {
      // Deselect if clicking empty space (propagation stopped by annotation click)
      onSelectAnnotation(null);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    // 1. Handle Panning (No snapping)
    if (mode === ToolMode.PAN && isDragging && dragStart) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      onPanChange(pan.x + dx, pan.y + dy);
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    const { x, y } = getMousePos(e);
    
    // Calculate threshold in Image Space
    // 10 screen pixels / zoom = X image pixels
    const threshold = SNAP_DIST_PX / zoom;
    
    let snapXVisual: number | null = null;
    let snapYVisual: number | null = null;

    // 2. Handle Creating New Box (DRAW or MAGIC)
    if ((mode === ToolMode.DRAW || mode === ToolMode.MAGIC_BOX) && isDragging && dragStart) {
      const { xLines, yLines } = getSnapLines(null);
      
      // We drag from dragStart to current (x,y). 
      // We want to snap the *current* cursor position to lines.
      const sx = getClosestSnap(x, xLines, threshold);
      const sy = getClosestSnap(y, yLines, threshold);
      
      if (sx.snapped) snapXVisual = sx.val;
      if (sy.snapped) snapYVisual = sy.val;
      
      const currentX = sx.val;
      const currentY = sy.val;

      // Calculate rect based on start and current (snapped)
      const minX = Math.min(dragStart.x, currentX);
      const minY = Math.min(dragStart.y, currentY);
      const w = Math.abs(currentX - dragStart.x);
      const h = Math.abs(currentY - dragStart.y);
      
      setActiveCreation({ x: minX, y: minY, w, h });
      setActiveSnapLines({ x: snapXVisual, y: snapYVisual });
      return;
    }

    // 3. Handle Resizing Existing Box
    if (mode === ToolMode.SELECT && resizeHandle && selectedAnnotationId) {
      const { xLines, yLines } = getSnapLines(selectedAnnotationId);
      
      // Snap cursor position
      const sx = getClosestSnap(x, xLines, threshold);
      const sy = getClosestSnap(y, yLines, threshold);
      
      if (sx.snapped) snapXVisual = sx.val;
      if (sy.snapped) snapYVisual = sy.val;
      
      const effX = sx.val;
      const effY = sy.val;

      const ann = image.annotations.find(a => a.id === selectedAnnotationId);
      if (ann) {
        const rect = yoloToSvg(ann, image.width, image.height);
        let newX = rect.x;
        let newY = rect.y;
        let newW = rect.w;
        let newH = rect.h;

        // Adjust dimensions based on handle
        if (resizeHandle === 'tl') {
          const brX = rect.x + rect.w;
          const brY = rect.y + rect.h;
          newX = Math.min(effX, brX - 5);
          newY = Math.min(effY, brY - 5);
          newW = brX - newX;
          newH = brY - newY;
        } else if (resizeHandle === 'tr') {
          const blX = rect.x;
          const blY = rect.y + rect.h;
          newY = Math.min(effY, blY - 5);
          newW = Math.max(effX - blX, 5);
          newH = blY - newY;
        } else if (resizeHandle === 'bl') {
          const trX = rect.x + rect.w;
          const trY = rect.y;
          newX = Math.min(effX, trX - 5);
          newW = trX - newX;
          newH = Math.max(effY - trY, 5);
        } else if (resizeHandle === 'br') {
          const tlX = rect.x;
          const tlY = rect.y;
          newW = Math.max(effX - tlX, 5);
          newH = Math.max(effY - tlY, 5);
        }

        const newYolo = svgToYolo(newX, newY, newW, newH, image.width, image.height);
        const updatedAnns = image.annotations.map(a => 
          a.id === ann.id ? { ...a, ...newYolo } : a
        );
        onUpdateAnnotations(updatedAnns);
      }
      setActiveSnapLines({ x: snapXVisual, y: snapYVisual });
      return;
    }

    // 4. Handle Moving Existing Box
    if (mode === ToolMode.SELECT && isDragging && draggingAnnotationId && initialMoveRect && dragStart) {
      const { xLines, yLines } = getSnapLines(draggingAnnotationId);
      
      // Delta from start of drag
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;

      // Raw proposed position
      let proposedX = initialMoveRect.x + dx;
      let proposedY = initialMoveRect.y + dy;

      // Check snaps for Left edge
      const snapLeft = getClosestSnap(proposedX, xLines, threshold);
      // Check snaps for Right edge
      const snapRight = getClosestSnap(proposedX + initialMoveRect.w, xLines, threshold);
      
      if (snapLeft.snapped) {
        proposedX = snapLeft.val;
        snapXVisual = snapLeft.val;
      } else if (snapRight.snapped) {
        proposedX = snapRight.val - initialMoveRect.w;
        snapXVisual = snapRight.val;
      }

      // Check snaps for Top edge
      const snapTop = getClosestSnap(proposedY, yLines, threshold);
      // Check snaps for Bottom edge
      const snapBottom = getClosestSnap(proposedY + initialMoveRect.h, yLines, threshold);

      if (snapTop.snapped) {
        proposedY = snapTop.val;
        snapYVisual = snapTop.val;
      } else if (snapBottom.snapped) {
        proposedY = snapBottom.val - initialMoveRect.h;
        snapYVisual = snapBottom.val;
      }

      // Update Annotation
      const newYolo = svgToYolo(proposedX, proposedY, initialMoveRect.w, initialMoveRect.h, image.width, image.height);
      
      const newAnns = image.annotations.map(a => {
        if (a.id === draggingAnnotationId) {
          return { ...a, ...newYolo };
        }
        return a;
      });
      
      onUpdateAnnotations(newAnns);
      setActiveSnapLines({ x: snapXVisual, y: snapYVisual });
    }
  };

  const handleMouseUp = () => {
    // Finalize Creation
    if (activeCreation) {
      if (activeCreation.w > 5 && activeCreation.h > 5) {
        
        if (mode === ToolMode.DRAW) {
          // Standard Draw
          const yoloBox = svgToYolo(
            activeCreation.x, activeCreation.y, 
            activeCreation.w, activeCreation.h, 
            image.width, image.height
          );
          const newAnn: BBox = {
            ...yoloBox,
            id: crypto.randomUUID(),
            labelId: currentLabelId
          };
          onUpdateAnnotations([...image.annotations, newAnn]);
          onSelectAnnotation(newAnn.id);

        } else if (mode === ToolMode.MAGIC_BOX && onMagicBoxSelect) {
          // Magic Box - Defer to parent
          onMagicBoxSelect(activeCreation);
        }
      }
      setActiveCreation(null);
    }

    setIsDragging(false);
    setDragStart(null);
    setDraggingAnnotationId(null);
    setInitialMoveRect(null);
    setResizeHandle(null);
    setActiveSnapLines({ x: null, y: null });
  };

  // Annotation Interactions
  const handleAnnMouseDown = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (mode === ToolMode.SELECT) {
      onSelectAnnotation(id);
      setIsDragging(true);
      
      const { x, y } = getMousePos(e);
      setDragStart({ x, y }); // Store image coord start
      
      // Store initial rect state for stable moving calculation
      const ann = image.annotations.find(a => a.id === id);
      if (ann) {
        setDraggingAnnotationId(id);
        setInitialMoveRect(yoloToSvg(ann, image.width, image.height));
      }
    }
  };

  const handleResizeStart = (e: MouseEvent, handle: ResizeHandleType) => {
    e.stopPropagation(); 
    setResizeHandle(handle);
    setIsDragging(true);
    // Drag start isn't strictly needed for resize logic here as we just track mouse pos relative to rect corners,
    // but keeping consistent state helps.
  };

  // Determine cursor
  let cursorClass = '';
  if (mode === ToolMode.PAN) cursorClass = isDragging ? 'cursor-grabbing' : 'cursor-grab';
  else if (mode === ToolMode.DRAW || mode === ToolMode.MAGIC_BOX) cursorClass = 'cursor-crosshair';
  else if (mode === ToolMode.SELECT) cursorClass = 'cursor-default';

  return (
    <div 
      className={`relative w-full h-full bg-neutral-900 overflow-hidden ${cursorClass}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        ref={containerRef}
        className="absolute origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: image.width,
          height: image.height
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Base Image */}
        <img 
          src={image.url} 
          alt="workspace" 
          className="absolute top-0 left-0 select-none pointer-events-none"
          style={{ width: '100%', height: '100%' }}
          draggable={false}
        />

        {/* SVG Overlay */}
        <svg 
          width={image.width} 
          height={image.height} 
          className="absolute top-0 left-0"
        >
          {/* Snap Lines */}
          {activeSnapLines.x !== null && (
            <line x1={activeSnapLines.x} y1={0} x2={activeSnapLines.x} y2={image.height} stroke="#06b6d4" strokeWidth={2/zoom} strokeDasharray={`${5/zoom}, ${5/zoom}`} />
          )}
          {activeSnapLines.y !== null && (
            <line x1={0} y1={activeSnapLines.y} x2={image.width} y2={activeSnapLines.y} stroke="#06b6d4" strokeWidth={2/zoom} strokeDasharray={`${5/zoom}, ${5/zoom}`} />
          )}

          {/* Existing Annotations */}
          {image.annotations.map(ann => {
            const { x, y, w, h } = yoloToSvg(ann, image.width, image.height);
            const label = labels.find(l => l.id === ann.labelId);
            const isSelected = selectedAnnotationId === ann.id;
            const color = label?.color || '#1d4ed8';

            return (
              <g key={ann.id}>
                <rect
                  x={x} y={y} width={w} height={h}
                  fill={color}
                  fillOpacity={isSelected ? 0.2 : 0.1}
                  stroke={color}
                  strokeWidth={isSelected ? 2 / zoom : 1.5 / zoom}
                  onMouseDown={(e) => handleAnnMouseDown(e, ann.id)}
                  className={`transition-all ${mode === ToolMode.SELECT ? 'cursor-move' : ''}`}
                />
                 <text
                    x={x}
                    y={y - 5 / zoom}
                    fill={color}
                    fontSize={14 / zoom}
                    fontWeight="bold"
                    className="select-none pointer-events-none"
                    style={{ textShadow: '0px 1px 2px black' }}
                  >
                    {label?.name}
                  </text>
                
                {/* Resize Handles */}
                {isSelected && mode === ToolMode.SELECT && (
                  <>
                    <circle cx={x} cy={y} r={5/zoom} fill="white" stroke={color} strokeWidth={1/zoom} className="cursor-nwse-resize" onMouseDown={(e) => handleResizeStart(e, 'tl')} />
                    <circle cx={x+w} cy={y} r={5/zoom} fill="white" stroke={color} strokeWidth={1/zoom} className="cursor-nesw-resize" onMouseDown={(e) => handleResizeStart(e, 'tr')} />
                    <circle cx={x} cy={y+h} r={5/zoom} fill="white" stroke={color} strokeWidth={1/zoom} className="cursor-nesw-resize" onMouseDown={(e) => handleResizeStart(e, 'bl')} />
                    <circle cx={x+w} cy={y+h} r={5/zoom} fill="white" stroke={color} strokeWidth={1/zoom} className="cursor-nwse-resize" onMouseDown={(e) => handleResizeStart(e, 'br')} />
                  </>
                )}
              </g>
            );
          })}

          {/* Creation Preview Box */}
          {activeCreation && (
             <rect
             x={activeCreation.x} y={activeCreation.y} 
             width={activeCreation.w} height={activeCreation.h}
             fill={mode === ToolMode.MAGIC_BOX ? "rgba(147, 51, 234, 0.2)" : "rgba(37, 99, 235, 0.3)"}
             stroke={mode === ToolMode.MAGIC_BOX ? "#9333ea" : "#1d4ed8"}
             strokeWidth={2 / zoom}
             strokeDasharray={mode === ToolMode.MAGIC_BOX ? "4 2" : ""}
             className={mode === ToolMode.MAGIC_BOX ? "animate-pulse" : ""}
           />
          )}
        </svg>
      </div>
    </div>
  );
};