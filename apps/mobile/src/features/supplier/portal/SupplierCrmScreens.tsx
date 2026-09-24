import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChartBar, Flame, Repeat, ShoppingBag, ShoppingBasket, Target, TriangleAlert, TrendingUp, Trophy, Users } from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDate, formatLKR, humanize } from '@/lib/format';
import {
  AreaChart,
  Avatar,
  BarChart,
  Button,
  ChipRow,
  Donut,
  EmptyState,
  ErrorState,
  IconTile,
  InkHero,
  Input,
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
  useToast,
} from '@/ui';
import { Enter, ItemCard, Section } from '@/features/supplier/ops/kit';
import {
  useAddLeadNote,
  useCrmSummary,
  useSetLeadStatus,
  useSetLeadTag,
  useSupplierAnalytics,
  useSupplierCustomers,
  useSupplierLead,
  useSupplierLeadNotes,
  useSupplierLeads,
} from './api';

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

const STATUS_STEPS = ['new', 'contacted', 'quoted', 'won', 'lost'] as const;

export function SupplierLeadsScreen() {
  const supplierId = useSupplierId();
  const [filter, setFilter] = useState<LeadFilter>('all');
  const q = useSupplierLeads(
    supplierId,
    filter === 'hot' || filter === 'warm' || filter === 'cold' ? filter : null,
    filter === 'converted' ? 'won' : null,
  );
  const summary = useCrmSummary(supplierId);

  const leads = useMemo(() => (q.data ? q.data.pages.flatMap((p) => p.leads) : []), [q.data]);
  const nextCursor = q.data ? q.data.pages.at(-1)?.nextCursor ?? null : null;

  const counts = useMemo(() => {
    const t = summary.data;
    if (!t) return null;
    return {
      all: t.totals.leads,
      hot: t.byTag.hot,
      warm: t.byTag.warm,
      cold: t.byTag.cold,
      converted: t.byStatus.won,
    } satisfies Record<LeadFilter, number>;
  }, [summary.data]);

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
    <Screen
      back
      onRefresh={() => q.refetch()}
      kicker="CRM"
      title="Leads"
      subtitle="Buyer RFQ pipeline and conversion stages."
    >
      <ChipRow<LeadFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: counts?.all ?? leads.length },
          { value: 'hot', label: 'Hot', count: counts?.hot ?? 0 },
          { value: 'warm', label: 'Warm', count: counts?.warm ?? 0 },
          { value: 'cold', label: 'Cold', count: counts?.cold ?? 0 },
          { value: 'converted', label: 'Converted', count: counts?.converted ?? 0 },
        ]}
      />
      {leads.length === 0 ? (
        <EmptyState icon={Target} title="No leads" message="Invited RFQs and buyer inquiries land here." />
      ) : (
        leads.map((l, i) => {
          const tag = l.tag;
          const won = l.conversionStatus === 'won';
          return (
            <Enter key={l.id} i={i}>
              <ItemCard
                icon={won ? Trophy : tag === 'hot' ? Flame : Target}
                iconTone={won ? 'success' : tag === 'hot' ? 'danger' : tag === 'warm' ? 'warning' : 'paper'}
                title={l.buyerName}
                subtitle={`${humanize(l.status)}${tag ? ` · ${humanize(tag)}` : ''}`}
                meta={l.quotedAt ? `Quoted ${formatDate(l.quotedAt)}` : `Invited ${formatDate(l.invitedAt)}`}
                badge={
                  l.conversionStatus ? (
                    <StatusBadge status={l.conversionStatus === 'won' ? 'won' : l.conversionStatus} size="sm" />
                  ) : undefined
                }
                amount={l.orderValueCents ? formatLKR(l.orderValueCents) : undefined}
                amountSub="Order value"
                onPress={() => router.push(`/supplier/leads/${l.id}` as never)}
              />
            </Enter>
          );
        })
      )}
      {nextCursor ? (
        <Button
          variant="ghost"
          title={q.isFetchingNextPage ? 'Loading…' : 'Load older leads'}
          onPress={() => void q.fetchNextPage()}
        />
      ) : null}
    </Screen>
  );
}

