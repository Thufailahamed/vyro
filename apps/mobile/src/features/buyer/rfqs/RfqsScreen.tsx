import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Scale, Search, Sparkles } from 'lucide-react-native';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  InkHero,
  Kicker,
  ListHeader,
  ListScreen,
  ScreenHeader,
  SearchBar,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { errorMessage } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatCompactLKR, formatDate, humanize } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { Enter, go } from '../orders/kit';
import { useRfqDashboard } from './api';
import type { RfqRow } from './api';

type Group = 'open' | 'review' | 'awarded' | 'draft' | 'closed' | 'all';

const GROUPS: { value: Group; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'review', label: 'In review' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'draft', label: 'Drafts' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

function matchGroup(s: string, g: Group): boolean {
  const v = s.toLowerCase();
  switch (g) {
    case 'open':
      return ['open', 'quoting'].includes(v);
    case 'review':
      return ['quotes_received', 'under_review'].includes(v);
    case 'awarded':
      return ['awarded', 'converted_to_order'].includes(v);
    case 'draft':
      return v === 'draft';
    case 'closed':
      return ['expired', 'cancelled', 'closed'].includes(v);
    default:
      return true;
  }
}

export function RfqsScreen() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const [group, setGroup] = useState<Group>('open');
  const [search, setSearch] = useState('');

  const q = useRfqDashboard(businessId);

  const rows = useMemo(() => q.data?.recent ?? [], [q.data]);

  const counts = useMemo(() => {
    const c = (g: Group) => (g === 'all' ? rows.length : rows.filter((r) => matchGroup(r.status, g)).length);
    return GROUPS.map((g) => ({ value: g.value, label: g.label, count: c(g.value) }));
  }, [rows]);

  const shown = useMemo(() => {
    let list = group === 'all' ? rows : rows.filter((r) => matchGroup(r.status, group));
    const t = search.trim().toLowerCase();
    if (t) list = list.filter((r) => r.title.toLowerCase().includes(t) || r.rfqNumber.toLowerCase().includes(t));
    return list;
  }, [rows, group, search]);

  const header = (
    <ListHeader>
      <ScreenHeader
        kicker="Bulk procurement"
        title="Requests for quotation"
        subtitle="Negotiated bulk pricing — compare suppliers on landed cost, award, convert to PO."
        right={<Button title="New RFQ" icon={Plus} size="sm" onPress={() => go('/buyer/rfqs/new')} />}
      />
      <Gutter style={{ gap: 14 }}>
        {q.data ? (
          <Enter i={0}>
            <InkHero seed={`rfq-${businessId ?? ''}`}>
              <View style={{ gap: 6 }}>
                <Kicker color="volt">Active negotiations</Kicker>
                <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit>
                  {q.data.activeRfqs}
                </Text>
                <Text variant="caption" color="paperMuted">
                  {q.data.quotesReceived} quotes received · {Math.round((q.data.rfqToPoConversion ?? 0) * 100)}% convert to PO
                </Text>
              </View>
              <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.paperLine, paddingTop: 14, marginTop: 16 }}>
                <HeroStat label="Quotes" value={q.data.quotesReceived} onPress={() => setGroup('review')} />
                <HeroStat label="Awarded" value={q.data.awarded} onPress={() => setGroup('awarded')} />
                <HeroStat label="Saved" value={formatCompactLKR(q.data.negotiationSavingsCents)} onPress={() => setGroup('awarded')} />
              </View>
            </InkHero>
          </Enter>
        ) : null}
        {rows.length > 0 ? (
          <>
            <SearchBar value={search} onChangeText={setSearch} placeholder="RFQ title or number…" />
            <View style={{ marginHorizontal: -20 }}>
              <ChipRow options={counts} value={group} onChange={setGroup} style={{ paddingHorizontal: 20 }} />
            </View>
          </>
        ) : null}
      </Gutter>
    </ListHeader>
  );

  const empty =
    q.isLoading || !businessId ? (
      <SkeletonList rows={4} height={120} />
    ) : q.isError ? (
      <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
    ) : rows.length === 0 ? (
      <EmptyState
        icon={FileText}
        title="No RFQs yet"
        message="Create a bulk quote request and suppliers will send negotiated quotes you can compare and award."
        action={{ label: 'Create your first RFQ', onPress: () => go('/buyer/rfqs/new') }}
      />
    ) : (
      <EmptyState
        icon={Search}
        title="No RFQs match"
        message="Try a different group or search term."
        action={{ label: 'Reset filters', onPress: () => { setGroup('all'); setSearch(''); } }}
        compact
      />
    );

  return (
    <ListScreen
      data={q.isLoading ? [] : shown}
      keyExtractor={(r) => r.id}
      header={header}
      onRefresh={() => qc.refetchQueries({ queryKey: ['rfqs'] })}
      ListEmptyComponent={empty}
      renderItem={({ item, index }) => <RfqCard rfq={item} index={index} />}
    />
  );
}

function HeroStat({ label, value, onPress }: { label: string; value: number | string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} style={{ flex: 1, gap: 2 }} scaleTo={0.95}>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 17, color: colors.paper }} numberOfLines={1}>
        {value}
      </Text>
      <Text variant="overline" color="paperFaint">
        {label}
      </Text>
    </Touchable>
  );
}

function RfqCard({ rfq: r, index }: { rfq: RfqRow; index: number }) {
  const [renderedAt] = useState(() => Date.now());
  return (
    <Enter i={index}>
      <Card onPress={() => go(`/buyer/rfqs/${r.id}`)} padding={16} style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.copperDeep, letterSpacing: 0.3 }}>{r.rfqNumber}</Text>
            <Text variant="h3" numberOfLines={2}>{r.title}</Text>
          </View>
          <StatusBadge status={r.status} size="sm" />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Meta icon={Scale}>{r.quoteCount ?? 0} quotes</Meta>
          {r.itemCount != null ? <Meta>{r.itemCount} lines</Meta> : null}
          {r.lowestLandedCents != null ? <Meta accent>from {formatCompactLKR(r.lowestLandedCents)}</Meta> : null}
          {r.deadline ? <Meta>{r.deadline < renderedAt ? 'Expired' : `Due ${formatDate(r.deadline)}`}</Meta> : null}
        </View>
        {r.status === 'awarded' || r.status === 'converted_to_order' ? (
          <Text variant="caption" color="ink4">Awarded — open to convert into a purchase order.</Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 12 }}>
          <Button title="Open" size="sm" variant="secondary" onPress={() => go(`/buyer/rfqs/${r.id}`)} style={{ flex: 1 }} />
          <Button title="Ask AI" icon={Sparkles} size="sm" variant="ghost" onPress={() => go('/buyer/ask')} />
        </View>
      </Card>
    </Enter>
  );
}

function Meta({ children, icon: Icon, accent }: { children: React.ReactNode; icon?: typeof FileText; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {Icon ? <Icon size={12} color={colors.copper} /> : null}
      <Text variant="caption" color={accent ? 'ink' : 'ink4'} weight={accent ? 'semibold' : undefined} style={accent ? { fontFamily: fonts.monoMedium } : undefined}>
        {children}
      </Text>
    </View>
  );
}

export function rfqStatusLabel(s: string): string {
  return humanize(s);
}
