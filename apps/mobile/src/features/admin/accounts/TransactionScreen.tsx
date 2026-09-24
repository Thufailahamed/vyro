import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  BookOpenCheck,
  FileText,
  GitBranch,
  Landmark,
  ReceiptText,
  RotateCcw,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatDateTime, formatLKR } from '@/lib/format';
import { Card, IconTile, KeyValue, QueryView, Screen, StatusBadge, Text } from '@/ui';
import { colors } from '@/theme/tokens';
import { Section } from '@/features/admin/ops/kit';
import { AcctStatus } from '@/features/admin/money/accounts/shared';
import { go } from '@/features/admin/platform/kit';

interface Chain {
  order: { id: string; poNumber: string; status: string; businessId: string; supplierId: string; totalCents: number } | null;
  payment: {
    paymentNumber: string | null;
    amountCents: number;
    feeCents: number;
    netCents: number;
    method: string;
    provider: string;
    status: string;
    createdAt: number;
    paidAt: number | null;
  };
  attempts: { id: string; attemptNumber: number; status: string; failureReason: string | null }[];
  allocations: { supplierId: string; grossCents: number; commissionCents: number; netCents: number }[];
  invoices: { id: string; invoiceNumber: string | null; totalCents: number; status: string }[];
  refunds: { refundNumber: string | null; amountCents: number; status: string }[];
  earnings: { grossCents: number; commissionCents: number; netCents: number; eligibility: string }[];
  settlements: { settlement: { settlementNumber: string; status: string } | null; netCents: number }[];
  payouts: { payoutNumber: string | null; netCents: number; status: string }[];
  cod: { id: string; collectedCents: number; status: string }[];
  bankTransfers: { id: string; referenceNumber: string | null; expectedCents: number; status: string }[];
  ledger: { id: string; accountType: string; direction: string; amountCents: number; category: string | null; description: string }[];
  adjustments: { id: string; kind: string; amountCents: number; status: string; reason: string | null }[];
}

/**
 * /admin/accounts/payments/:id — the full money chain for one payment
 * (GET /admin/finance/payments/:id). Mirrors web AdminTransactionPage.
 */
