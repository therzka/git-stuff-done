'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { AlertTriangle, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import ImageLightbox from './ImageLightbox';
import { imageDeleteRef, PLACEHOLDER_PREFIX } from '@/lib/customImage';

export default function InlineImageView({ node, deleteNode }: NodeViewProps) {
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string) || '';
  const isUploading = src.startsWith(PLACEHOLDER_PREFIX);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  const handleDelete = useCallback(async () => {
    if (imageDeleteRef.current && src) {
      try { await imageDeleteRef.current(src); } catch { /* still remove from editor */ }
    }
    deleteNode();
  }, [deleteNode, src]);

  const showSpinner = isUploading || (!imageLoaded && !imageError);

  return (
    <NodeViewWrapper className="inline-image-node" data-drag-handle>
      {showSpinner && (
        <div className="upload-placeholder" contentEditable={false}>
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>{isUploading ? 'Uploading image…' : 'Loading image…'}</span>
        </div>
      )}
      {imageError && !isUploading && (
        <div className="upload-placeholder" contentEditable={false}>
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-destructive">Failed to load image</span>
          <button
            onClick={handleDelete}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Remove broken image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {!isUploading && !imageError && (
        <>
          <div className="relative group inline-block" contentEditable={false}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className={`inline-image-thumbnail${imageLoaded ? '' : ' sr-only'}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              onClick={() => setShowLightbox(true)}
            />
            {imageLoaded && (
              <button
                onClick={handleDelete}
                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-colors hover:opacity-90"
                aria-label="Delete image"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {showLightbox && (
            <ImageLightbox src={src} onClose={() => setShowLightbox(false)} />
          )}
        </>
      )}
    </NodeViewWrapper>
  );
}