/* ------------------------------ Lead detail ------------------------------- */

export function SupplierLeadDetailScreen() {
  const supplierId = useSupplierId();
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const toast = useToast();
  const q = useSupplierLead(supplierId, leadId);
  const notes = useSupplierLeadNotes(supplierId, leadId);
  const setTag = useSetLeadTag(supplierId);
  const setStatus = useSetLeadStatus(supplierId);
  const addNote = useAddLeadNote(supplierId);
  const [noteText, setNoteText] = useState('');

  const onMutationError = (e: unknown) => toast.error('Could not update lead', errorMessage(e));

  const lead = q.data?.lead;

  if (q.isLoading)
    return (
      <Screen back kicker="CRM" title="Lead">
        <SkeletonList rows={4} />
      </Screen>
    );
  if (q.isError || !lead)
    return (
      <Screen back kicker="CRM" title="Lead" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error) ?? 'Lead not found.'} onRetry={() => q.refetch()} />
      </Screen>
    );

  return (
    <Screen
      back
      onRefresh={() => q.refetch()}
      kicker="CRM"
      title={lead.buyerName}
      subtitle={`RFQ #${lead.rfqId}`}
    >
      <Enter>
        <ItemCard
          icon={lead.conversionStatus === 'won' ? Trophy : lead.tag === 'hot' ? Flame : Target}
          iconTone={
            lead.conversionStatus === 'won' ? 'success' : lead.tag === 'hot' ? 'danger' : lead.tag === 'warm' ? 'warning' : 'paper'
          }
          title={lead.buyerName}
          subtitle={`${humanize(lead.status)} · ${lead.buyerVerified ? 'Verified buyer' : 'Unverified buyer'}`}
          meta={
            lead.quotedAt
              ? `Quoted ${formatDate(lead.quotedAt)}`
              : `Invited ${formatDate(lead.invitedAt)}`
          }
          amount={lead.orderValueCents ? formatLKR(lead.orderValueCents) : undefined}
          amountSub="Order value"
        />
      </Enter>

      <Section icon={Target} kicker="Temperature" title="Lead tag">
        <ChipRow<'hot' | 'warm' | 'cold' | 'none'>
          value={lead.tag ?? 'none'}
          onChange={(next) => setTag.mutate({ leadId: lead.id, tag: next === 'none' ? null : next }, { onError: onMutationError })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'hot', label: 'Hot' },
            { value: 'warm', label: 'Warm' },
            { value: 'cold', label: 'Cold' },
          ]}
        />
      </Section>

      <Section icon={TrendingUp} kicker="Pipeline" title="Conversion status">
        <ChipRow<(typeof STATUS_STEPS)[number]>
          value={lead.conversionStatus ?? 'new'}
          onChange={(next) => setStatus.mutate({ leadId: lead.id, status: next }, { onError: onMutationError })}
          options={STATUS_STEPS.map((s) => ({ value: s, label: humanize(s) }))}
        />
      </Section>

      <Section icon={Users} kicker="Sales notes" title="Notes">
        {notes.isLoading ? (
          <SkeletonList rows={2} />
        ) : (notes.data?.notes ?? []).length === 0 ? (
          <EmptyState compact title="No notes yet" message="Log follow-ups so the team stays in sync." />
        ) : (
          (notes.data?.notes ?? []).map((n) => (
            <Enter key={n.id}>
              <ItemCard title="Team note" subtitle={n.body} meta={formatDate(n.createdAt)} />
            </Enter>
          ))
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
          <Input
            value={noteText}
            onChangeText={(t) => setNoteText(t.slice(0, 1000))}
            placeholder="Add a note…"
            containerStyle={{ flex: 1 }}
          />
          <Button
            variant="primary"
            title="Log"
            disabled={!noteText.trim() || addNote.isPending}
            onPress={() => {
              addNote.mutate(
                { leadId: lead.id, body: noteText.trim() },
                { onSuccess: () => setNoteText(''), onError: onMutationError },
              );
            }}
          />
        </View>
      </Section>
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
