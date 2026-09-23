import { useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react-native';
import {
  AreaChart,
  Badge,
  Button,
  Card,
  ChipRow,
  Donut,
  EmptyState,
  ErrorState,
  IconButton,
  IconTile,
  InkHero,
  Kicker,
  ProgressBar,
  Pulse,
  Row,
  Screen,
  SearchBar,
  Skeleton,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { Gate } from '@/features/common/Gate';
import { api, errorMessage, qs } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatCompactLKR, formatDateTime, formatLKR, humanize } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import {
  go,
  KpiGrid,
  KpiTile,
  MethodDot,
  methodChartColor,
  methodLabel,
  MoneyText,
  monthlySeries,
  Panel,
  termsLabel,
} from './shared';

type Tab = 'overview' | 'payments' | 'invoices' | 'refunds' | 'transactions' | 'credit';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'payments', label: 'Payments' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'credit', label: 'Credit' },
];

interface Overview {
  totalSpendCents: number;
  paidCents: number;
  pendingCents: number;
  refundedCents: number;
  outstandingCents: number;
  byMethod: { method: string; cents: number; count: number }[];
  recentPayments: { id: string; amountCents: number; method: string; status: string; purchaseOrderId: string; createdAt: number }[];
}
interface PaymentRow {
  id: string;
  paymentNumber: string | null;
  amountCents: number;
  method: string;
  status: string;
  purchaseOrderId: string;
  createdAt: number;
}
interface InvoiceRow {
  id: string;
  number: string;
  type: string;
  totalCents: number;
  purchaseOrderId: string;
  issuedAt: number;
  paymentId: string | null;
}
interface RefundRow {
  id: string;
  refundNumber: string | null;
  paymentId: string;
  amountCents: number;
  status: string;
  reason: string | null;
  createdAt: number;
}
interface TxRow {
  id: string;
  direction: string;
  amountCents: number;
  refType: string;
  refId: string;
  category: string | null;
  description: string;
  createdAt: number;
}
interface FacilityLite {
  facility: { limitCents: number; usedCents: number; status: string; defaultTerms?: string } | null;
  availableCents: number;
  eligible: boolean;
  reason: string | null;
  overdueCount?: number;
  paidOrderCount?: number;
  requiredPaidOrders?: number;
}

const enter = (i: number) => FadeInDown.delay(Math.min(i, 8) * 45).duration(380);

async function shareCsv(title: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  try {
    await Share.share({ title, message: csv });
  } catch {
    /* user dismissed */
  }
}

export function AccountsScreen() {
  return (
    <Gate need="business">
      <AccountsInner />
    </Gate>
  );
}

function AccountsInner() {
  const businessId = useBusinessId()!;
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = TABS.some((t) => t.value === params.tab) ? (params.tab as Tab) : 'overview';
  const [tab, setTab] = useState<Tab>(initial);
  const qc = useQueryClient();

  return (
    <Screen
      back
      kicker="Business · Accounts"
      title="Accounts"
      subtitle="What you paid, how you paid, what's pending and what was refunded — across every supplier PO."
      right={<IconButton icon={Sparkles} variant="ink" accessibilityLabel="Ask finance AI" onPress={() => go('/buyer/ask')} />}
      onRefresh={() => Promise.all([qc.refetchQueries({ queryKey: ['accounts'] }), qc.refetchQueries({ queryKey: ['credit-facility', businessId] })])}
    >
      <Row gap={8}>
        <Pulse color={colors.copper} size={6} />
        <Badge label="Vyro Escrow Protected" tone="copper" icon={ShieldCheck} size="sm" />
      </Row>
      <View style={{ marginHorizontal: -20 }}>
        <ChipRow options={TABS} value={tab} onChange={setTab} style={{ paddingHorizontal: 20 }} />
      </View>
      {tab === 'overview' && <OverviewTab businessId={businessId} onSeeAll={() => setTab('payments')} />}
      {tab === 'payments' && <PaymentsTab businessId={businessId} />}
      {tab === 'invoices' && <InvoicesTab businessId={businessId} />}
      {tab === 'refunds' && <RefundsTab businessId={businessId} />}
      {tab === 'transactions' && <TransactionsTab businessId={businessId} />}
      {tab === 'credit' && <CreditTab businessId={businessId} />}
    </Screen>
  );
}

/* --------------------------------- Overview -------------------------------- */

