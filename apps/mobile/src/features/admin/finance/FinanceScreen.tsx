import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Landmark, ReceiptText, RotateCcw, Undo2, XCircle } from 'lucide-react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Gutter,
  InkHero,
  Input,
  ListHeader,
  ListScreen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { openDocument } from '@/lib/files';
import { formatLKR, timeAgo } from '@/lib/format';
import { colors } from '@/theme/tokens';
import { MonoTag } from '../../buyer/orders/kit';
import { HeroFigure, HeroPipeline, HeroTopline, LinkTile, RecordCard } from '@/features/admin/ops/kit';

type FailedPayout = {
  id: string;
  status: string;
  supplierId?: string;
  supplierName?: string | null;
  amountCents?: number;
  currency?: string;
  method?: string;
  failureReason?: string | null;
  createdAt?: number;
};

/** /admin/finance — failed payouts, refund issuance, ledger exports. */
export function AdminFinanceScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const [retryTarget, setRetryTarget] = useState<FailedPayout | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  const summary = useQuery({
    queryKey: ['admin-finance-summary'],
    queryFn: () => api.get<{ failedPayouts: FailedPayout[]; metrics?: { failedCount: number; failedAmountCents: number; pendingCount: number; totalCount: number } }>('/admin/finance/summary'),
  });
  const retry = useMutation({
    mutationFn: (p: FailedPayout) =>
      api.post(`/admin/finance/payouts/${p.id}/retry`, { reason: 'Retry from console', idempotencyKey: `retry-${p.id}-${Date.now()}` }),
    onSuccess: () => {
      toast.success('Payout requeued');
      setRetryTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-finance-summary'] });
    },
    onError: (e) => toast.error('Retry failed', errorMessage(e)),
  });

  const m = summary.data?.metrics;
  const payouts = summary.data?.failedPayouts ?? [];

  return (
    <>
      <ListScreen
        data={payouts}
        keyExtractor={(p) => p.id}
        onRefresh={() => summary.refetch()}
        header={
          <ListHeader>
            <ScreenHeader
              back
              kicker="Money operations"
              title="Finance"
              subtitle="Failed payouts, refund issuance and ledger exports."
                          />
            <Gutter style={{ gap: 14 }}>
              <InkHero seed="admin-finance" style={{ padding: 18 }}>
                <HeroTopline icon={Landmark} label="Failed payout value" status={m?.failedCount ? `${m.failedCount} to recover` : 'Transfers clear'} statusTone={m?.failedCount ? 'danger' : 'ok'} />
                <HeroFigure value={formatLKR(m?.failedAmountCents ?? 0)} caption={`${m?.totalCount ?? 0} payouts on record`} />
                <HeroPipeline
                  segments={[
                    { label: 'Cleared', value: Math.max(0, (m?.totalCount ?? 0) - (m?.failedCount ?? 0) - (m?.pendingCount ?? 0)), color: colors.mint },
                    { label: 'Pending', value: m?.pendingCount ?? 0, color: colors.volt },
                    { label: 'Failed', value: m?.failedCount ?? 0, color: colors.rose },
                  ]}
                />
              </InkHero>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <LinkTile icon={FileSpreadsheet} label="Ledger CSV" hint="Export" onPress={() => void openDocument('/api/admin/finance/exports/ledger.csv')} />
                <LinkTile icon={ReceiptText} label="Payments CSV" hint="Export" onPress={() => void openDocument('/api/admin/finance/exports/payments.csv')} />
                <LinkTile icon={Undo2} label="Refund" hint="Issue manually" onPress={() => setRefundOpen(true)} />
              </View>
              <View style={{ marginTop: 6 }}>
                <SectionHeader kicker="Recovery" title="Failed payouts" style={{ marginBottom: 4 }} />
                <Text variant="caption" color="ink4" style={{ paddingHorizontal: 2 }}>
                  Bank rejections land here. Retry only after the supplier's account details are verified.
                </Text>
              </View>
            </Gutter>
          </ListHeader>
        }
        ListEmptyComponent={
          summary.isLoading ? (
            <SkeletonList rows={4} height={80} />
          ) : summary.isError ? (
            <ErrorState message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />
          ) : (
            <EmptyState icon={RotateCcw} title="No failed payouts" message="All settlement transfers cleared." />
          )
        }
        renderItem={({ item: p }) => (
          <RecordCard
            icon={XCircle}
            tone="danger"
            title={p.supplierName ?? p.supplierId ?? 'Supplier'}
            meta={p.createdAt ? timeAgo(p.createdAt) : null}
            amount={formatLKR(p.amountCents ?? 0)}
            status={<StatusBadge status={p.status} size="sm" />}
            chips={p.method ? <MonoTag label={p.method} tone="ink" /> : undefined}
            actions={
              <>
                <View style={{ flex: 1 }} />
                <Button title="Retry payout" icon={RotateCcw} size="sm" onPress={() => setRetryTarget(p)} />
              </>
            }
          >
            {p.failureReason ? (
              <View style={{ padding: 12, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.roseSoft }}>
                <Text variant="caption" style={{ color: colors.rose }}>
                  {p.failureReason}
                </Text>
              </View>
            ) : null}
          </RecordCard>
        )}
      />
      <RetrySheet payout={retryTarget} onClose={() => setRetryTarget(null)} onConfirm={() => retryTarget && retry.mutate(retryTarget)} loading={retry.isPending} />
      <RefundSheet visible={refundOpen} onClose={() => setRefundOpen(false)} />
    </>
  );
}

