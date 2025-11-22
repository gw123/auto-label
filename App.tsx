import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Upload, Download, Plus, Trash2, ZoomIn, ZoomOut, 
  MousePointer, Square, Move, Brain, Settings, Layout,
  Image as ImageIcon, Check, Save, Package, CircleHelp,
  Target, Cpu, Layers, Database
} from 'lucide-react';
import JSZip from 'jszip';
import { Canvas } from './components/Canvas';
import { HelpModal } from './components/HelpModal';
import { SettingsModal } from './components/ModelManagerModal';
import { AILogModal } from './components/AILogModal';
import { ImageSidebar } from './components/ImageSidebar';
import { ImageMetadata, LoadedImage, LabelClass, ToolMode, YOLOConfig, BBox, AIModel, DEFAULT_MODELS, LogEntry, StoredImage } from './types';
import { DEFAULT_LABELS, DEFAULT_YOLO_CONFIG, COLORS } from './constants';
import { autoLabelImage, analyzeImageForSpecificLabel } from './services/geminiService';
import { generateYoloAnnotation, generateDataYaml, generateTrainingScript } from './services/yoloService';
import { dbService } from './services/db';

// --- ToolButton Component for UX ---
interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hotkey?: string;
  description: string;
  disabled?: boolean;
}

const ToolButton: React.FC<ToolButtonProps> = ({ active, onClick, icon, title, hotkey, description, disabled }) => {
  return (
    <div className="group relative flex justify-center">
      <button 
        onClick={onClick}
        disabled={disabled}
        className={`p-2 rounded flex justify-center transition-all duration-200 ${
          active 
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50 ring-1 ring-blue-400/50' 
            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
        } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
      >
        {icon}
      </button>
      
      {/* Tooltip */}
      <div className="absolute left-full top-0 ml-3 w-48 p-3 bg-neutral-900/95 backdrop-blur border border-neutral-700 rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none translate-x-[-10px] group-hover:translate-x-0">
        <div className="flex justify-between items-center mb-1">
          <span className="font-semibold text-sm text-white">{title}</span>
          {hotkey && <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-700 font-mono text-neutral-400">{hotkey}</span>}
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">{description}</p>
        {/* Arrow */}
        <div className="absolute top-3 -left-1 w-2 h-2 bg-neutral-900 border-l border-b border-neutral-700 transform rotate-45"></div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  // State: Data (Metadata only, heavy data in IDB)
  const [images, setImages] = useState<ImageMetadata[]>([]);
  
  // Canvas State: Single Loaded Image
  const [currentImage, setCurrentImage] = useState<LoadedImage | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // Selection
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());

  // Labels
  const [labels, setLabels] = useState<LabelClass[]>(DEFAULT_LABELS);
  const [currentLabelId, setCurrentLabelId] = useState<string>(DEFAULT_LABELS[0].id);
  
  // UI State
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.SELECT);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [snapDistance, setSnapDistance] = useState(15);
  const [activeTab, setActiveTab] = useState<'editor' | 'train'>('editor');
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false); // For Import/Export
  const [processMessage, setProcessMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // AI Models & Logging
  const [models, setModels] = useState<AIModel[]>(DEFAULT_MODELS);
  const [activeModelId, setActiveModelId] = useState<string>(DEFAULT_MODELS[0].id);
  const [aiLogs, setAiLogs] = useState<LogEntry[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);

  // Drag & Drop
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  
  // Config
  const [yoloConfig, setYoloConfig] = useState<YOLOConfig>(DEFAULT_YOLO_CONFIG);
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  const editorRef = useRef<HTMLElement>(null);
  const currentLabel = labels.find(l => l.id === currentLabelId);
  const activeModel = models.find(m => m.id === activeModelId) || models[0];

  // Init: Load Metadata from DB
  useEffect(() => {
    const init = async () => {
      try {
        const meta = await dbService.getAllMetadata();
        setImages(meta);
        if (meta.length > 0 && !selectedImageId) {
            setSelectedImageId(meta[0].id);
            setSelectedImageIds(new Set([meta[0].id]));
        }
      } catch (e) {
        console.error("DB Init Error", e);
      }
    };
    
    const savedModels = localStorage.getItem('yolo_studio_models');
    const savedActiveId = localStorage.getItem('yolo_studio_active_model');
    if (savedModels) {
        try { const parsed = JSON.parse(savedModels); if (Array.isArray(parsed)) setModels(parsed); } catch (e) {}
    }
    if (savedActiveId) setActiveModelId(savedActiveId);

    init();
  }, []);

  // Load Current Image from IDB when selectedImageId changes
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const loadImg = async () => {
      if (!selectedImageId) {
        setCurrentImage(null);
        return;
      }
      setIsLoadingImage(true);
      try {
        const stored = await dbService.getImage(selectedImageId);
        if (active && stored) {
           objectUrl = URL.createObjectURL(stored.blob);
           setCurrentImage({ ...stored, url: objectUrl });
        }
      } catch (e) {
        console.error("Failed to load image blob", e);
      } finally {
        if (active) setIsLoadingImage(false);
      }
    };
    loadImg();

    return () => {
      active = false;
      if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedImageId]);

  // Auto-fit zoom
  useEffect(() => {
    if (currentImage && editorRef.current && currentImage.width > 0 && currentImage.height > 0) {
      const { clientWidth, clientHeight } = editorRef.current;
      if (currentImage.width > clientWidth || currentImage.height > clientHeight) {
        setZoom(Math.min(clientWidth / currentImage.width, clientHeight / currentImage.height) * 0.9);
      } else {
        setZoom(1);
      }
      setPan({ x: 0, y: 0 });
    }
  }, [currentImage?.id]);

  const handleSaveModels = (newModels: AIModel[]) => {
    setModels(newModels);
    localStorage.setItem('yolo_studio_models', JSON.stringify(newModels));
  };

  const handleSetActiveModel = (id: string) => {
    setActiveModelId(id);
    localStorage.setItem('yolo_studio_active_model', id);
  };

  // Image Selection Logic
  const handleImageClick = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let newSet = new Set(selectedImageIds);
    let newActiveId = id;

    if (e.metaKey || e.ctrlKey) {
      if (newSet.has(id)) {
        newSet.delete(id);
        if (selectedImageId === id) {
           const others = Array.from(newSet);
           newActiveId = others.length > 0 ? others[others.length - 1] : id;
        } else {
           newActiveId = selectedImageId || id;
        }
      } else {
        newSet.add(id);
        newActiveId = id;
      }
    } else if (e.shiftKey && selectedImageId) {
      const startIdx = images.findIndex(img => img.id === selectedImageId);
      const endIdx = images.findIndex(img => img.id === id);
      if (startIdx !== -1 && endIdx !== -1) {
        newSet.clear();
        const low = Math.min(startIdx, endIdx);
        const high = Math.max(startIdx, endIdx);
        for(let i=low; i<=high; i++) newSet.add(images[i].id);
        newActiveId = id;
      } else {
        newSet.add(id);
        newActiveId = id;
      }
    } else {
      newSet.clear();
      newSet.add(id);
      newActiveId = id;
    }
    setSelectedImageIds(newSet);
    setSelectedImageId(newActiveId);
  }, [images, selectedImageId, selectedImageIds]);

  // --- Optimized Batch Import ---
  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setProcessMessage(`Preparing to import ${files.length} images...`);

    const CHUNK_SIZE = 20; // Process in chunks to keep UI responsive
    const newMetadata: ImageMetadata[] = [];

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        const processedChunk: StoredImage[] = [];
        
        await Promise.all(chunk.map(async (file) => {
            if (!file.type.startsWith('image/')) return;
            // We need dimensions. Create bitmap or image to check.
            try {
                const bmp = await createImageBitmap(file);
                const id = crypto.randomUUID();
                processedChunk.push({
                    id,
                    name: file.name,
                    width: bmp.width,
                    height: bmp.height,
                    status: 'unlabeled',
                    annotationCount: 0,
                    blob: file,
                    annotations: []
                });
            } catch(e) {
                console.warn("Failed to read image", file.name);
            }
        }));

        // Write to DB
        await dbService.addImages(processedChunk);
        
        // Add to local metadata state list
        processedChunk.forEach(img => {
            newMetadata.push({
                id: img.id,
                name: img.name,
                width: img.width,
                height: img.height,
                status: img.status,
                annotationCount: img.annotationCount
            });
        });

        setProcessMessage(`Imported ${Math.min(i + CHUNK_SIZE, files.length)} / ${files.length}...`);
        // Small delay to allow UI render
        await new Promise(r => setTimeout(r, 10));
    }

    setImages(prev => [...prev, ...newMetadata]);
    if (newMetadata.length > 0 && !selectedImageId) {
        setSelectedImageId(newMetadata[0].id);
        setSelectedImageIds(new Set([newMetadata[0].id]));
    }
    setIsProcessing(false);
  };

  const handleZipUpload = async (file: File) => {
    setIsProcessing(true);
    setProcessMessage("Reading ZIP directory...");
    try {
      const zip = new JSZip();
      const content = await zip.loadAsync(file);
      const files: any[] = Object.values(content.files);
      const validFiles = files.filter(f => !f.dir && f.name.match(/\.(jpg|jpeg|png|webp|bmp)$/i) && !f.name.includes('__MACOSX'));
      
      setProcessMessage(`Found ${validFiles.length} images. Extracting...`);
      
      const CHUNK_SIZE = 10;
      const newMetadata: ImageMetadata[] = [];

      for (let i = 0; i < validFiles.length; i+= CHUNK_SIZE) {
          const chunk = validFiles.slice(i, i + CHUNK_SIZE);
          const processedChunk: StoredImage[] = [];

          await Promise.all(chunk.map(async (f) => {
             try {
                const blob = await f.async('blob');
                const bmp = await createImageBitmap(blob);
                const name = f.name.split('/').pop() || 'image.jpg';
                const id = crypto.randomUUID();
                processedChunk.push({
                    id, name, width: bmp.width, height: bmp.height,
                    status: 'unlabeled', annotationCount: 0,
                    blob, annotations: []
                });
             } catch(e) {}
          }));

          await dbService.addImages(processedChunk);
          processedChunk.forEach(img => {
             newMetadata.push({ id: img.id, name: img.name, width: img.width, height: img.height, status: img.status, annotationCount: 0 });
          });
          
          setProcessMessage(`Importing ZIP: ${Math.min(i + CHUNK_SIZE, validFiles.length)} / ${validFiles.length}`);
          await new Promise(r => setTimeout(r, 10));
      }

      setImages(prev => [...prev, ...newMetadata]);
      if (newMetadata.length > 0 && !selectedImageId) {
          setSelectedImageId(newMetadata[0].id);
          setSelectedImageIds(new Set([newMetadata[0].id]));
      }

    } catch (e) {
      alert("Error reading ZIP");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const zipFile = files.find(f => f.name.endsWith('.zip'));
      if (zipFile) { handleZipUpload(zipFile); return; }
      processFiles(files);
      e.target.value = ''; 
    }
  };

  // Drag Handlers
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current += 1; setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current -= 1; if (dragCounter.current === 0) setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0; if (e.dataTransfer.files.length > 0) handleFileUpload({ target: { files: e.dataTransfer.files } } as any); };

  const handleDeleteSelectedImages = async () => {
    if (selectedImageIds.size === 0) return;
    const ids = Array.from(selectedImageIds);
    if (!window.confirm(`Delete ${ids.length} images permanently?`)) return;
    
    await dbService.deleteImages(ids);
    const newImages = images.filter(img => !selectedImageIds.has(img.id));
    setImages(newImages);
    
    setSelectedImageIds(new Set());
    if (newImages.length > 0) {
        setSelectedImageId(newImages[0].id);
        setSelectedImageIds(new Set([newImages[0].id]));
    } else {
        setSelectedImageId(null);
    }
  };

  const handleDeleteLabel = (labelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (labels.length <= 1) return alert("At least one class required.");
    if (!window.confirm("Delete this class? Existing annotations will be removed.")) return;
    const newLabels = labels.filter(l => l.id !== labelId);
    setLabels(newLabels);
    // Note: We are not strictly scrubbing DB for efficiency, but UI will handle it.
    if (currentLabelId === labelId) setCurrentLabelId(newLabels[0].id);
  };

  const updateAnnotations = async (newAnnotations: BBox[]) => {
    if (!selectedImageId || !currentImage) return;
    
    // Optimistic UI Update for Canvas
    setCurrentImage(prev => prev ? { ...prev, annotations: newAnnotations } : null);
    
    // Update Metadata list state
    setImages(prev => prev.map(img => img.id === selectedImageId ? { 
        ...img, 
        annotationCount: newAnnotations.length, 
        status: newAnnotations.length > 0 ? 'in-progress' : 'unlabeled' 
    } : img));

    // Persist to DB
    await dbService.updateImageAnnotations(selectedImageId, newAnnotations);
  };

  const handleDeleteAnnotation = () => {
    if (selectedAnnId && currentImage) {
      const newAnns = currentImage.annotations.filter(a => a.id !== selectedAnnId);
      updateAnnotations(newAnns);
      setSelectedAnnId(null);
    }
  };

  // --- AI Integration ---
  const appendLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' });
    setAiLogs(prev => [...prev, { timestamp, message, type }]);
  };

  // Optimized AI processing using DB reading
  const runBatchAI = async (specificLabel?: LabelClass) => {
    const targetIds = Array.from(selectedImageIds);
    if (targetIds.length === 0) return;

    setIsProcessingAI(true);
    setAiLogs([]);
    setShowLogModal(true);
    
    const isBatch = targetIds.length > 1;
    let successCount = 0;

    try {
      for (let i = 0; i < targetIds.length; i++) {
         const id = targetIds[i];
         // Fetch full data from DB
         const fullImage = await dbService.getImage(id);
         if (!fullImage) continue;

         const loadedImage: LoadedImage = { ...fullImage, url: '' }; // URL not needed for AI service which takes blob, but type needs match

         const progressStr = isBatch ? `[${i+1}/${targetIds.length}] ` : '';
         appendLog(`${progressStr}Loading: ${fullImage.name}`, 'info');

         try {
            let newAnns: BBox[] = [];
            if (specificLabel) {
                newAnns = await analyzeImageForSpecificLabel(loadedImage, specificLabel, activeModel, process.env.API_KEY, appendLog);
            } else {
                newAnns = await autoLabelImage(loadedImage, labels, activeModel, process.env.API_KEY, appendLog);
            }

            // Merge with existing if needed, or replace? Usually replace or append. Let's append.
            const mergedAnns = [...fullImage.annotations, ...newAnns];
            
            // Save to DB
            await dbService.updateImageAnnotations(id, mergedAnns);
            
            // Update Metadata State
            setImages(prev => prev.map(p => p.id === id ? { 
                ...p, 
                annotationCount: mergedAnns.length, 
                status: mergedAnns.length > 0 ? 'in-progress' : 'unlabeled' 
            } : p));
            
            // If this is the currently viewed image, update it too
            if (currentImage?.id === id) {
                setCurrentImage(prev => prev ? { ...prev, annotations: mergedAnns } : null);
            }

            successCount++;
         } catch (err: any) {
            appendLog(`Failed ${fullImage.name}: ${err.message}`, 'warning');
         }
      }
      appendLog(`Batch Finished. Success: ${successCount}/${targetIds.length}`, 'success');
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleDownloadFullDataset = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    setProcessMessage("Initializing export...");
    
    try {
      const zip = new JSZip();
      const root = zip.folder("yolo_dataset");
      if (!root) throw new Error("Error");
      const trainImgs = root.folder("train")?.folder("images");
      const trainLbls = root.folder("train")?.folder("labels");
      const valImgs = root.folder("val")?.folder("images");
      const valLbls = root.folder("val")?.folder("labels");

      // Fetch and add files sequentially to save memory
      for (let i = 0; i < images.length; i++) {
          const meta = images[i];
          const img = await dbService.getImage(meta.id);
          if (!img) continue;

          const isVal = i % 5 === 0; 
          const targetImgFolder = isVal ? valImgs : trainImgs;
          const targetLblFolder = isVal ? valLbls : trainLbls;

          if (targetImgFolder && targetLblFolder) {
              targetImgFolder.file(img.name, img.blob);
              targetLblFolder.file(
                  img.name.replace(/\.[^/.]+$/, "") + ".txt", 
                  generateYoloAnnotation(img.annotations, labels)
              );
          }
          
          if (i % 50 === 0) {
              setProcessMessage(`Adding files to ZIP: ${i}/${images.length}`);
              await new Promise(r => setTimeout(r, 0)); // yield
          }
      }

      root.file("data.yaml", generateDataYaml(labels));
      root.file("train.py", generateTrainingScript(yoloConfig));
      
      setProcessMessage("Compressing ZIP (this may take a while)...");
      // Use stream or blob. Blob is easier but memory heavy. For 10k, browser might crash on 2GB limit.
      // Ideally we'd use a streamSaver, but that's complex. Standard Blob for now.
      const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
          setProcessMessage(`Compressing: ${metadata.percent.toFixed(1)}%`);
      });

      const url = URL.createObjectURL(content);
      const a = document.createElement('a'); a.href = url; a.download = `dataset.zip`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e) { 
        console.error(e); 
        alert("Export failed (Dataset might be too large for browser memory)."); 
    } finally { 
        setIsProcessing(false); 
    }
  };

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeTab === 'editor') {
          if (selectedAnnId) handleDeleteAnnotation();
      }
      if (e.key === 'v') setToolMode(ToolMode.SELECT);
      if (e.key === 'r') setToolMode(ToolMode.DRAW);
      if (e.key === 'h') setToolMode(ToolMode.PAN);
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
          e.preventDefault();
          const allIds = new Set(images.map(i => i.id));
          setSelectedImageIds(allIds);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnId, currentImage, activeTab, images]);

  return (
    <div 
      className="flex flex-col h-screen w-full bg-neutral-900 text-white"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-[100] bg-blue-500/20 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-2xl flex items-center justify-center pointer-events-none">
           <div className="text-2xl font-bold">Drop Images / ZIP Here</div>
        </div>
      )}

      {/* Global Loading Overlay */}
      {isProcessing && (
          <div className="fixed inset-0 z-[200] bg-black/80 flex flex-col items-center justify-center">
              <div className="animate-spin text-blue-500 mb-4"><Cpu size={48} /></div>
              <h3 className="text-xl font-bold">{processMessage}</h3>
          </div>
      )}

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
        models={models} 
        onSaveModels={handleSaveModels} 
        activeModelId={activeModelId} 
        onSetActiveModel={handleSetActiveModel} 
        snapDistance={snapDistance}
        setSnapDistance={setSnapDistance}
      />
      <AILogModal isOpen={showLogModal} onClose={() => setShowLogModal(false)} logs={aiLogs} isProcessing={isProcessingAI} />

      <header className="h-14 border-b border-neutral-800 flex items-center justify-between px-4 bg-neutral-950 relative z-10">
        <div className="flex items-center gap-2">
          <Layout className="w-6 h-6 text-blue-500" />
          <h1 className="font-bold text-lg tracking-tight">YOLOv11 <span className="text-neutral-400 font-normal">Studio</span></h1>
        </div>
        <div className="flex bg-neutral-900 rounded-lg p-1 border border-neutral-800">
          <button onClick={() => setActiveTab('editor')} className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'editor' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>Editor</button>
          <button onClick={() => setActiveTab('train')} className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'train' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}>Train / Export</button>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-2 py-1 bg-neutral-900 rounded border border-neutral-800 text-xs text-neutral-400">
            <Cpu size={12} />
            <span className="truncate max-w-[100px]">{activeModel.name}</span>
          </div>
          <div className="w-px h-4 bg-neutral-800 hidden md:block"></div>
          <button onClick={() => setShowSettings(true)} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors" title="Settings & Models"><Settings size={20} /></button>
          <button onClick={() => setShowHelp(true)} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors" title="Help"><CircleHelp size={20} /></button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Tools Sidebar */}
        <aside className="w-64 border-r border-neutral-800 bg-neutral-900 flex flex-col z-10">
          <div className="p-4 border-b border-neutral-800 grid grid-cols-4 gap-2">
             <ToolButton active={toolMode === ToolMode.SELECT} onClick={() => setToolMode(ToolMode.SELECT)} icon={<MousePointer size={18} />} title="Select" description="Select box" />
             <ToolButton active={toolMode === ToolMode.DRAW} onClick={() => setToolMode(ToolMode.DRAW)} icon={<Square size={18} />} title="Draw" description="Draw box" />
             <ToolButton active={toolMode === ToolMode.PAN} onClick={() => setToolMode(ToolMode.PAN)} icon={<Move size={18} />} title="Pan" description="Pan canvas" />
             <ToolButton active={false} onClick={handleDeleteAnnotation} disabled={!selectedAnnId} icon={<Trash2 size={18} />} title="Delete" description="Delete box" />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-neutral-400 uppercase">Classes</h3>
              <button className="p-1 hover:bg-neutral-800 rounded" onClick={() => setLabels([...labels, { id: crypto.randomUUID(), name: 'new_class', color: COLORS[labels.length % COLORS.length] }])}><Plus size={16} /></button>
            </div>
            <div className="space-y-2">
              {labels.map(label => (
                <div key={label.id} onClick={() => setCurrentLabelId(label.id)} className={`flex items-center p-2 rounded border cursor-pointer ${currentLabelId === label.id ? 'bg-neutral-800 border-neutral-700' : 'border-transparent hover:bg-neutral-800/50'}`}>
                    <div className="w-3 h-3 rounded-full mr-3" style={{ backgroundColor: label.color }}></div>
                    <input className="bg-transparent text-sm w-full outline-none" value={label.name} onChange={e => setLabels(l => l.map(x => x.id === label.id ? { ...x, name: e.target.value } : x))} />
                    <button onClick={(e) => handleDeleteLabel(label.id, e)} className="ml-2 p-1 hover:text-red-400"><Trash2 size={12}/></button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-neutral-800 space-y-2">
             <h3 className="text-xs font-semibold text-neutral-400 uppercase flex items-center gap-1"><Cpu size={12} /> AI Auto-Label</h3>
             <p className="text-[10px] text-neutral-500 mb-2 truncate">Using: {activeModel.name}</p>
             
             <button disabled={selectedImageIds.size === 0 || isProcessingAI} onClick={() => runBatchAI()} className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg flex items-center justify-center gap-2 font-medium text-xs border border-neutral-700 disabled:opacity-50 transition-all">
                {isProcessingAI ? <span className="animate-pulse">Processing...</span> : <><Brain size={16} /><span>{selectedImageIds.size > 1 ? `Batch Label (${selectedImageIds.size})` : 'Auto-Label Image'}</span></>}
             </button>
             <button disabled={selectedImageIds.size === 0 || isProcessingAI} onClick={() => runBatchAI(currentLabel)} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center justify-center gap-2 font-medium text-xs disabled:opacity-50 transition-all">
                {isProcessingAI ? <span className="animate-pulse">Processing...</span> : <><Target size={16} /><span>Label {currentLabel?.name}</span></>}
             </button>
          </div>
        </aside>

        {/* Main Canvas Area */}
        <main className="flex-1 bg-neutral-950 relative flex flex-col" ref={editorRef}>
          {activeTab === 'editor' ? (
            <>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-neutral-800/90 backdrop-blur border border-neutral-700 p-1.5 rounded-full flex gap-2 z-20 shadow-xl">
                 <button className="p-2 hover:bg-white/10 rounded-full" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}><ZoomOut size={16}/></button>
                 <span className="px-2 text-xs font-mono min-w-[3rem] text-center flex items-center justify-center">{Math.round(zoom * 100)}%</span>
                 <button className="p-2 hover:bg-white/10 rounded-full" onClick={() => setZoom(z => z + 0.1)}><ZoomIn size={16}/></button>
                 <div className="w-px bg-neutral-600 h-6 my-auto"></div>
                 <button className="p-2 hover:bg-white/10 rounded-full" onClick={() => setPan({x:0, y:0})}><Layout size={16}/></button>
              </div>

              {isLoadingImage ? (
                  <div className="w-full h-full flex items-center justify-center"><div className="animate-spin text-blue-500"><Cpu/></div></div>
              ) : currentImage ? (
                <Canvas 
                  image={currentImage} currentLabelId={currentLabelId} labels={labels} mode={toolMode} zoom={zoom} pan={pan}
                  onUpdateAnnotations={updateAnnotations} onPanChange={(x, y) => setPan({x, y})} onSelectAnnotation={setSelectedAnnId} selectedAnnotationId={selectedAnnId}
                  snapPixelDistance={snapDistance}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500"><ImageIcon size={48} className="mb-4 opacity-20" /><p>No image selected</p></div>
              )}
            </>
          ) : (
            <div className="p-8 max-w-4xl mx-auto w-full">
               <h2 className="text-2xl font-bold mb-6">Export Configuration</h2>
               <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800 mb-6">
                 <h3 className="font-semibold mb-4 flex items-center gap-2"><Download size={18}/> Dataset</h3>
                 <p className="text-sm text-neutral-400 mb-4">Export {images.length} images and annotations in YOLOv11 format. Large datasets may take a moment.</p>
                 <button onClick={handleDownloadFullDataset} disabled={images.length === 0 || isProcessing} className="bg-blue-600 hover:bg-blue-500 px-4 py-3 rounded text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                    {isProcessing ? <span className="animate-spin">⏳</span> : <Package size={18} />} Download ZIP
                 </button>
               </div>
               <div className="bg-neutral-900 p-6 rounded-xl border border-neutral-800">
                 <h3 className="font-semibold mb-4 flex items-center gap-2"><Database size={18}/> Data Management</h3>
                 <button onClick={async () => { if(window.confirm("Clear all data?")) { await dbService.clearDatabase(); setImages([]); setSelectedImageId(null); } }} className="bg-red-900/20 text-red-500 border border-red-900/50 hover:bg-red-900/40 px-4 py-2 rounded text-sm font-medium flex items-center gap-2">
                    <Trash2 size={16} /> Delete All Data
                 </button>
               </div>
            </div>
          )}
        </main>

        {/* Images Sidebar - VIRTUALIZED */}
        <aside className="w-64 border-l border-neutral-800 bg-neutral-900 flex flex-col z-10">
          <div className="p-4 border-b border-neutral-800">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-sm text-neutral-300">Images</h3>
                {selectedImageIds.size > 0 && (
                    <button onClick={handleDeleteSelectedImages} className="text-neutral-500 hover:text-red-400" title="Delete selected">
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
            <label className="flex items-center justify-center w-full p-2 bg-neutral-800 hover:bg-neutral-700 rounded border border-dashed border-neutral-600 cursor-pointer">
              <Upload size={16} className="mr-2 text-neutral-400" /><span className="text-xs text-neutral-300">Upload / Drop</span>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
            </label>
            <div className="text-[10px] text-neutral-500 mt-2 text-center">
                Ctrl/Cmd + Click to select multiple
            </div>
          </div>
          
          {/* Virtual List Component */}
          <ImageSidebar 
            images={images} 
            selectedImageId={selectedImageId} 
            selectedImageIds={selectedImageIds} 
            onImageClick={handleImageClick} 
          />

          <div className="p-3 border-t border-neutral-800 text-xs text-neutral-500 flex justify-between">
             <span>{images.length} Images</span><span>{selectedImageIds.size > 0 ? `${selectedImageIds.size} Selected` : ''}</span>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;