function OverviewTab({ businessId, onSeeAll }: { businessId: string; onSeeAll: () => void }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-overview', businessId],
    queryFn: () => api.get<Overview>(`/finance/business/overview${qs({ businessId })}`),
  });

  if (q.isLoading) {
    return (
      <View style={{ gap: 12 }}>
        <Skeleton height={180} radius={16} />
        <Row gap={10}>
          <Skeleton height={92} radius={12} style={{ flex: 1 }} />
          <Skeleton height={92} radius={12} style={{ flex: 1 }} />
        </Row>
        <Skeleton height={220} radius={12} />
      </View>
    );
  }
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const methods = d.byMethod.slice().sort((a, b) => b.cents - a.cents);
  const totalByMethod = methods.reduce((s, m) => s + m.cents, 0);
  const settledPct = d.totalSpendCents > 0 ? d.paidCents / d.totalSpendCents : 0;

  return (
    <View style={{ gap: 16 }}>
      <Animated.View entering={enter(0)}>
        <InkHero seed={`accounts-${businessId}`}>
          <Kicker color="volt">Total spend · lifetime</Kicker>
          <Text variant="metric" color="paper" style={{ marginTop: 10 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatLKR(d.totalSpendCents)}
          </Text>
          <Text variant="caption" color="paperMuted" style={{ marginTop: 4 }}>
            Across all purchase orders
          </Text>
          <View style={{ marginTop: 18, gap: 8 }}>
            <Row justify="space-between">
              <Text variant="caption" color="paperMuted">
                Settled through escrow
              </Text>
              <Text variant="caption" color="volt" style={{ fontFamily: fonts.monoMedium }}>
                {Math.round(settledPct * 100)}%
              </Text>
            </Row>
            <ProgressBar value={settledPct} max={1} track={colors.paperLine} />
          </View>
          <Row gap={10} style={{ marginTop: 16 }}>
            <HeroFigure label="Outstanding" value={formatCompactLKR(d.outstandingCents)} tone={d.outstandingCents > 0 ? 'rose' : 'paper'} />
            <HeroFigure label="Pending" value={formatCompactLKR(d.pendingCents)} tone="paper" />
          </Row>
        </InkHero>
      </Animated.View>

      <Animated.View entering={enter(1)}>
        <KpiGrid>
          <KpiTile label="Paid" cents={d.paidCents} sub="Cleared through escrow" accent="mint" icon={CheckCircle2} />
          <KpiTile label="Pending" cents={d.pendingCents} sub="Awaiting settlement" accent="amber" icon={Clock} />
          <KpiTile label="Refunded" cents={d.refundedCents} sub="Returned to your account" accent="copper" icon={RefreshCw} />
          <KpiTile label="Outstanding" cents={d.outstandingCents} sub="Due on open POs" accent="rose" icon={CreditCard} />
        </KpiGrid>
      </Animated.View>

      <Animated.View entering={enter(2)}>
        <Panel
          title="By payment method"
          subtitle="Cumulative volume per method"
          icon={CreditCard}
          right={
            <Text variant="overline" color="ink4">
              {methods.length} methods
            </Text>
          }
        >
          {methods.length === 0 ? (
            <EmptyState compact icon={CreditCard} title="No payments yet" message="Once you settle a PO, your payment method mix shows up here." />
          ) : (
            <View style={{ gap: 18 }}>
              <Donut
                size={128}
                data={methods.map((m) => ({ label: methodLabel(m.method), value: m.cents, color: methodChartColor(m.method) }))}
                centerValue={formatCompactLKR(totalByMethod)}
                centerLabel="volume"
              />
              <View style={{ gap: 12 }}>
                {methods.map((m) => {
                  const pct = totalByMethod > 0 ? Math.min(100, (m.cents / totalByMethod) * 100) : 0;
                  return (
                    <View key={m.method} style={{ gap: 6 }}>
                      <Row justify="space-between">
                        <Row gap={6} style={{ flex: 1 }}>
                          <MethodDot method={m.method} label={false} />
                          <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
                            {methodLabel(m.method)}
                          </Text>
                          <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }}>
                            × {m.count}
                          </Text>
                        </Row>
                        <Row gap={8}>
                          <MoneyText cents={m.cents} size={13} />
                          <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono, width: 34, textAlign: 'right' }}>
                            {pct.toFixed(0)}%
                          </Text>
                        </Row>
                      </Row>
                      <ProgressBar value={pct} max={100} height={5} track={colors.bone} tone={toneForBar(methodChartColor(m.method))} />
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </Panel>
      </Animated.View>

      <Animated.View entering={enter(3)}>
        <Panel
          title="Recent payments"
          subtitle="Latest 5 settled transactions"
          icon={CreditCard}
          iconTone="copper"
          padding={d.recentPayments.length ? 6 : 16}
          right={
            <Touchable onPress={onSeeAll} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text variant="overline" color="copper">
                See all
              </Text>
              <ChevronRight size={12} color={colors.copper} />
            </Touchable>
          }
        >
          {d.recentPayments.length === 0 ? (
            <EmptyState compact icon={CreditCard} title="No payments yet" message="Settled payments and escrow releases will show up here." />
          ) : (
            d.recentPayments.slice(0, 5).map((p, i, arr) => (
              <Touchable
                key={p.id}
                hapticOnPress
                scaleTo={0.985}
                onPress={() => go(`/buyer/accounts/payment/${p.id}`)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderBottomWidth: i === arr.length - 1 ? 0 : StyleSheet.hairlineWidth * 2,
                  borderBottomColor: colors.lineSoft,
                }}
              >
                <IconTile icon={CreditCard} tone="paper" size={38} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Row gap={8}>
                    <StatusBadge status={p.status} size="sm" />
                    <MethodDot method={p.method} />
                  </Row>
                  <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }}>
                    {formatDateTime(p.createdAt)}
                  </Text>
                </View>
                <MoneyText cents={p.amountCents} />
                <ChevronRight size={16} color={colors.ink5} />
              </Touchable>
            ))
          )}
        </Panel>
      </Animated.View>

      <Animated.View entering={enter(4)}>
        <Card radius={radii['2xl']} style={{ flexDirection: 'row', gap: 14 }}>
          <IconTile icon={ShieldCheck} tone="success" size={42} />
          <View style={{ flex: 1, gap: 4 }}>
            <Kicker>Escrow-protected settlement</Kicker>
            <Text variant="bodySm" color="ink3">
              Every PayHere / bank transfer payment is held in licensed escrow until GRN or order completion. Refunds settle within 1–2 business days.
            </Text>
            <Row gap={6} style={{ marginTop: 4 }}>
              <Pulse color={colors.mint} size={5} />
              <Text variant="caption" color="ink3" style={{ fontFamily: fonts.mono }}>
                Finance API live
              </Text>
            </Row>
          </View>
        </Card>
      </Animated.View>

      <Row gap={10}>
        <Button title="View orders" icon={FileText} variant="secondary" size="sm" onPress={() => go('/buyer/orders')} style={{ flex: 1 }} />
        <Button title="Ask finance AI" icon={Sparkles} size="sm" onPress={() => go('/buyer/ask')} style={{ flex: 1 }} />
      </Row>
    </View>
  );
}

