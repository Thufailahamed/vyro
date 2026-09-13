import type { JSX } from 'react';
import { RatingStars } from './RatingStars';
import { RatingDistribution } from './RatingDistribution';
import { ReviewList } from './ReviewList';
import { useSupplierReviewSummary } from './useSupplierReviewSummary';

export function SupplierReviewsPanel({ supplierId }: { supplierId: string }): JSX.Element {
  const summary = useSupplierReviewSummary(supplierId);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <RatingStars avg={summary.avg} count={summary.count} size="md" />
      </div>
      {summary.count > 0 && (
        <div className="max-w-xs">
          <RatingDistribution counts={summary.distribution} total={summary.count} />
        </div>
      )}
      <ReviewList supplierId={supplierId} />
    </div>
  );
}