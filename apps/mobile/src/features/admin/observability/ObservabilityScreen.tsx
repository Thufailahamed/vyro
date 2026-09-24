import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { Activity, AlertOctagon, Bell, BellOff, ListTree, Play, Timer } from 'lucide-react-native';
import {
  Button,
  EmptyState,
  ErrorState,
  Gutter,
  InkHero,
  ListHeader,
  ListScreen,
  Loader,
  Pulse,
  QuickAction,
  QuickActions,
  ScreenHeader,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { MonoTag, Section, go } from '../../buyer/orders/kit';
import { HeroMetric, RecordCard } from '@/features/admin/ops/kit';

type HealthSnapshot = {
  dbLatencyMs: number;
  pendingWebhookDeliveries: number;
  failedWebhookDeliveries24h: number;
  openAbuseReports: number;
  pendingKyc: number;
  pendingRefunds: number;
  recentErrors: { action: string; createdAt: number; status: string | null }[];
  capturedAt: number;
};
type CronJob = { name: string; schedule: string; description: string };

/** /admin/observability — health dashboard + cron control. */
export function ObservabilityScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const health = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => api.get<HealthSnapshot>('/admin/health/dashboard'),
    refetchInterval: 30_000,
  });
  const cron = useQuery({
    queryKey: ['admin-cron'],
    queryFn: () => api.get<{ jobs: CronJob[] }>('/admin/cron'),
  });
  const trigger = useMutation({
    mutationFn: (name: string) => api.post('/admin/cron/trigger', { name }),
    onSuccess: (_r, name) => {
      toast.success(`Triggered ${name}`);
      qc.invalidateQueries({ queryKey: ['admin-health'] });
    },
    onError: (e) => toast.error('Trigger failed', errorMessage(e)),
  });

  const h = health.data;
  const metrics = h
    ? [
        { label: 'DB latency', value: `${h.dbLatencyMs}ms`, warn: h.dbLatencyMs > 500 },
        { label: 'Webhook backlog', value: String(h.pendingWebhookDeliveries), warn: h.pendingWebhookDeliveries > 20 },
        { label: 'Webhook failures 24h', value: String(h.failedWebhookDeliveries24h), warn: h.failedWebhookDeliveries24h > 0 },
        { label: 'Open abuse reports', value: String(h.openAbuseReports), warn: h.openAbuseReports > 0 },
        { label: 'Pending KYC', value: String(h.pendingKyc), warn: h.pendingKyc > 10 },
        { label: 'Pending refunds', value: String(h.pendingRefunds), warn: h.pendingRefunds > 5 },
      ]
    : [];

  return (
    <ListScreen
      data={cron.data?.jobs ?? []}
      keyExtractor={(j) => j.name}
      onRefresh={() => Promise.all([health.refetch(), cron.refetch()])}
      header={
        <ListHeader>
          <ScreenHeader
            back
            kicker="Platform telemetry"
            title="Observability"
            subtitle={h ? `Snapshot ${timeAgo(h.capturedAt)}` : undefined}
          />
          <Gutter style={{ gap: 14 }}>
            <InkHero seed="admin-observability">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="overline" color="volt">
                  Platform health
                </Text>
                {h ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Pulse color={metrics.some((m) => m.warn) ? colors.amber : colors.volt} size={6} />
                    <Text variant="caption" color="paperMuted">
                      {metrics.filter((m) => m.warn).length ? `${metrics.filter((m) => m.warn).length} warnings` : 'Nominal'}
                    </Text>
                  </View>
                ) : null}
              </View>
              {health.isLoading ? (
                <SkeletonList rows={1} height={90} />
              ) : health.isError ? (
                <Text variant="bodySm" color="paperMuted" style={{ marginTop: 12 }}>
                  Snapshot unavailable
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 14, marginTop: 16 }}>
                  {metrics.map((m) => (
                    <HeroMetric key={m.label} label={m.label} value={m.value} tone={m.warn ? 'rose' : 'paper'} />
                  ))}
                </View>
              )}
              <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.paperLine, marginTop: 20, marginBottom: 18 }} />
              <QuickActions style={{ justifyContent: 'flex-start', gap: 12 }}>
                <QuickAction icon={Bell} label="Alerts" tone="glass" onPress={() => go('/admin/observability/alerts')} />
                <QuickAction icon={ListTree} label="Queues" tone="glass" onPress={() => go('/admin/observability/queues')} />
              </QuickActions>
            </InkHero>
            {health.isError ? <ErrorState message={errorMessage(health.error)} onRetry={() => health.refetch()} /> : null}
            {!health.isLoading && !health.isError ? (
              <>
                {h?.recentErrors?.length ? (
                  <Section kicker="Errors" title="Recent errors" icon={Activity}>
                    {h.recentErrors.slice(0, 8).map((e, i) => (
                      <View
                        key={(e as { id?: string }).id ?? `${e.action}-${e.createdAt}-${i}`}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: i ? 10 : 0, borderTopWidth: i ? StyleSheet.hairlineWidth * 2 : 0, borderTopColor: colors.lineSoft }}
                      >
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.rose }} />
                        <Text variant="caption" color="ink3" numberOfLines={1} style={{ flex: 1, fontFamily: fonts.mono }}>
                          {e.action}
                        </Text>
                        <Text variant="caption" color="ink5">
                          {timeAgo(e.createdAt)}
                        </Text>
                      </View>
                    ))}
                  </Section>
                ) : null}
                <Section kicker="Scheduler" title="Cron jobs" icon={Timer}>
                  <Text variant="caption" color="ink4">
                    Manually trigger a scheduled job. Runs are idempotent.
                  </Text>
                </Section>
              </>
            ) : null}
          </Gutter>
        </ListHeader>
      }
      ListEmptyComponent={cron.isLoading ? <Loader label="Loading jobs…" /> : <EmptyState icon={Timer} title="No cron jobs" message="The scheduler registry is empty." />}
      renderItem={({ item: j }) => (
        <RecordCard
          icon={Timer}
          tone="paper"
          title={j.name}
          subtitle={j.description}
          chips={<MonoTag label={j.schedule} tone="ink" />}
          actions={
            <>
              <View style={{ flex: 1 }} />
              <Button title="Run now" icon={Play} size="sm" loading={trigger.isPending && trigger.variables === j.name} onPress={() => trigger.mutate(j.name)} />
            </>
          }
        />
      )}
    />
  );
}