function toneForBar(c: string): 'volt' | 'copper' | 'success' | 'warning' | 'ink' {
  if (c === colors.volt) return 'volt';
  if (c === colors.copper) return 'copper';
  if (c === colors.mint) return 'success';
  if (c === colors.amber) return 'warning';
  return 'ink';
}

function HeroFigure({ label, value, tone }: { label: string; value: string; tone: 'paper' | 'rose' }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: 'rgba(250,247,240,0.07)', gap: 4 }}>
      <Text variant="overline" color="paperMuted">
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 16, color: tone === 'rose' ? colors.roseSoft : colors.paper }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

/* --------------------------------- Payments -------------------------------- */

const STATUS_OPTS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];
const METHOD_OPTS = [
  { value: '', label: 'All methods' },
  { value: 'online', label: 'PayHere' },
  { value: 'cash', label: 'Cash on delivery' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

function PaymentsTab({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['accounts', 'business-payments', businessId, status, method],
    queryFn: () => api.get<{ items: PaymentRow[] }>(`/finance/business/payments${qs({ businessId, status, method })}`),
  });
  const items = useMemo(() => {
    const list = q.data?.items ?? [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(
      (p) => (p.paymentNumber ?? p.id).toLowerCase().includes(s) || p.method.toLowerCase().includes(s) || p.purchaseOrderId.toLowerCase().includes(s),
    );
  }, [q.data, search]);
  const trend = useMemo(() => monthlySeries(items, (p) => p.createdAt, (p) => p.amountCents), [items]);

  return (
    <View style={{ gap: 14 }}>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Reference, method or PO ID…" />
      <View style={{ marginHorizontal: -20, gap: 8 }}>
        <ChipRow options={STATUS_OPTS} value={status} onChange={setStatus} style={{ paddingHorizontal: 20 }} />
        <ChipRow options={METHOD_OPTS} value={method} onChange={setMethod} style={{ paddingHorizontal: 20 }} />
      </View>

      {q.isLoading ? (
        <SkeletonList rows={5} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={CreditCard} title="No payments match" message="Try adjusting the filters, or settle a PO to see payments here." />
      ) : (
        <>
          <Card>
            <Row justify="space-between" style={{ marginBottom: 8 }}>
              <Kicker>Payment volume · 6 months</Kicker>
              <IconButton
                icon={Share2}
                size={32}
                variant="surface"
                accessibilityLabel="Export payments"
                onPress={() =>
                  shareCsv(
                    'VYRO payments',
                    ['Reference', 'PO', 'Method', 'Status', 'Amount (LKR)', 'Date'],
                    items.map((p) => [p.paymentNumber ?? p.id, p.purchaseOrderId, methodLabel(p.method), p.status, (p.amountCents / 100).toFixed(2), new Date(p.createdAt).toISOString()]),
                  )
                }
              />
            </Row>
            <AreaChart data={trend} height={150} formatValue={(v) => formatCompactLKR(v)} />
          </Card>
          <Text variant="caption" color="ink4">
            {items.length} payment{items.length === 1 ? '' : 's'}
          </Text>
          {items.map((p, i) => (
            <Animated.View key={p.id} entering={enter(i)}>
              <Card onPress={() => go(`/buyer/accounts/payment/${p.id}`)} padding={14} style={{ gap: 12 }}>
                <Row justify="space-between" align="center" gap={12}>
                  <IconTile icon={CreditCard} tone={p.status === 'confirmed' ? 'success' : p.status === 'failed' || p.status === 'cancelled' ? 'danger' : 'paper'} size={42} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="mono" style={{ fontFamily: fonts.monoMedium }} numberOfLines={1}>
                      {p.paymentNumber ?? p.id.slice(0, 12)}
                    </Text>
                    <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }}>
                      PO {p.purchaseOrderId.slice(0, 8)}
                    </Text>
                  </View>
                  <MoneyText cents={p.amountCents} size={15} />
                </Row>
                <Row justify="space-between">
                  <Row gap={10}>
                    <StatusBadge status={p.status} size="sm" />
                    <MethodDot method={p.method} />
                  </Row>
                  <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }}>
                    {formatDateTime(p.createdAt)}
                  </Text>
                </Row>
              </Card>
            </Animated.View>
          ))}
        </>
      )}
    </View>
  );
}

