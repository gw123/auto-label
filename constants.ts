import { YOLOConfig, LabelClass } from './types';

export const DEFAULT_LABELS: LabelClass[] = [
  { id: '0', name: 'person', color: '#ef4444' },
  { id: '1', name: 'car', color: '#3b82f6' },
  { id: '2', name: 'dog', color: '#eab308' },
];

export const DEFAULT_YOLO_CONFIG: YOLOConfig = {
  epochs: 100,
  batchSize: 16,
  imgSize: 640,
  lr0: 0.01,
};

export const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', 
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#f43f5e'
];
