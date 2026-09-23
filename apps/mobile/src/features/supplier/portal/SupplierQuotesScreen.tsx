import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, Clock, FileText, MapPin, Package, Send, Timer, Trophy } from 'lucide-react-native';
import { useSupplierId } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import {
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  IconTile,
  InkHero,
  Kicker,
  ListHeader,
  ListScreen,
  ScreenHeader,
  SearchBar,
  SkeletonList,
  Text,
} from '@/ui';
import { Enter, HeroMetric, NotificationsBell, RfqPill } from '@/features/supplier/ops/kit';
import { useSupplierRfqDashboard, useSupplierRfqs, type RfqInvite } from './api';

type Filter = 'all' | 'new' | 'open' | 'quoted' | 'expiring' | 'closed';

const OPEN_STATUSES = ['open', 'invited', 'negotiating', 'quoting', 'quotes_received', 'under_review'];
const CLOSED_STATUSES = ['cancelled', 'expired', 'closed', 'awarded', 'converted_to_order', 'rejected', 'withdrawn'];
const isOpen = (s: string) => OPEN_STATUSES.includes(s.toLowerCase());
const isClosed = (s: string) => CLOSED_STATUSES.includes(s.toLowerCase());

export function SupplierQuotesScreen() {
  const supplierId = useSupplierId();
  const q = useSupplierRfqs(supplierId);
  const dash = useSupplierRfqDashboard(supplierId);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const all = useMemo(() => q.data?.rfqs ?? [], [q.data]);
  const counts = useMemo(
    () => ({
      all: all.length,
      new: all.filter((r) => r.inviteStatus === 'invited' && r.myQuotes === 0).length,
      open: all.filter((r) => isOpen(r.rfq.status)).length,
      quoted: all.filter((r) => r.myQuotes > 0).length,
      expiring: all.filter((r) => r.expiringSoon).length,
      closed: all.filter((r) => isClosed(r.rfq.status)).length,
    }),
    [all],
  );

  const shown = useMemo(() => {
    let list = all;
    if (filter === 'new') list = list.filter((r) => r.inviteStatus === 'invited' && r.myQuotes === 0);
    if (filter === 'open') list = list.filter((r) => isOpen(r.rfq.status));
    if (filter === 'quoted') list = list.filter((r) => r.myQuotes > 0);
    if (filter === 'expiring') list = list.filter((r) => r.expiringSoon);
    if (filter === 'closed') list = list.filter((r) => isClosed(r.rfq.status));
    const t = search.trim().toLowerCase();
    if (t) list = list.filter((r) => r.rfq.title.toLowerCase().includes(t) || r.rfq.rfqNumber.toLowerCase().includes(t));
    // Urgent invites float to the top, then by nearest deadline.
    return [...list].sort((a, b) => {
      const ea = a.expiringSoon ? 0 : 1;
      const eb = b.expiringSoon ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const na = a.inviteStatus === 'invited' && a.myQuotes === 0 ? 0 : 1;
      const nb = b.inviteStatus === 'invited' && b.myQuotes === 0 ? 0 : 1;
      if (na !== nb) return na - nb;
      return (a.rfq.deadline ?? Number.MAX_SAFE_INTEGER) - (b.rfq.deadline ?? Number.MAX_SAFE_INTEGER);
    });
  }, [all, filter, search]);

  const d = dash.data;

  const header = (
    <ListHeader>
      <ScreenHeader
        kicker="Quotations"
        title="Quote requests"
        subtitle="Buyer RFQs routed to your depot. Quote fast to win the order."
        right={<NotificationsBell />}
      />
      <Gutter style={{ gap: 12 }}>
        {d ? (
          <Enter>
            <InkHero seed="rfq-pipeline">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <IconTile icon={Trophy} tone="glass" size={36} />
                <Kicker color="volt">Win pipeline</Kicker>
              </View>
              <View style={{ flexDirection: 'row', gap: 14, marginTop: 18 }}>
                <HeroMetric label="Received" value={String(d.rfqsReceived)} sub="invites" style={{ flex: 1 }} />
                <HeroMetric label="Quoted" value={String(d.quotesSubmitted)} sub={`${Math.round(d.responseRate * 100)}% response`} style={{ flex: 1 }} />
                <HeroMetric label="Won" value={String(d.won)} sub={`${Math.round(d.winRate * 100)}% win rate`} tone="mint" style={{ flex: 1 }} />
              </View>
            </InkHero>
          </Enter>
        ) : null}
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search RFQ title or number…" />
        <ChipRow<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'new', label: 'New', count: counts.new },
            { value: 'open', label: 'Open', count: counts.open },
            { value: 'quoted', label: 'Quoted', count: counts.quoted },
            { value: 'expiring', label: 'Expiring', count: counts.expiring },
            { value: 'closed', label: 'Closed', count: counts.closed },
          ]}
        />
      </Gutter>
    </ListHeader>
  );

  if (q.isLoading) return <ListScreen tabBar data={[]} renderItem={null} header={header} ListEmptyComponent={<SkeletonList />} />;
  if (q.isError)
    return (
      <ListScreen tabBar data={[]} renderItem={null} header={header} onRefresh={() => q.refetch()} ListEmptyComponent={<ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />} />
    );

  return (
    <ListScreen
      tabBar
      header={header}
      onRefresh={() => Promise.all([q.refetch(), dash.refetch()])}
      data={shown}
      keyExtractor={(r) => r.rfq.id}
      renderItem={({ item, index }) => (
        <Enter i={index}>
          <QuoteCard invite={item} />
        </Enter>
      )}
      ListEmptyComponent={
        <EmptyState
          icon={FileText}
          title={all.length ? 'No matches' : 'No quote requests'}
          message={all.length ? 'Try a different search or filter.' : 'When buyers invite your depot to quote, RFQs appear here.'}
          action={all.length ? { label: 'Reset filters', onPress: () => { setSearch(''); setFilter('all'); } } : undefined}
        />
      }
    />
  );
}