/* --------------------------------- Invoices -------------------------------- */

function InvoicesTab({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-invoices', businessId],
    queryFn: () => api.get<{ invoices: InvoiceRow[] }>(`/finance/business/invoices${qs({ businessId })}`),
  });
  if (q.isLoading) return <SkeletonList rows={5} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const invoices = q.data?.invoices ?? [];
  const total = invoices.reduce((s, i) => s + i.totalCents, 0);
  const linked = invoices.filter((i) => i.paymentId).length;

  return (
    <View style={{ gap: 14 }}>
      <KpiGrid>
        <KpiTile label="Invoices issued" cents={total} sub={`${invoices.length} total`} accent="ink" icon={FileText} style={{ flexBasis: '100%' }} />
        <KpiTile label="Linked to payment" value={linked} sub={`${invoices.length - linked} pending link`} accent="mint" icon={CheckCircle2} />
        <KpiTile label="Avg. invoice" cents={invoices.length ? Math.round(total / invoices.length) : 0} sub="Across all POs" accent="copper" icon={TrendingUp} />
      </KpiGrid>
      {invoices.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices yet" message="Invoices are issued automatically when payments complete." />
      ) : (
        invoices.map((inv, i) => (
          <Animated.View key={inv.id} entering={enter(i)}>
            <Card onPress={() => go(`/buyer/order/${inv.purchaseOrderId}/invoice/${inv.id}`)} padding={14} style={{ gap: 12 }}>
              <Row justify="space-between" align="center" gap={12}>
                <IconTile icon={FileText} tone="ink" size={42} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="mono" style={{ fontFamily: fonts.monoMedium }}>
                    {inv.number}
                  </Text>
                  <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }}>
                    PO {inv.purchaseOrderId.slice(0, 8)} · {formatDateTime(inv.issuedAt)}
                  </Text>
                </View>
                <MoneyText cents={inv.totalCents} size={15} />
              </Row>
              <Row justify="space-between">
                <Row gap={8}>
                  <Badge label={humanize(inv.type)} size="sm" />
                  {inv.paymentId ? <Badge label="Linked" tone="success" dot size="sm" /> : <Badge label="Unlinked" tone="warning" dot size="sm" />}
                </Row>
                <Row gap={2}>
                  <Text variant="caption" weight="semibold">
                    Open
                  </Text>
                  <ChevronRight size={14} color={colors.ink} />
                </Row>
              </Row>
            </Card>
          </Animated.View>
        ))
      )}
    </View>
  );
}

