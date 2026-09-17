import { useSupplierTrustSignals, useRecomputeTrustSignals } from '../../hooks/useTrustSignals';

export function SupplierTrustSignalsCard({ supplierId }: { supplierId: string }) {
  const { data, isLoading, error } = useSupplierTrustSignals(supplierId);
  const recompute = useRecomputeTrustSignals(supplierId);

  if (isLoading) return <div className="text-sm text-ink-3">Loading trust signals…</div>;
  if (error) return <div className="text-sm text-rose">Failed to load trust signals.</div>;
  if (!data) return null;

  const v = data.view;
  return (
    <div className="border border-ink/10 rounded-xl p-4 space-y-3 bg-paper">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">Trust signals</h3>
        <button
          type="button"
          className="text-xs px-3 py-1 border border-ink/15 rounded hover:border-copper/40 transition"
          onClick={() => recompute.mutate()}
          disabled={recompute.isPending}
        >
          {recompute.isPending ? 'Recomputing…' : 'Recompute now'}
        </button>
      </header>
      {!data.flagEnabled && (
        <p className="text-xs text-amber-700">
          Flag <code className="font-mono">TRUST_SIGNALS_ENABLED</code> is off — public endpoints will not return this view.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-ink-3">KYC</dt>
        <dd>{v.kyc ? '✅ verified' : '—'}</dd>
        <dt className="text-ink-3">Member since</dt>
        <dd>{v.memberSinceYear ?? '—'}</dd>
        <dt className="text-ink-3">On-time</dt>
        <dd>
          {v.onTimePct != null
            ? `${v.onTimePct}% (sample ${v.onTimeSampleSize})`
            : `Need ≥5 delivered POs (current ${v.onTimeSampleSize})`}
        </dd>
        <dt className="text-ink-3">Dispute-free</dt>
        <dd>{v.disputeFree ? '✅' : '—'}</dd>
        <dt className="text-ink-3">Computed at</dt>
        <dd>
          {v.lastComputedAt ? new Date(v.lastComputedAt * 1000).toISOString() : '—'}
        </dd>
      </dl>
    </div>
  );
}
