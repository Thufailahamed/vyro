import type { JSX } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { Surface } from '@/components/brand/Surface';
import { AdminReviewQueue } from '@/reviews/AdminReviewQueue';

export function AdminReviewsPage(): JSX.Element {
  usePageTitle('Review Flags');
  return (
    <div className="space-y-6">
      <div>
        <div className="vyro-kicker text-copper">Moderation</div>
        <h1 className="text-2xl font-display font-bold text-ink">Review Flags</h1>
        <p className="text-sm text-ink-3 mt-1">
          Reviews flagged by suppliers. Resolve by keeping the review, dismissing the flag, or deleting the review.
        </p>
      </div>
      <Surface className="p-6">
        <AdminReviewQueue />
      </Surface>
    </div>
  );
}
