import { useEffect, useState, type JSX } from 'react';
import { HelpfulButton } from './HelpfulButton';
import { ReviewImageGrid } from './ReviewImageGrid';
import { ShieldCheckIcon } from '@/components/icons';

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
    <div className="space-y-4">
      {/* Controls Bar: Sort Pills & Filter Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-ink/10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-ink-4">
            Sort reviews:
          </span>
          <div className="inline-flex rounded-lg p-0.5 bg-sand/40 border border-ink/10 text-xs">
            <button
              type="button"
              onClick={() => {
                setSort('recent');
                setNextCursor(null);
              }}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                sort === 'recent'
                  ? 'bg-ink text-paper shadow-2xs font-semibold'
                  : 'text-ink-3 hover:text-ink'
              }`}
            >
              Most Recent
            </button>
            <button
              type="button"
              onClick={() => {
                setSort('highest');
                setNextCursor(null);
              }}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                sort === 'highest'
                  ? 'bg-ink text-paper shadow-2xs font-semibold'
                  : 'text-ink-3 hover:text-ink'
              }`}
            >
              Highest (5★)
            </button>
            <button
              type="button"
              onClick={() => {
                setSort('lowest');
                setNextCursor(null);
              }}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                sort === 'lowest'
                  ? 'bg-ink text-paper shadow-2xs font-semibold'
                  : 'text-ink-3 hover:text-ink'
              }`}
            >
              Lowest
            </button>
          </div>

          {/* Accessible hidden select for form control / test compatibility */}
          <select
            aria-label="Sort reviews"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as ReviewSort);
              setNextCursor(null);
            }}
            className="sr-only"
          >
            <option value="recent">Most recent</option>
            <option value="highest">Highest</option>
            <option value="lowest">Lowest</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-4 font-mono">
              <span className="size-1.5 rounded-full bg-volt animate-ping" />
              Loading reviews…
            </span>
          )}
          <span className="text-xs font-mono text-ink-4">
            {items.length} {items.length === 1 ? 'review' : 'reviews'} loaded
          </span>
        </div>
      </div>

      {/* Empty State */}
      {items.length === 0 && !loading && (
        <div className="border border-dashed border-ink/15 rounded-xl p-8 sm:p-10 bg-paper/60 text-center space-y-4">
          <div className="mx-auto size-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 text-xl font-bold shadow-2xs">
            ★
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h4 className="text-base font-semibold text-ink">
              No reviews yet
            </h4>
            <p className="text-xs sm:text-sm text-ink-3 leading-relaxed">
              No verified buyer reviews logged yet for this facility. When commercial buyers accept deliveries and complete Purchase Orders, they will be prompted to submit performance feedback.
            </p>
          </div>
          <div className="pt-2 inline-flex flex-wrap items-center justify-center gap-3 text-xs text-ink-4 font-mono">
            <span className="inline-flex items-center gap-1 bg-sand/30 px-2.5 py-1 rounded-md border border-ink/5">
              <ShieldCheckIcon size={13} className="text-volt" />
              <span>Authentic PO Deliveries Only</span>
            </span>
            <span className="inline-flex items-center gap-1 bg-sand/30 px-2.5 py-1 rounded-md border border-ink/5">
              <span>🚚 Packaging & Delivery Audits</span>
            </span>
          </div>
        </div>
      )}

      {/* Populated Review Cards */}
      {items.length > 0 && (
        <div className="space-y-3.5">
          {items.map((r) => {
            const stars = Math.min(5, Math.max(1, Math.round(r.rating)));
            return (
              <div
                key={r.id}
                className="border border-ink/10 bg-paper rounded-xl p-4 sm:p-5 space-y-3 hover:border-ink/20 transition-all shadow-2xs"
              >
                {/* Review Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex tracking-tight text-sm">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span
                          key={i}
                          className={i <= stars ? 'text-yellow-500' : 'text-gray-300'}
                        >
                          ★
                        </span>
                      ))}
                    </span>
                    <span className="font-mono font-bold text-xs text-ink">
                      {r.rating}/5
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-volt/10 border border-volt/20 text-[10px] font-semibold text-volt uppercase tracking-wider">
                      <ShieldCheckIcon size={11} />
                      <span>Verified Buyer</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-ink-4">
                      {new Date(r.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <HelpfulButton reviewId={r.id} initialCount={r.helpfulCount ?? 0} />
                  </div>
                </div>

                {/* Review Body */}
                <p className="text-sm text-ink-1 leading-relaxed whitespace-pre-wrap">
                  {r.body}
                </p>

                {/* Image Attachments */}
                {r.images && r.images.length > 0 && (
                  <div className="pt-1">
                    <ReviewImageGrid images={r.images} />
                  </div>
                )}

                {/* Official Facility Reply */}
                {r.reply && (
                  <div className="mt-3 border-l-2 border-copper bg-sand/20 rounded-r-lg p-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-ink-3 font-medium">
                      <span className="font-semibold text-copper">
                        Official Supplier Facility Response
                      </span>
                      <span className="font-mono text-[10px] text-ink-4">
                        {new Date(r.reply.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-ink-2 leading-relaxed">
                      {r.reply.body}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Load More */}
      {nextCursor && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => load(nextCursor, sort, true)}
            disabled={loading}
            className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-ink bg-paper border border-ink/20 rounded-lg hover:bg-sand/30 hover:border-ink/40 active:scale-[0.99] transition disabled:opacity-50"
          >
            {loading ? 'Loading More Reviews…' : 'Load More Buyer Reviews'}
          </button>
        </div>
      )}
    </div>
  );
}