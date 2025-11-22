import React, { useEffect, useRef } from 'react';
import { X, Terminal, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { LogEntry } from '../types';

interface AILogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  isProcessing: boolean;
}

export const AILogModal: React.FC<AILogModalProps> = ({ isOpen, onClose, logs, isProcessing }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (isOpen && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 w-full max-w-2xl rounded-xl border border-neutral-700 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 font-mono">
        
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-neutral-800 bg-neutral-950">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Terminal size={16} className="text-blue-500" />
            AI Processing Console
          </h3>
          <button 
            onClick={onClose} 
            disabled={isProcessing}
            className={`text-neutral-400 transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:text-white'}`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Log Output */}
        <div className="h-80 overflow-y-auto p-4 bg-[#0d0d0d] text-xs space-y-1.5">
          {logs.length === 0 && (
            <div className="text-neutral-600 italic">Waiting for process to start...</div>
          )}
          
          {logs.map((log, idx) => (
            <div key={idx} className="flex items-start gap-2 break-all">
              <span className="text-neutral-600 shrink-0">[{log.timestamp}]</span>
              <span className={`
                ${log.type === 'error' ? 'text-red-400 font-bold' : ''}
                ${log.type === 'success' ? 'text-green-400 font-bold' : ''}
                ${log.type === 'warning' ? 'text-yellow-400' : ''}
                ${log.type === 'info' ? 'text-neutral-300' : ''}
              `}>
                {log.message}
              </span>
            </div>
          ))}
          
          {isProcessing && (
             <div className="flex items-center gap-2 text-blue-400 animate-pulse mt-2">
                <Loader2 size={12} className="animate-spin" />
                <span>Processing...</span>
             </div>
          )}
          
          <div ref={bottomRef} />
        </div>

        {/* Footer Status */}
        <div className="p-3 border-t border-neutral-800 bg-neutral-900 flex justify-between items-center">
          <div className="text-xs text-neutral-500">
             {isProcessing ? 'AI Model is running inference...' : 'Operation completed.'}
          </div>
          {!isProcessing && (
            <button 
                onClick={onClose}
                className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-xs text-white transition-colors"
            >
                Close Console
            </button>
          )}
        </div>
      </div>
    </div>
  );
};