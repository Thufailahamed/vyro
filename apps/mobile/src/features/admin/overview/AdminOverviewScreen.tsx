import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, CheckCircle2, ChevronRight, Layers, ListOrdered, Package, Search, ShoppingBag, Store, Truck, UserPlus, Wallet, type LucideIcon } from 'lucide-react-native';
import { colors, fonts, radii } from '@/theme/tokens';
import { formatCompactLKR, formatNumber, formatPercent, humanize, timeAgo } from '@/lib/format';
import {
  AreaChart,
  Button,
  Card,
  EmptyState,
  IconButton,
  IconTile,
  InkHero,
  ListCard,
  ListRow,
  Pulse,
  QuickAction,
  QuickActions,
  RankBars,
  Screen,
  SectionHeader,
  Skeleton,
  Sparkline,
  CountUp,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { useAdminGet } from '@/features/admin/common/api';
import { AdminTabHeader, GlassStats, Section } from '@/features/admin/ops/kit';
import { Appear, go } from '@/features/admin/platform/kit';

interface CommandCenter {
  needsAction: { stuckPayments: number; payoutFailures: number; slaBreaches: number; openDisputes: number };
  recentEvents: { id: string; action: string; createdAt: number }[];
}

interface AdminAnalytics {
  range: string;
  metrics: {
    gmvCents: number;
    takeRateCents: number;
    activeBuyers: number;
    activeSuppliers: number;
    newSignups: number;
    disputeRate: number;
    completionRate: number;
  };
  gmvByDay: { day: string; cents: number }[];
  topCategories: { categoryId: string; name: string; cents: number }[];
  topRegions: { district: string; cents: number }[];
}

interface QueuesHealth {
  queues: { name: string; depth: number; failed?: number; status?: string }[];
}

/* Dashboard sections the operator can pin/reorder (persisted per device). */
const SECTION_KEYS = ['triage', 'stats', 'gmv', 'queues', 'events', 'categories'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
const SECTION_META: Record<SectionKey, { title: string; kicker: string }> = {
  stats: { title: 'Marketplace', kicker: 'Active · 7d' },
  triage: { title: 'Triage queues', kicker: 'Needs action' },
  gmv: { title: 'GMV by day', kicker: 'Volume' },
  queues: { title: 'Workers', kicker: 'Queues' },
  events: { title: 'Recent events', kicker: 'Audit' },
  categories: { title: 'Top categories', kicker: 'Mix' },
};
const ORDER_KEY = 'admin-overview-order';

/** Triage tile — calm when clear, tinted and loud when work is waiting. */
function TriageTile({ label, value, icon: Icon, onPress }: { label: string; value: number; icon: LucideIcon; onPress: () => void }) {
  const hot = value > 0;
  return (
    <Touchable
      onPress={onPress}
      hapticOnPress
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={[
        {
          flexBasis: '47%',
          flexGrow: 1,
          padding: 14,
          gap: 14,
          borderRadius: radii.xl,
          borderCurve: 'continuous',
          backgroundColor: hot ? colors.roseSoft : colors.paper,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: hot ? 'rgba(196,90,74,0.22)' : 'rgba(12,14,11,0.05)',
        },
        hot ? null : { boxShadow: '0px 1px 2px rgba(12,14,11,0.04), 0px 8px 22px rgba(12,14,11,0.06)' },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconTile icon={Icon} tone={hot ? 'danger' : 'paper'} size={34} style={hot ? { backgroundColor: colors.paper } : undefined} />
        {hot ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: 22, borderRadius: radii.pill, backgroundColor: colors.paper }}>
            <Pulse color={colors.rose} size={5} />
            <Text variant="caption" weight="semibold" style={{ fontSize: 10.5, color: '#9A3B2E' }}>
              Open
            </Text>
          </View>
        ) : (
          <CheckCircle2 size={16} color={colors.mint} strokeWidth={2} />
        )}
      </View>
      <View style={{ gap: 1 }}>
        <Text style={{ fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.8, color: hot ? '#9A3B2E' : colors.ink5 }}>{value}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="caption" weight="semibold" color={hot ? 'ink2' : 'ink4'} numberOfLines={1} style={{ flexShrink: 1 }}>
            {label}
          </Text>
          <ChevronRight size={13} color={hot ? colors.rose : colors.ink5} strokeWidth={2.2} />
        </View>
      </View>
    </Touchable>
  );
}

/**
 * Admin command centre — mirrors the web HomePage + CommandCenter:
 * GMV hero, KPI grid, needs-action alerts, queues teaser, recent activity.
 */
export function AdminOverviewScreen() {
  const cc = useAdminGet<CommandCenter>(['admin-command-center'], '/admin/command-center');
  const analytics = useAdminGet<AdminAnalytics>(['admin-analytics', '7d'], '/analytics/admin?range=7d');
  const queues = useAdminGet<QueuesHealth>(['admin', 'queues', 'health'], '/admin/queues/health');

  const [order, setOrder] = useState<SectionKey[]>([...SECTION_KEYS]);
  const [arranging, setArranging] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(ORDER_KEY)
      .then((raw) => {
        if (!raw) return;
        const saved = JSON.parse(raw) as string[];
        const valid = saved.filter((k): k is SectionKey => (SECTION_KEYS as readonly string[]).includes(k));
        setOrder([...valid, ...SECTION_KEYS.filter((k) => !valid.includes(k))]);
      })
      .catch(() => {});
  }, []);
  const move = (key: SectionKey, dir: -1 | 1) => {
    setOrder((o) => {
      const i = o.indexOf(key);
      const j = i + dir;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j]!, next[i]!];
      void AsyncStorage.setItem(ORDER_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const n = cc.data?.needsAction;
  const alerts = [
    { label: 'Stuck payments', value: n?.stuckPayments ?? 0, href: '/admin/finance', icon: Wallet },
    { label: 'Payout failures', value: n?.payoutFailures ?? 0, href: '/admin/finance', icon: Activity },
    { label: 'SLA breaches', value: n?.slaBreaches ?? 0, href: '/admin/deliveries', icon: Truck },
    { label: 'Open disputes', value: n?.openDisputes ?? 0, href: '/admin/disputes', icon: AlertTriangle },
  ];
  const totalAlerts = alerts.reduce((s, a) => s + a.value, 0);
  const m = analytics.data?.metrics;
  const queueRows = (queues.data?.queues ?? []).slice(0, 3);
  const queueDepth = (queues.data?.queues ?? []).reduce((s, q) => s + (q.depth ?? 0), 0);

  const refresh = () => Promise.all([cc.refetch(), analytics.refetch(), queues.refetch()]);

  const SECTION_BODY: Record<SectionKey, ReactNode | null> = {
    stats: (
      <Card kind="flat" padding={0} style={{ flexDirection: 'row' }}>
        {[
          { icon: ShoppingBag, label: 'Buyers', value: m?.activeBuyers ?? 0, fmt: formatNumber },
          { icon: Store, label: 'Suppliers', value: m?.activeSuppliers ?? 0, fmt: formatNumber },
          { icon: UserPlus, label: 'Signups', value: m?.newSignups ?? 0, fmt: formatNumber },
        ].map((c, i) => (
          <View key={c.label} style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 14, gap: 10, borderLeftWidth: i ? StyleSheet.hairlineWidth * 2 : 0, borderLeftColor: colors.lineSoft }}>
            <IconTile icon={c.icon} tone={i === 2 ? 'volt' : 'paper'} size={30} />
            <View style={{ gap: 1 }}>
              <CountUp value={c.value} format={c.fmt} style={{ fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 27, letterSpacing: -0.7, color: colors.ink }} />
              <Text variant="caption" color="ink4" numberOfLines={1}>
                {c.label}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    ),
    triage: (
      <View>
        <SectionHeader kicker="Needs action" title="Triage" action={{ label: cc.isLoading ? 'Alerts' : totalAlerts ? `${totalAlerts} open` : 'Alerts', onPress: () => go('/admin/observability/alerts') }} />
        {cc.isLoading ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {alerts.map((a) => (
              <Skeleton key={a.label} height={118} radius={radii.xl} style={{ flexBasis: '47%', flexGrow: 1 }} />
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {alerts.map((a) => (
              <TriageTile key={a.label} label={a.label} value={a.value} icon={a.icon} onPress={() => go(a.href)} />
            ))}
          </View>
        )}
      </View>
    ),
    gmv: (
      <Section kicker="Volume" title="GMV by day" icon={BarChart3}>
        {analytics.isLoading ? (
          <Skeleton height={180} />
        ) : (
          <AreaChart
            data={(analytics.data?.gmvByDay ?? []).map((d) => ({ label: d.day, value: d.cents / 100 }))}
            formatValue={(v) => `Rs. ${Math.round(v).toLocaleString('en-LK')}`}
          />
        )}
      </Section>
    ),
    queues: (
      <View>
        <SectionHeader kicker="Queues" title="Workers" action={{ label: 'Open queues', onPress: () => go('/admin/observability/queues') }} />
        {queues.isLoading ? (
          <Skeleton height={140} radius={radii.xl} />
        ) : queueRows.length === 0 ? (
          <EmptyState compact icon={Layers} title="No queue telemetry" message="Workers report here once jobs flow." />
        ) : (
          <ListCard>
            {queueRows.map((q, i) => (
              <ListRow
                key={q.name}
                title={humanize(q.name)}
                subtitle={`${formatNumber(q.depth)} waiting${q.failed ? ` · ${q.failed} failed` : ''}`}
                icon={Layers}
                iconTone="paper"
                last={i === queueRows.length - 1}
                trailing={q.status ? <StatusBadge status={q.status} size="sm" /> : undefined}
                onPress={() => go('/admin/observability/queues')}
              />
            ))}
          </ListCard>
        )}
      </View>
    ),
    events: (
      <View>
        <SectionHeader kicker="Audit" title="Recent events" />
        {cc.isLoading ? (
          <Skeleton height={120} radius={radii.xl} />
        ) : (cc.data?.recentEvents ?? []).length === 0 ? (
          <EmptyState compact icon={Activity} title="No recent events" message="Admin actions will appear here." />
        ) : (
          <ListCard>
            {(cc.data?.recentEvents ?? []).slice(0, 5).map((e, i, arr) => (
              <ListRow
                key={e.id}
                title={humanize(e.action)}
                leading={
                  <View style={{ width: 38, height: 38, borderRadius: 12, borderCurve: 'continuous', backgroundColor: i === 0 ? colors.voltSoft : colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                    {i === 0 ? <Pulse size={6} color={colors.voltDeep} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.ink5 }} />}
                  </View>
                }
                trailing={
                  <Text variant="caption" color="ink5">
                    {timeAgo(e.createdAt)}
                  </Text>
                }
                last={i === arr.length - 1}
              />
            ))}
          </ListCard>
        )}
      </View>
    ),
    categories: (analytics.data?.topCategories ?? []).length ? (
      <Section kicker="Mix" title="Top categories" icon={Activity}>
        <RankBars
          data={(analytics.data?.topCategories ?? []).slice(0, 5).map((c) => ({ label: c.name, value: c.cents / 100 }))}
          formatValue={(v) => `Rs. ${Math.round(v).toLocaleString('en-LK')}`}
        />
      </Section>
    ) : null,
  };

  const gmvSeries = (analytics.data?.gmvByDay ?? []).map((d) => d.cents / 100);

  return (
    <Screen
      tabBar
      header={
        <AdminTabHeader
          kicker={new Date().toLocaleDateString('en-LK', { weekday: 'long', day: 'numeric', month: 'short' })}
          title="Command centre"
        />
      }
      onRefresh={refresh}
    >
      <Appear>
        <InkHero seed="admin-command" style={{ padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
              <IconTile icon={BarChart3} tone="glass" size={30} />
              <Text variant="overline" color="paperMuted" numberOfLines={1}>
                GMV · 7 days
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                height: 26,
                borderRadius: radii.pill,
                backgroundColor: totalAlerts ? 'rgba(196,132,58,0.18)' : 'rgba(198,220,74,0.12)',
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: totalAlerts ? 'rgba(196,132,58,0.35)' : 'rgba(198,220,74,0.25)',
              }}
            >
              <Pulse color={totalAlerts ? colors.amber : colors.volt} size={6} />
              <Text variant="caption" weight="semibold" color={totalAlerts ? 'amberSoft' : 'voltGlow'} style={{ fontSize: 11.5 }}>
                {cc.isLoading ? 'Checking…' : totalAlerts ? `${totalAlerts} need action` : 'All clear'}
              </Text>
            </View>
          </View>

          {analytics.isLoading ? (
            <Skeleton height={48} style={{ marginTop: 18, opacity: 0.25 }} />
          ) : (
            <View style={{ marginTop: 18 }}>
              <CountUp value={m?.gmvCents ?? 0} format={formatCompactLKR} style={{ fontFamily: fonts.display, fontSize: 44, lineHeight: 50, letterSpacing: -1.8, color: colors.paper }} />
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <Text variant="bodySm" color="paperMuted">
              Platform-wide settled volume
            </Text>
            {m ? (
              <View style={{ paddingHorizontal: 8, height: 22, borderRadius: radii.pill, backgroundColor: 'rgba(198,220,74,0.14)', justifyContent: 'center' }}>
                <Text variant="caption" weight="semibold" color="volt" style={{ fontSize: 11 }}>
                  Take {formatCompactLKR(m.takeRateCents)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: 18, marginHorizontal: -4 }}>
            {gmvSeries.some((v) => v > 0) ? (
              <Sparkline values={gmvSeries} height={56} color={colors.volt} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 4 }}>
                <View style={{ flex: 1, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(198,220,74,0.3)' }} />
                <Text variant="caption" color="paperFaint" style={{ fontSize: 11 }}>
                  No settled volume yet
                </Text>
              </View>
            )}
          </View>

          <GlassStats
            items={[
              { label: 'Completion', value: m?.completionRate ?? 0, format: formatPercent, hint: 'Orders delivered' },
              { label: 'Dispute rate', value: m?.disputeRate ?? 0, format: formatPercent, hint: 'Of fulfilled', warn: (m?.disputeRate ?? 0) > 2 },
              { label: 'New signups', value: m?.newSignups ?? 0, format: formatNumber, hint: 'Last 7 days' },
              { label: 'Queue depth', value: queueDepth, format: formatNumber, hint: 'Jobs waiting', warn: queueDepth > 0 },
            ]}
          />

          <QuickActions style={{ marginTop: 20 }}>
            <QuickAction icon={Package} label="Orders" tone="glass" onPress={() => go('/admin/orders')} />
            <QuickAction icon={Truck} label="Deliveries" tone="glass" onPress={() => go('/admin/deliveries')} />
            <QuickAction icon={AlertTriangle} label="Disputes" tone="glass" badge={n?.openDisputes || undefined} onPress={() => go('/admin/disputes')} />
            <QuickAction icon={Search} label="Search" tone="volt" dark onPress={() => go('/admin/search')} />
          </QuickActions>
        </InkHero>
      </Appear>

      {arranging ? (
        <Appear i={1}>
          <View>
            <SectionHeader kicker="Arrange" title="Section order" />
            <ListCard>
              {order.map((key, i) => (
                <ListRow
                  key={key}
                  title={SECTION_META[key].title}
                  subtitle={SECTION_META[key].kicker}
                  leading={
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <IconButton icon={ArrowUp} variant="surface" size={34} accessibilityLabel={`Move ${SECTION_META[key].title} up`} onPress={() => move(key, -1)} style={i === 0 ? { opacity: 0.35 } : undefined} />
                      <IconButton icon={ArrowDown} variant="surface" size={34} accessibilityLabel={`Move ${SECTION_META[key].title} down`} onPress={() => move(key, 1)} style={i === order.length - 1 ? { opacity: 0.35 } : undefined} />
                    </View>
                  }
                  last={i === order.length - 1}
                />
              ))}
            </ListCard>
            <Button title="Done" variant="secondary" size="sm" style={{ marginTop: 12 }} onPress={() => setArranging(false)} />
          </View>
        </Appear>
      ) : (
        order.map((key, i) => {
          const content = SECTION_BODY[key];
          return content ? (
            <Appear key={key} i={i + 1}>
              {content}
            </Appear>
          ) : null;
        })
      )}

      {!arranging ? (
        <Touchable
          onPress={() => setArranging(true)}
          hapticOnPress
          style={{ flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 16, marginTop: 4, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' }}
        >
          <ListOrdered size={15} color={colors.ink4} strokeWidth={2} />
          <Text variant="caption" weight="semibold" color="ink4">
            Customize dashboard
          </Text>
        </Touchable>
      ) : null}
    </Screen>
  );
}