export function AdminTransactionScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['admin-accounts', 'payment-chain', id],
    enabled: !!id,
    queryFn: () => api.get<Chain>(`/admin/finance/payments/${encodeURIComponent(id)}`),
  });

  return (
    <Screen
      back
      kicker="Accounts · Transaction"
      title={q.data?.payment.paymentNumber ?? 'Payment'}
      subtitle={q.data ? `Order ${q.data.order?.poNumber ?? '—'} · ${q.data.payment.method} via ${q.data.payment.provider}` : undefined}
      onRefresh={() => q.refetch()}
    >
      <QueryView query={q} empty={() => !q.data} emptyTitle="Payment not found" emptyMessage="This payment doesn't exist or you can't view it.">
        {(c) => (
          <View style={{ gap: 14 }}>
            <Section kicker="Payment" title="Summary" icon={ReceiptText} action={<StatusBadge status={c.payment.status} size="sm" />}>
              <View>
                <KeyValue label="Amount" value={formatLKR(c.payment.amountCents)} />
                <KeyValue label="Fee" value={formatLKR(c.payment.feeCents)} />
                <KeyValue label="Net" value={formatLKR(c.payment.netCents)} />
                <KeyValue label="When" value={formatDateTime(c.payment.paidAt ?? c.payment.createdAt)} last />
              </View>
            </Section>

            {c.order ? (
              <Card onPress={() => go(`/admin/order/${c.order!.id}`)} padding={16} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile icon={ReceiptText} tone="copper" size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="overline" color="copper">Linked purchase order</Text>
                  <Text variant="h3" numberOfLines={1}>{c.order.poNumber}</Text>
                  <Text variant="caption" color="ink4">{formatLKR(c.order.totalCents)}</Text>
                </View>
                <AcctStatus status={c.order.status} />
              </Card>
            ) : null}

            <ChainSection kicker={`Attempts · ${c.attempts.length}`} title="Payment attempts" icon={GitBranch}>
              {c.attempts.length === 0 ? <None /> : c.attempts.map((a) => (
                <Row key={a.id} left={`#${a.attemptNumber}`} right={<AcctStatus status={a.status} />} sub={a.failureReason ?? undefined} />
              ))}
            </ChainSection>

            <ChainSection kicker={`Allocations · ${c.allocations.length}`} title="Supplier allocations" icon={Wallet}>
              {c.allocations.length === 0 ? <None /> : c.allocations.map((a, i) => (
                <Row key={i} left={a.supplierId.slice(0, 12)} mono right={formatLKR(a.netCents)} sub={`gross ${formatLKR(a.grossCents)} − commission ${formatLKR(a.commissionCents)}`} />
              ))}
            </ChainSection>

            {c.invoices.length || c.cod.length || c.bankTransfers.length ? (
              <ChainSection kicker="Rails" title="Invoices & transfers" icon={FileText}>
                {c.invoices.map((inv) => (
                  <Row key={inv.id} left={inv.invoiceNumber ?? inv.id.slice(0, 10)} mono right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AcctStatus status={inv.status} /><Text variant="mono">{formatLKR(inv.totalCents)}</Text></View>} sub="Invoice" />
                ))}
                {c.cod.map((cd) => (
                  <Row key={cd.id} left="Cash on delivery" right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AcctStatus status={cd.status} /><Text variant="mono">{formatLKR(cd.collectedCents)}</Text></View>} />
                ))}
                {c.bankTransfers.map((t) => (
                  <Row key={t.id} left={t.referenceNumber ?? t.id.slice(0, 10)} mono right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AcctStatus status={t.status} /><Text variant="mono">{formatLKR(t.expectedCents)}</Text></View>} sub="Bank transfer" />
                ))}
              </ChainSection>
            ) : null}

            <ChainSection kicker={`Refunds · ${c.refunds.length}`} title="Refunds" icon={RotateCcw}>
              {c.refunds.length === 0 ? <None /> : c.refunds.map((r, i) => (
                <Row key={i} left={r.refundNumber ?? `#${i + 1}`} mono right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AcctStatus status={r.status} /><Text variant="mono">{formatLKR(r.amountCents)}</Text></View>} />
              ))}
            </ChainSection>

            <ChainSection kicker={`Earnings · ${c.earnings.length}`} title="Supplier earnings" icon={ArrowRightLeft}>
              {c.earnings.length === 0 ? <None /> : c.earnings.map((e, i) => (
                <Row key={i} left={<AcctStatus status={e.eligibility} />} right={formatLKR(e.netCents)} sub={`gross ${formatLKR(e.grossCents)} − commission ${formatLKR(e.commissionCents)}`} />
              ))}
            </ChainSection>

            <ChainSection kicker="Downstream" title="Settlement & payout" icon={Landmark}>
              {c.settlements.length === 0 && c.payouts.length === 0 ? (
                <Text variant="bodySm" color="ink4">Not yet settled.</Text>
              ) : (
                <>
                  {c.settlements.map((s, i) => (
                    <Row key={`s${i}`} left={s.settlement?.settlementNumber ?? '—'} mono right={formatLKR(s.netCents)} sub={s.settlement?.status} />
                  ))}
                  {c.payouts.map((p, i) => (
                    <Row key={`p${i}`} left={p.payoutNumber ?? '—'} mono right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AcctStatus status={p.status} /><Text variant="mono">{formatLKR(p.netCents)}</Text></View>} />
                  ))}
                </>
              )}
            </ChainSection>

            {c.adjustments.length ? (
              <ChainSection kicker={`Adjustments · ${c.adjustments.length}`} title="Manual adjustments" icon={SlidersHorizontal}>
                {c.adjustments.map((a) => (
                  <Row key={a.id} left={a.kind} right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><AcctStatus status={a.status} /><Text variant="mono">{formatLKR(a.amountCents)}</Text></View>} sub={a.reason ?? undefined} />
                ))}
              </ChainSection>
            ) : null}

            <ChainSection kicker={`Ledger · ${c.ledger.length}`} title="Ledger entries" icon={BookOpenCheck}>
              {c.ledger.length === 0 ? <None /> : c.ledger.map((l, i) => (
                <Row
                  key={l.id}
                  last={i === c.ledger.length - 1}
                  left={l.description}
                  right={formatLKR(l.direction === 'credit' ? l.amountCents : -l.amountCents)}
                  sub={`${l.accountType} · ${l.category ?? ''}`}
                />
              ))}
            </ChainSection>
          </View>
        )}
      </QueryView>
    </Screen>
  );
}

function None() {
  return (
    <Text variant="bodySm" color="ink4" style={{ paddingVertical: 6 }}>
      None recorded.
    </Text>
  );
}

function ChainSection({ kicker, title, icon, children }: { kicker: string; title: string; icon: typeof BookOpenCheck; children: ReactNode }) {
  return (
    <Section kicker={kicker} title={title} icon={icon}>
      <View>{children}</View>
    </Section>
  );
}

function Row({ left, right, sub, mono, last }: { left: ReactNode; right: ReactNode; sub?: string; mono?: boolean; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2,
        borderBottomColor: colors.lineSoft,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {typeof left === 'string' ? (
          <Text variant={mono ? 'mono' : 'bodySm'} weight={mono ? 'regular' : 'medium'} numberOfLines={1}>
            {left}
          </Text>
        ) : (
          left
        )}
        {sub ? (
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={{ flexShrink: 0, alignItems: 'flex-end' }}>
        {typeof right === 'string' ? <Text variant="mono">{right}</Text> : right}
      </View>
    </View>
  );
}
