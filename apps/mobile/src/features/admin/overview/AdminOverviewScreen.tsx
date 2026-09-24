import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, BarChart3, CheckCircle2, Layers, ListOrdered, Package, Search, ShoppingBag, Store, Truck, UserPlus, Wallet } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { formatCompactLKR, formatNumber, formatPercent, humanize, timeAgo } from '@/lib/format';
import {
  AreaChart,
  Button,
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
  CountUp,
  Stat,
  StatGrid,
  StatusBadge,
  Text,
} from '@/ui';
import { useAdminGet } from '@/features/admin/common/api';
import { AdminHeaderActions, Section } from '@/features/admin/ops/kit';
import { Appear, HeroGrid, HeroMetric, go } from '@/features/admin/platform/kit';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';

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
const SECTION_KEYS = ['stats', 'triage', 'gmv', 'queues', 'events', 'categories'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
const SECTION_META: Record<SectionKey, { title: string; kicker: string }> = {
  stats: { title: 'KPI grid', kicker: 'Stats' },
  triage: { title: 'Triage queues', kicker: 'Needs action' },
  gmv: { title: 'GMV by day', kicker: 'Volume' },
  queues: { title: 'Workers', kicker: 'Queues' },
  events: { title: 'Recent events', kicker: 'Audit' },
  categories: { title: 'Top categories', kicker: 'Mix' },
};
const ORDER_KEY = 'admin-overview-order';

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
      <StatGrid>
        <Stat icon={ShoppingBag} label="Buyers" value={m?.activeBuyers ?? 0} format={formatNumber} hint="Active · 7d" />
        <Stat icon={Store} label="Suppliers" value={m?.activeSuppliers ?? 0} format={formatNumber} hint="Active · 7d" />
        <Stat icon={CheckCircle2} label="Completion" value={m?.completionRate ?? 0} format={formatPercent} hint="Delivered share" />
        <Stat icon={UserPlus} label="Signups" value={m?.newSignups ?? 0} format={formatNumber} hint="New accounts" accent />
      </StatGrid>
    ),
    triage: (
      <View>
        <SectionHeader kicker="Needs action" title="Triage queues" action={{ label: cc.isLoading ? 'Alerts' : `${totalAlerts} open`, onPress: () => go('/admin/observability/alerts') }} />
        {cc.isLoading ? (
          <Skeleton height={240} radius={radii.xl} />
        ) : (
          <ListCard>
            {alerts.map((a, i) => (
              <ListRow
                key={a.label}
                title={a.label}
                subtitle={a.value ? `${a.value} waiting` : 'Clear'}
                leading={<IconTile icon={a.icon} tone={a.value ? 'danger' : 'success'} size={38} />}
                trailing={
                  <Text variant="metricSm" style={{ fontSize: 20, color: a.value ? colors.rose : colors.ink5 }}>
                    {a.value}
                  </Text>
                }
                last={i === alerts.length - 1}
                onPress={() => go(a.href)}
              />
            ))}
          </ListCard>
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
          <EmptyState compact title="No queue telemetry" message="Workers report here once jobs flow." />
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
          <EmptyState compact title="No recent events" message="Admin actions will appear here." />
        ) : (
          <ListCard>
            {(cc.data?.recentEvents ?? []).slice(0, 5).map((e, i, arr) => (
              <ListRow
                key={e.id}
                title={humanize(e.action)}
                leading={
                  <View style={{ width: 38, height: 38, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.voltSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Pulse size={6} color={colors.voltDeep} />
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

  return (
    <Screen
      tabBar
      kicker="Command"
      title="Overview"
      subtitle="Gross volume, action queues and platform health at a glance."
      right={
        <>
          <IconButton
            icon={ListOrdered}
            variant="surface"
            accessibilityLabel="Arrange sections"
            onPress={() => setArranging((a) => !a)}
            style={arranging ? { backgroundColor: colors.volt } : undefined}
          />
          <AdminHeaderActions />
          <PortalSwitcher current="admin" />
        </>
      }
      onRefresh={refresh}
    >
      <Appear>
        <InkHero seed="admin-command">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="overline" color="volt">
              GMV · last 7 days
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingLeft: 4,
                paddingRight: 10,
                height: 26,
                borderRadius: radii.pill,
                backgroundColor: totalAlerts ? 'rgba(196,132,58,0.16)' : 'rgba(198,220,74,0.12)',
              }}
            >
              <Pulse color={totalAlerts ? colors.amber : colors.volt} size={6} />
              <Text variant="caption" weight="semibold" color={totalAlerts ? 'amberSoft' : 'voltGlow'}>
                {cc.isLoading ? 'Checking…' : totalAlerts ? `${totalAlerts} need action` : 'All clear'}
              </Text>
            </View>
          </View>
          {analytics.isLoading ? (
            <Skeleton height={44} style={{ marginTop: 14, opacity: 0.25 }} />
          ) : (
            <View style={{ marginTop: 14 }}>
              <CountUp value={m?.gmvCents ?? 0} format={formatCompactLKR} style={{ fontSize: 40, lineHeight: 44, letterSpacing: -1.4, color: colors.paper }} />
            </View>
          )}
          <Text variant="caption" color="paperFaint" style={{ marginTop: 4 }}>
            {m ? `${formatNumber(m.activeBuyers)} buyers · ${formatNumber(m.activeSuppliers)} suppliers · take ${formatCompactLKR(m.takeRateCents)}` : 'Platform-wide settled volume'}
          </Text>
          <HeroGrid>
            <HeroMetric label="Completion" value={m?.completionRate ?? 0} format={formatPercent} hint="Orders delivered" />
            <HeroMetric label="Dispute rate" value={m?.disputeRate ?? 0} format={formatPercent} hint="Of fulfilled orders" accent={(m?.disputeRate ?? 0) > 2} />
            <HeroMetric label="New signups" value={m?.newSignups ?? 0} format={formatNumber} hint="Last 7 days" />
            <HeroMetric label="Queue depth" value={queueDepth} format={formatNumber} hint="Jobs waiting" accent={queueDepth > 0} />
          </HeroGrid>
          <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.paperLine, marginTop: 20, marginBottom: 18 }} />
          <QuickActions>
            <QuickAction icon={Package} label="Orders" tone="glass" onPress={() => go('/admin/orders')} />
            <QuickAction icon={Truck} label="Deliveries" tone="glass" onPress={() => go('/admin/deliveries')} />
            <QuickAction icon={AlertTriangle} label="Disputes" tone="glass" badge={n?.openDisputes || undefined} onPress={() => go('/admin/disputes')} />
            <QuickAction icon={Search} label="Search" tone="volt" onPress={() => go('/admin/search')} />
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
    </Screen>
  );
}
