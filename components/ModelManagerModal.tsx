import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Trash2, CheckCircle, XCircle, Globe, Key, Server, Cpu, Play, Settings as SettingsIcon, Sliders } from 'lucide-react';
import { AIModel, ModelProvider, DEFAULT_MODELS } from '../types';
import { testModelConnection } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: AIModel[];
  onSaveModels: (models: AIModel[]) => void;
  activeModelId: string;
  onSetActiveModel: (id: string) => void;
  snapDistance: number;
  setSnapDistance: (n: number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, models, onSaveModels, activeModelId, onSetActiveModel, snapDistance, setSnapDistance
}) => {
  const [localModels, setLocalModels] = useState<AIModel[]>(models);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [activeTab, setActiveTab] = useState<'general' | 'models'>('models');

  // Sync props
  useEffect(() => {
    setLocalModels(models);
  }, [models]);

  if (!isOpen) return null;

  const handleAddModel = () => {
    const newModel: AIModel = {
      id: crypto.randomUUID(),
      name: 'New Model',
      provider: ModelProvider.OPENAI,
      modelId: 'gpt-4o',
      isDefault: false,
      config: { temperature: 0.1 }
    };
    setLocalModels([...localModels, newModel]);
    setEditingId(newModel.id);
  };

  const handleUpdateModel = (id: string, updates: Partial<AIModel>) => {
    setLocalModels(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this model configuration?')) {
      const filtered = localModels.filter(m => m.id !== id);
      setLocalModels(filtered);
      // If we deleted the active model, fallback to first available
      if (id === activeModelId && filtered.length > 0) {
        onSetActiveModel(filtered[0].id);
      }
    }
  };

  const handleTest = async (model: AIModel) => {
    setTestStatus(prev => ({ ...prev, [model.id]: 'loading' }));
    const success = await testModelConnection(model);
    setTestStatus(prev => ({ ...prev, [model.id]: success ? 'success' : 'error' }));
    // Clear status after 3s
    setTimeout(() => {
        setTestStatus(prev => ({ ...prev, [model.id]: 'idle' }));
    }, 3000);
  };

  const handleSaveAll = () => {
    onSaveModels(localModels);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 w-full max-w-4xl h-[85vh] rounded-xl border border-neutral-700 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <SettingsIcon size={24} className="text-blue-500" /> Settings
            </h2>
            <p className="text-xs text-neutral-400">Manage application preferences and AI connections.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveAll} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                <Save size={16} /> Save & Close
            </button>
            <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 bg-neutral-900 px-4">
             <button 
                onClick={() => setActiveTab('models')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'models' ? 'border-blue-500 text-white' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}
             >
                <Cpu size={16} /> AI Models
             </button>
             <button 
                onClick={() => setActiveTab('general')}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'general' ? 'border-blue-500 text-white' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}
             >
                <Sliders size={16} /> General
             </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-neutral-950/50 relative">
            
            {/* --- GENERAL TAB --- */}
            {activeTab === 'general' && (
                <div className="p-8 max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
                        <h3 className="text-lg font-medium mb-4 text-white">Canvas Preferences</h3>
                        
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-neutral-300">Snapping Distance</label>
                                <span className="font-mono text-xs bg-neutral-800 px-2 py-0.5 rounded text-blue-400">{snapDistance}px</span>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <span className="text-xs text-neutral-500">0px</span>
                                <input 
                                    type="range" min="0" max="50" step="1" 
                                    value={snapDistance} 
                                    onChange={(e) => setSnapDistance(parseInt(e.target.value))}
                                    className="flex-1 h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <span className="text-xs text-neutral-500">50px</span>
                            </div>
                            
                            <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
                                Controls the magnet strength when moving or resizing boxes near other edges. 
                                Set to <span className="text-neutral-300 font-mono">0px</span> to disable snapping entirely.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODELS TAB --- */}
            {activeTab === 'models' && (
                <div className="flex h-full animate-in fade-in slide-in-from-left-4 duration-300">
                    {/* List Sidebar */}
                    <div className="w-64 border-r border-neutral-800 bg-neutral-900 overflow-y-auto p-2 space-y-2">
                        {localModels.map(m => (
                            <div 
                                key={m.id} 
                                onClick={() => setEditingId(m.id)}
                                className={`p-3 rounded-lg cursor-pointer border transition-all flex flex-col gap-1 ${
                                    editingId === m.id ? 'bg-blue-900/20 border-blue-500/50' : 'bg-neutral-800/30 border-transparent hover:bg-neutral-800'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={`text-sm font-semibold ${editingId === m.id ? 'text-blue-200' : 'text-neutral-300'}`}>{m.name}</span>
                                    {activeModelId === m.id && <span className="text-[10px] bg-green-900 text-green-300 px-1.5 py-0.5 rounded">Active</span>}
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-neutral-500">
                                    <span className="uppercase">{m.provider}</span>
                                    <span>{m.modelId}</span>
                                </div>
                            </div>
                        ))}
                        
                        <button 
                            onClick={handleAddModel}
                            className="w-full py-3 border border-dashed border-neutral-700 rounded-lg text-neutral-500 hover:text-white hover:border-neutral-500 hover:bg-neutral-800 flex items-center justify-center gap-2 text-sm transition-all"
                        >
                            <Plus size={16} /> Add Model
                        </button>
                    </div>

                    {/* Edit Form */}
                    <div className="flex-1 overflow-y-auto bg-neutral-950/50 p-6">
                        {editingId ? (
                            (() => {
                                const model = localModels.find(m => m.id === editingId);
                                if (!model) return null;
                                const isPredefined = DEFAULT_MODELS.some(dm => dm.id === model.id);

                                return (
                                    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-300">
                                        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                                            <h3 className="text-lg font-medium">Edit Model Configuration</h3>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => onSetActiveModel(model.id)}
                                                    disabled={activeModelId === model.id}
                                                    className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                                                        activeModelId === model.id 
                                                        ? 'bg-green-900/20 border-green-800 text-green-500 cursor-default' 
                                                        : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'
                                                    }`}
                                                >
                                                    {activeModelId === model.id ? 'Currently Active' : 'Set as Active'}
                                                </button>
                                                {!isPredefined && (
                                                    <button onClick={() => handleDelete(model.id)} className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-900 rounded">
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Provider & Name */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-neutral-500 mb-1">Provider Source</label>
                                                <div className="relative">
                                                    <select 
                                                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-sm appearance-none focus:border-blue-500 outline-none"
                                                        value={model.provider}
                                                        disabled={isPredefined}
                                                        onChange={e => handleUpdateModel(model.id, { provider: e.target.value as ModelProvider })}
                                                    >
                                                        <option value={ModelProvider.GOOGLE}>Google Gemini</option>
                                                        <option value={ModelProvider.OPENAI}>OpenAI</option>
                                                        <option value={ModelProvider.CUSTOM}>OpenAI Compatible / Custom</option>
                                                        <option value={ModelProvider.OLLAMA}>Ollama (Local)</option>
                                                    </select>
                                                    <Server className="absolute right-3 top-3 text-neutral-500 pointer-events-none" size={16} />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-neutral-500 mb-1">Friendly Name</label>
                                                <input 
                                                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-sm focus:border-blue-500 outline-none"
                                                    value={model.name}
                                                    onChange={e => handleUpdateModel(model.id, { name: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        {/* Core Config */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs text-neutral-500 mb-1">Model ID (e.g. gpt-4o, gemini-1.5-pro, llama3)</label>
                                                <input 
                                                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-sm font-mono focus:border-blue-500 outline-none"
                                                    value={model.modelId}
                                                    disabled={isPredefined}
                                                    onChange={e => handleUpdateModel(model.id, { modelId: e.target.value })}
                                                />
                                            </div>

                                            {(model.provider === ModelProvider.OPENAI || model.provider === ModelProvider.CUSTOM || model.provider === ModelProvider.GOOGLE) && (
                                                <div>
                                                    <label className="block text-xs text-neutral-500 mb-1">API Key {model.provider === ModelProvider.GOOGLE && isPredefined && '(Leave empty to use env)'}</label>
                                                    <div className="relative">
                                                        <input 
                                                            type="password"
                                                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-sm font-mono focus:border-blue-500 outline-none pl-9"
                                                            value={model.apiKey || ''}
                                                            placeholder={model.provider === ModelProvider.GOOGLE && isPredefined ? "Using System Env Key" : "sk-..."}
                                                            onChange={e => handleUpdateModel(model.id, { apiKey: e.target.value })}
                                                        />
                                                        <Key className="absolute left-3 top-3 text-neutral-500" size={16} />
                                                    </div>
                                                </div>
                                            )}

                                            {(model.provider === ModelProvider.CUSTOM || model.provider === ModelProvider.OLLAMA) && (
                                                <div>
                                                    <label className="block text-xs text-neutral-500 mb-1">Base URL / Endpoint</label>
                                                    <div className="relative">
                                                        <input 
                                                            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-sm font-mono focus:border-blue-500 outline-none pl-9"
                                                            value={model.endpoint || ''}
                                                            placeholder={model.provider === ModelProvider.OLLAMA ? "http://localhost:11434" : "https://api.example.com/v1"}
                                                            onChange={e => handleUpdateModel(model.id, { endpoint: e.target.value })}
                                                        />
                                                        <Globe className="absolute left-3 top-3 text-neutral-500" size={16} />
                                                    </div>
                                                    <p className="text-[10px] text-neutral-500 mt-1 ml-1">For custom providers, usually ends in /v1. Ollama usually http://localhost:11434.</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Parameters */}
                                        <div className="bg-neutral-900/50 p-4 rounded-lg border border-neutral-800">
                                            <h4 className="text-xs font-semibold text-neutral-400 uppercase mb-3">Inference Parameters</h4>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-[10px] text-neutral-500 mb-1">Temperature</label>
                                                    <input 
                                                        type="number" step="0.1" min="0" max="2"
                                                        className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-xs focus:border-blue-500 outline-none"
                                                        value={model.config?.temperature ?? 0.1}
                                                        onChange={e => handleUpdateModel(model.id, { config: { ...model.config, temperature: parseFloat(e.target.value) } })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-neutral-500 mb-1">Top P</label>
                                                    <input 
                                                        type="number" step="0.1" min="0" max="1"
                                                        className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-xs focus:border-blue-500 outline-none"
                                                        value={model.config?.topP ?? 0.9}
                                                        onChange={e => handleUpdateModel(model.id, { config: { ...model.config, topP: parseFloat(e.target.value) } })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-neutral-500 mb-1">Max Tokens</label>
                                                    <input 
                                                        type="number" step="100"
                                                        className="w-full bg-neutral-900 border border-neutral-700 rounded p-2 text-xs focus:border-blue-500 outline-none"
                                                        value={model.config?.maxTokens ?? 2048}
                                                        onChange={e => handleUpdateModel(model.id, { config: { ...model.config, maxTokens: parseInt(e.target.value) } })}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-4 pt-4 border-t border-neutral-800">
                                            <button 
                                                onClick={() => handleTest(model)}
                                                disabled={testStatus[model.id] === 'loading'}
                                                className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 text-sm font-medium flex items-center justify-center gap-2 transition-all"
                                            >
                                                {testStatus[model.id] === 'loading' ? (
                                                    <span className="animate-spin">⏳</span>
                                                ) : testStatus[model.id] === 'success' ? (
                                                    <><CheckCircle className="text-green-500" size={16} /> Success</>
                                                ) : testStatus[model.id] === 'error' ? (
                                                    <><XCircle className="text-red-500" size={16} /> Failed</>
                                                ) : (
                                                    <><Play size={16} /> Test Connection</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()
                        ) : (
                            <div className="h-full flex items-center justify-center text-neutral-500">
                                <p>Select a model to edit or create a new one.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};