import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { BellIcon } from '@/components/icons';
import { Card, Pill, type PillTone } from '../ui';

type Rule = {
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

function severityTone(severity: string): PillTone {
  const s = severity.toLowerCase();
  if (/(crit|high|page|p0|p1|error)/.test(s)) return 'danger';
  if (/(warn|medium|p2)/.test(s)) return 'warning';
  if (/(info|low)/.test(s)) return 'info';
  return 'neutral';
}

export function AlertRuleCard({
  rule,
  onSilence,
}: {
  rule: Rule;
  onSilence: () => void;
}): ReactNode {
  const state = rule.silenced
    ? { label: 'Silenced', tone: 'warning' as const }
    : rule.enabled
      ? { label: 'Enabled', tone: 'success' as const }
      : { label: 'Disabled', tone: 'neutral' as const };

  return (
    <Card padded={false} className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-bone text-ink-3">
            <BellIcon size={16} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-ink">{rule.name}</span>
              <Pill tone={state.tone} dot>
                {state.label}
              </Pill>
            </div>
            {rule.description && <p className="mt-1 text-sm text-ink-3 text-pretty">{rule.description}</p>}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onSilence} className="sm:shrink-0">
          Silence…
        </Button>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-ink/[0.07] pt-4 text-sm sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-ink-4">Component</dt>
          <dd className="mt-1 truncate text-ink">{rule.component}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-ink-4">Condition</dt>
          <dd className="mt-1 font-mono text-xs text-ink num-tabular">
            {rule.comparator} {rule.threshold} / {rule.window}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium text-ink-4">Severity</dt>
          <dd className="mt-1">
            <Pill tone={severityTone(rule.severity)}>{rule.severity}</Pill>
          </dd>
        </div>
      </dl>
    </Card>
  );
}
