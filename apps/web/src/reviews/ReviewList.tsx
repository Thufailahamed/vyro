import { useEffect, useState, type JSX } from 'react';

export interface ReviewItem {
  id: string;
  rating: number;
  body: string;
  createdAt: number;
}

export type ReviewSort = 'recent' | 'highest' | 'lowest';

export function ReviewList({ supplierId }: { supplierId: string }): JSX.Element {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [sort, setSort] = useState<ReviewSort>('recent');
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ sort, limit: '10' });
    if (nextCursor) params.set('cursor', nextCursor);
    fetch(`/api/suppliers/${supplierId}/reviews?${params.toString()}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (cancelled || !j || typeof j !== 'object') return;
        const obj = j as { reviews?: ReviewItem[]; nextCursor?: string | null };
        setItems(obj.reviews ?? []);
        setNextCursor(obj.nextCursor ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId, sort, nextCursor]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-sm">Sort:</label>
        <select
          aria-label="Sort reviews"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as ReviewSort);
            setNextCursor(null);
          }}
          className="text-sm border rounded px-2 py-1"
        >
          <option value="recent">Most recent</option>
          <option value="highest">Highest</option>
          <option value="lowest">Lowest</option>
        </select>
        {loading && <span className="text-xs text-gray-500">Loading…</span>}
      </div>
      {items.length === 0 && !loading && (
        <p className="text-sm text-gray-500">No reviews yet.</p>
      )}
      <ul className="divide-y">
        {items.map((r) => (
          <li key={r.id} className="py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{r.rating}/5</span>
              <span className="text-gray-500">
                {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-gray-800">{r.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}