import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChartBar, Flame, Target, TrendingUp, Trophy, Users } from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDate, formatLKR, humanize } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import {
  AreaChart,
  Avatar,
  BarChart,
  Button,
  ChipRow,
  Donut,
  EmptyState,
  ErrorState,
  Input,
  RankBars,
  Screen,
  SearchBar,
  Segmented,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
  useToast,
} from '@/ui';
import { Enter, ItemCard, Section, SummaryHero } from '@/features/supplier/ops/kit';
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

  const totals = useMemo(() => {
    const all = q.data?.items ?? [];
    const revenue = all.reduce((sum, c) => sum + c.totalCents, 0);
    const orders = all.reduce((sum, c) => sum + c.totalOrders, 0);
    return { count: all.length, revenue, orders, repeat: all.filter((c) => c.totalOrders > 1).length };
  }, [q.data]);

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
    <Screen back onRefresh={() => q.refetch()} kicker="CRM" title="Customers" subtitle="Commercial buyers who order from your depot.">
      <Enter>
        <SummaryHero
          icon={Users}
          kicker="Lifetime revenue"
          value={formatLKR(totals.revenue)}
          sub={`From ${totals.count} ${totals.count === 1 ? 'buyer' : 'buyers'} across ${totals.orders} ${totals.orders === 1 ? 'order' : 'orders'}`}
          cells={[
            { label: 'Buyers', value: totals.count, dot: colors.volt },
            { label: 'Repeat', value: totals.repeat, dot: colors.mint },
            { label: 'Avg / buyer', value: formatCompactLKR(totals.count ? Math.round(totals.revenue / totals.count) : 0), dot: colors.copper },
          ]}
        />
      </Enter>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search trading name…" />
      <Segmented value={sort} onChange={setSort} options={[{ value: 'spend', label: 'Spend' }, { value: 'orders', label: 'Orders' }, { value: 'recent', label: 'Recent' }]} />
      {list.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" message="Buyers appear here after placing orders." />
      ) : (
        list.map((c, i) => (
          <Enter key={c.businessId} i={i}>
            <ItemCard
              leading={
                <View>
                  <Avatar name={c.name} size={44} tone={i < 3 && sort === 'spend' && !search ? 'volt' : 'ink'} />
                  {i < 3 && sort === 'spend' && !search ? (
                    <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, lineHeight: 12, color: colors.volt }}>{i + 1}</Text>
                    </View>
                  ) : null}
                </View>
              }
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
  const toggle = (f: LeadFilter) => setFilter((cur) => (cur === f ? 'all' : f));
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
      onRefresh={() => Promise.all([q.refetch(), summary.refetch()])}
      kicker="CRM"
      title="Leads"
      subtitle="Buyer RFQ pipeline and conversion stages."
    >
      <Enter>
        <SummaryHero
          icon={Target}
          kicker={filter === 'all' ? 'Lead pipeline' : `Showing ${filter === 'converted' ? 'won' : filter} leads`}
          value={`${counts?.all ?? leads.length} ${(counts?.all ?? leads.length) === 1 ? 'lead' : 'leads'}`}
          sub={
            counts?.all
              ? `${Math.round(((counts.converted ?? 0) / counts.all) * 100)}% converted to orders · tap a stage to filter`
              : 'Invited RFQs and buyer inquiries land here.'
          }
          cells={[
            { label: 'Hot', value: counts?.hot ?? 0, dot: colors.rose, active: filter === 'hot', onPress: () => toggle('hot') },
            { label: 'Warm', value: counts?.warm ?? 0, dot: colors.amber, active: filter === 'warm', onPress: () => toggle('warm') },
            { label: 'Cold', value: counts?.cold ?? 0, dot: colors.paperFaint, active: filter === 'cold', onPress: () => toggle('cold') },
            { label: 'Won', value: counts?.converted ?? 0, dot: colors.volt, active: filter === 'converted', onPress: () => toggle('converted') },
          ]}
        />
      </Enter>
      {leads.length === 0 ? (
        <EmptyState
          icon={Target}
          title={filter === 'all' ? 'No leads yet' : 'No leads in this stage'}
          message={filter === 'all' ? 'Invited RFQs and buyer inquiries land here.' : 'Tap the stage again to see every lead.'}
          action={filter === 'all' ? undefined : { label: 'Show all leads', onPress: () => setFilter('all') }}
        />
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
        <SummaryHero
          icon={lead.conversionStatus === 'won' ? Trophy : lead.tag === 'hot' ? Flame : Target}
          kicker={lead.buyerVerified ? 'Verified buyer' : 'Unverified buyer'}
          value={lead.orderValueCents ? formatLKR(lead.orderValueCents) : humanize(lead.conversionStatus ?? lead.status)}
          sub={`${lead.orderValueCents ? 'Order value · ' : ''}${lead.quotedAt ? `Quoted ${formatDate(lead.quotedAt)}` : `Invited ${formatDate(lead.invitedAt)}`}`}
          cells={[
            { label: 'Stage', value: humanize(lead.conversionStatus ?? 'new'), dot: lead.conversionStatus === 'won' ? colors.volt : colors.copper },
            { label: 'Temperature', value: lead.tag ? humanize(lead.tag) : '—', dot: lead.tag === 'hot' ? colors.rose : lead.tag === 'warm' ? colors.amber : colors.paperFaint },
            { label: 'RFQ status', value: humanize(lead.status), dot: colors.paperFaint },
          ]}
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
      <Enter>
        <SummaryHero
          icon={TrendingUp}
          kicker="Revenue"
          value={formatCompactLKR(d.metrics.revenueCents)}
          sub={`${d.metrics.ordersCount} ${d.metrics.ordersCount === 1 ? 'order' : 'orders'} in the last ${range.replace('d', ' days')} · ${d.metrics.avgLeadTimeDays}d avg lead time`}
          right={
            <View style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: radii.pill, backgroundColor: 'rgba(250,247,240,0.07)' }}>
              {(['7d', '30d', '90d'] as const).map((r) => (
                <Touchable
                  key={r}
                  onPress={() => setRange(r)}
                  hapticOnPress
                  accessibilityLabel={`Last ${r}`}
                  accessibilityState={{ selected: range === r }}
                  style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center', backgroundColor: range === r ? colors.volt : 'transparent' }}
                >
                  <Text variant="caption" weight="semibold" style={{ color: range === r ? colors.ink : colors.paperMuted }}>
                    {r.toUpperCase()}
                  </Text>
                </Touchable>
              ))}
            </View>
          }
          cells={[
            { label: 'Orders', value: d.metrics.ordersCount, dot: colors.volt },
            { label: 'Avg order value', value: formatCompactLKR(d.metrics.avgOrderValueCents), dot: colors.copper },
            { label: 'Repeat buyers', value: `${Math.round(d.metrics.repeatCustomerRate)}%`, dot: colors.mint },
            { label: 'Low stock', value: d.metrics.lowStockCount, dot: d.metrics.lowStockCount ? colors.rose : colors.paperFaint },
          ]}
          grid
        />
      </Enter>
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