type SloRule = {
  name: string;
  component: string;
  description: string;
  severity: string;
  threshold: number;
  window: string;
  comparator: string;
  enabled: boolean;
  silenced: boolean;
};

/** /admin/observability/alerts — SLO rules + silence control. */
export function ObservabilityAlertsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const rules = useQuery({
    queryKey: ['admin-alert-rules'],
    queryFn: () => api.get<{ rules: SloRule[] }>('/admin/observability/alerts/rules'),
  });
  const silence = useMutation({
    mutationFn: ({ ruleName, durationMinutes, reason }: { ruleName: string; durationMinutes: number; reason: string }) =>
      api.post('/admin/observability/alerts/silence', { ruleName, durationMinutes, reason }),
    onSuccess: () => {
      toast.success('Rule silenced');
      qc.invalidateQueries({ queryKey: ['admin-alert-rules'] });
    },
    onError: (e) => toast.error('Could not silence', errorMessage(e)),
  });
  const unsilence = useMutation({
    mutationFn: (ruleName: string) => api.del(`/admin/observability/alerts/silence/${encodeURIComponent(ruleName)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-alert-rules'] }),
    onError: (e) => toast.error('Could not unsilence', errorMessage(e)),
  });

  return (
    <ListScreen
      data={rules.data?.rules ?? []}
      keyExtractor={(r) => r.name}
      onRefresh={() => rules.refetch()}
      header={
        <ListHeader>
          <ScreenHeader back kicker="SLO alerts" title="Alert rules" subtitle="Silence a rule during planned work; it resumes automatically after the window." />
        </ListHeader>
      }
      ListEmptyComponent={
        rules.isLoading ? <SkeletonList rows={4} height={84} /> : rules.isError ? <ErrorState message={errorMessage(rules.error)} onRetry={() => rules.refetch()} /> : <EmptyState icon={Bell} title="No rules" />
      }
      renderItem={({ item: r }) => (
        <RecordCard
          icon={r.silenced ? BellOff : AlertOctagon}
          tone={r.silenced ? 'paper' : r.severity === 'critical' ? 'danger' : 'warning'}
          title={r.name}
          subtitle={r.description}
          status={<StatusBadge status={r.silenced ? 'silenced' : r.enabled ? 'active' : 'disabled'} size="sm" label={r.silenced ? 'Silenced' : r.enabled ? 'Active' : 'Disabled'} />}
          chips={
            <>
              <MonoTag label={r.component} tone="copper" />
              <MonoTag label={r.severity} tone={r.severity === 'critical' ? 'rose' : 'amber'} />
              <MonoTag label={`${r.comparator} ${r.threshold}`} tone="ink" />
              <MonoTag label={r.window} tone="ink" />
            </>
          }
          actions={
            r.silenced ? (
              <Button title="Unsilence" icon={Bell} variant="paper" size="sm" loading={unsilence.isPending} onPress={() => unsilence.mutate(r.name)} />
            ) : (
              <Button
                title="Silence 1h"
                icon={BellOff}
                variant="paper"
                size="sm"
                loading={silence.isPending}
                onPress={() => silence.mutate({ ruleName: r.name, durationMinutes: 60, reason: 'Planned maintenance' })}
              />
            )
          }
        />
      )}
    />
  );
}
