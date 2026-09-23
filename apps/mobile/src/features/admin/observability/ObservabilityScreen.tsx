import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { Activity, Bell, ListTree, Play, Timer } from 'lucide-react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Gutter,
  ListHeader,
  ListScreen,
  Loader,
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
            right={
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Alerts" icon={Bell} variant="secondary" size="sm" onPress={() => go('/admin/observability/alerts')} />
                <Button title="Queues" icon={ListTree} variant="secondary" size="sm" onPress={() => go('/admin/observability/queues')} />
              </View>
            }
          />
          <Gutter style={{ gap: 14 }}>
            {health.isLoading ? (
              <SkeletonList rows={2} height={90} />
            ) : health.isError ? (
              <ErrorState message={errorMessage(health.error)} onRetry={() => health.refetch()} />
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {metrics.map((m) => (
                    <Card key={m.label} padding={12} style={{ width: '31%', flexGrow: 1, gap: 4, borderWidth: m.warn ? 1 : 0, borderColor: colors.amber }}>
                      <Text variant="overline" color="ink4" numberOfLines={1}>
                        {m.label}
                      </Text>
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 17, color: m.warn ? colors.amber : colors.ink }}>{m.value}</Text>
                    </Card>
                  ))}
                </View>
                {h?.recentErrors?.length ? (
                  <Section kicker="Errors" title="Recent errors" icon={Activity}>
                    {h.recentErrors.slice(0, 8).map((e, i) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                        <Text variant="caption" color="ink3" numberOfLines={1} style={{ flex: 1 }}>
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
            )}
          </Gutter>
        </ListHeader>
      }
      ListEmptyComponent={cron.isLoading ? <Loader label="Loading jobs…" /> : <EmptyState icon={Timer} title="No cron jobs" message="The scheduler registry is empty." />}
      renderItem={({ item: j }) => (
        <Card padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodySm" weight="semibold">
              {j.name}
            </Text>
            <Text variant="caption" color="ink4" numberOfLines={1}>
              {j.description}
            </Text>
          </View>
          <MonoTag label={j.schedule} tone="ink" />
          <Button title="Run" icon={Play} size="sm" variant="secondary" loading={trigger.isPending && trigger.variables === j.name} onPress={() => trigger.mutate(j.name)} />
        </Card>
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
        <Card padding={14} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="bodySm" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
              {r.name}
            </Text>
            <StatusBadge status={r.silenced ? 'silenced' : r.enabled ? 'active' : 'disabled'} size="sm" label={r.silenced ? 'Silenced' : r.enabled ? 'Active' : 'Disabled'} />
          </View>
          <Text variant="caption" color="ink3">
            {r.description}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <MonoTag label={r.component} tone="copper" />
            <MonoTag label={r.severity} tone={r.severity === 'critical' ? 'rose' : 'amber'} />
            <MonoTag label={`${r.comparator} ${r.threshold}`} tone="ink" />
            <MonoTag label={r.window} tone="ink" />
          </View>
          {r.silenced ? (
            <Button title="Unsilence" variant="ghost" size="sm" loading={unsilence.isPending} onPress={() => unsilence.mutate(r.name)} />
          ) : (
            <Button
              title="Silence 1h"
              variant="secondary"
              size="sm"
              loading={silence.isPending}
              onPress={() => silence.mutate({ ruleName: r.name, durationMinutes: 60, reason: 'Planned maintenance' })}
            />
          )}
        </Card>
      )}
    />
  );
}
