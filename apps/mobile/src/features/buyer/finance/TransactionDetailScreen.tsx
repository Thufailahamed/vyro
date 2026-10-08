import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, CreditCard, FileText, Package, RefreshCw, RotateCcw, X, type LucideIcon } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Row,
  Screen,
  Sheet,
  Skeleton,
  StatusBadge,
  Text,
  Touchable,
  useToast,
} from '@/ui';
import { Gate } from '@/features/common/Gate';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatLKR, humanize, shortId } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import { go, methodLabel, MoneyText, statusTint } from './shared';

type Chain = {
  order: { id: string; poNumber: string; status: string; totalCents: number } | null;
  payment: {
    id: string;
    paymentNumber: string | null;
    amountCents: number;
    feeCents: number;
    netCents: number;
    method: string;
    provider: string;
    status: string;
    currency: string;
    providerReference: string | null;
    transactionReference: string | null;
    createdAt: number;
    paidAt: number | null;
  };
  attempts: { id: string; attemptNumber: number; provider: string; amountCents: number; status: string; failureReason: string | null; initiatedAt: number; completedAt: number | null }[];
  allocations: { supplierId: string; grossCents: number; commissionCents: number; commissionBps: number; netCents: number }[];
  invoices: { id: string; number: string; totalCents: number }[];
  refunds: { id: string; refundNumber: string | null; amountCents: number; status: string; reason: string | null; createdAt: number }[];
  earnings: { id: string; grossCents: number; commissionCents: number; refundCents: number; netCents: number; eligibility: string }[];
  settlements: { settlementId: string; netCents: number; settlement: { settlementNumber: string; status: string } | null }[];
  payouts: { id: string; payoutNumber: string | null; netCents: number; status: string }[];
  cod: { expectedCents: number; collectedCents: number | null; discrepancyCents: number; status: string; reconciliationStatus: string }[];
  bankTransfers: { referenceNumber: string; expectedCents: number; verifiedCents: number | null; status: string }[];
  ledger: { id: string; accountType: string; direction: string; amountCents: number; category: string | null; description: string; createdAt: number }[];
  adjustments: { id: string; adjustmentNumber: string; kind: string; amountCents: number; status: string; reason: string }[];
};

export function TransactionDetailScreen() {
  return (
    <Gate need="auth">
      <Inner />
    </Gate>
  );
}

