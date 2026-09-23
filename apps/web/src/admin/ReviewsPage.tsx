import { useEffect, useState, type JSX } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { AdminReviewQueue } from '@/reviews/AdminReviewQueue';
import { AdminPage, AdminPageHeader, Callout, Card, Pill } from './ui';

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
    <AdminPage>
      <AdminPageHeader
        kicker="Moderation"
        title="Review flags"
        description="Reviews flagged by suppliers. Resolve by keeping the review, dismissing the flag, or deleting the review."
      />
      {burst.length > 0 && (
        <Callout tone="warning" title="Flag burst (24h)">
          <ul className="mt-2 space-y-1.5">
            {burst.map((b) => (
              <li key={b.supplierId} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-ink">{b.supplierId}</span>
                <Pill tone="warning">
                  <span className="num-tabular">{b.flagCount}</span> flags
                </Pill>
              </li>
            ))}
          </ul>
        </Callout>
      )}
      <Card>
        <AdminReviewQueue />
      </Card>
    </AdminPage>
  );
}
