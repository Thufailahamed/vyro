import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Banknote, CreditCard, Landmark, Search, type LucideIcon } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { formatCompactLKR, formatNumber } from '@/lib/format';
import { hasPermission, useAdminRole } from '@/features/admin/common/permissions';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';
import { ChipRow, IconButton, InkHero, Pulse, Screen, Text, Touchable } from '@/ui';
import { Appear, HeroGrid, HeroMetric, go } from '@/features/admin/platform/kit';
import { useLedgerSummary, useOpenChargebacks, usePayoutBatchQueue, useRefundQueue } from './api';
import { ChargebacksSection, CreditSection, LedgerSection, PayoutsSection, RefundsSection } from './MoneySections';

type Tab = 'refunds' | 'payouts' | 'ledger' | 'chargebacks' | 'credit';
const TABS: Tab[] = ['refunds', 'payouts', 'ledger', 'chargebacks', 'credit'];

function QuickLink({ icon: Icon, label, hint, onPress }: { icon: LucideIcon; label: string; hint: string; onPress: () => void }) {
  return (
    <Touchable
      onPress={onPress}
      hapticOnPress
      style={{
        width: 164,
        padding: 14,
        gap: 12,
        borderRadius: radii.xl,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.lineSoft,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={colors.volt} strokeWidth={1.7} />
        </View>
        <ArrowRight size={16} color={colors.ink5} />
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="h3">{label}</Text>
        <Text variant="caption" color="ink4" numberOfLines={1}>
          {hint}
        </Text>
      </View>
    </Touchable>
  );
}

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
      kicker="Treasury"
      title="Money"
      subtitle="Refunds, payout batches, the double-entry ledger, chargebacks and trade credit."
      right={
        <>
          {can('payment:read') ? <IconButton icon={Search} variant="surface" accessibilityLabel="Search payments" onPress={() => go('/admin/payments')} /> : null}
          <PortalSwitcher current="admin" />
        </>
      }
      onRefresh={() => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin') })}
    >
      <Appear>
        <InkHero seed="money-in-flight">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="overline" color="volt">
              Money in flight
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pulse color={needsAction ? colors.amber : colors.volt} size={7} />
              <Text variant="caption" color="paperMuted">
                {needsAction ? `${needsAction} awaiting action` : 'All clear'}
              </Text>
            </View>
          </View>
          <Text variant="metric" color="paper" style={{ marginTop: 10 }} numberOfLines={1} adjustsFontSizeToFit>
            {formatCompactLKR(inFlight)}
          </Text>
          <Text variant="caption" color="paperFaint">
            Pending refunds + unreleased payout batches
          </Text>
          <HeroGrid>
            <HeroMetric label="Pending refunds" value={formatCompactLKR(pendingRefundCents)} hint={`${formatNumber(pendingRefunds.length)} requests`} />
            <HeroMetric label="Pending batches" value={formatCompactLKR(pendingBatchCents)} hint={`${formatNumber(pendingBatches.length)} unreleased`} />
            <HeroMetric label="Open chargebacks" value={formatNumber(openCb)} hint="Disputed transactions" accent={openCb > 0} />
            <HeroMetric label="Ledger net" value={formatCompactLKR(ledger.data?.netCents ?? 0)} hint="Platform settled capital" />
          </HeroGrid>
        </InkHero>
      </Appear>

      {links.length ? (
        <Appear i={1}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
            {links.map((l) => (
              <QuickLink key={l.href} icon={l.icon} label={l.label} hint={l.hint} onPress={() => go(l.href)} />
            ))}
          </ScrollView>
        </Appear>
      ) : null}

      <Appear i={2}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Banknote size={14} color={colors.copper} />
            <Text variant="overline" color="copper">
              Control desk
            </Text>
          </View>
          <ChipRow<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'refunds', label: 'Refunds', count: pendingRefunds.length || undefined },
              { value: 'payouts', label: 'Payout batches', count: pendingBatches.length || undefined },
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
