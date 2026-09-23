import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Users, Target, ChartBar } from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDate, formatLKR, humanize } from '@/lib/format';
import {
  AreaChart,
  BarChart,
  Card,
  ChipRow,
  Donut,
  EmptyState,
  ErrorState,
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
        list.map((c) => (
          <Card key={c.businessId} kind="flat" onPress={() => router.push('/supplier/orders' as never)} style={{ gap: 4 }}>
            <Text variant="h3">{c.name}</Text>
            <Text variant="caption" color="ink4">
              {c.totalOrders} orders · Lifetime {formatLKR(c.totalCents)}
              {c.lastOrderAt ? ` · Last ${formatDate(c.lastOrderAt)}` : ''}
            </Text>
          </Card>
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
        shown.map((l) => (
          <Card key={l.id} kind="flat" style={{ gap: 6 }}>
            <StatusBadge status={l.status ?? l.tag ?? 'open'} size="sm" />
            <Text variant="h3">{l.businessName ?? l.title ?? 'Buyer lead'}</Text>
            <Text variant="caption" color="ink4">
              {l.status ? humanize(l.status) : 'New'}
              {l.totalCents ? ` · ${formatLKR(l.totalCents)}` : ''}
              {l.updatedAt ? ` · ${formatDate(l.updatedAt)}` : ''}
            </Text>
          </Card>
        ))
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
      <StatGrid>
        <Stat label="Revenue" value={formatCompactLKR(d.metrics.revenueCents)} hint={`${d.metrics.ordersCount} orders`} />
        <Stat label="Avg order" value={formatCompactLKR(d.metrics.avgOrderValueCents)} hint="Basket size" />
        <Stat label="Repeat rate" value={`${Math.round(d.metrics.repeatCustomerRate)}%`} hint="Returning buyers" />
        <Stat label="Low stock" value={d.metrics.lowStockCount} hint={`${d.metrics.avgLeadTimeDays}d lead`} />
      </StatGrid>
      <Card kind="flat" style={{ gap: 10 }}>
        <Text variant="h2">Revenue trend</Text>
        <AreaChart data={d.revenueTrend.map((p) => ({ label: p.day.slice(5), value: p.cents / 100 }))} formatValue={(v) => `Rs. ${Math.round(v).toLocaleString()}`} />
      </Card>
      <Card kind="flat" style={{ gap: 10 }}>
        <Text variant="h2">Orders per day</Text>
        <BarChart data={d.ordersByDay.map((p) => ({ label: p.day.slice(5), value: p.count }))} />
      </Card>
      <Card kind="flat" style={{ gap: 10 }}>
        <Text variant="h2">Top products</Text>
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
      </Card>
    </Screen>
  );
}
