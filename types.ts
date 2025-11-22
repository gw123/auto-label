export interface BBox {
  id: string;
  labelId: string;
  x: number; // Normalized center x (0-1)
  y: number; // Normalized center y (0-1)
  w: number; // Normalized width (0-1)
  h: number; // Normalized height (0-1)
}

export interface DatasetImage {
  id: string;
  file: File;
  url: string;
  name: string;
  width: number;
  height: number;
  annotations: BBox[];
  status: 'unlabeled' | 'in-progress' | 'done';
}

export interface LabelClass {
  id: string;
  name: string;
  color: string;
}

export enum ToolMode {
  SELECT = 'SELECT',
  DRAW = 'DRAW',
  PAN = 'PAN',
  MAGIC_BOX = 'MAGIC_BOX'
}

export interface YOLOConfig {
  epochs: number;
  batchSize: number;
  imgSize: number;
  lr0: number;
}

// --- Model Management Types ---

export enum ModelProvider {
  GOOGLE = 'google',
  OPENAI = 'openai',
  OLLAMA = 'ollama',
  CUSTOM = 'custom', // For Qwen, Volcano, etc. via OpenAI compatible schema
}

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  
  // Configuration
  apiKey?: string;
  endpoint?: string; // Base URL for OpenAI/Ollama/Custom
  modelId: string; // The specific model string (e.g., 'gpt-4o', 'gemini-1.5-flash')
  
  // Hyperparameters
  config?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };

  isDefault: boolean;
}

export interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export const DEFAULT_MODELS: AIModel[] = [
  {
    id: 'default-gemini-flash',
    name: 'Gemini 2.5 Flash (Default)',
    provider: ModelProvider.GOOGLE,
    modelId: 'gemini-2.5-flash',
    isDefault: true,
    // apiKey is expected to be in env or user must provide new one
  },
  {
    id: 'default-gemini-pro',
    name: 'Gemini 3.0 Pro',
    provider: ModelProvider.GOOGLE,
    modelId: 'gemini-3-pro-preview',
    isDefault: false,
  }
];