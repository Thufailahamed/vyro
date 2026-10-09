import { Link } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { CheckCircleIcon, ArrowRightIcon } from '@/components/icons';
import type { AlertHistoryRow } from '@/lib/useAlertRules';
import { relativeTime } from '../registryUi';
import { fmtClock } from '../observabilityUi';
import { EmptyBlock, Pill } from '../ui';
import { severityTone } from './AlertRuleCard';

const DOT: Record<string, string> = { critical: 'bg-rose', warning: 'bg-amber', info: 'bg-copper' };

export function AlertHistoryTable({ rows }: { rows: AlertHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border-t border-ink/[0.07]">
        <EmptyBlock
          icon={<CheckCircleIcon size={22} />}
          title="No alerts fired"
          description="When a rule crosses its threshold, the alert it raises is listed here."
        />
      </div>
    );
  }
  return (
    <ol className="divide-y divide-ink/[0.06] border-t border-ink/[0.07]">
      {rows.map((r) => (
        <li key={r.id} className="group flex items-start gap-4 px-5 py-3.5 sm:px-6">
          <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[r.severity] ?? 'bg-ink/30')} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">{r.title}</span>
              <Pill tone={severityTone(r.severity)}>{r.severity}</Pill>
            </div>
            {r.body && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-4">{r.body}</p>}
            {r.sourceRef && <div className="mt-1 font-mono text-[11px] text-ink-5">{r.sourceRef}</div>}
          </div>
          <div className="shrink-0 text-right">
            <time className="block text-xs text-ink-3" title={fmtClock(r.createdAt)}>
              {relativeTime(r.createdAt)}
            </time>
            {r.link && r.link.startsWith('/') && (
              <Link to={r.link} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-4 hover:text-ink">
                Open <ArrowRightIcon size={10} />
              </Link>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
