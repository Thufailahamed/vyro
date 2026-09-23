import { View } from 'react-native';
import { Activity, AlertTriangle, ArrowRight, Package, Truck, Wallet } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { formatCompactLKR, formatNumber, formatPercent, humanize, timeAgo } from '@/lib/format';
import {
  AreaChart,
  Card,
  Chip,
  EmptyState,
  InkHero,
  ListCard,
  ListRow,
  Pulse,
  RankBars,
  Screen,
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
              Gross merchandise volume · 7d
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pulse color={totalAlerts ? colors.amber : colors.volt} size={7} />
              <Text variant="caption" color="paperMuted">
                {cc.isLoading ? 'Checking…' : totalAlerts ? `${totalAlerts} need action` : 'All clear'}
              </Text>
            </View>
          </View>
          {analytics.isLoading ? (
            <Skeleton height={44} style={{ marginTop: 10 }} />
          ) : (
            <Text variant="metric" color="paper" style={{ marginTop: 10 }} numberOfLines={1} adjustsFontSizeToFit>
              {formatCompactLKR(m?.gmvCents ?? 0)}
            </Text>
          )}
          <Text variant="caption" color="paperFaint">
            {m ? `${formatNumber(m.activeBuyers)} buyers · ${formatNumber(m.activeSuppliers)} suppliers · take ${formatCompactLKR(m.takeRateCents)}` : 'Platform-wide settled volume'}
          </Text>
          <HeroGrid>
            <HeroMetric label="Completion" value={formatPercent(m?.completionRate ?? 0)} hint="Orders delivered" />
            <HeroMetric label="Dispute rate" value={formatPercent(m?.disputeRate ?? 0)} hint="Of fulfilled orders" accent={(m?.disputeRate ?? 0) > 2} />
            <HeroMetric label="New signups" value={formatNumber(m?.newSignups ?? 0)} hint="Last 7 days" />
            <HeroMetric label="Queue depth" value={formatNumber(queueDepth)} hint="Jobs waiting" accent={queueDepth > 0} />
          </HeroGrid>
        </InkHero>
      </Appear>

      <Appear i={1}>
        <StatGrid>
          <Stat label="Buyers" value={formatNumber(m?.activeBuyers ?? 0)} hint="Active · 7d" />
          <Stat label="Suppliers" value={formatNumber(m?.activeSuppliers ?? 0)} hint="Active · 7d" />
          <Stat label="Completion" value={formatPercent(m?.completionRate ?? 0)} hint="Delivered share" />
          <Stat label="Signups" value={formatNumber(m?.newSignups ?? 0)} hint="New accounts" />
        </StatGrid>
      </Appear>

      <Appear i={2}>
        <Section kicker="Needs action" title="Triage queues" icon={AlertTriangle} action={<Chip label={cc.isLoading ? '…' : `${totalAlerts} open`} selected={false} onPress={() => go('/admin/observability/alerts')} />}>
          {cc.isLoading ? (
            <Skeleton height={120} />
          ) : (
            <View style={{ gap: 8 }}>
              {alerts.map((a) => (
                <Card key={a.label} kind="flat" padding={12} onPress={() => go(a.href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: a.value ? colors.roseSoft : colors.mist, alignItems: 'center', justifyContent: 'center' }}>
                    <a.icon size={16} color={a.value ? colors.rose : colors.ink3} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="semibold">
                      {a.label}
                    </Text>
                    <Text variant="caption" color="ink4">
                      {a.value ? `${a.value} waiting` : 'Clear'}
                    </Text>
                  </View>
                  <Text variant="metricSm">{a.value}</Text>
                  <ArrowRight size={16} color={colors.ink5} />
                </Card>
              ))}
            </View>
          )}
        </Section>
      </Appear>

      <Appear i={3}>
        <Section kicker="Volume" title="GMV by day" icon={Package}>
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
        <Section kicker="Queues" title="Workers" action={<Text variant="caption" color="copper" onPress={() => go('/admin/observability/queues')}>Open queues</Text>}>
          {queues.isLoading ? (
            <Skeleton height={110} />
          ) : queueRows.length === 0 ? (
            <EmptyState compact title="No queue telemetry" message="Workers report here once jobs flow." />
          ) : (
            <ListCard>
              {queueRows.map((q, i) => (
                <ListRow
                  key={q.name}
                  title={humanize(q.name)}
                  subtitle={`${formatNumber(q.depth)} waiting${q.failed ? ` · ${q.failed} failed` : ''}`}
                  last={i === queueRows.length - 1}
                  trailing={q.status ? <StatusBadge status={q.status} size="sm" /> : undefined}
                  onPress={() => go('/admin/observability/queues')}
                />
              ))}
            </ListCard>
          )}
        </Section>
      </Appear>

      <Appear i={5}>
        <Section kicker="Audit" title="Recent events">
          {cc.isLoading ? (
            <Skeleton height={90} />
          ) : (cc.data?.recentEvents ?? []).length === 0 ? (
            <EmptyState compact title="No recent events" message="Admin actions will appear here." />
          ) : (
            <View style={{ gap: 8 }}>
              {(cc.data?.recentEvents ?? []).slice(0, 5).map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pulse size={6} />
                  <Text variant="bodySm" style={{ flex: 1 }} numberOfLines={1}>
                    {humanize(e.action)}
                  </Text>
                  <Text variant="caption" color="ink5">
                    {timeAgo(e.createdAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Section>
      </Appear>

      {(analytics.data?.topCategories ?? []).length ? (
        <Appear i={6}>
          <Section kicker="Mix" title="Top categories">
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
