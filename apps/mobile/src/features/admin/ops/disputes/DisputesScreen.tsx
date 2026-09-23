import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Scale } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatLKR, timeAgo } from '@/lib/format';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  RadioCards,
  Screen,
  Select,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Appear, go , Can } from '@/features/admin/platform/kit';

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

type Outcome = 'refund_business' | 'release_supplier';

/** Mirrors web DisputedAndAudit (GET /admin/disputes). */
export function DisputesScreen() {
  const q = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: () => api.get<{ disputes: DisputedOrder[] }>('/admin/disputes'),
  });
  const toast = useToast();
  const qc = useQueryClient();
  const [target, setTarget] = useState<DisputedOrder | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('refund_business');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = q.data?.disputes ?? [];

  const resolve = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(`/admin/disputes/${target.id}/resolve`, { outcome, note: note || undefined });
      toast.success('Dispute resolved', outcome === 'refund_business' ? 'Refunded to the buyer.' : 'Released to the supplier.');
      setTarget(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
    } catch (e) {
      toast.error('Resolve failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back kicker="Operations" title="Disputes" subtitle="GRN variances awaiting arbitration." onRefresh={() => q.refetch()}>
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
              <Card kind="flat" padding={14} style={{ gap: 8 }} onPress={() => go(`/admin/order/${d.id}`)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="mono" style={{ flex: 1 }} numberOfLines={1}>
                    {d.poNumber ?? d.id.slice(0, 10)}
                  </Text>
                  <StatusBadge status={d.status} size="sm" />
                </View>
                <Text variant="bodySm" color="ink3" numberOfLines={1}>
                  {d.businessName ?? 'Buyer'} → {d.supplierName ?? 'Supplier'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="caption" color="ink4" style={{ flex: 1 }}>
                    {d.updatedAt ? `Updated ${timeAgo(d.updatedAt)}` : formatDateTime(d.createdAt)}
                  </Text>
                  {d.totalCents != null ? <Text variant="mono">{formatLKR(d.totalCents)}</Text> : null}
                </View>
                <Can perm="dispute:resolve">
                  <Button
                    title="Arbitrate"
                    size="sm"
                    onPress={() => {
                      setTarget(d);
                      setOutcome('refund_business');
                      setNote('');
                    }}
                    style={{ alignSelf: 'flex-start' }}
                  />
                </Can>
              </Card>
            </Appear>
          ))}
        </View>
      )}

      <Sheet
        visible={!!target}
        onClose={() => setTarget(null)}
        title="Arbitration decision"
        subtitle={target ? `${target.poNumber ?? target.id.slice(0, 8)}` : undefined}
        scroll
        footer={
          <>
            <Button title={outcome === 'refund_business' ? 'Refund buyer' : 'Release to supplier'} full size="lg" loading={busy} onPress={resolve} />
            <Button title="Cancel" variant="ghost" full onPress={() => setTarget(null)} />
          </>
        }
      >
        <View style={{ gap: 14 }}>
          <RadioCards<Outcome>
            value={outcome}
            onChange={setOutcome}
            options={[
              { value: 'refund_business', label: 'Refund buyer', description: 'Return funds to the purchasing business' },
              { value: 'release_supplier', label: 'Release to supplier', description: 'Pay out the held amount to the merchant' },
            ]}
          />
          <Field label="Arbitration note" hint="Recorded in the audit trail">
            <Input value={note} onChangeText={setNote} multiline placeholder="GRN short by 2 bags, photo evidence attached…" />
          </Field>
          <Field label="Outcome preview">
            <Select value={outcome} onChange={(v) => setOutcome(v as Outcome)} title="Outcome" options={[{ value: 'refund_business', label: 'Refund buyer' }, { value: 'release_supplier', label: 'Release to supplier' }]} />
          </Field>
        </View>
      </Sheet>
    </Screen>
  );
}
