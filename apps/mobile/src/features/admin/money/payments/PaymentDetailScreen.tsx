import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ArrowRight, Landmark, ReceiptText, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatLKR, humanize } from '@/lib/format';
import {
  Banner,
  Button,
  Card,
  ConfirmSheet,
  Field,
  Input,
  KeyValue,
  QueryView,
  Screen,
  Sheet,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { useAdminPaymentDetail } from '../api';
import { Appear, Can, CodeBlock, go, rupeesToCents } from '@/features/admin/platform/kit';
import { Section } from '@/features/admin/ops/kit';

/**
 * Admin payment detail — mirrors apps/web/src/admin/PaymentDetailPage.tsx
 * (GET /admin/payments/:id) with refund + confirm actions and a link to the order.
 */
export function PaymentDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const q = useAdminPaymentDetail(id || undefined);
  const toast = useToast();
  const [refundOpen, setRefundOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const issueRefund = async (amountCents: number, reason: string) => {
    setActing(true);
    try {
      await api.post('/admin/finance/refunds', { paymentId: id, amountCents, reason });
      toast.success('Refund raised', 'Finance can now approve it from the queue.');
      setRefundOpen(false);
      void q.refetch();
    } catch (e) {
      toast.error('Refund failed', errorMessage(e));
    } finally {
      setActing(false);
    }
  };

  const confirmPayment = async () => {
    setActing(true);
    try {
      await api.post(`/payments/${encodeURIComponent(id)}/confirm`, { status: 'confirmed' });
      toast.success('Payment confirmed', 'The order balance was updated.');
      setConfirmOpen(false);
      void q.refetch();
    } catch (e) {
      toast.error('Confirm failed', errorMessage(e));
    } finally {
      setActing(false);
    }
  };

  return (
    <Screen
      back
      kicker="Money · Payment"
      title={q.data ? `${q.data.payment.poNumber || q.data.payment.id.slice(0, 10)}` : 'Payment'}
      subtitle={q.data ? `${q.data.payment.businessName} → ${q.data.payment.supplierName}` : undefined}
      onRefresh={() => q.refetch()}
      footer={
        q.data ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Can perm="payment:refund">
              <Button title="Refund" icon={RotateCcw} variant="secondary" onPress={() => setRefundOpen(true)} style={{ flex: 1 }} />
            </Can>
            <Can perm={['payment:verify_bank_transfer', 'payment:refund']}>
              {q.data.payment.status === 'pending' ? (
                <Button title="Confirm" icon={ShieldCheck} onPress={() => setConfirmOpen(true)} style={{ flex: 1 }} />
              ) : null}
            </Can>
          </View>
        ) : undefined
      }
    >
      <QueryView
        query={q}
        empty={() => !q.data}
        emptyTitle="Payment not found"
        emptyMessage="This payment doesn't exist or you can't view it."
      >
        {(b) => {
          const p = b.payment;
          return (
            <>
              <Appear>
                <Card kind="ink" flow="payment-detail" style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <StatusBadge status={p.status} />
                    <Text variant="caption" color="paperMuted">
                      {humanize(p.method)} · {formatDateTime(p.createdAt)}
                    </Text>
                  </View>
                  <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit>
                    {formatLKR(p.amountCents)}
                  </Text>
                  <Text variant="caption" color="paperFaint">
                    Fee {formatLKR(p.feeCents)} · net {formatLKR(p.netCents)} · {p.currency}
                  </Text>
                </Card>
              </Appear>

              <Appear i={1}>
                <Section kicker="Summary" title="Payment record">
                  <View>
                    <KeyValue label="Status" value={humanize(p.status)} />
                    <KeyValue label="Method" value={humanize(p.method)} />
                    <KeyValue label="Paid" value={p.paidAt ? formatDateTime(p.paidAt) : '—'} />
                    <KeyValue label="Confirmed" value={p.confirmedAt ? formatDateTime(p.confirmedAt) : '—'} />
                    {p.transactionReference ? <KeyValue label="Txn ref" value={p.transactionReference} mono /> : null}
                    {p.gatewayRef ? <KeyValue label="Gateway ref" value={p.gatewayRef} mono /> : null}
                    {p.statusReason ? <KeyValue label="Reason" value={p.statusReason} /> : null}
                    {p.notes ? <KeyValue label="Notes" value={p.notes} last={!p.gatewayPayload} /> : null}
                  </View>
                  {p.gatewayPayload ? <CodeBlock value={p.gatewayPayload} maxLines={8} /> : null}
                </Section>
              </Appear>

              {b.purchaseOrder ? (
                <Appear i={2}>
                  <Card
                    onPress={() => go(`/admin/order/${b.purchaseOrder!.id}`)}
                    style={{ gap: 8 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ReceiptText size={16} color="#B87A4E" />
                      <Text variant="overline" color="copper">
                        Linked purchase order
                      </Text>
                      <View style={{ flex: 1 }} />
                      <ArrowRight size={16} color="#8A8A8A" />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text variant="h3" style={{ flex: 1 }} numberOfLines={1}>
                        {b.purchaseOrder.poNumber}
                      </Text>
                      <StatusBadge status={b.purchaseOrder.status} size="sm" />
                    </View>
                    <Text variant="bodySm" color="ink4">
                      {formatLKR(b.purchaseOrder.totalCents)} · {formatDateTime(b.purchaseOrder.createdAt)}
                    </Text>
                  </Card>
                </Appear>
              ) : null}

              <Appear i={3}>
                <Section kicker="Parties" title="Who paid whom" icon={Landmark}>
                  <View>
                    {b.business ? <KeyValue label="Buyer" value={`${b.business.name}`} /> : null}
                    {b.supplier ? <KeyValue label="Supplier" value={`${b.supplier.name}`} last /> : null}
                    {!b.business && !b.supplier ? (
                      <Text variant="bodySm" color="ink4">
                        No counterparty snapshot.
                      </Text>
                    ) : null}
                  </View>
                </Section>
              </Appear>

              <Appear i={4}>
                <Section kicker={`Refunds · ${b.refunds.length}`} title="Refund history">
                  {b.refunds.length === 0 ? (
                    <Text variant="bodySm" color="ink4">
                      No refunds raised against this payment.
                    </Text>
                  ) : (
                    <View>
                      {b.refunds.map((r) => (
                        <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text variant="mono" numberOfLines={1}>
                              {r.id.slice(0, 12)}
                            </Text>
                            <Text variant="caption" color="ink4" numberOfLines={1}>
                              {r.reason ?? 'No reason'} · {formatDateTime(r.createdAt)}
                            </Text>
                          </View>
                          <StatusBadge status={r.status} size="sm" />
                          <Text variant="bodySm" weight="semibold">
                            {formatLKR(r.amountCents)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Section>
              </Appear>

              <Appear i={5}>
                <Section kicker={`Ledger · ${b.ledger.length}`} title="Money trail">
                  {b.ledger.length === 0 ? (
                    <Text variant="bodySm" color="ink4">
                      No ledger entries yet.
                    </Text>
                  ) : (
                    <View>
                      {b.ledger.slice(0, 12).map((l) => (
                        <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text variant="bodySm" numberOfLines={1}>
                              {l.description}
                            </Text>
                            <Text variant="caption" color="ink4" numberOfLines={1}>
                              {l.accountType} · {l.direction} · {formatDateTime(l.createdAt)}
                            </Text>
                          </View>
                          <Text variant="mono">{formatLKR(l.amountCents)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </Section>
              </Appear>

              <RefundSheet visible={refundOpen} onClose={() => setRefundOpen(false)} loading={acting} maxCents={b.payment.amountCents} onSubmit={issueRefund} />
              <ConfirmSheet
                visible={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={confirmPayment}
                loading={acting}
                title={`Confirm ${formatLKR(b.payment.amountCents)}?`}
                message="Marks this payment confirmed and updates the order balance. Written to the audit trail."
                confirmLabel="Confirm payment"
              />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function RefundSheet({
  visible,
  onClose,
  onSubmit,
  loading,
  maxCents,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (cents: number, reason: string) => void;
  loading?: boolean;
  maxCents: number;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const cents = rupeesToCents(amount);
  const ok = cents !== null && cents > 0 && cents <= maxCents && reason.trim().length >= 5;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Issue refund"
      subtitle={`Up to ${formatLKR(maxCents)}. Finance approves from the refund queue.`}
      scroll
      footer={
        <>
          <Button
            title="Raise refund"
            variant="danger"
            size="lg"
            full
            disabled={!ok}
            loading={loading}
            onPress={() => {
              if (cents === null) {
                setErr('Enter a valid amount.');
                return;
              }
              setErr(null);
              onSubmit(cents, reason.trim());
            }}
          />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        {err ? <Banner tone="danger" message={err} /> : null}
        <Field label="Amount (LKR)" required hint={`Max ${formatLKR(maxCents)}`}>
          <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
        </Field>
        <Field label="Reason" required hint={reason.trim().length >= 5 ? 'Ready' : `At least 5 characters (${reason.trim().length}/5)`}>
          <Input value={reason} onChangeText={setReason} multiline placeholder="Customer overcharged on delivery…" />
        </Field>
      </View>
    </Sheet>
  );
}