/* --------------------------------- Refunds --------------------------------- */

function RefundsTab({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-refunds', businessId],
    queryFn: () => api.get<{ refunds: RefundRow[] }>(`/finance/business/refunds${qs({ businessId })}`),
  });
  if (q.isLoading) return <SkeletonList rows={4} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const refunds = q.data?.refunds ?? [];
  const total = refunds.reduce((s, r) => s + r.amountCents, 0);
  const pending = refunds.filter((r) => ['pending', 'requested'].includes(r.status)).length;

  return (
    <View style={{ gap: 14 }}>
      <KpiGrid>
        <KpiTile label="Total refunded" cents={total} sub={`${refunds.length} refund${refunds.length === 1 ? '' : 's'}`} accent="copper" icon={RefreshCw} style={{ flexBasis: '100%' }} />
        <KpiTile label="Pending review" value={pending} sub="Awaiting finance team" accent="amber" icon={Clock} />
        <KpiTile label="Settled" value={refunds.length - pending} sub="Returned to account" accent="mint" icon={CheckCircle2} />
      </KpiGrid>
      {refunds.length === 0 ? (
        <EmptyState icon={RefreshCw} title="No refunds" message="Refund requests and their outcomes will appear here." />
      ) : (
        refunds.map((r, i) => (
          <Animated.View key={r.id} entering={enter(i)}>
            <Card onPress={() => go(`/buyer/accounts/payment/${r.paymentId}`)} padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile icon={RefreshCw} tone="copper" size={42} />
              <View style={{ flex: 1, gap: 4 }}>
                <Row gap={8}>
                  <Text variant="mono" style={{ fontFamily: fonts.monoMedium, flexShrink: 1 }} numberOfLines={1}>
                    {r.refundNumber ?? r.id.slice(0, 12)}
                  </Text>
                  <StatusBadge status={r.status} size="sm" />
                </Row>
                <Text variant="caption" color="ink4" numberOfLines={2}>
                  {r.reason ?? 'No reason given'} · {formatDateTime(r.createdAt)}
                </Text>
              </View>
              <MoneyText cents={r.amountCents} />
            </Card>
          </Animated.View>
        ))
      )}
    </View>
  );
}

/* ------------------------------- Transactions ------------------------------ */

type Dir = 'all' | 'credit' | 'debit';

