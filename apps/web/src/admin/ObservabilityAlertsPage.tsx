import { useState } from 'react';
import { useAlertRules, silenceRule } from '../lib/useAlertRules';
import { AlertRuleCard } from './components/AlertRuleCard';
import { AlertHistoryTable } from './components/AlertHistoryTable';
import { SilenceDialog } from './components/SilenceDialog';

export function ObservabilityAlertsPage() {
  const rules = useAlertRules();
  const [dialogRule, setDialogRule] = useState<string | null>(null);
  const [history] = useState<any[]>([]);
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Observability Alerts</h1>
      <section>
        <h2 className="font-semibold mb-2">Rules</h2>
        {!rules && <p>Loading…</p>}
        {rules?.map((r) => (
          <AlertRuleCard
            key={r.name}
            rule={r}
            onSilence={() => setDialogRule(r.name)}
          />
        ))}
      </section>
      <section className="mt-8">
        <h2 className="font-semibold mb-2">History</h2>
        <AlertHistoryTable rows={history} />
      </section>
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
    </main>
  );
}