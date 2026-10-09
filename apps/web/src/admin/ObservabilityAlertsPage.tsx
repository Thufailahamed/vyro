import { useMemo, useState } from 'react';
import { BellIcon } from '@/components/icons';
import { ApiError } from '@/lib/api';
import { useAlertHistory, useAlertRules, useSilenceRule, useUnsilenceRule } from '../lib/useAlertRules';
import { AlertRuleCard } from './components/AlertRuleCard';
import { AlertHistoryTable } from './components/AlertHistoryTable';
import { SilenceDialog } from './components/SilenceDialog';
import { NavCount, ObservabilityNav } from './observabilityUi';
import { AdminPage, AdminPageHeader, Callout, EmptyBlock, SectionLabel, Segmented, Skeleton, StatCard, StatGrid, TableCard } from './ui';

const DAY = 86_400_000;

export function ObservabilityAlertsPage() {
  const rules = useAlertRules();
  const history = useAlertHistory();
  const silence = useSilenceRule();
  const unsilence = useUnsilenceRule();
  const [dialogRule, setDialogRule] = useState<string | null>(null);
  const [severity, setSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const list = rules.data ?? [];
  const rows = history.data ?? [];
  const stats = useMemo(() => {
    const since = Date.now() - DAY;
    const recent = rows.filter((r) => r.createdAt >= since);
    return {
      enabled: list.filter((r) => r.enabled).length,
      silenced: list.filter((r) => r.silenced).length,
      fired24h: recent.length,
      critical24h: recent.filter((r) => r.severity === 'critical').length,
    };
  }, [list, rows]);

  const visibleRows = severity === 'all' ? rows : rows.filter((r) => r.severity === severity);

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Infrastructure & reliability"
        title="Alerts"
        description="Rules that watch platform health, and the alerts they have raised. Silence a rule to pause its notifications during planned work."
      />
      <ObservabilityNav badges={{ alerts: <NavCount n={stats.critical24h} tone="danger" /> }} />

      <StatGrid cols={4}>
        <StatCard label="Active rules" value={`${stats.enabled}/${list.length}`} sub="Enabled and evaluating" loading={rules.isLoading} />
        <StatCard
          label="Silenced"
          value={stats.silenced}
          sub={stats.silenced ? 'Notifications paused' : 'Nothing muted'}
          tone={stats.silenced ? 'warning' : 'neutral'}
          loading={rules.isLoading}
        />
        <StatCard label="Fired (24h)" value={stats.fired24h} sub="Alerts raised in the last day" loading={history.isLoading} />
        <StatCard
          label="Critical (24h)"
          value={stats.critical24h}
          sub={stats.critical24h ? 'Needs investigation' : 'No critical alerts'}
          tone={stats.critical24h ? 'danger' : 'success'}
          loading={history.isLoading}
        />
      </StatGrid>

      {unsilence.isError && (
        <Callout tone="danger" title="Couldn’t unsilence the rule">
          {(unsilence.error as Error).message}
        </Callout>
      )}

      <section className="space-y-4">
        <SectionLabel>Rules</SectionLabel>
        {rules.isError ? (
          <Callout tone="danger" title="Couldn’t load alert rules">
            {(rules.error as Error).message}
          </Callout>
        ) : rules.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-[18px]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="vyro-surface">
            <EmptyBlock icon={<BellIcon size={20} />} title="No alert rules" description="No alert rules are configured yet." />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((r) => (
              <AlertRuleCard
                key={r.name}
                rule={r}
                onSilence={() => {
                  silence.reset();
                  setDialogRule(r.name);
                }}
                onUnsilence={() => unsilence.mutate(r.name)}
                busy={unsilence.isPending && unsilence.variables === r.name}
              />
            ))}
          </div>
        )}
      </section>

      <TableCard
        title="Alert history"
        description="Most recent alerts raised by these rules."
        actions={
          rows.length > 0 ? (
            <Segmented
              ariaLabel="Filter by severity"
              value={severity}
              onChange={setSeverity}
              items={[
                { key: 'all', label: 'All' },
                { key: 'critical', label: 'Critical' },
                { key: 'warning', label: 'Warning' },
                { key: 'info', label: 'Info' },
              ]}
            />
          ) : undefined
        }
      >
        {history.isError ? (
          <div className="px-5 pb-5 sm:px-6">
            <Callout tone="danger">{(history.error as Error).message}</Callout>
          </div>
        ) : history.isLoading ? (
          <div className="space-y-2 px-6 pb-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <AlertHistoryTable rows={visibleRows} />
        )}
      </TableCard>

      {dialogRule && (
        <SilenceDialog
          ruleName={dialogRule}
          pending={silence.isPending}
          error={silence.error ? (silence.error instanceof ApiError ? silence.error.message : 'Couldn’t silence this rule.') : null}
          onCancel={() => setDialogRule(null)}
          onConfirm={(durationMinutes, reason) =>
            silence.mutate({ ruleName: dialogRule, durationMinutes, reason }, { onSuccess: () => setDialogRule(null) })
          }
        />
      )}
    </AdminPage>
  );
}
