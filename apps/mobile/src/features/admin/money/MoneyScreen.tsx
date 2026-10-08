import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { CreditCard, Landmark, Search, Wallet, type LucideIcon } from 'lucide-react-native';
import { formatCompactLKR, formatNumber } from '@/lib/format';
import { hasPermission, useAdminRole } from '@/features/admin/common/permissions';
import { ChipRow, InkHero, Screen, SectionHeader } from '@/ui';
import { Appear, go } from '@/features/admin/platform/kit';
import { AdminTabHeader, GlassStats, HeroFigure, HeroTopline, LinkTile } from '@/features/admin/ops/kit';
import { useLedgerSummary, useOpenChargebacks, usePayoutBatchQueue, useRefundQueue } from './api';
import { ChargebacksSection, CreditSection, LedgerSection, PayoutsSection, RefundsSection } from './MoneySections';

type Tab = 'refunds' | 'payouts' | 'ledger' | 'chargebacks' | 'credit';
const TABS: Tab[] = ['refunds', 'payouts', 'ledger', 'chargebacks', 'credit'];

export function MoneyScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'refunds');
  const qc = useQueryClient();
  const role = useAdminRole();
  const can = (p: string) => !role || hasPermission(role, p);

  // Top KPIs — fetched like the web regardless of tab; a 403 just shows zero.
  const refunds = useRefundQueue();
  const batches = usePayoutBatchQueue();
  const chargebacks = useOpenChargebacks();
  const ledger = useLedgerSummary({});

  const pendingRefunds = useMemo(() => (refunds.data ?? []).filter((r) => r.status === 'requested'), [refunds.data]);
  const pendingRefundCents = pendingRefunds.reduce((s, r) => s + r.amountCents, 0);
  const pendingBatches = useMemo(() => (batches.data ?? []).filter((b) => b.status === 'pending'), [batches.data]);
  const pendingBatchCents = pendingBatches.reduce((s, b) => s + b.totalCents, 0);
  const openCb = chargebacks.data?.length ?? 0;
  const inFlight = pendingRefundCents + pendingBatchCents;
  const needsAction = pendingRefunds.length + pendingBatches.length + openCb;

  const links = [
    can('payment:read') ? { icon: Search, label: 'Payments', hint: 'Cross-tenant search', href: '/admin/payments' } : null,
    can('payment:read') || can('payout:read') || can('invoice:read') ? { icon: CreditCard, label: 'Finance ops', hint: 'Recon, settlements', href: '/admin/finance' } : null,
    can('financial_report:read') || can('payment:read') ? { icon: Landmark, label: 'Accounts', hint: 'Statements & ledgers', href: '/admin/accounts' } : null,
  ].filter(Boolean) as { icon: LucideIcon; label: string; hint: string; href: string }[];

  return (
    <Screen
      tabBar
      header={<AdminTabHeader kicker="Treasury" title="Money" subtitle="Refunds, payouts, ledger, chargebacks and trade credit." />}
      onRefresh={() => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin') })}
    >
      <Appear>
        <InkHero seed="money-in-flight" style={{ padding: 18 }}>
          <HeroTopline icon={Wallet} label="Money in flight" status={needsAction ? `${needsAction} awaiting action` : 'All clear'} statusTone={needsAction ? 'warn' : 'ok'} />
          <HeroFigure value={formatCompactLKR(inFlight)} caption="Pending refunds + unreleased payout batches" />
          <GlassStats
            items={[
              { label: 'Pending refunds', value: formatCompactLKR(pendingRefundCents), hint: `${formatNumber(pendingRefunds.length)} requests`, warn: pendingRefunds.length > 0 },
              { label: 'Payout batches', value: formatCompactLKR(pendingBatchCents), hint: `${formatNumber(pendingBatches.length)} unreleased` },
              { label: 'Chargebacks', value: formatNumber(openCb), hint: 'Open disputes', warn: openCb > 0 },
              { label: 'Ledger net', value: formatCompactLKR(ledger.data?.netCents ?? 0), hint: 'Settled capital' },
            ]}
          />
        </InkHero>
      </Appear>

      {links.length ? (
        <Appear i={1}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {links.map((l) => (
              <LinkTile key={l.href} icon={l.icon} label={l.label} hint={l.hint} onPress={() => go(l.href)} />
            ))}
          </View>
        </Appear>
      ) : null}

      <Appear i={2}>
        <View>
          <SectionHeader kicker="Control desk" title="Work the queues" style={{ marginBottom: 10 }} />
          <ChipRow<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'refunds', label: 'Refunds', count: pendingRefunds.length || undefined },
              { value: 'payouts', label: 'Payouts', count: pendingBatches.length || undefined },
              { value: 'ledger', label: 'Ledger' },
              { value: 'chargebacks', label: 'Chargebacks', count: openCb || undefined },
              { value: 'credit', label: 'Credit' },
            ]}
          />
        </View>
      </Appear>

      {tab === 'refunds' ? <RefundsSection /> : null}
      {tab === 'payouts' ? <PayoutsSection /> : null}
      {tab === 'ledger' ? <LedgerSection /> : null}
      {tab === 'chargebacks' ? <ChargebacksSection /> : null}
      {tab === 'credit' ? <CreditSection /> : null}
    </Screen>
  );
}
