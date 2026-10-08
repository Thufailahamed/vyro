import { useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  RefreshCw,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react-native';
import {
  AreaChart,
  Badge,
  Card,
  ChipRow,
  Donut,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  ListSection,
  Row,
  Screen,
  SearchBar,
  Sheet,
  Skeleton,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { Gate } from '@/features/common/Gate';
import { api, errorMessage, qs } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatCompactLKR, formatDate, formatLKR, formatRs, humanize } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { go, MethodDot, methodChartColor, methodLabel, MoneyRow, MonthGroups, monthlySeries, formatShort, statusTint, SummaryCard, TabStrip, termsLabel } from './shared';

type Tab = 'overview' | 'payments' | 'invoices' | 'refunds' | 'transactions' | 'credit';

const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'payments', label: 'Payments' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'transactions', label: 'Ledger' },
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
      title="Accounts"
      right={<IconButton icon={Sparkles} variant="ink" accessibilityLabel="Ask finance AI" onPress={() => go('/buyer/ask')} />}
      onRefresh={() => Promise.all([qc.refetchQueries({ queryKey: ['accounts'] }), qc.refetchQueries({ queryKey: ['credit-facility', businessId] })])}
      gap={20}
    >
      <View style={{ marginTop: -14 }}>
        <TabStrip tabs={TABS} value={tab} onChange={setTab} />
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

/* ------------------------------- Shared bits ------------------------------- */

function SectionTitle({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Row justify="space-between" style={{ paddingHorizontal: 2 }}>
      <Text variant="h2">{title}</Text>
      {action ? (
        <Touchable onPress={action.onPress} hapticOnPress style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="bodySm" weight="semibold" color="copper">
            {action.label}
          </Text>
          <ChevronRight size={15} color={colors.copper} />
        </Touchable>
      ) : null}
    </Row>
  );
}

function ChartCard({ title, data, color, onShare }: { title: string; data: { label: string; value: number }[]; color?: string; onShare: () => void }) {
  return (
    <Card padding={16} radius={radii['2xl']} style={{ gap: 6 }}>
      <Row justify="space-between">
        <View style={{ gap: 1 }}>
          <Text variant="h3">{title}</Text>
          <Text variant="caption" color="ink4">
            Last 6 months
          </Text>
        </View>
        <IconButton icon={Share2} size={36} variant="surface" accessibilityLabel={`Export ${title.toLowerCase()}`} onPress={onShare} />
      </Row>
      <AreaChart data={data} height={140} formatValue={(v) => formatCompactLKR(v)} color={color} />
    </Card>
  );
}

