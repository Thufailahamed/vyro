import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ChartBar, Flame, Repeat, ShoppingBag, ShoppingBasket, Target, TriangleAlert, TrendingUp, Trophy, Users } from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDate, formatLKR, humanize } from '@/lib/format';
import {
  AreaChart,
  Avatar,
  BarChart,
  ChipRow,
  Donut,
  EmptyState,
  ErrorState,
  IconTile,
  InkHero,
  Kicker,
  RankBars,
  Screen,
  SearchBar,
  Segmented,
  SkeletonList,
  Stat,
  StatGrid,
  StatusBadge,
  Text,
} from '@/ui';
import { Enter, ItemCard, Section } from '@/features/supplier/ops/kit';
import { useSupplierAnalytics, useSupplierCustomers, useSupplierLeads } from './api';

/* -------------------------------- Customers ------------------------------- */

export function SupplierCustomersScreen() {
  const supplierId = useSupplierId();
  const q = useSupplierCustomers(supplierId);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'spend' | 'orders' | 'recent'>('spend');

  const list = useMemo(() => {
    const all = q.data?.items ?? [];
    const t = search.trim().toLowerCase();
    const f = t ? all.filter((c) => c.name.toLowerCase().includes(t)) : all;
    return [...f].sort((a, b) =>
      sort === 'orders' ? b.totalOrders - a.totalOrders : sort === 'recent' ? (b.lastOrderAt ?? 0) - (a.lastOrderAt ?? 0) : b.totalCents - a.totalCents,
    );
  }, [q.data, search, sort]);

  if (q.isLoading)
    return (
      <Screen back kicker="CRM" title="Customers">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="CRM" title="Customers" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="CRM" title="Customers" subtitle={`${list.length} commercial buyers on record.`}>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search trading name…" />
      <Segmented value={sort} onChange={setSort} options={[{ value: 'spend', label: 'Spend' }, { value: 'orders', label: 'Orders' }, { value: 'recent', label: 'Recent' }]} />
      {list.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" message="Buyers appear here after placing orders." />
      ) : (
        list.map((c, i) => (
          <Enter key={c.businessId} i={i}>
            <ItemCard
              leading={<Avatar name={c.name} size={44} tone={i < 3 && sort === 'spend' ? 'volt' : 'ink'} />}
              title={c.name}
              subtitle={`${c.totalOrders} ${c.totalOrders === 1 ? 'order' : 'orders'}`}
              meta={c.lastOrderAt ? `Last order ${formatDate(c.lastOrderAt)}` : undefined}
              amount={formatLKR(c.totalCents)}
              amountSub="Lifetime"
              onPress={() => router.push('/supplier/orders' as never)}
            />
          </Enter>
        ))
      )}
    </Screen>
  );
}

/* ---------------------------------- Leads --------------------------------- */

type LeadFilter = 'all' | 'hot' | 'warm' | 'cold' | 'converted';

export function SupplierLeadsScreen() {
  const supplierId = useSupplierId();
  const q = useSupplierLeads(supplierId);
  const [filter, setFilter] = useState<LeadFilter>('all');

  const all = useMemo(() => q.data?.leads ?? [], [q.data]);
  const shown = useMemo(() => {
    if (filter === 'all') return all;
    if (filter === 'converted') return all.filter((l) => (l.status ?? '').toLowerCase().includes('convert'));
    return all.filter((l) => (l.tag ?? '').toLowerCase() === filter);
  }, [all, filter]);

  if (q.isLoading)
    return (
      <Screen back kicker="CRM" title="Leads">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="CRM" title="Leads" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="CRM" title="Leads" subtitle="Buyer RFQ pipeline and conversion stages.">
      <ChipRow<LeadFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: all.length },
          { value: 'hot', label: 'Hot', count: all.filter((l) => l.tag === 'hot').length },
          { value: 'warm', label: 'Warm', count: all.filter((l) => l.tag === 'warm').length },
          { value: 'cold', label: 'Cold', count: all.filter((l) => l.tag === 'cold').length },
          { value: 'converted', label: 'Converted', count: all.filter((l) => (l.status ?? '').toLowerCase().includes('convert')).length },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState icon={Target} title="No leads" message="Invited RFQs and buyer inquiries land here." />
      ) : (
        shown.map((l, i) => {
          const tag = (l.tag ?? '').toLowerCase();
          const converted = (l.status ?? '').toLowerCase().includes('convert');
          return (
            <Enter key={l.id} i={i}>
              <ItemCard
                icon={converted ? Trophy : tag === 'hot' ? Flame : Target}
                iconTone={converted ? 'success' : tag === 'hot' ? 'danger' : tag === 'warm' ? 'warning' : 'paper'}
                title={l.businessName ?? l.title ?? 'Buyer lead'}
                subtitle={`${l.status ? humanize(l.status) : 'New'}${tag ? ` · ${humanize(tag)}` : ''}`}
                meta={l.updatedAt ? `Updated ${formatDate(l.updatedAt)}` : undefined}
                badge={<StatusBadge status={l.status ?? l.tag ?? 'open'} size="sm" />}
                amount={l.totalCents ? formatLKR(l.totalCents) : undefined}
              />
            </Enter>
          );
        })
      )}
    </Screen>
  );
}

