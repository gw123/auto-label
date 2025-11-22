import React, { memo, useMemo } from 'react';
import * as ReactWindow from 'react-window';
import AutoSizerPkg from 'react-virtualized-auto-sizer';
import { ImageMetadata } from '../types';
import { Check, Image as ImageIcon } from 'lucide-react';

// Robust fix for ESM/CJS/Namespace import interoperability issues with CDN builds
const List = (ReactWindow as any).FixedSizeList || (ReactWindow as any).default?.FixedSizeList;
const areEqual = (ReactWindow as any).areEqual || (ReactWindow as any).default?.areEqual;
const AutoSizer = (AutoSizerPkg as any).default || AutoSizerPkg;

// Define props interface locally to avoid import type issues
interface ListChildComponentProps {
  index: number;
  style: React.CSSProperties;
  data: any;
}

interface ImageSidebarProps {
  images: ImageMetadata[];
  selectedImageId: string | null;
  selectedImageIds: Set<string>;
  onImageClick: (id: string, e: React.MouseEvent) => void;
}

// Memoized Row Component to prevent unnecessary re-renders
const ImageRow = memo(({ data, index, style }: ListChildComponentProps) => {
  const { images, selectedImageId, selectedImageIds, onImageClick } = data;
  const img = images[index];
  const isSelected = selectedImageIds.has(img.id);
  const isActive = selectedImageId === img.id;

  return (
    <div 
      style={style}
      onClick={(e) => onImageClick(img.id, e)} 
      className={`
        flex items-center px-3 gap-3 cursor-pointer border-l-2 transition-colors select-none
        ${isSelected ? 'bg-blue-900/20 border-blue-500' : 'hover:bg-neutral-800 border-transparent'}
        ${isActive && !isSelected ? 'bg-neutral-800' : ''}
      `}
    >
      {/* Simplified Icon instead of Thumbnail for performance with 10k items */}
      <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-900/40 text-blue-300' : 'bg-neutral-800 text-neutral-500'}`}>
         <ImageIcon size={16} />
      </div>

      <div className="overflow-hidden flex-1">
        <div className={`text-xs font-medium truncate ${isSelected ? 'text-blue-200' : 'text-neutral-300'}`}>
          {img.name}
        </div>
        <div className="text-[10px] text-neutral-500 flex items-center gap-2 mt-0.5">
           <span>{img.width}x{img.height}</span>
           {img.annotationCount > 0 && (
               <span className="flex items-center gap-0.5 text-green-500/80">
                   <Check size={10} /> {img.annotationCount}
               </span>
           )}
        </div>
      </div>

      {/* Status Indicator */}
      {img.status === 'in-progress' && (
        <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full shrink-0"></div>
      )}
      {img.status === 'done' && (
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0"></div>
      )}
    </div>
  );
}, areEqual);

export const ImageSidebar: React.FC<ImageSidebarProps> = ({ images, selectedImageId, selectedImageIds, onImageClick }) => {
  
  const itemData = useMemo(() => ({
    images,
    selectedImageId,
    selectedImageIds,
    onImageClick
  }), [images, selectedImageId, selectedImageIds, onImageClick]);

  // Safety check if libraries failed to load completely
  if (!List || !AutoSizer) {
    return <div className="p-4 text-red-500 text-xs">Error loading list components. Please refresh.</div>;
  }

  return (
    <div className="flex-1 w-full h-full">
      <AutoSizer>
        {({ height, width }: { height: number; width: number }) => (
          <List
            height={height}
            itemCount={images.length}
            itemSize={56} // Fixed height per row
            width={width}
            itemData={itemData}
            overscanCount={5} // Render a few items outside viewport for smoothness
          >
            {ImageRow}
          </List>
        )}
      </AutoSizer>
    </div>
  );
};