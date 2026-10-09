import { useSupplierTrustSignals, useRecomputeTrustSignals } from '../../hooks/useTrustSignals';
import { Button } from '@/components/ui';
import { ShieldCheckIcon } from '@/components/icons';
import { cn } from '@vyro/ui';
import { CheckIcon, XIcon } from '@/components/icons';
import { Callout, Panel, Skeleton } from '../ui';

export function SupplierTrustSignalsCard({ supplierId }: { supplierId: string }) {
  const { data, isLoading, error } = useSupplierTrustSignals(supplierId);
  const recompute = useRecomputeTrustSignals(supplierId);

  if (isLoading)
    return (
      <div className="vyro-surface space-y-3 p-5" aria-busy="true">
        <span className="sr-only">Loading trust signals…</span>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  if (error) return <Callout tone="danger">Failed to load trust signals.</Callout>;
  if (!data) return null;

  const v = data.view;
  return (
    <Panel
      title="Trust signals"
      icon={<ShieldCheckIcon size={16} />}
      actions={
        <Button type="button" size="sm" variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
          {recompute.isPending ? 'Recomputing…' : 'Recompute now'}
        </Button>
      }
    >
      <div className="space-y-4">
        {!data.flagEnabled && (
          <Callout tone="warning">
            Flag <code className="font-mono text-xs">TRUST_SIGNALS_ENABLED</code> is off — public endpoints will not
            return this view.
          </Callout>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SignalTile
            label="KYC"
            ok={v.kyc}
            value={v.kyc ? 'Verified' : 'Not verified'}
            hint="Identity & business documents"
          />
          <SignalTile
            label="Dispute-free"
            ok={v.disputeFree}
            value={v.disputeFree ? 'Clean record' : 'Has disputes'}
            hint="No upheld buyer disputes"
          />
          <div className="rounded-xl bg-bone/50 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-5">On-time delivery</div>
            {v.onTimePct != null ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="vyro-metric text-2xl leading-none text-ink">{v.onTimePct}%</span>
                  <span className="text-xs text-ink-4">of {v.onTimeSampleSize} POs</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                  <div
                    className={cn('h-full rounded-full', v.onTimePct >= 90 ? 'bg-mint' : v.onTimePct >= 75 ? 'bg-amber' : 'bg-rose')}
                    style={{ width: `${Math.min(100, Math.max(0, v.onTimePct))}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-ink-4">
                Needs ≥5 delivered POs · <span className="num-tabular font-semibold text-ink">{v.onTimeSampleSize}</span> so far
              </p>
            )}
          </div>
          <div className="rounded-xl bg-bone/50 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-5">Member since</div>
            <div className="mt-2 vyro-metric text-2xl leading-none text-ink">{v.memberSinceYear ?? '—'}</div>
            <p className="mt-2 text-xs text-ink-4">Year joined the network</p>
          </div>
        </div>
        <p className="font-mono text-[11px] text-ink-4">
          Computed {v.lastComputedAt ? new Date(v.lastComputedAt * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
        </p>
      </div>
    </Panel>
  );
}

function SignalTile({ label, ok, value, hint }: { label: string; ok: boolean; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-bone/50 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-5">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            'flex size-6 items-center justify-center rounded-full',
            ok ? 'bg-mint text-paper' : 'bg-ink/[0.07] text-ink-4',
          )}
        >
          {ok ? <CheckIcon size={12} /> : <XIcon size={12} />}
        </span>
        <span className={cn('text-sm font-semibold', ok ? 'text-ink' : 'text-ink-3')}>{value}</span>
      </div>
      <p className="mt-2 text-xs text-ink-4">{hint}</p>
    </div>
  );
}
