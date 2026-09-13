import type { JSX } from 'react';
import { useSupplierReviewSummary } from './useSupplierReviewSummary';

export function SupplierStarsLine({ supplierId }: { supplierId: string }): JSX.Element | null {
  const s = useSupplierReviewSummary(supplierId);
  if (s.isLoading) return null;
  if (s.count === 0 || s.avg === null) return null;
  return (
    <div className="text-[11px] text-amber-600 font-mono" aria-label={`Rating ${s.avg.toFixed(1)} of 5`}>
      ★ {s.avg.toFixed(1)} <span className="text-ink-4">({s.count})</span>
    </div>
  );
}
