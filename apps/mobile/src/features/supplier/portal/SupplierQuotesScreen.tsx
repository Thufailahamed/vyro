import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, Clock, FileText, MapPin, Package, Send, Timer, Trophy, TriangleAlert, Sparkles } from 'lucide-react-native';
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
  SearchBar,
  SkeletonList,
  Text,
} from '@/ui';
import { Enter, NotificationsBell, RfqPill } from '@/features/supplier/ops/kit';
import { useSupplierRfqDashboard, useSupplierRfqs, type RfqInvite } from './api';

type Filter = 'all' | 'new' | 'open' | 'quoted' | 'expiring' | 'closed';

const OPEN_STATUSES = ['open', 'invited', 'negotiating', 'quoting', 'quotes_received', 'under_review'];
const CLOSED_STATUSES = ['cancelled', 'expired', 'closed', 'awarded', 'converted_to_order', 'rejected', 'withdrawn'];
const isOpen = (s: string) => OPEN_STATUSES.includes(s.toLowerCase());
const isClosed = (s: string) => CLOSED_STATUSES.includes(s.toLowerCase());
const isNewInvite = (r: RfqInvite) => r.inviteStatus === 'invited' && r.myQuotes === 0 && !isClosed(r.rfq.status);

const DAY = 86_400_000;

/** "3d left" / "Ends today" / "Expired 2d ago" for an RFQ deadline. */
function deadlineLabel(deadline: number, closed: boolean, now = Date.now()) {
  const diff = deadline - now;
  const days = Math.ceil(Math.abs(diff) / DAY);
  if (diff < 0) return { text: days <= 1 ? 'Expired today' : `Expired ${days}d ago`, tone: 'past' as const };
  if (closed) return { text: `Due ${formatDate(deadline)}`, tone: 'normal' as const };
  if (diff < DAY) return { text: 'Ends today', tone: 'urgent' as const };
  if (days <= 2) return { text: `${days}d left`, tone: 'urgent' as const };
  return { text: `${days}d left · ${formatDate(deadline)}`, tone: 'normal' as const };
}

