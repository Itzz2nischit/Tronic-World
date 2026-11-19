import React, { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import { IMAGE_ASSETS } from '../data/starterCatalog';
import { ImageKey } from '../types';

interface ImageWithFallbackProps {
  imageKey: ImageKey;
  imageUrl?: string;
  alt: string;
  className?: string;
}

export const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  imageKey,
  imageUrl,
  alt,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const src =
    (imageUrl && imageUrl.trim()) || IMAGE_ASSETS[imageKey] || IMAGE_ASSETS.microcontrollers;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div
        className={`w-full h-full bg-slate-100 flex flex-col items-center justify-center p-4 text-slate-400 ${className}`}
      >
        <Cpu className="w-10 h-10 mb-2 text-slate-400" />
        <span className="text-xs font-medium text-slate-500 text-center line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`w-full h-full object-cover ${className}`}
    />
  );
};
