import type { JSX } from 'react';

export interface RatingStarsProps {
  avg: number | null;
  count: number;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Read-only star display. Renders "No reviews" when count = 0.
 * Uses ★/☆ glyphs (no icon library dependency).
 */
export function RatingStars({ avg, count, size = 'sm', className }: RatingStarsProps): JSX.Element {
  if (!count || avg == null) {
    return <span className={className ?? 'text-sm text-gray-500'}>No reviews</span>;
  }
  const rounded = Math.round(avg);
  const fontSize = size === 'md' ? 'text-base' : 'text-sm';
  const star = size === 'md' ? '★' : '★';
  return (
    <span className={`inline-flex items-center gap-1 ${fontSize} ${className ?? ''}`}>
      <span aria-label={`${avg.toFixed(1)} out of 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= rounded ? 'text-yellow-500' : 'text-gray-300'}>{star}</span>
        ))}
      </span>
      <span className="font-medium">{avg.toFixed(1)}</span>
      <span className="text-gray-500">({count})</span>
    </span>
  );
}