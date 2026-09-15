import { useEffect, useState, type JSX } from 'react';
import { HelpfulButton } from './HelpfulButton';
import { ReviewImageGrid } from './ReviewImageGrid';

export interface ReviewItem {
  id: string;
  rating: number;
  body: string;
  createdAt: number;
  helpfulCount?: number;
  images?: Array<{ url: string; r2Key?: string }>;
  reply?: { body: string; createdAt: number } | null;
}

export type ReviewSort = 'recent' | 'highest' | 'lowest';

export function ReviewList({ supplierId }: { supplierId: string }): JSX.Element {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [sort, setSort] = useState<ReviewSort>('recent');
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  async function load(cursor: string | null, currentSort: ReviewSort, append: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: currentSort, limit: '10' });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/suppliers/${supplierId}/reviews?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const j = (await res.json()) as { reviews?: ReviewItem[]; nextCursor?: string | null };
      setItems((prev) => (append ? [...prev, ...(j.reviews ?? [])] : (j.reviews ?? [])));
      setNextCursor(j.nextCursor ?? null);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void load(null, sort, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, sort]);

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
              <HelpfulButton reviewId={r.id} initialCount={r.helpfulCount ?? 0} />
            </div>
            <p className="text-sm text-gray-800">{r.body}</p>
            <ReviewImageGrid images={r.images ?? []} />
            {r.reply && (
              <div className="mt-2 ml-4 border-l-2 border-gray-200 pl-3">
                <p className="text-xs text-gray-500">Supplier reply</p>
                <p className="text-sm text-gray-700">{r.reply.body}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
      {nextCursor && (
        <button
          onClick={() => load(nextCursor, sort, true)}
          disabled={loading}
          className="text-sm text-blue-600 underline disabled:opacity-50"
        >
          Load more
        </button>
      )}
    </div>
  );
}