function TransactionsTab({ businessId }: { businessId: string }) {
  const [dir, setDir] = useState<Dir>('all');
  const q = useQuery({
    queryKey: ['accounts', 'business-transactions', businessId],
    queryFn: () => api.get<{ transactions: TxRow[] }>(`/finance/business/transactions${qs({ businessId })}`),
  });
  const txs = useMemo(() => q.data?.transactions ?? [], [q.data]);
  const trend = useMemo(() => monthlySeries(txs, (t) => t.createdAt, (t) => (t.direction === 'debit' ? t.amountCents : 0)), [txs]);
  if (q.isLoading) return <SkeletonList rows={6} height={64} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const credit = txs.filter((t) => t.direction === 'credit').reduce((s, t) => s + t.amountCents, 0);
  const debit = txs.filter((t) => t.direction === 'debit').reduce((s, t) => s + t.amountCents, 0);
  const net = credit - debit;
  const shown = dir === 'all' ? txs : txs.filter((t) => t.direction === dir);

  return (
    <View style={{ gap: 14 }}>
      <KpiGrid>
        <KpiTile label="Total credits" cents={credit} sub="Refunds, returns, adjustments" accent="mint" icon={ArrowDownLeft} />
        <KpiTile label="Total debits" cents={debit} sub="Settlements, fees" accent="rose" icon={ArrowUpRight} />
        <KpiTile label="Net movement" cents={net} sub="Credit − debit" accent={net >= 0 ? 'mint' : 'rose'} icon={TrendingUp} style={{ flexBasis: '100%' }} />
      </KpiGrid>
      {txs.length === 0 ? (
        <EmptyState icon={Banknote} title="No transactions" message="Your financial ledger entries will appear here." />
      ) : (
        <>
          <Card>
            <Row justify="space-between" style={{ marginBottom: 8 }}>
              <Kicker>Debits · 6 months</Kicker>
              <IconButton
                icon={Share2}
                size={32}
                variant="surface"
                accessibilityLabel="Export ledger"
                onPress={() =>
                  shareCsv(
                    'VYRO ledger',
                    ['Date', 'Direction', 'Amount (LKR)', 'Category', 'Description', 'Reference'],
                    txs.map((t) => [new Date(t.createdAt).toISOString(), t.direction, (t.amountCents / 100).toFixed(2), t.category ?? t.refType, t.description, t.refId]),
                  )
                }
              />
            </Row>
            <AreaChart data={trend} height={150} formatValue={(v) => formatCompactLKR(v)} color={colors.ink} />
          </Card>
          <View style={{ marginHorizontal: -20 }}>
            <ChipRow
              options={[
                { value: 'all', label: 'All', count: txs.length },
                { value: 'credit', label: 'Credits', count: txs.filter((t) => t.direction === 'credit').length },
                { value: 'debit', label: 'Debits', count: txs.filter((t) => t.direction === 'debit').length },
              ]}
              value={dir}
              onChange={setDir}
              style={{ paddingHorizontal: 20 }}
            />
          </View>
          {shown.map((t, i) => {
            const isCredit = t.direction === 'credit';
            return (
              <Animated.View key={t.id} entering={enter(i)}>
                <Card padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <IconTile icon={isCredit ? ArrowDownLeft : ArrowUpRight} tone={isCredit ? 'success' : 'danger'} size={42} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                      {t.description}
                    </Text>
                    <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }} numberOfLines={1}>
                      {t.category ?? t.refType} · {formatDateTime(t.createdAt)}
                    </Text>
                  </View>
                  <MoneyText cents={t.amountCents} sign={isCredit ? '+' : '−'} color={isCredit ? 'mint' : 'rose'} size={13} />
                </Card>
              </Animated.View>
            );
          })}
        </>
      )}
    </View>
  );
}

/* ---------------------------------- Credit --------------------------------- */

function CreditTab({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['credit-facility', businessId],
    queryFn: () => api.get<FacilityLite>(`/credit/facility${qs({ businessId })}`),
  });
  if (q.isLoading) return <Skeleton height={160} radius={16} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const f = q.data;
  if (!f?.facility) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Credit not available"
        message={f?.reason && f.reason !== 'credit_not_eligible' ? humanize(f.reason) : 'Complete 3 paid orders to unlock VYRO Credit.'}
        action={{ label: 'See how to unlock', onPress: () => go('/buyer/credit') }}
      />
    );
  }
  const used = f.facility.limitCents > 0 ? f.facility.usedCents / f.facility.limitCents : 0;
  return (
    <Card kind="ink" flow={`credit-mini-${businessId}`} padding={18} onPress={() => go('/buyer/credit')} style={{ gap: 12 }}>
      <Kicker color="volt">Available credit</Kicker>
      <Text variant="metric" color="volt" numberOfLines={1} adjustsFontSizeToFit>
        {formatLKR(f.availableCents)}
      </Text>
      <ProgressBar value={used} max={1} track={colors.paperLine} tone={(f.overdueCount ?? 0) > 0 ? 'danger' : 'volt'} />
      <Row justify="space-between">
        <Text variant="caption" color="paperMuted">
          {Math.round(used * 100)}% of {formatCompactLKR(f.facility.limitCents)} used
          {f.facility.defaultTerms ? ` · ${termsLabel(f.facility.defaultTerms)}` : ''}
        </Text>
        <Row gap={2}>
          <Text variant="caption" color="volt" weight="semibold">
            Open VYRO Credit
          </Text>
          <ChevronRight size={14} color={colors.volt} />
        </Row>
      </Row>
    </Card>
  );
}
