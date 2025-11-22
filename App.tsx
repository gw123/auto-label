import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Upload, Download, Plus, Trash2, ZoomIn, ZoomOut, 
  MousePointer, Square, Move, Brain, Settings, Layout,
  Image as ImageIcon, Check, Save, Package, CornerRightDown, Command, CircleHelp,
  Target, Cpu
} from 'lucide-react';
import JSZip from 'jszip';
import { Canvas } from './components/Canvas';
import { HelpModal } from './components/HelpModal';
import { ModelManagerModal } from './components/ModelManagerModal';
import { AILogModal } from './components/AILogModal';
import { DatasetImage, LabelClass, ToolMode, YOLOConfig, BBox, AIModel, DEFAULT_MODELS, LogEntry } from './types';
import { DEFAULT_LABELS, DEFAULT_YOLO_CONFIG, COLORS } from './constants';
import { autoLabelImage, analyzeImageForSpecificLabel } from './services/geminiService';
import { generateYoloAnnotation, generateDataYaml, generateTrainingScript } from './services/yoloService';

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
  // State: Data
  const [images, setImages] = useState<DatasetImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelClass[]>(DEFAULT_LABELS);
  const [currentLabelId, setCurrentLabelId] = useState<string>(DEFAULT_LABELS[0].id);
  
  // State: UI
  const [toolMode, setToolMode] = useState<ToolMode>(ToolMode.SELECT);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<'editor' | 'train'>('editor');
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);
  
  // State: AI Models & Logging
  const [models, setModels] = useState<AIModel[]>(DEFAULT_MODELS);
  const [activeModelId, setActiveModelId] = useState<string>(DEFAULT_MODELS[0].id);
  const [aiLogs, setAiLogs] = useState<LogEntry[]>([]);
  const [showLogModal, setShowLogModal] = useState(false);

  // State: Drag & Drop
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  
  // State: Config
  const [yoloConfig, setYoloConfig] = useState<YOLOConfig>(DEFAULT_YOLO_CONFIG);
  const [isProcessingAI, setIsProcessingAI] = useState(false);

  const editorRef = useRef<HTMLElement>(null);
  const currentImage = images.find(img => img.id === selectedImageId);
  const currentLabel = labels.find(l => l.id === currentLabelId);
  const activeModel = models.find(m => m.id === activeModelId) || models[0];

  // Load/Save Models to LocalStorage
  useEffect(() => {
    const savedModels = localStorage.getItem('yolo_studio_models');
    const savedActiveId = localStorage.getItem('yolo_studio_active_model');
    
    if (savedModels) {
        try {
            const parsed = JSON.parse(savedModels);
            // Merge defaults in case code updated, but prefer user settings
            // (Simple implementation: just load them)
            if (Array.isArray(parsed) && parsed.length > 0) setModels(parsed);
        } catch (e) { console.error("Failed to load models", e); }
    }
    if (savedActiveId) setActiveModelId(savedActiveId);
  }, []);

  const handleSaveModels = (newModels: AIModel[]) => {
    setModels(newModels);
    localStorage.setItem('yolo_studio_models', JSON.stringify(newModels));
  };

  const handleSetActiveModel = (id: string) => {
    setActiveModelId(id);
    localStorage.setItem('yolo_studio_active_model', id);
  };

  // Effect: Auto-fit zoom for large images
  useEffect(() => {
    if (currentImage && editorRef.current && currentImage.width > 0 && currentImage.height > 0) {
      const { clientWidth, clientHeight } = editorRef.current;
      if (currentImage.width > clientWidth || currentImage.height > clientHeight) {
        setZoom(0.5);
      } else {
        setZoom(1);
      }
      setPan({ x: 0, y: 0 });
    }
  }, [currentImage?.id, currentImage?.width, currentImage?.height]);

  // Effect: Ensure valid image selection
  useEffect(() => {
    if (images.length === 0) {
      if (selectedImageId !== null) setSelectedImageId(null);
      return;
    }
    const exists = images.some(img => img.id === selectedImageId);
    if (!exists) {
      setSelectedImageId(images[0].id);
    }
  }, [images, selectedImageId]);

  // Handlers (Zip/Upload/Delete logic same as before, simplified for brevity where no changes needed)
  const handleZipUpload = async (file: File) => {
    setIsZipping(true); 
    try {
      const zip = new JSZip();
      const content = await zip.loadAsync(file);
      // ... (existing ZIP logic preserved implicitly, no changes to unzip logic needed for this feature)
      // Re-implementing basic unzip logic to ensure file completeness
       const files: any[] = Object.values(content.files);
       const newImages: DatasetImage[] = [];
       for (const f of files) {
         if (!f.dir && f.name.match(/\.(jpg|jpeg|png|webp|bmp)$/i) && !f.name.includes('__MACOSX')) {
            const blob = await f.async('blob');
            const name = f.name.split('/').pop() || 'restored_image.jpg';
            const imgFile = new File([blob], name, { type: blob.type });
            const url = URL.createObjectURL(blob);
            newImages.push({
               id: crypto.randomUUID(),
               file: imgFile,
               url,
               name,
               width: 0, 
               height: 0,
               annotations: [],
               status: 'unlabeled'
            });
         }
      }
      setImages(prev => [...prev, ...newImages]);
      newImages.forEach(img => {
         const i = new Image();
         i.src = img.url;
         i.onload = () => { setImages(prev => prev.map(p => p.id === img.id ? { ...p, width: i.naturalWidth, height: i.naturalHeight } : p)); };
      });
      if (newImages.length > 0) setSelectedImageId(newImages[0].id);

    } catch (e) {
      console.error(e);
      alert("Error processing ZIP file.");
    } finally {
      setIsZipping(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const zipFile = files.find(f => f.name.endsWith('.zip'));
      if (zipFile) { handleZipUpload(zipFile); return; }

      const newImages: DatasetImage[] = files.filter(f => f.type.startsWith('image/')).map(file => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        width: 800, height: 600, annotations: [], status: 'unlabeled'
      }));
      
      newImages.forEach(img => {
        const i = new Image();
        i.src = img.url;
        i.onload = () => { setImages(prev => prev.map(p => p.id === img.id ? { ...p, width: i.naturalWidth, height: i.naturalHeight } : p)); };
      });

      setImages(prev => [...prev, ...newImages]);
      if (!selectedImageId && newImages.length > 0) setSelectedImageId(newImages[0].id);
      e.target.value = ''; 
    }
  };

  // Drag Handlers
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current += 1; setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current -= 1; if (dragCounter.current === 0) setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0; if (e.dataTransfer.files.length > 0) handleFileUpload({ target: { files: e.dataTransfer.files } } as any); };

  const handleDeleteImage = (idToDelete: string) => {
    if (window.confirm("Are you sure?")) {
        const newImages = images.filter(img => img.id !== idToDelete);
        setImages(newImages);
        if (selectedImageId === idToDelete) setSelectedImageId(newImages[0]?.id || null);
    }
  };

  const handleDeleteLabel = (labelId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (labels.length <= 1) return alert("At least one class required.");
    if (!window.confirm("Delete this class?")) return;
    const newLabels = labels.filter(l => l.id !== labelId);
    setLabels(newLabels);
    setImages(prev => prev.map(img => ({...img, annotations: img.annotations.filter(a => a.labelId !== labelId)})));
    if (currentLabelId === labelId) setCurrentLabelId(newLabels[0].id);
  };

  const updateAnnotations = (newAnnotations: BBox[]) => {
    if (!selectedImageId) return;
    setImages(prev => prev.map(img => img.id === selectedImageId ? { ...img, annotations: newAnnotations, status: newAnnotations.length > 0 ? 'in-progress' : 'unlabeled' } : img));
  };

  const handleDeleteAnnotation = () => {
    if (selectedAnnId && currentImage) {
      updateAnnotations(currentImage.annotations.filter(a => a.id !== selectedAnnId));
      setSelectedAnnId(null);
    }
  };

  // --- AI Integration & Logging ---
  const appendLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' });
    setAiLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const handleAutoLabel = async () => {
    if (!currentImage) return;
    
    setIsProcessingAI(true);
    setAiLogs([]);
    setShowLogModal(true);
    
    try {
      const newAnns = await autoLabelImage(
        currentImage, 
        labels, 
        activeModel, 
        process.env.API_KEY,
        appendLog
      );
      updateAnnotations([...currentImage.annotations, ...newAnns]);
    } catch (err: any) {
      // Error logging handled inside service, but catch here to stop spinner
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleSmartLabelCurrent = async () => {
    if (!currentImage || !currentLabel) return;
    
    setIsProcessingAI(true);
    setAiLogs([]);
    setShowLogModal(true);
    
    try {
      const newAnns = await analyzeImageForSpecificLabel(
        currentImage, 
        currentLabel, 
        activeModel, 
        process.env.API_KEY,
        appendLog
      );
      updateAnnotations([...currentImage.annotations, ...newAnns]);
    } catch (err: any) {
      // Handled
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleDownloadData = () => {
    if (activeTab === 'editor' && currentImage) {
        const content = generateYoloAnnotation(currentImage.annotations, labels);
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = currentImage.name.replace(/\.[^/.]+$/, "") + ".txt"; a.click();
    }
  };

  const handleDownloadFullDataset = async () => {
    if (images.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const root = zip.folder("yolo_dataset");
      if (!root) throw new Error("Error");
      const trainImgs = root.folder("train")?.folder("images");
      const trainLbls = root.folder("train")?.folder("labels");
      const valImgs = root.folder("val")?.folder("images");
      const valLbls = root.folder("val")?.folder("labels");

      images.forEach((img, index) => {
        const isVal = index % 5 === 0; 
        const targetImgFolder = isVal ? valImgs : trainImgs;
        const targetLblFolder = isVal ? valLbls : trainLbls;
        if (targetImgFolder && targetLblFolder) {
          targetImgFolder.file(img.name, img.file);
          targetLblFolder.file(img.name.replace(/\.[^/.]+$/, "") + ".txt", generateYoloAnnotation(img.annotations, labels));
        }
      });
      root.file("data.yaml", generateDataYaml(labels));
      root.file("train.py", generateTrainingScript(yoloConfig));
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a'); a.href = url; a.download = `dataset.zip`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e) { console.error(e); alert("Export failed"); } finally { setIsZipping(false); }
  };

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeTab === 'editor') handleDeleteAnnotation();
      if (e.key === 'v') setToolMode(ToolMode.SELECT);
      if (e.key === 'r') setToolMode(ToolMode.DRAW);
      if (e.key === 'h') setToolMode(ToolMode.PAN);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnId, currentImage, activeTab]);

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
           <div className="text-2xl font-bold">Drop Images Here</div>
        </div>
      )}

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      
      <ModelManagerModal 
        isOpen={showModelManager} 
        onClose={() => setShowModelManager(false)} 
        models={models}
        onSaveModels={handleSaveModels}
        activeModelId={activeModelId}
        onSetActiveModel={handleSetActiveModel}
      />

      <AILogModal 
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        logs={aiLogs}
        isProcessing={isProcessingAI}
      />

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
          <button onClick={() => setShowModelManager(true)} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors" title="Manage AI Models">
            <Settings size={20} />
          </button>
          <button onClick={() => setShowHelp(true)} className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors" title="Help">
            <CircleHelp size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
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
              <button className="p-1 hover:bg-neutral-800 rounded" onClick={() => setLabels([...labels, { id: labels.length.toString(), name: 'new_class', color: COLORS[labels.length % COLORS.length] }])}>
                <Plus size={16} />
              </button>
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
             <h3 className="text-xs font-semibold text-neutral-400 uppercase flex items-center gap-1">
                <Cpu size={12} /> AI Auto-Label
             </h3>
             <p className="text-[10px] text-neutral-500 mb-2 truncate">Using: {activeModel.name}</p>
             
             <button disabled={!currentImage || isProcessingAI} onClick={handleAutoLabel} className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg flex items-center justify-center gap-2 font-medium text-xs border border-neutral-700 disabled:opacity-50">
                {isProcessingAI ? <span className="animate-pulse">Thinking...</span> : <><Brain size={16} /><span>Auto-Label All</span></>}
             </button>
             <button disabled={!currentImage || isProcessingAI} onClick={handleSmartLabelCurrent} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center justify-center gap-2 font-medium text-xs disabled:opacity-50">
                {isProcessingAI ? <span className="animate-pulse">Thinking...</span> : <><Target size={16} /><span>Label {currentLabel?.name}</span></>}
             </button>
          </div>
        </aside>

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

              {currentImage ? (
                <Canvas 
                  image={currentImage} currentLabelId={currentLabelId} labels={labels} mode={toolMode} zoom={zoom} pan={pan}
                  onUpdateAnnotations={updateAnnotations} onPanChange={(x, y) => setPan({x, y})} onSelectAnnotation={setSelectedAnnId} selectedAnnotationId={selectedAnnId}
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
                 <button onClick={handleDownloadFullDataset} disabled={images.length === 0 || isZipping} className="bg-blue-600 hover:bg-blue-500 px-4 py-3 rounded text-sm font-medium disabled:opacity-50 flex items-center gap-2">
                    {isZipping ? <span className="animate-spin">⏳</span> : <Package size={18} />} Download ZIP
                 </button>
               </div>
            </div>
          )}
        </main>

        <aside className="w-64 border-l border-neutral-800 bg-neutral-900 flex flex-col z-10">
          <div className="p-4 border-b border-neutral-800">
            <h3 className="font-semibold text-sm mb-3 text-neutral-300">Images</h3>
            <label className="flex items-center justify-center w-full p-2 bg-neutral-800 hover:bg-neutral-700 rounded border border-dashed border-neutral-600 cursor-pointer">
              <Upload size={16} className="mr-2 text-neutral-400" /><span className="text-xs text-neutral-300">Upload</span>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {images.map(img => (
                <div key={img.id} onClick={() => setSelectedImageId(img.id)} className={`relative p-3 flex items-start gap-3 cursor-pointer ${selectedImageId === img.id ? 'bg-blue-900/20 border-l-2 border-blue-500' : 'hover:bg-neutral-800 border-l-2 border-transparent'}`}>
                    <div className="w-12 h-12 bg-neutral-800 rounded overflow-hidden shrink-0"><img src={img.url} className="w-full h-full object-cover opacity-80" alt="thumb"/></div>
                    <div className="overflow-hidden"><div className="text-xs font-medium truncate mb-1">{img.name}</div><div className="text-[10px] text-neutral-500">{img.annotations.length} box</div></div>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }} className="absolute right-2 top-2 p-1 hover:text-red-400"><Trash2 size={12}/></button>
                </div>
            ))}
          </div>
          <div className="p-3 border-t border-neutral-800 text-xs text-neutral-500 flex justify-between">
             <span>{images.length} Images</span><span>{images.reduce((acc, cur) => acc + cur.annotations.length, 0)} Boxes</span>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;