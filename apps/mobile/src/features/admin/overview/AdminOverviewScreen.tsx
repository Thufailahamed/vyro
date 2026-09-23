import { StyleSheet, View } from 'react-native';
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Layers, Package, Search, ShoppingBag, Store, Truck, UserPlus, Wallet } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { formatCompactLKR, formatNumber, formatPercent, humanize, timeAgo } from '@/lib/format';
import {
  AreaChart,
  EmptyState,
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

/**
 * Admin command centre — mirrors the web HomePage + CommandCenter:
 * GMV hero, KPI grid, needs-action alerts, queues teaser, recent activity.
 */
export function AdminOverviewScreen() {
  const cc = useAdminGet<CommandCenter>(['admin-command-center'], '/admin/command-center');
  const analytics = useAdminGet<AdminAnalytics>(['admin-analytics', '7d'], '/analytics/admin?range=7d');
  const queues = useAdminGet<QueuesHealth>(['admin', 'queues', 'health'], '/admin/queues/health');

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

  return (
    <Screen
      tabBar
      kicker="Command"
      title="Overview"
      subtitle="Gross volume, action queues and platform health at a glance."
      right={
        <>
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
            <Text variant="metric" color="paper" style={{ marginTop: 14, fontSize: 40, lineHeight: 44 }} numberOfLines={1} adjustsFontSizeToFit>
              {formatCompactLKR(m?.gmvCents ?? 0)}
            </Text>
          )}
          <Text variant="caption" color="paperFaint" style={{ marginTop: 4 }}>
            {m ? `${formatNumber(m.activeBuyers)} buyers · ${formatNumber(m.activeSuppliers)} suppliers · take ${formatCompactLKR(m.takeRateCents)}` : 'Platform-wide settled volume'}
          </Text>
          <HeroGrid>
            <HeroMetric label="Completion" value={formatPercent(m?.completionRate ?? 0)} hint="Orders delivered" />
            <HeroMetric label="Dispute rate" value={formatPercent(m?.disputeRate ?? 0)} hint="Of fulfilled orders" accent={(m?.disputeRate ?? 0) > 2} />
            <HeroMetric label="New signups" value={formatNumber(m?.newSignups ?? 0)} hint="Last 7 days" />
            <HeroMetric label="Queue depth" value={formatNumber(queueDepth)} hint="Jobs waiting" accent={queueDepth > 0} />
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

      <Appear i={1}>
        <StatGrid>
          <Stat icon={ShoppingBag} label="Buyers" value={formatNumber(m?.activeBuyers ?? 0)} hint="Active · 7d" />
          <Stat icon={Store} label="Suppliers" value={formatNumber(m?.activeSuppliers ?? 0)} hint="Active · 7d" />
          <Stat icon={CheckCircle2} label="Completion" value={formatPercent(m?.completionRate ?? 0)} hint="Delivered share" />
          <Stat icon={UserPlus} label="Signups" value={formatNumber(m?.newSignups ?? 0)} hint="New accounts" accent />
        </StatGrid>
      </Appear>

      <Appear i={2}>
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
      </Appear>

      <Appear i={3}>
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
      </Appear>

      <Appear i={4}>
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
      </Appear>

      <Appear i={5}>
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
      </Appear>

      {(analytics.data?.topCategories ?? []).length ? (
        <Appear i={6}>
          <Section kicker="Mix" title="Top categories" icon={Activity}>
            <RankBars
              data={(analytics.data?.topCategories ?? []).slice(0, 5).map((c) => ({ label: c.name, value: c.cents / 100 }))}
              formatValue={(v) => `Rs. ${Math.round(v).toLocaleString('en-LK')}`}
            />
          </Section>
        </Appear>
      ) : null}
    </Screen>
  );
}
