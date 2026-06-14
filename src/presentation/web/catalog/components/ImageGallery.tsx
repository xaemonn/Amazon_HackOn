import { useState, useCallback } from 'react';
import './ImageGallery.css';

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
}

export interface ImageGalleryProps {
  images: GalleryImage[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleThumbnailClick = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      setSelectedIndex((prev) => {
        if (direction === 'left') {
          return prev < images.length - 1 ? prev + 1 : prev;
        }
        return prev > 0 ? prev - 1 : prev;
      });
    },
    [images.length]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    (e.currentTarget as HTMLElement).dataset.touchStartX = String(touch.clientX);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const startX = Number(
        (e.currentTarget as HTMLElement).dataset.touchStartX ?? '0'
      );
      const endX = e.changedTouches[0].clientX;
      const diff = startX - endX;

      if (Math.abs(diff) > 50) {
        handleSwipe(diff > 0 ? 'left' : 'right');
      }
    },
    [handleSwipe]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleSwipe('right');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleSwipe('left');
      }
    },
    [handleSwipe]
  );

  if (images.length === 0) {
    return (
      <div className="image-gallery image-gallery--empty" aria-label="No images available">
        <div className="image-gallery__placeholder">No image available</div>
      </div>
    );
  }

  const currentImage = images[selectedIndex];

  return (
    <div className="image-gallery" aria-label="Product image gallery">
      <div
        className="image-gallery__primary"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="img"
        aria-label={currentImage.alt}
        aria-roledescription="Image viewer. Use arrow keys to navigate."
      >
        <img
          className="image-gallery__primary-image"
          src={currentImage.url}
          alt={currentImage.alt}
          draggable={false}
        />
      </div>

      {images.length > 1 && (
        <div
          className="image-gallery__thumbnails"
          role="list"
          aria-label="Image thumbnails"
        >
          {images.map((image, index) => (
            <button
              key={image.id}
              className={`image-gallery__thumbnail${
                index === selectedIndex ? ' image-gallery__thumbnail--active' : ''
              }`}
              onClick={() => handleThumbnailClick(index)}
              aria-label={`View image ${index + 1} of ${images.length}`}
              aria-pressed={index === selectedIndex}
              type="button"
              role="listitem"
            >
              <img
                className="image-gallery__thumbnail-image"
                src={image.url}
                alt=""
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
