import { useSupplierTrustSignals, useRecomputeTrustSignals } from '../../hooks/useTrustSignals';
import { Button } from '@/components/ui';
import { ShieldCheckIcon } from '@/components/icons';
import { Callout, DetailList, Panel, Pill, Skeleton } from '../ui';

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
        <DetailList
          columns={2}
          items={[
            {
              label: 'KYC',
              value: v.kyc ? (
                <Pill tone="success" dot>
                  Verified
                </Pill>
              ) : (
                '—'
              ),
            },
            { label: 'Member since', value: <span className="num-tabular">{v.memberSinceYear ?? '—'}</span> },
            {
              label: 'On-time',
              value:
                v.onTimePct != null ? (
                  <span className="num-tabular">
                    {v.onTimePct}% <span className="text-ink-4">(sample {v.onTimeSampleSize})</span>
                  </span>
                ) : (
                  <span className="text-ink-3">Need ≥5 delivered POs (current {v.onTimeSampleSize})</span>
                ),
            },
            {
              label: 'Dispute-free',
              value: v.disputeFree ? (
                <Pill tone="success" dot>
                  Yes
                </Pill>
              ) : (
                '—'
              ),
            },
            {
              label: 'Computed at',
              value: (
                <span className="font-mono text-xs">
                  {v.lastComputedAt ? new Date(v.lastComputedAt * 1000).toISOString() : '—'}
                </span>
              ),
            },
          ]}
        />
      </div>
    </Panel>
  );
}
