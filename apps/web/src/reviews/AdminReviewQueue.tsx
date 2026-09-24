import { useState, type JSX } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { Callout, Pill } from '@/admin/ui';
import { AlertTriangleIcon, CheckCircleIcon, RefreshCwIcon, XCircleIcon, XIcon } from '@/components/icons';

interface FlagRow {
  id: string;
  reviewId: string;
  flaggedBy: 'buyer' | 'supplier' | 'admin' | 'system' | string;
  flaggedByUserId: string | null;
  reason: string;
  note: string | null;
  status: string;
  createdAt: number;
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatReported(ts: number): string {
  const diffMs = Date.now() - ts;
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);
  const relative =
    days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : `${Math.max(1, Math.floor(diffMs / 60_000))}m ago`;
  const date = new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return `${date} · ${relative}`;
}

export function AdminReviewQueue(): JSX.Element {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-review-flags'],
    queryFn: () => api.get<{ flags: FlagRow[] }>('/admin/reviews/flags?limit=50'),
  });
  const flags = q.data?.flags ?? [];

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusyKey(key);
    setActionError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['admin-review-flags'] });
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusyKey(null);
      setConfirmDeleteId(null);
    }
  }

  const resolve = (flagId: string, decision: 'keep' | 'remove') =>
    run(`resolve:${flagId}:${decision}`, () => api.post(`/admin/reviews/flags/${flagId}/resolve`, { decision }));

  const deleteReview = (reviewId: string) =>
    run(`delete:${reviewId}`, () => api.del(`/admin/reviews/${reviewId}`));

  if (q.isLoading) {
    return (
      <div className="divide-y divide-ink/[0.05]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-4 animate-pulse">
            <div className="space-y-2">
              <div className="h-5 w-24 rounded-md bg-ink/10" />
              <div className="h-3.5 w-56 rounded bg-ink/10" />
              <div className="h-2.5 w-40 rounded bg-ink/5" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-24 rounded-lg bg-ink/10" />
              <div className="h-8 w-24 rounded-lg bg-ink/10" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <Callout
        tone="danger"
        title="Couldn't load flagged reviews"
        action={
          <Button variant="secondary" size="sm" onClick={() => void q.refetch()} icon={<RefreshCwIcon size={14} />}>
            Retry
          </Button>
        }
      >
        {q.error instanceof ApiError ? `${q.error.code}: ${q.error.message}` : 'The moderation API did not respond.'}
      </Callout>
    );
  }

  if (!flags.length) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-ink text-volt">
          <AlertTriangleIcon size={18} />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-ink">No pending flags</h3>
        <p className="mt-1 text-xs text-ink-4">Reviews flagged by suppliers will appear here for moderation.</p>
      </div>
    );
  }

  return (
    <div>
      {actionError ? <Callout tone="danger" className="mb-4">{actionError}</Callout> : null}
      <div className="divide-y divide-ink/[0.06]">
        {flags.map((f) => {
          const confirming = confirmDeleteId === f.reviewId;
          return (
            <div key={f.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="warning" dot>
                    {humanize(f.reason)}
                  </Pill>
                  <span className="text-[11px] text-ink-4">{formatReported(f.createdAt)}</span>
                </div>
                {f.note ? <p className="text-sm leading-relaxed text-ink-2">“{f.note}”</p> : null}
                <div className="font-mono text-[11px] text-ink-4">
                  Flag {f.id.slice(0, 8)} · Review {f.reviewId.slice(0, 8)} · Flagged by {f.flaggedBy}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {confirming ? (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busyKey === `delete:${f.reviewId}`}
                      onClick={() => void deleteReview(f.reviewId)}
                      icon={<XCircleIcon size={13} />}
                    >
                      Confirm delete
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)} icon={<XIcon size={13} />}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="success"
                      size="sm"
                      loading={busyKey === `resolve:${f.id}:keep`}
                      disabled={busyKey !== null}
                      onClick={() => void resolve(f.id, 'keep')}
                      icon={<CheckCircleIcon size={13} />}
                    >
                      Keep review
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busyKey === `resolve:${f.id}:remove`}
                      disabled={busyKey !== null}
                      onClick={() => void resolve(f.id, 'remove')}
                    >
                      Dismiss flag
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose hover:bg-rose/10"
                      disabled={busyKey !== null}
                      onClick={() => setConfirmDeleteId(f.reviewId)}
                      icon={<AlertTriangleIcon size={13} />}
                    >
                      Delete review
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