function paymentIcon(status: string) {
  return status === 'refunded' ? RefreshCw : status === 'failed' || status === 'cancelled' ? X : status === 'confirmed' ? Check : CreditCard;
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
        <Skeleton height={220} radius={28} />
        <Skeleton height={200} radius={22} />
      </View>
    );
  }
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const methods = d.byMethod.slice().sort((a, b) => b.cents - a.cents);
  const totalByMethod = methods.reduce((s, m) => s + m.cents, 0);
  const settledPct = d.totalSpendCents > 0 ? d.paidCents / d.totalSpendCents : 0;
  const breakdown = [
    { label: 'Paid', cents: d.paidCents, color: colors.mint },
    { label: 'Pending', cents: d.pendingCents, color: colors.amber },
    { label: 'Refunded', cents: d.refundedCents, color: colors.copper },
    { label: 'Outstanding', cents: d.outstandingCents, color: colors.rose },
  ];

  return (
    <View style={{ gap: 22 }}>
      {/* Spend card */}
      <Animated.View entering={enter(0)}>
        <View style={[{ borderRadius: 28, borderCurve: 'continuous', backgroundColor: colors.ink, overflow: 'hidden' }, shadow.ink]}>
          <LinearGradient pointerEvents="none" colors={['#2F3524', '#171A13', colors.ink]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient pointerEvents="none" colors={['rgba(198,220,74,0.16)', 'rgba(198,220,74,0)']} start={{ x: 1, y: 0 }} end={{ x: 0.35, y: 0.6 }} style={StyleSheet.absoluteFill} />
          <View style={{ padding: 22, gap: 16 }}>
            <Row justify="space-between">
              <Row gap={8}>
                <Wallet size={16} color={colors.volt} strokeWidth={2} />
                <Text variant="bodySm" weight="medium" color="paperMuted">
                  Total spend
                </Text>
              </Row>
              <Row gap={5} style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(250,247,240,0.1)' }}>
                <ShieldCheck size={12} color={colors.volt} strokeWidth={2.2} />
                <Text variant="caption" weight="semibold" color="paper">
                  Escrow
                </Text>
              </Row>
            </Row>
            <Text style={{ fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 46, letterSpacing: -1.2, color: colors.paper, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
              {formatRs(d.totalSpendCents)}
            </Text>
            <View style={{ gap: 8 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(250,247,240,0.1)', overflow: 'hidden' }}>
                <View style={{ width: `${settledPct * 100}%`, height: '100%', borderRadius: 4, backgroundColor: colors.volt }} />
              </View>
              <Text variant="caption" color="paperMuted">
                {Math.round(settledPct * 100)}% settled through escrow
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.paperLine }}>
            <HeroCell label="Outstanding" value={formatShort(d.outstandingCents)} danger={d.outstandingCents > 0} />
            <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.paperLine, marginVertical: 14 }} />
            <HeroCell label="Pending" value={formatShort(d.pendingCents)} />
          </View>
        </View>
      </Animated.View>

      {/* Breakdown */}
      <Animated.View entering={enter(1)} style={{ gap: 10 }}>
        <SectionTitle title="Breakdown" />
        <Card padding={0} radius={radii['2xl']} style={{ paddingHorizontal: 16 }}>
          {breakdown.map((b, i) => (
            <View key={b.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i === breakdown.length - 1 ? 0 : StyleSheet.hairlineWidth * 2, borderBottomColor: colors.lineSoft }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: b.color }} />
              <Text variant="body" style={{ flex: 1 }}>
                {b.label}
              </Text>
              <Text variant="body" weight="semibold" tabular>
                {formatLKR(b.cents)}
              </Text>
            </View>
          ))}
        </Card>
      </Animated.View>

      {/* Method mix */}
      {methods.length ? (
        <Animated.View entering={enter(2)} style={{ gap: 10 }}>
          <SectionTitle title="Payment methods" />
          <Card padding={18} radius={radii['2xl']} style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Donut size={112} thickness={14} data={methods.map((m) => ({ label: methodLabel(m.method), value: m.cents, color: methodChartColor(m.method) }))} centerValue={formatCompactLKR(totalByMethod)} centerLabel="volume" />
            <View style={{ flex: 1, gap: 12 }}>
              {methods.map((m) => {
                const pct = totalByMethod > 0 ? Math.round((m.cents / totalByMethod) * 100) : 0;
                return (
                  <View key={m.method} style={{ gap: 2 }}>
                    <Row justify="space-between">
                      <MethodDot method={m.method} />
                      <Text variant="caption" weight="semibold" tabular>
                        {pct}%
                      </Text>
                    </Row>
                    <Text variant="caption" color="ink5" style={{ marginLeft: 13 }}>
                      {formatCompactLKR(m.cents)} · {m.count} payment{m.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {/* Recent payments */}
      <Animated.View entering={enter(3)} style={{ gap: 10 }}>
        <SectionTitle title="Recent payments" action={d.recentPayments.length ? { label: 'See all', onPress: onSeeAll } : undefined} />
        {d.recentPayments.length === 0 ? (
          <EmptyCard icon={CreditCard} title="No payments yet" message="Settled payments and escrow releases will show up here." />
        ) : (
          <Card padding={0} radius={radii['2xl']} style={{ paddingHorizontal: 14 }}>
            {d.recentPayments.slice(0, 5).map((p, i, arr) => {
              const t = statusTint(p.status);
              return (
                <MoneyRow
                  key={p.id}
                  icon={paymentIcon(p.status)}
                  tint={t.fg}
                  tintBg={t.bg}
                  title={methodLabel(p.method)}
                  subtitle={formatDate(p.createdAt)}
                  amount={formatLKR(p.amountCents)}
                  meta={<StatusBadge status={p.status} size="sm" />}
                  onPress={() => go(`/buyer/accounts/payment/${p.id}`)}
                  last={i === arr.length - 1}
                />
              );
            })}
          </Card>
        )}
      </Animated.View>

      {/* Escrow note */}
      <Animated.View entering={enter(4)}>
        <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.mintSoft }}>
          <ShieldCheck size={18} color={colors.mint} strokeWidth={2} style={{ marginTop: 1 }} />
          <Text variant="bodySm" color="ink3" style={{ flex: 1 }}>
            Payments are held in licensed escrow until goods are received. Refunds settle within 1–2 business days.
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

function HeroCell({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingVertical: 14, gap: 3 }}>
      <Text variant="caption" color="paperFaint">
        {label}
      </Text>
      <Text variant="h3" numberOfLines={1} adjustsFontSizeToFit tabular style={{ color: danger ? colors.roseSoft : colors.paper }}>
        {value}
      </Text>
    </View>
  );
}

function EmptyCard({ icon: Icon, title, message }: { icon: typeof CreditCard; title: string; message: string }) {
  return (
    <Card padding={22} radius={radii['2xl']} style={{ alignItems: 'center', gap: 8 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon size={22} color={colors.ink3} strokeWidth={1.9} />
      </View>
      <Text variant="h3" align="center">
        {title}
      </Text>
      <Text variant="bodySm" color="ink4" align="center">
        {message}
      </Text>
    </Card>
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
  { value: 'online', label: 'payments.lk' },
  { value: 'cash', label: 'Cash on delivery' },
  { value: 'bank_transfer', label: 'Bank transfer' },
];

function PaymentsTab({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const active = [status ? STATUS_OPTS.find((o) => o.value === status) : null, method ? METHOD_OPTS.find((o) => o.value === method) : null].filter(Boolean) as { value: string; label: string }[];

  return (
    <View style={{ gap: 14 }}>
      <Row gap={10}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Reference, method or PO…" style={{ flex: 1 }} />
        <Touchable
          onPress={() => setFiltersOpen(true)}
          hapticOnPress
          scaleTo={0.92}
          accessibilityLabel="Filter payments"
          style={[{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: active.length ? colors.ink : colors.paper }, active.length ? shadow.ink : shadow.card]}
        >
          <SlidersHorizontal size={19} color={active.length ? colors.volt : colors.ink} strokeWidth={2} />
        </Touchable>
      </Row>
      {active.length ? (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {active.map((a) => (
            <Touchable
              key={a.label}
              onPress={() => (STATUS_OPTS.includes(a) ? setStatus('') : setMethod(''))}
              hapticOnPress
              accessibilityLabel={`Remove ${a.label} filter`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 12, paddingRight: 8, borderRadius: 16, backgroundColor: colors.ink }}
            >
              <Text variant="caption" weight="semibold" color="paper">
                {a.label}
              </Text>
              <X size={13} color={colors.paperMuted} strokeWidth={2.2} />
            </Touchable>
          ))}
        </Row>
      ) : null}

      {q.isLoading ? (
        <SkeletonList rows={5} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyCard icon={CreditCard} title={active.length || search ? 'No payments match' : 'No payments yet'} message={active.length || search ? 'Try clearing a filter or searching another reference.' : 'Settle a purchase order and its payment shows up here.'} />
      ) : (
        <>
          <ChartCard
            title="Payment volume"
            data={trend}
            onShare={() =>
              shareCsv(
                'VYRO payments',
                ['Reference', 'PO', 'Method', 'Status', 'Amount (LKR)', 'Date'],
                items.map((p) => [p.paymentNumber ?? p.id, p.purchaseOrderId, methodLabel(p.method), p.status, (p.amountCents / 100).toFixed(2), new Date(p.createdAt).toISOString()]),
              )
            }
          />
          <MonthGroups
            items={items}
            ts={(p) => p.createdAt}
            render={(p, last) => {
              const t = statusTint(p.status);
              return (
                <MoneyRow
                  key={p.id}
                  icon={paymentIcon(p.status)}
                  tint={t.fg}
                  tintBg={t.bg}
                  title={p.paymentNumber ?? `Payment ${p.id.slice(0, 8)}`}
                  subtitle={`${methodLabel(p.method)} · ${formatDate(p.createdAt)}`}
                  amount={formatLKR(p.amountCents)}
                  meta={<StatusBadge status={p.status} size="sm" />}
                  onPress={() => go(`/buyer/accounts/payment/${p.id}`)}
                  last={last}
                />
              );
            }}
          />
        </>
      )}

      <Sheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter payments" scroll>
        <View style={{ gap: 22 }}>
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="ink4" style={{ marginLeft: 6 }}>
              Status
            </Text>
            <ChipRow options={STATUS_OPTS} value={status} onChange={setStatus} />
          </View>
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="ink4" style={{ marginLeft: 6 }}>
              Method
            </Text>
            <ChipRow options={METHOD_OPTS} value={method} onChange={setMethod} />
          </View>
          <Touchable onPress={() => setFiltersOpen(false)} hapticOnPress style={{ height: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="body" weight="semibold" color="paper">
              Show results
            </Text>
          </Touchable>
        </View>
      </Sheet>
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
    <View style={{ gap: 18 }}>
      <SummaryCard
        label="Invoiced to date"
        cents={total}
        stats={[
          { label: 'Invoices', value: String(invoices.length) },
          { label: 'Paid', value: String(linked), color: colors.mint },
          { label: 'Average', value: formatShort(invoices.length ? Math.round(total / invoices.length) : 0) },
        ]}
      />
      {invoices.length === 0 ? (
        <EmptyCard icon={FileText} title="No invoices yet" message="Invoices are issued automatically when payments complete." />
      ) : (
        <MonthGroups
          items={invoices}
          ts={(i) => i.issuedAt}
          render={(inv, last) => (
            <MoneyRow
              key={inv.id}
              icon={FileText}
              tint={colors.volt}
              tintBg={colors.ink}
              title={inv.number}
              subtitle={`${humanize(inv.type)} · ${formatDate(inv.issuedAt)}`}
              amount={formatLKR(inv.totalCents)}
              meta={inv.paymentId ? <Badge label="Paid" tone="success" dot size="sm" /> : <Badge label="Unpaid" tone="warning" dot size="sm" />}
              onPress={() => go(`/buyer/order/${inv.purchaseOrderId}/invoice/${inv.id}`)}
              last={last}
            />
          )}
        />
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
    <View style={{ gap: 18 }}>
      <SummaryCard
        label="Total refunded"
        cents={total}
        stats={[
          { label: 'Refunds', value: String(refunds.length) },
          { label: 'In review', value: String(pending), color: pending ? colors.amber : undefined },
          { label: 'Settled', value: String(refunds.length - pending), color: colors.mint },
        ]}
      />
      {refunds.length === 0 ? (
        <EmptyCard icon={RefreshCw} title="No refunds" message="Refund requests and their outcomes will appear here. Request one from any payment." />
      ) : (
        <MonthGroups
          items={refunds}
          ts={(r) => r.createdAt}
          render={(r, last) => (
            <MoneyRow
              key={r.id}
              icon={RefreshCw}
              tint={colors.copperDeep}
              tintBg={colors.copperSoft}
              title={r.reason ?? 'Refund'}
              subtitle={`${r.refundNumber ?? r.id.slice(0, 8)} · ${formatDate(r.createdAt)}`}
              amount={`+${formatLKR(r.amountCents)}`}
              amountColor={colors.mint}
              meta={<StatusBadge status={r.status} size="sm" />}
              onPress={() => go(`/buyer/accounts/payment/${r.paymentId}`)}
              last={last}
            />
          )}
        />
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
    <View style={{ gap: 18 }}>
      <SummaryCard
        label="Net movement"
        value={`${net < 0 ? '−' : '+'}${formatRs(Math.abs(net))}`}
        caption="Credits minus debits, all time"
        stats={[
          { label: 'Money in', value: formatShort(credit), color: colors.mint },
          { label: 'Money out', value: formatShort(debit), color: colors.rose },
        ]}
      />
      {txs.length === 0 ? (
        <EmptyCard icon={Banknote} title="No ledger entries" message="Every debit and credit on your account will appear here." />
      ) : (
        <>
          <ChartCard
            title="Money out"
            data={trend}
            color={colors.ink}
            onShare={() =>
              shareCsv(
                'VYRO ledger',
                ['Date', 'Direction', 'Amount (LKR)', 'Category', 'Description', 'Reference'],
                txs.map((t) => [new Date(t.createdAt).toISOString(), t.direction, (t.amountCents / 100).toFixed(2), t.category ?? t.refType, t.description, t.refId]),
              )
            }
          />
          <View style={{ marginHorizontal: -20 }}>
            <ChipRow
              options={[
                { value: 'all', label: 'All', count: txs.length },
                { value: 'credit', label: 'Money in', count: txs.filter((t) => t.direction === 'credit').length },
                { value: 'debit', label: 'Money out', count: txs.filter((t) => t.direction === 'debit').length },
              ]}
              value={dir}
              onChange={setDir}
              style={{ paddingHorizontal: 20 }}
            />
          </View>
          <MonthGroups
            items={shown}
            ts={(t) => t.createdAt}
            render={(t, last) => {
              const isCredit = t.direction === 'credit';
              return (
                <MoneyRow
                  key={t.id}
                  icon={isCredit ? ArrowDownLeft : ArrowUpRight}
                  tint={isCredit ? colors.mint : colors.ink}
                  tintBg={isCredit ? colors.mintSoft : colors.bone}
                  title={t.description}
                  subtitle={`${humanize(t.category ?? t.refType)} · ${formatDate(t.createdAt)}`}
                  amount={`${isCredit ? '+' : '−'}${formatLKR(t.amountCents)}`}
                  amountColor={isCredit ? colors.mint : colors.ink}
                  last={last}
                />
              );
            }}
          />
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
  if (q.isLoading) return <Skeleton height={200} radius={28} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const f = q.data;
  if (!f?.facility) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Credit not available yet"
        message={f?.reason && f.reason !== 'credit_not_eligible' ? humanize(f.reason) : 'Complete 3 paid orders to unlock VYRO Credit.'}
        action={{ label: 'See how to unlock', onPress: () => go('/buyer/credit') }}
      />
    );
  }
  const used = f.facility.limitCents > 0 ? f.facility.usedCents / f.facility.limitCents : 0;
  const danger = (f.overdueCount ?? 0) > 0;
  return (
    <View style={{ gap: 18 }}>
      <Touchable onPress={() => go('/buyer/credit')} hapticOnPress scaleTo={0.985} accessibilityLabel="Open VYRO Credit">
        <View style={[{ borderRadius: 28, borderCurve: 'continuous', backgroundColor: colors.ink, overflow: 'hidden', padding: 22, gap: 16 }, shadow.ink]}>
          <LinearGradient pointerEvents="none" colors={['#2F3524', '#171A13', colors.ink]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Row justify="space-between">
            <Text variant="bodySm" weight="medium" color="paperMuted">
              Available credit
            </Text>
            <Badge label={danger ? 'Paused' : 'Active'} tone={danger ? 'danger' : 'volt'} dot size="sm" />
          </Row>
          <Text style={{ fontFamily: fonts.displayBold, fontSize: 36, lineHeight: 44, letterSpacing: -1.1, color: colors.paper, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
            {formatRs(f.availableCents)}
          </Text>
          <View style={{ gap: 8 }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(250,247,240,0.1)', overflow: 'hidden' }}>
              <View style={{ width: `${used * 100}%`, height: '100%', borderRadius: 4, backgroundColor: danger ? colors.rose : colors.volt }} />
            </View>
            <Row justify="space-between">
              <Text variant="caption" color="paperMuted">
                {Math.round(used * 100)}% of {formatCompactLKR(f.facility.limitCents)} used
              </Text>
              <Row gap={4}>
                <Text variant="caption" weight="semibold" color="volt">
                  Manage
                </Text>
                <ArrowRight size={13} color={colors.volt} />
              </Row>
            </Row>
          </View>
        </View>
      </Touchable>
      <ListSection>
        <ListRow icon={CreditCard} iconTone="paper" title="Default terms" subtitle={f.facility.defaultTerms ? termsLabel(f.facility.defaultTerms) : '—'} chevron={false} />
        <ListRow icon={Banknote} iconTone="paper" title="Drawn" subtitle={formatLKR(f.facility.usedCents)} chevron={false} last />
      </ListSection>
    </View>
  );
}