function RetrySheet({ payout, onClose, onConfirm, loading }: { payout: FailedPayout | null; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <Sheet
      visible={!!payout}
      onClose={onClose}
      title="Retry payout?"
      subtitle={payout ? `${formatLKR(payout.amountCents ?? 0)} to ${payout.supplierName ?? payout.supplierId}` : undefined}
      footer={<Button title="Retry transfer" variant="volt" full loading={loading} onPress={onConfirm} />}
    >
      <View style={{ gap: 10 }}>
        <Text variant="bodySm" color="ink3">
          Re-submits the bank transfer with a fresh idempotency key. Verify the beneficiary account before retrying.
        </Text>
        {payout?.failureReason ? (
          <Card kind="flat" padding={14} style={{ backgroundColor: colors.roseSoft }}>
            <Text variant="caption" color="ink3">
              Last failure: {payout.failureReason}
            </Text>
          </Card>
        ) : null}
      </View>
    </Sheet>
  );
}

function RefundSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const issue = useMutation({
    mutationFn: () =>
      api.post('/admin/finance/refunds', {
        paymentId: paymentId.trim(),
        amountCents: Math.round(Number(amount) * 100),
        reason: reason.trim(),
        idempotencyKey: `refund-${paymentId.trim()}-${Date.now()}`,
      }),
    onSuccess: () => {
      toast.success('Refund issued');
      onClose();
      setPaymentId('');
      setAmount('');
      setReason('');
    },
    onError: (e) => toast.error('Refund failed', errorMessage(e)),
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Issue refund"
      subtitle="Refunds against a confirmed payment record."
      footer={<Button title="Issue refund" icon={Undo2} variant="volt" full loading={issue.isPending} disabled={!paymentId.trim() || !Number(amount) || !reason.trim()} onPress={() => issue.mutate()} />}
    >
      <View style={{ gap: 14 }}>
        <Field label="Payment ID" required>
          <Input value={paymentId} onChangeText={setPaymentId} placeholder="pay_…" autoCapitalize="none" />
        </Field>
        <Field label="Amount (LKR)" required>
          <Input value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
        </Field>
        <Field label="Reason" required hint="Shown to the buyer and recorded in the ledger.">
          <Input value={reason} onChangeText={setReason} placeholder="Duplicate charge / short shipment…" />
        </Field>
      </View>
    </Sheet>
  );
}
