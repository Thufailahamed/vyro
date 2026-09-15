import type { JSX } from 'react';

export interface ReviewImage {
  url: string;
  r2Key?: string;
}

export function ReviewImageGrid({ images }: { images: ReviewImage[] }): JSX.Element | null {
  if (!images.length) return null;
  return (
    <div className="flex gap-2 mt-2">
      {images.slice(0, 3).map((im) => (
        <img
          key={im.url}
          src={im.url}
          alt="Review photo"
          className="w-20 h-20 object-cover rounded border"
          loading="lazy"
        />
      ))}
    </div>
  );
}
