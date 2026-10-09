import type { ReactNode } from 'react';
import { cn } from '@vyro/ui';
import { BellIcon } from '@/components/icons';
import type { SloRule } from '@/lib/useAlertRules';
import { Button, Pill, type PillTone } from '../ui';

export function severityTone(severity: unknown): PillTone {
  const s = String(severity ?? '').toLowerCase();
  if (/(crit|high|page|p0|p1|error)/.test(s)) return 'danger';
  if (/(warn|medium|p2)/.test(s)) return 'warning';
  if (/(info|low)/.test(s)) return 'info';
  return 'neutral';
}

const ACCENT: Record<PillTone, string> = {
  danger: 'bg-rose',
  warning: 'bg-amber',
  info: 'bg-copper',
  success: 'bg-mint',
  brand: 'bg-volt-deep',
  dark: 'bg-ink',
  neutral: 'bg-ink/20',
};

const COMPARATORS: Record<string, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', '>': '>', '>=': '≥', '<': '<', '<=': '≤' };

export function AlertRuleCard({
  rule,
  onSilence,
  onUnsilence,
  busy,
}: {
  rule: SloRule;
  onSilence: () => void;
  onUnsilence: () => void;
  busy?: boolean | undefined;
}): ReactNode {
  const tone = severityTone(rule.severity);
  const state = rule.silenced
    ? { label: 'Silenced', tone: 'warning' as const }
    : rule.enabled
      ? { label: 'Watching', tone: 'success' as const }
      : { label: 'Disabled', tone: 'neutral' as const };

  return (
    <article
      className={cn(
        'vyro-surface relative flex flex-col overflow-hidden p-5 pl-6 transition-opacity',
        (rule.silenced || !rule.enabled) && 'opacity-80',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', ACCENT[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-[10px]',
              rule.silenced ? 'bg-amber/[0.12] text-[#a86c28]' : 'bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]',
            )}
          >
            <BellIcon size={15} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-mono text-[13px] font-semibold text-ink">{rule.name}</div>
            <div className="mt-0.5 text-xs capitalize text-ink-4">{rule.component}</div>
          </div>
        </div>
        <Pill tone={state.tone} dot>
          {state.label}
        </Pill>
      </div>

      {rule.description && <p className="mt-3 text-[13px] leading-relaxed text-ink-3 text-pretty">{rule.description}</p>}

      <div className="min-h-4 flex-1" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-ink px-2 py-0.5 font-mono text-[11px] text-paper num-tabular">
            {COMPARATORS[rule.comparator] ?? rule.comparator} {rule.threshold}
            <span className="text-paper/50"> / {rule.window}</span>
          </span>
          <Pill tone={tone}>{rule.severity}</Pill>
        </div>
        {rule.silenced ? (
          <Button size="sm" variant="secondary" onClick={onUnsilence} disabled={busy}>
            {busy ? 'Resuming…' : 'Unsilence'}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={onSilence} disabled={!rule.enabled}>
            Silence…
          </Button>
        )}
      </div>
    </article>
  );
}