/** Tappable "needs attention" chip inside the ink hero. */
function AttentionChip({ icon: Icon, label, count, color, onPress }: { icon: typeof Clock; label: string; count: number; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${label}`}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: radii.lg,
        borderCurve: 'continuous',
        backgroundColor: pressed ? 'rgba(250,247,240,0.14)' : 'rgba(250,247,240,0.07)',
        opacity: count ? 1 : 0.55,
      })}
    >
      <View style={{ width: 30, height: 30, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(250,247,240,0.08)' }}>
        <Icon size={15} color={count ? color : colors.paperMuted} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h3" color="paper" tabular>
          {count}
        </Text>
        <Text variant="caption" color="paperMuted" numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** One funnel stage: label, count and a proportional bar. */
function FunnelRow({ label, value, max, sub, color }: { label: string; value: number; max: number; sub: string; color: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="caption" color="paperMuted">
          {label}
        </Text>
        <Text variant="caption" color="paperFaint">
          <Text variant="bodySm" weight="bold" color="paper" tabular>
            {value}
          </Text>
          {'  '}
          {sub}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(250,247,240,0.08)', overflow: 'hidden' }}>
        <View style={{ width: `${max ? Math.max(value ? 4 : 0, (value / max) * 100) : 0}%`, height: '100%', borderRadius: 4, backgroundColor: color }} />
      </View>
    </View>
  );
}

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
      new: all.filter(isNewInvite).length,
      open: all.filter((r) => isOpen(r.rfq.status)).length,
      quoted: all.filter((r) => r.myQuotes > 0).length,
      expiring: all.filter((r) => r.expiringSoon).length,
      closed: all.filter((r) => isClosed(r.rfq.status)).length,
    }),
    [all],
  );

  const shown = useMemo(() => {
    let list = all;
    if (filter === 'new') list = list.filter(isNewInvite);
    if (filter === 'open') list = list.filter((r) => isOpen(r.rfq.status));
    if (filter === 'quoted') list = list.filter((r) => r.myQuotes > 0);
    if (filter === 'expiring') list = list.filter((r) => r.expiringSoon);
    if (filter === 'closed') list = list.filter((r) => isClosed(r.rfq.status));
    const t = search.trim().toLowerCase();
    if (t) list = list.filter((r) => r.rfq.title.toLowerCase().includes(t) || r.rfq.rfqNumber.toLowerCase().includes(t));
    // Urgent invites float to the top, then by nearest deadline.
    return [...list].sort((a, b) => {
      const ca = isClosed(a.rfq.status) ? 1 : 0;
      const cb = isClosed(b.rfq.status) ? 1 : 0;
      if (ca !== cb) return ca - cb;
      const ea = a.expiringSoon ? 0 : 1;
      const eb = b.expiringSoon ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const na = isNewInvite(a) ? 0 : 1;
      const nb = isNewInvite(b) ? 0 : 1;
      if (na !== nb) return na - nb;
      return (a.rfq.deadline ?? Number.MAX_SAFE_INTEGER) - (b.rfq.deadline ?? Number.MAX_SAFE_INTEGER);
    });
  }, [all, filter, search]);

  const d = dash.data;

  const header = (
    <ListHeader>
      <Gutter style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 8 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text variant="overline" color="copper">
            Supplier
          </Text>
          <Text variant="displayMd">Quotes</Text>
        </View>
        <NotificationsBell />
      </Gutter>
      <Gutter style={{ gap: 12 }}>
        {d ? (
          <Enter>
            <InkHero seed="rfq-pipeline" style={{ padding: 18, gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile icon={Trophy} tone="glass" size={40} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Kicker color="volt">Win pipeline</Kicker>
                  <Text variant="caption" color="paperMuted">
                    Respond quickly to win more orders
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="displaySm" color="paper" tabular>
                    {Math.round(d.winRate * 100)}%
                  </Text>
                  <Text variant="caption" color="paperFaint">
                    win rate
                  </Text>
                </View>
              </View>
              <View style={{ gap: 12 }}>
                <FunnelRow label="Invites received" value={d.rfqsReceived} max={d.rfqsReceived} sub="RFQs" color="rgba(250,247,240,0.55)" />
                <FunnelRow label="Quotes submitted" value={d.quotesSubmitted} max={d.rfqsReceived} sub={`${Math.round(d.responseRate * 100)}% response`} color={colors.copper} />
                <FunnelRow label="Orders won" value={d.won} max={d.rfqsReceived} sub="awarded" color={colors.volt} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <AttentionChip icon={Sparkles} label="New invites" count={counts.new} color={colors.volt} onPress={() => setFilter('new')} />
                <AttentionChip icon={TriangleAlert} label="Expiring soon" count={counts.expiring} color={colors.rose} onPress={() => setFilter('expiring')} />
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
  const isNew = isNewInvite(r);
  const closed = isClosed(r.rfq.status);
  const quoted = r.myQuotes > 0;
  const dl = r.rfq.deadline ? deadlineLabel(r.rfq.deadline, closed) : null;
  const accent = quoted ? colors.mint : closed ? colors.ink6 : r.expiringSoon ? colors.rose : isNew ? colors.volt : colors.copper;
  const expired = r.rfq.status.toLowerCase() === 'expired';
  return (
    <Card kind="flat" onPress={() => router.push(`/supplier/quotes/${r.rfq.id}` as never)} padding={0} style={{ overflow: 'hidden', opacity: closed && !quoted ? 0.88 : 1 }}>
      <View style={{ position: 'absolute', left: 0, top: 18, bottom: 70, width: 3.5, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: accent }} />
      <View style={{ padding: 16, paddingLeft: 18, gap: 12 }}>
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
            <Text variant="h3" numberOfLines={2} color={closed ? 'ink3' : 'ink'}>
              {r.rfq.title}
            </Text>
          </View>
          <RfqPill status={r.myStatus ?? r.rfq.status} size="sm" />
        </View>

        {/* Meta chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {r.itemCount > 0 ? <Meta icon={Package} text={`${r.itemCount} item${r.itemCount === 1 ? '' : 's'}`} /> : null}
          {r.rfq.deliveryLocation ? <Meta icon={MapPin} text={r.rfq.deliveryLocation} /> : null}
          {dl ? (
            <Meta
              icon={Clock}
              text={dl.text}
              color={dl.tone === 'urgent' ? colors.rose : dl.tone === 'past' ? colors.ink5 : undefined}
            />
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
            {quoted ? `${r.myQuotes} quote${r.myQuotes === 1 ? '' : 's'} submitted` : closed ? (expired ? 'Expired · not quoted' : 'Closed · not quoted') : isNew ? 'Awaiting your quote' : 'Not quoted yet'}
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
