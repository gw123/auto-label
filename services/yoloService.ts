import { BBox, DatasetImage, LabelClass, YOLOConfig } from '../types';

// Convert normalized center coordinates (YOLO) to SVG rect coordinates (top-left)
export const yoloToSvg = (bbox: BBox, imgWidth: number, imgHeight: number) => {
  const w = bbox.w * imgWidth;
  const h = bbox.h * imgHeight;
  const x = (bbox.x * imgWidth) - (w / 2);
  const y = (bbox.y * imgHeight) - (h / 2);
  return { x, y, w, h };
};

// Convert SVG rect coordinates (top-left) to normalized center coordinates (YOLO)
export const svgToYolo = (x: number, y: number, w: number, h: number, imgWidth: number, imgHeight: number): Omit<BBox, 'id' | 'labelId'> => {
  const cx = (x + w / 2) / imgWidth;
  const cy = (y + h / 2) / imgHeight;
  const nw = w / imgWidth;
  const nh = h / imgHeight;
  return { x: cx, y: cy, w: nw, h: nh };
};

export const generateYoloAnnotation = (annotations: BBox[], labels: LabelClass[]): string => {
  return annotations.map(ann => {
    // Find index of the label in the current label set. YOLO uses integer indices.
    const classIndex = labels.findIndex(l => l.id === ann.labelId);
    if (classIndex === -1) return '';
    return `${classIndex} ${ann.x.toFixed(6)} ${ann.y.toFixed(6)} ${ann.w.toFixed(6)} ${ann.h.toFixed(6)}`;
  }).join('\n');
};

export const generateDataYaml = (labels: LabelClass[]): string => {
  const names = labels.map(l => `  - ${l.name}`).join('\n');
  return `
train: ./train/images
val: ./val/images

nc: ${labels.length}
names:
${names}
`;
};

export const generateTrainingScript = (config: YOLOConfig): string => {
  return `
from ultralytics import YOLO

# Load a model
model = YOLO("yolo11n.pt")  # load a pretrained model (recommended for training)

# Train the model
results = model.train(
    data="data.yaml", 
    epochs=${config.epochs}, 
    imgsz=${config.imgSize}, 
    batch=${config.batchSize}, 
    lr0=${config.lr0},
    device="0"
)
`;
};