/* -------------------------------- Analytics ------------------------------- */

export function SupplierAnalyticsScreen() {
  const supplierId = useSupplierId();
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  const q = useSupplierAnalytics(supplierId, range);

  if (q.isLoading)
    return (
      <Screen back kicker="Intelligence" title="Analytics">
        <SkeletonList rows={6} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Intelligence" title="Analytics" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );
  const d = q.data;
  if (!d)
    return (
      <Screen back kicker="Intelligence" title="Analytics">
        <EmptyState icon={ChartBar} title="No analytics yet" message="Metrics compute once orders flow." />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="Intelligence" title="Analytics" subtitle="Revenue, demand and catalog performance.">
      <Segmented value={range} onChange={setRange} options={[{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }]} />
      <Enter>
        <InkHero seed={`analytics-${range}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <IconTile icon={TrendingUp} tone="glass" size={40} />
            <Text variant="caption" color="paperMuted">
              Last {range.replace('d', ' days')}
            </Text>
          </View>
          <View style={{ marginTop: 18, gap: 6 }}>
            <Kicker color="volt">Revenue</Kicker>
            <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 38, lineHeight: 42 }}>
              {formatCompactLKR(d.metrics.revenueCents)}
            </Text>
            <Text variant="caption" color="paperMuted">
              {d.metrics.ordersCount} orders in this period
            </Text>
          </View>
        </InkHero>
      </Enter>
      <StatGrid>
        <Stat label="Orders" value={d.metrics.ordersCount} hint="In this period" icon={ShoppingBag} accent />
        <Stat label="Avg order" value={formatCompactLKR(d.metrics.avgOrderValueCents)} hint="Basket size" icon={ShoppingBasket} />
        <Stat label="Repeat rate" value={`${Math.round(d.metrics.repeatCustomerRate)}%`} hint="Returning buyers" icon={Repeat} />
        <Stat label="Low stock" value={d.metrics.lowStockCount} hint={`${d.metrics.avgLeadTimeDays}d lead`} icon={TriangleAlert} />
      </StatGrid>
      <Section icon={TrendingUp} kicker="Trend" title="Revenue trend">
        <AreaChart data={d.revenueTrend.map((p) => ({ label: p.day.slice(5), value: p.cents / 100 }))} formatValue={(v) => `Rs. ${Math.round(v).toLocaleString()}`} />
      </Section>
      <Section icon={ChartBar} kicker="Demand" title="Orders per day">
        <BarChart data={d.ordersByDay.map((p) => ({ label: p.day.slice(5), value: p.count }))} />
      </Section>
      <Section icon={Trophy} kicker="Catalog" title="Top products">
        {d.topProducts.length === 0 ? (
          <EmptyState compact title="No sales yet" message="Top SKUs rank here by revenue." />
        ) : (
          <>
            <RankBars data={d.topProducts.slice(0, 5).map((p) => ({ label: p.name, value: p.revenueCents / 100 }))} formatValue={(v) => `Rs. ${Math.round(v).toLocaleString()}`} />
            <Donut
              data={d.topProducts.slice(0, 4).map((p) => ({ label: p.name, value: p.revenueCents }))}
              centerLabel="Top SKUs"
              centerValue={formatCompactLKR(d.topProducts.reduce((s, p) => s + p.revenueCents, 0))}
            />
          </>
        )}
      </Section>
    </Screen>
  );
}
