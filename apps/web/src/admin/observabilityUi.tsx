/**
 * Shared pieces for the Observability section: the section nav that ties
 * Health / Crons / Queues / Alerts together, plus cron-schedule helpers.
 */
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { BellIcon, ClockIcon, LayersIcon, TrendingUpIcon } from '@/components/icons';

type Section = 'health' | 'cron' | 'queues' | 'alerts';

const SECTIONS: Array<{ key: Section; to: string; label: string; icon: ReactNode }> = [
  { key: 'health', to: '/admin/observability?tab=health', label: 'Health', icon: <TrendingUpIcon size={14} /> },
  { key: 'cron', to: '/admin/observability?tab=cron', label: 'Cron jobs', icon: <ClockIcon size={14} /> },
  { key: 'queues', to: '/admin/observability/queues', label: 'Queues', icon: <LayersIcon size={14} /> },
  { key: 'alerts', to: '/admin/observability/alerts', label: 'Alerts', icon: <BellIcon size={14} /> },
];

function currentSection(pathname: string, search: string): Section {
  if (pathname.endsWith('/queues')) return 'queues';
  if (pathname.endsWith('/alerts')) return 'alerts';
  return new URLSearchParams(search).get('tab') === 'cron' ? 'cron' : 'health';
}

/** Section switcher shown under every Observability page header. */
export function ObservabilityNav({ badges }: { badges?: Partial<Record<Section, ReactNode>> }) {
  const { pathname, search } = useLocation();
  const active = currentSection(pathname, search);
  return (
    <nav aria-label="Observability sections" className="-mx-1 overflow-x-auto scrollbar-thin">
      <div className="mx-1 inline-flex min-w-max gap-0.5 rounded-xl bg-ink/[0.045] p-1 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.05),inset_0_1px_2px_rgba(12,14,11,0.05)]">
        {SECTIONS.map((s) => {
          const on = s.key === active;
          return (
            <Link
              key={s.key}
              to={s.to}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-all duration-200',
                on
                  ? 'bg-paper text-ink shadow-[0_0_0_1px_rgba(12,14,11,0.06),0_1px_2px_rgba(12,14,11,0.08),0_4px_10px_-4px_rgba(12,14,11,0.12)]'
                  : 'text-ink-4 hover:bg-paper/50 hover:text-ink',
              )}
            >
              <span className={on ? 'text-ink' : 'text-ink-4'}>{s.icon}</span>
              {s.label}
              {badges?.[s.key]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Small count bubble for the nav. */
export function NavCount({ n, tone = 'neutral' }: { n: number; tone?: 'neutral' | 'danger' }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        'rounded-full px-1.5 text-[10px] font-semibold leading-4 num-tabular',
        tone === 'danger' ? 'bg-rose text-paper' : 'bg-ink/[0.08] text-ink-3',
      )}
    >
      {n}
    </span>
  );
}

/* ---------------------------------------------------------------- Cron helpers */

const pad = (n: number) => String(n).padStart(2, '0');

/** Plain-English label for the cron shapes used in wrangler.toml. */
export function humanizeCron(schedule: string): string {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  const restAny = dom === '*' && mon === '*';
  if (min.startsWith('*/') && hour === '*' && restAny && dow === '*') return `Every ${min.slice(2)} minutes`;
  if (min === '*' && hour === '*' && restAny && dow === '*') return 'Every minute';
  if (/^\d+$/.test(min) && hour === '*' && restAny && dow === '*') return min === '0' ? 'Hourly, on the hour' : `Hourly at :${pad(+min)}`;
  if (/^\d+$/.test(min) && hour.startsWith('*/') && restAny && dow === '*') return `Every ${hour.slice(2)} hours at :${pad(+min)}`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && restAny) {
    const at = `${pad(+hour)}:${pad(+min)} UTC`;
    if (dow === '*') return `Daily at ${at}`;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (/^[0-6]$/.test(dow)) return `Weekly on ${days[+dow]} at ${at}`;
    return `${at} on ${dow}`;
  }
  return schedule;
}

function fieldMatches(field: string, value: number): boolean {
  return field.split(',').some((part) => {
    if (part === '*') return true;
    const step = part.match(/^(\*|\d+-\d+)\/(\d+)$/);
    if (step) {
      const [lo, hi] = step[1] === '*' ? [0, 59] : step[1]!.split('-').map(Number) as [number, number];
      return value >= lo && value <= hi && (value - lo) % Number(step[2]) === 0;
    }
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) return value >= Number(range[1]) && value <= Number(range[2]);
    return Number(part) === value;
  });
}

/** Next UTC fire time for a 5-field cron, scanning minute by minute up to 8 days. */
export function nextCronRun(schedule: string, from = Date.now()): number | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts as [string, string, string, string, string];
  const t = new Date(from);
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);
  for (let i = 0; i < 8 * 24 * 60; i++) {
    if (
      fieldMatches(min, t.getUTCMinutes()) &&
      fieldMatches(hour, t.getUTCHours()) &&
      fieldMatches(dom, t.getUTCDate()) &&
      fieldMatches(mon, t.getUTCMonth() + 1) &&
      fieldMatches(dow, t.getUTCDay())
    ) {
      return t.getTime();
    }
    t.setUTCMinutes(t.getUTCMinutes() + 1);
  }
  return null;
}

/** "in 4 min" / "in 3 h 12 min" countdown label. */
export function untilLabel(ts: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((ts - now) / 60000));
  if (mins < 1) return 'any moment';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  return `in ${Math.round(h / 24)} d`;
}

export function fmtClock(t: number | null | undefined): string {
  if (!t) return '—';
  return new Date(t).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