function Meta({ icon: Icon, text, color }: { icon: typeof Clock; text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 26, borderRadius: radii.pill, backgroundColor: colors.pearl, maxWidth: '100%' }}>
      <Icon size={12} color={color ?? colors.ink4} strokeWidth={1.9} />
      <Text variant="caption" style={{ color: color ?? colors.ink3, flexShrink: 1 }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function QuoteCard({ invite: r }: { invite: RfqInvite }) {
  const isNew = r.inviteStatus === 'invited' && r.myQuotes === 0;
  const closed = isClosed(r.rfq.status);
  const quoted = r.myQuotes > 0;
  return (
    <Card kind="flat" onPress={() => router.push(`/supplier/quotes/${r.rfq.id}` as never)} padding={0} style={{ overflow: 'hidden' }}>
      <View style={{ padding: 16, gap: 12 }}>
        {/* Icon + number/title + status */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <IconTile icon={quoted ? Send : FileText} tone={quoted ? 'success' : closed ? 'paper' : isNew ? 'volt' : 'copper'} size={42} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, color: colors.ink4, flexShrink: 1 }} numberOfLines={1}>
                {r.rfq.rfqNumber}
              </Text>
              {isNew ? (
                <View style={{ paddingHorizontal: 7, height: 18, borderRadius: 9, backgroundColor: colors.volt, justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 0.5, color: colors.ink }}>NEW</Text>
                </View>
              ) : null}
            </View>
            <Text variant="h3" numberOfLines={2}>
              {r.rfq.title}
            </Text>
          </View>
          <RfqPill status={r.myStatus ?? r.rfq.status} size="sm" />
        </View>

        {/* Meta chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Meta icon={Package} text={`${r.itemCount} item${r.itemCount === 1 ? '' : 's'}`} />
          {r.rfq.deliveryLocation ? <Meta icon={MapPin} text={r.rfq.deliveryLocation} /> : null}
          {r.rfq.deadline ? (
            <Meta icon={Clock} text={`Due ${formatDate(r.rfq.deadline)}${r.expiringSoon ? ' · expiring soon' : ''}`} color={r.expiringSoon ? colors.rose : undefined} />
          ) : (
            <Meta icon={Timer} text="No deadline" />
          )}
        </View>
      </View>

      {/* Quote status footer */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.pearl,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: colors.lineSoft,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: quoted ? colors.mint : closed ? colors.ink5 : colors.amber }} />
          <Text variant="caption" weight="semibold" color={quoted ? 'mint' : closed ? 'ink4' : 'amber'}>
            {quoted ? `${r.myQuotes} quote${r.myQuotes === 1 ? '' : 's'} submitted` : isNew ? 'Awaiting your quote' : 'Not quoted yet'}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            height: 28,
            paddingHorizontal: 12,
            borderRadius: radii.pill,
            backgroundColor: quoted || closed ? colors.paper : colors.ink,
          }}
        >
          <Text variant="caption" weight="semibold" color={quoted || closed ? 'ink2' : 'paper'}>
            {quoted || closed ? 'View' : 'Quote now'}
          </Text>
          <ArrowRight size={12} color={quoted || closed ? colors.copper : colors.volt} />
        </View>
      </View>
    </Card>
  );
}
