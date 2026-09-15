import { useEffect, useState, type JSX } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { Surface } from '@/components/brand/Surface';
import { AdminReviewQueue } from '@/reviews/AdminReviewQueue';

export function AdminReviewsPage(): JSX.Element {
  usePageTitle('Review Flags');
  const [burst, setBurst] = useState<Array<{ supplierId: string; flagCount: number }>>([]);

  useEffect(() => {
    fetch('/api/admin/reviews/flag-burst?windowHours=24&minCount=3', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (!j || typeof j !== 'object') return;
        const obj = j as { items?: Array<{ supplierId: string; flagCount: number }> };
        setBurst(obj.items ?? []);
      })
      .catch(() => {});
  }, []);
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
        {burst.length > 0 && (
          <div className="mb-4 text-sm">
            <h2 className="font-medium">Flag burst (24h)</h2>
            <ul className="list-disc ml-5">
              {burst.map((b) => (
                <li key={b.supplierId}>
                  {b.supplierId} — {b.flagCount} flags
                </li>
              ))}
            </ul>
          </div>
        )}
        <AdminReviewQueue />
      </Surface>
    </div>
  );
}
