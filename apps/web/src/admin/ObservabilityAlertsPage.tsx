import { useState } from 'react';
import { BellIcon } from '@/components/icons';
import { useAlertRules, silenceRule } from '../lib/useAlertRules';
import { AlertRuleCard } from './components/AlertRuleCard';
import { AlertHistoryTable } from './components/AlertHistoryTable';
import { SilenceDialog } from './components/SilenceDialog';
import { AdminPage, AdminPageHeader, CardHeader, EmptyBlock, Pill, Skeleton, TableCard } from './ui';

export function ObservabilityAlertsPage() {
  const rules = useAlertRules();
  const [dialogRule, setDialogRule] = useState<string | null>(null);
  const [history] = useState<any[]>([]);
  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Observability"
        title="Observability alerts"
        description="Alert rules watching platform health, and the alerts they have raised."
        {...(rules
          ? {
              meta: (
                <>
                  <Pill tone="neutral">{rules.length} rules</Pill>
                  {rules.some((r) => r.silenced) && (
                    <Pill tone="warning" dot>
                      {rules.filter((r) => r.silenced).length} silenced
                    </Pill>
                  )}
                </>
              ),
            }
          : {})}
      />

      <section className="space-y-4">
        <CardHeader title="Rules" description="Silence a rule to pause its notifications for a set time." />
        {!rules && (
          <div className="space-y-3" aria-busy="true">
            <span className="sr-only">Loading…</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        )}
        {rules && rules.length === 0 && (
          <div className="vyro-surface">
            <EmptyBlock icon={<BellIcon size={20} />} title="No alert rules" description="No alert rules are configured yet." />
          </div>
        )}
        {rules && rules.length > 0 && (
          <div className="grid gap-4">
            {rules.map((r) => (
              <AlertRuleCard key={r.name} rule={r} onSilence={() => setDialogRule(r.name)} />
            ))}
          </div>
        )}
      </section>

      <TableCard title="History" description="Recent alerts raised by these rules.">
        <AlertHistoryTable rows={history} />
      </TableCard>

      {dialogRule && (
        <SilenceDialog
          ruleName={dialogRule}
          onCancel={() => setDialogRule(null)}
          onConfirm={async (dur, reason) => {
            await silenceRule(dialogRule, dur, reason);
            setDialogRule(null);
            window.location.reload();
          }}
        />
      )}
    </AdminPage>
  );
}