function Inner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [refundOpen, setRefundOpen] = useState(false);
  const q = useQuery({
    queryKey: ['accounts', 'payment-chain', id],
    queryFn: () => api.get<Chain>(`/finance/payments/${id}`),
    enabled: !!id,
  });

  if (q.isLoading) {
    return (
      <Screen back title="Payment">
        <Skeleton height={190} radius={16} />
        <Skeleton height={90} radius={12} />
        <Skeleton height={90} radius={12} />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen back title="Payment">
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        <Button title="Back to accounts" variant="secondary" onPress={() => go('/buyer/accounts')} style={{ alignSelf: 'center' }} />
      </Screen>
    );
  }

  const c = q.data;
  const p = c.payment;
  const tint = statusTint(p.status);
  const StatusIcon: LucideIcon = p.status === 'refunded' ? RefreshCw : p.status === 'failed' || p.status === 'cancelled' ? X : p.status === 'confirmed' ? Check : CreditCard;
  let step = 0;
  const S = (title: string, done: boolean, children: ReactNode, last?: boolean) => (
    <StepCard key={title} index={step++} title={title} done={done} last={last}>
      {children}
    </StepCard>
  );

  return (
    <Screen
      back
      title="Payment"
      onRefresh={() => q.refetch()}
      gap={20}
      footer={<Button title="Request refund" icon={RotateCcw} variant="secondary" size="lg" full onPress={() => setRefundOpen(true)} />}
    >
      {/* Receipt */}
      <Animated.View entering={FadeInDown.duration(380)}>
        <Card padding={0} radius={radii['2xl']}>
          <View style={{ alignItems: 'center', paddingTop: 26, paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <StatusIcon size={24} color={tint.fg} strokeWidth={2.2} />
            </View>
            <Text variant="metric" align="center" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 34 }}>
              {formatLKR(p.amountCents)}
            </Text>
            <StatusBadge status={p.status} size="sm" />
            <Text variant="bodySm" color="ink4" align="center">
              {methodLabel(p.method)} · {formatDateTime(p.paidAt ?? p.createdAt)}
            </Text>
          </View>
          <View style={{ height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, marginHorizontal: 18 }} />
          <View style={{ paddingHorizontal: 18, paddingVertical: 8 }}>
            <Detail label="Reference" value={p.paymentNumber ?? shortId(p.id)} mono />
            <Detail label="Order" value={c.order?.poNumber ?? '—'} mono />
            <Detail label="Provider" value={humanize(p.provider)} />
            <Detail label="Fee" value={formatLKR(p.feeCents)} />
            <Detail label="Net" value={formatLKR(p.netCents)} strong last={!(p.transactionReference || p.providerReference)} />
            {p.transactionReference || p.providerReference ? <Detail label="Provider ref" value={(p.transactionReference ?? p.providerReference)!} mono last /> : null}
          </View>
        </Card>
      </Animated.View>

      {/* Shortcuts */}
      <Card padding={0} radius={radii['2xl']} style={{ flexDirection: 'row' }}>
        {[
          c.order ? { icon: Package, label: 'View order', onPress: () => go(`/buyer/order/${c.order!.id}`) } : null,
          c.order && c.invoices[0] ? { icon: FileText, label: 'Invoice', onPress: () => go(`/buyer/order/${c.order!.id}/invoice/${c.invoices[0].id}`) } : null,
          { icon: RotateCcw, label: 'Refund', onPress: () => setRefundOpen(true) },
        ]
          .filter((a): a is { icon: LucideIcon; label: string; onPress: () => void } => !!a)
          .map((a, i) => (
            <View key={a.label} style={{ flex: 1, flexDirection: 'row' }}>
              {i ? <View style={{ width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.lineSoft, marginVertical: 16 }} /> : null}
              <Touchable onPress={a.onPress} hapticOnPress scaleTo={0.94} accessibilityLabel={a.label} style={{ flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16 }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                  <a.icon size={19} color={colors.ink} strokeWidth={1.9} />
                </View>
                <Text variant="caption" weight="semibold" color="ink3">
                  {a.label}
                </Text>
              </Touchable>
            </View>
          ))}
      </Card>

      <Text variant="h2" style={{ marginTop: 6, marginBottom: -6, paddingHorizontal: 2 }}>
        Money trail
      </Text>
      <Card padding={18} radius={radii['2xl']}>
        {S(
          'Order',
          !!c.order,
          c.order ? (
            <Touchable onPress={() => go(`/buyer/order/${c.order!.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="bodySm" weight="semibold">
                  PO {c.order.poNumber}
                </Text>
                <StatusBadge status={c.order.status} size="sm" />
              </View>
              <MoneyText cents={c.order.totalCents} />
              <ChevronRight size={16} color={colors.ink5} />
            </Touchable>
          ) : (
            <Banner tone="warning" title="Order missing" message="This payment references an order that no longer exists — flagged for reconciliation." />
          ),
        )}
        {S(
          `Payment attempts (${c.attempts.length})`,
          p.status === 'confirmed',
          c.attempts.length === 0 ? (
            <Muted>No attempts recorded.</Muted>
          ) : (
            c.attempts.map((a) => (
              <Line key={a.id} left={<Row gap={8}><Text variant="bodySm">#{a.attemptNumber} · {a.provider}</Text><StatusBadge status={a.status} size="sm" /></Row>}>
                <Text variant="caption" color={a.failureReason ? 'rose' : 'ink4'} style={{ fontFamily: fonts.mono }}>
                  {a.failureReason ?? formatDateTime(a.completedAt ?? a.initiatedAt)}
                </Text>
              </Line>
            ))
          ),
        )}
        {c.allocations.length > 0 &&
          S(
            'Supplier allocation',
            true,
            c.allocations.map((a, i) => (
              <View key={i} style={{ gap: 4, paddingVertical: 6 }}>
                <Text variant="bodySm">
                  Supplier {shortId(a.supplierId)} · commission {a.commissionBps}bps
                </Text>
                <Text variant="caption" color="ink3" style={{ fontFamily: fonts.mono }}>
                  {formatLKR(a.grossCents)} − {formatLKR(a.commissionCents)} = {formatLKR(a.netCents)}
                </Text>
              </View>
            )),
          )}
        {c.invoices.length > 0 &&
          S(
            'Invoices',
            true,
            c.invoices.map((inv) => (
              <Touchable
                key={inv.id}
                onPress={() => (c.order ? go(`/buyer/order/${c.order.id}/invoice/${inv.id}`) : undefined)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}
              >
                <Text variant="bodySm" weight="semibold" style={{ textDecorationLine: 'underline' }}>
                  {inv.number}
                </Text>
                <MoneyText cents={inv.totalCents} size={13} />
              </Touchable>
            )),
          )}
        {c.cod.length > 0 &&
          S(
            'Cash on delivery',
            c.cod[0]?.status === 'collected',
            c.cod.map((x, i) => (
              <View key={i} style={{ gap: 6, paddingVertical: 6 }}>
                <Text variant="bodySm">
                  Expected {formatLKR(x.expectedCents)} · collected {x.collectedCents == null ? '—' : formatLKR(x.collectedCents)}
                </Text>
                <Row gap={6}>
                  <StatusBadge status={x.status} size="sm" />
                  <StatusBadge status={x.reconciliationStatus} size="sm" />
                </Row>
              </View>
            )),
          )}
        {c.bankTransfers.length > 0 &&
          S(
            'Bank transfer',
            c.bankTransfers[0]?.status === 'verified',
            c.bankTransfers.map((b, i) => (
              <View key={i} style={{ gap: 6, paddingVertical: 6 }}>
                <Row gap={8}>
                  <Text variant="mono">{b.referenceNumber}</Text>
                  <StatusBadge status={b.status} size="sm" />
                </Row>
                <Text variant="caption" color="ink3">
                  Expected {formatLKR(b.expectedCents)}
                  {b.verifiedCents != null ? ` · verified ${formatLKR(b.verifiedCents)}` : ''}
                </Text>
              </View>
            )),
          )}
        {c.refunds.length > 0 &&
          S(
            'Refunds',
            false,
            c.refunds.map((r) => (
              <Line key={r.id} left={<Row gap={8} style={{ flexShrink: 1 }}><Text variant="mono">{r.refundNumber ?? r.id.slice(0, 8)}</Text><StatusBadge status={r.status} size="sm" /></Row>} sub={r.reason ?? undefined}>
                <MoneyText cents={r.amountCents} size={13} />
              </Line>
            )),
          )}
        {c.earnings.length > 0 &&
          S(
            'Supplier earnings',
            true,
            c.earnings.map((e) => (
              <View key={e.id} style={{ gap: 6, paddingVertical: 6 }}>
                <Row justify="space-between">
                  <StatusBadge status={e.eligibility} size="sm" />
                  <MoneyText cents={e.netCents} size={13} />
                </Row>
                <Text variant="caption" color="ink3" style={{ fontFamily: fonts.mono }}>
                  Gross {formatLKR(e.grossCents)} − commission {formatLKR(e.commissionCents)} − refunds {formatLKR(e.refundCents)}
                </Text>
              </View>
            )),
          )}
        {c.settlements.length > 0 &&
          S(
            'Settlement',
            true,
            c.settlements.map((s, i) => (
              <Line key={i} left={<Row gap={8} style={{ flexShrink: 1 }}><Text variant="mono" numberOfLines={1}>{s.settlement?.settlementNumber ?? s.settlementId}</Text>{s.settlement ? <StatusBadge status={s.settlement.status} size="sm" /> : null}</Row>}>
                <MoneyText cents={s.netCents} size={13} />
              </Line>
            )),
          )}
        {c.payouts.length > 0 &&
          S(
            'Payout',
            true,
            c.payouts.map((x) => (
              <Line key={x.id} left={<Row gap={8}><Text variant="mono">{x.payoutNumber ?? x.id.slice(0, 8)}</Text><StatusBadge status={x.status} size="sm" /></Row>}>
                <MoneyText cents={x.netCents} size={13} />
              </Line>
            )),
          )}
        {c.adjustments.length > 0 &&
          S(
            'Adjustments',
            true,
            c.adjustments.map((a) => (
              <View key={a.id} style={{ gap: 6, paddingVertical: 6 }}>
                <Row justify="space-between">
                  <Row gap={8}>
                    <Text variant="mono">{a.adjustmentNumber}</Text>
                    <StatusBadge status={a.status} size="sm" />
                  </Row>
                  <MoneyText cents={a.amountCents} size={13} />
                </Row>
                <Text variant="caption" color="ink3">
                  {humanize(a.kind)} · {a.reason}
                </Text>
              </View>
            )),
          )}
        {S(
          'Ledger entries',
          true,
          c.ledger.length === 0 ? (
            <Muted>No ledger entries yet.</Muted>
          ) : (
            c.ledger.map((l) => (
              <Line key={l.id} left={<Text variant="bodySm" numberOfLines={2}>{l.description}</Text>} sub={`${l.category ?? l.accountType} · ${formatDateTime(l.createdAt)}`}>
                <MoneyText cents={l.amountCents} sign={l.direction === 'credit' ? '+' : '−'} color={l.direction === 'credit' ? 'mint' : 'rose'} size={13} />
              </Line>
            ))
          ),
          true,
        )}
      </Card>

      <RefundSheet visible={refundOpen} onClose={() => setRefundOpen(false)} paymentId={p.id} maxCents={p.amountCents} status={p.status} />
    </Screen>
  );
}

function Detail({ label, value, mono, strong, last }: { label: string; value: string; mono?: boolean; strong?: boolean; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2,
        borderBottomColor: colors.lineSoft,
      }}
    >
      <Text variant="bodySm" color="ink4">
        {label}
      </Text>
      <Text variant="bodySm" weight={strong ? 'semibold' : 'medium'} tabular numberOfLines={1} style={[{ flexShrink: 1, textAlign: 'right' }, mono ? { fontFamily: fonts.mono } : null]}>
        {value}
      </Text>
    </View>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return (
    <Text variant="bodySm" color="ink4">
      {children}
    </Text>
  );
}

function Line({ left, sub, children }: { left: ReactNode; sub?: string; children?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 7 }}>
      <View style={{ flex: 1, gap: 3 }}>
        {left}
        {sub ? (
          <Text variant="caption" color="ink4" numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** One node of the money trail — dot + rail on the left, content on the right. */
function StepCard({ title, done, children, index, last }: { title: string; done: boolean; children: ReactNode; index: number; last?: boolean }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 55).duration(380)} style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ alignItems: 'center', width: 22 }}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: done ? colors.ink : colors.paper,
            borderWidth: done ? 0 : 1.5,
            borderColor: colors.lineStrong,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {done ? <Check size={11} color={colors.volt} strokeWidth={3} /> : null}
        </View>
        {!last ? <View style={{ flex: 1, width: 1.5, backgroundColor: done ? colors.ink : colors.line, marginVertical: 3 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 18, gap: 6 }}>
        <Text variant="body" weight="semibold" style={{ lineHeight: 22 }}>
          {title}
        </Text>
        {children}
      </View>
    </Animated.View>
  );
}

function RefundSheet({ visible, onClose, paymentId, maxCents, status }: { visible: boolean; onClose: () => void; paymentId: string; maxCents: number; status: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [key] = useState(() => `refund-${paymentId}-${Date.now().toString(36)}`);

  const m = useMutation({
    mutationFn: (body: { amountCents?: number; reason: string; idempotencyKey: string }) => api.post(`/finance/payments/${paymentId}/refunds`, body),
    onSuccess: () => {
      toast.success('Refund requested', 'VYRO finance will review it shortly.');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setAmount('');
      setReason('');
      onClose();
    },
    onError: (e) => toast.error('Refund not requested', errorMessage(e)),
  });

  const submit = () => {
    setErr(null);
    let amountCents: number | undefined;
    if (amount.trim()) {
      const rupees = Number(amount.replace(/,/g, ''));
      if (!Number.isFinite(rupees) || rupees <= 0) return setErr('Enter a valid amount.');
      amountCents = Math.round(rupees * 100);
      if (amountCents > maxCents) return setErr(`Maximum is ${formatLKR(maxCents)}.`);
    }
    if (!reason.trim()) return setErr('Tell finance why you need a refund.');
    m.mutate({ ...(amountCents ? { amountCents } : {}), reason: reason.trim(), idempotencyKey: key });
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Request refund"
      subtitle="This sends a refund request to VYRO finance for approval. Money moves only after approval."
      footer={
        <>
          <Button title="Submit request" size="lg" full loading={m.isPending} onPress={submit} />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        {status !== 'confirmed' ? <Banner tone="warning" message={`Only confirmed payments can be refunded. This one is ${humanize(status).toLowerCase()}.`} /> : null}
        {err ? <Banner tone="danger" message={err} /> : null}
        <Field label="Amount" hint={`Leave blank to refund the full remaining amount (max ${formatLKR(maxCents)}).`}>
          <Input value={amount} onChangeText={setAmount} prefix="Rs." placeholder={(maxCents / 100).toFixed(2)} keyboardType="decimal-pad" />
        </Field>
        <Field label="Reason" required>
          <Input value={reason} onChangeText={setReason} placeholder="Damaged goods…" multiline maxLength={500} />
        </Field>
      </View>
    </Sheet>
  );
}
