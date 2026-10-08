import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Gavel, Scale } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDateTime, formatLKR, timeAgo } from '@/lib/format';
import { Button, EmptyState, ErrorState, InkHero, Screen, SkeletonList, StatusBadge } from '@/ui';
import { Appear, go, Can } from '@/features/admin/platform/kit';
import { GlassStats, HeroFigure, HeroTopline, Pill, RecordCard } from '@/features/admin/ops/kit';
import { ResolveDisputeSheet } from './ResolveDisputeSheet';

interface DisputedOrder {
  id: string;
  poNumber?: string | null;
  status: string;
  totalCents?: number | null;
  businessName?: string | null;
  supplierName?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

/** Mirrors web DisputedAndAudit (GET /admin/disputes). */
export function DisputesScreen() {
  const q = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: () => api.get<{ disputes: DisputedOrder[] }>('/admin/disputes'),
  });
  const [target, setTarget] = useState<DisputedOrder | null>(null);

  const rows = q.data?.disputes ?? [];
  const atStake = rows.reduce((s, d) => s + (d.totalCents ?? 0), 0);
  const oldest = rows.reduce<number | null>((m, d) => (d.createdAt && (m === null || d.createdAt < m) ? d.createdAt : m), null);

  return (
    <Screen back kicker="Operations" title="Disputes" subtitle="GRN variances awaiting arbitration." onRefresh={() => q.refetch()}>
      {!q.isLoading && !q.isError ? (
        <Appear>
          <InkHero seed="admin-disputes" style={{ padding: 18 }}>
            <HeroTopline icon={Scale} label="Value at stake" status={rows.length ? `${rows.length} awaiting ruling` : 'All settled'} statusTone={rows.length ? 'warn' : 'ok'} />
            <HeroFigure value={formatCompactLKR(atStake)} caption="Purchase orders held in arbitration" />
            <GlassStats
              items={[
                { label: 'Open cases', value: rows.length, warn: rows.length > 0, hint: 'GRN variances' },
                { label: 'Oldest', value: oldest ? timeAgo(oldest) : '—', hint: 'Since raised' },
              ]}
            />
          </InkHero>
        </Appear>
      ) : null}
      {q.isLoading ? (
        <SkeletonList rows={4} height={130} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Scale} title="No open disputes" message="Every delivery matched its purchase order." />
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((d, i) => (
            <Appear key={d.id} i={i % 10}>
              <RecordCard
                icon={Scale}
                tone="warning"
                onPress={() => go(`/admin/order/${d.id}`)}
                title={d.businessName ?? 'Buyer'}
                subtitle={`→ ${d.supplierName ?? 'Supplier'}`}
                meta={d.updatedAt ? `Updated ${timeAgo(d.updatedAt)}` : formatDateTime(d.createdAt)}
                amount={d.totalCents != null ? formatLKR(d.totalCents) : null}
                status={<StatusBadge status={d.status} size="sm" />}
                chips={<Pill label={d.poNumber ?? d.id.slice(0, 10)} />}
                actions={
                  <Can perm="dispute:resolve">
                    <Button title="Arbitrate" icon={Gavel} size="sm" onPress={() => setTarget(d)} />
                  </Can>
                }
              />
            </Appear>
          ))}
        </View>
      )}

      <ResolveDisputeSheet target={target} onClose={() => setTarget(null)} />
    </Screen>
  );
}
