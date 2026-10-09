/**
 * Shared presentation helpers for the Leads CRM: tag/status metadata,
 * relative dates, the tag chip and the pipeline stage stepper.
 */
import { cn } from '@vyro/ui';
import { CheckIcon } from '@/components/icons';
import type { LeadConversionStatus, LeadTag } from '@vyro/validation';

export const STAGES = ['new', 'contacted', 'quoted', 'won'] as const;
export const ALL_STATUSES: LeadConversionStatus[] = ['new', 'contacted', 'quoted', 'won', 'lost'];

export const TAG_META: Record<LeadTag, { label: string; dot: string; chip: string; bar: string; tile: string }> = {
  hot: {
    label: 'Hot',
    dot: 'bg-rose',
    chip: 'bg-rose/10 text-rose ring-rose/25',
    bar: 'bg-rose',
    tile: 'bg-rose/10 text-rose group-hover:bg-rose/15',
  },
  warm: {
    label: 'Warm',
    dot: 'bg-amber',
    chip: 'bg-amber/10 text-[#a86c28] ring-amber/30',
    bar: 'bg-amber',
    tile: 'bg-amber/10 text-[#a86c28] group-hover:bg-amber/15',
  },
  cold: {
    label: 'Cold',
    dot: 'bg-ink/30',
    chip: 'bg-ink/[0.05] text-ink-3 ring-ink/12',
    bar: 'bg-ink/20',
    tile: 'bg-ink/[0.05] text-ink-3 group-hover:bg-ink/[0.08]',
  },
};

export const STATUS_BAR: Record<LeadConversionStatus, string> = {
  new: 'bg-ink/25',
  contacted: 'bg-copper',
  quoted: 'bg-volt-deep',
  won: 'bg-mint',
  lost: 'bg-rose',
};

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relTime(ts: number, now = Date.now()) {
  const diff = (ts - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'just now';
  if (abs < 3600) return RTF.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return RTF.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return RTF.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return RTF.format(Math.round(diff / (86400 * 30)), 'month');
  return RTF.format(Math.round(diff / (86400 * 365)), 'year');
}

export function fmtDate(ts: number, withTime = false) {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function TagChip({ tag, className }: { tag: LeadTag; className?: string }) {
  const m = TAG_META[tag];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-4 tracking-[0.08em] ring-1 ring-inset',
        m.chip,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

/** Connected stepper new → contacted → quoted → won; `lost` shows a terminal red state. */
export function StageStepper({
  status,
  onSelect,
  disabled,
}: {
  status: LeadConversionStatus | null;
  onSelect: (s: LeadConversionStatus) => void;
  disabled?: boolean;
}) {
  const lost = status === 'lost';
  const idx = status && !lost ? STAGES.indexOf(status as (typeof STAGES)[number]) : -1;
  return (
    <div>
      <ol className="flex items-start">
        {STAGES.map((s, i) => {
          const done = idx > i;
          const current = idx === i;
          return (
            <li key={s} className="relative flex flex-1 flex-col items-center">
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute right-1/2 top-[13px] h-0.5 w-full -translate-y-1/2 transition-colors duration-500',
                    idx >= i ? 'bg-ink' : 'bg-ink/10',
                  )}
                />
              ) : null}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(s)}
                aria-label={`Move to ${s}`}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'relative z-10 flex size-[26px] items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 disabled:cursor-wait',
                  done && 'bg-ink text-volt',
                  current && 'bg-volt text-ink shadow-[0_0_0_4px_rgba(198,220,74,0.3)] ring-2 ring-ink',
                  !done && !current && 'bg-paper text-ink-4 shadow-[inset_0_0_0_1.5px_rgba(12,14,11,0.15)] hover:shadow-[inset_0_0_0_1.5px_rgba(12,14,11,0.5)]',
                )}
              >
                {done ? <CheckIcon size={12} /> : i + 1}
              </button>
              <span
                className={cn(
                  'mt-2 text-[11px] font-semibold capitalize',
                  current ? 'text-ink' : done ? 'text-ink-3' : 'text-ink-4',
                )}
              >
                {s}
              </span>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect('lost')}
        className={cn(
          'mt-4 inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-all disabled:cursor-wait',
          lost
            ? 'bg-rose text-paper shadow-[0_4px_10px_-4px_rgba(196,90,74,0.6)]'
            : 'bg-paper text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] hover:text-rose hover:shadow-[inset_0_0_0_1px_rgba(196,90,74,0.5)]',
        )}
      >
        {lost ? 'Marked as lost' : 'Mark as lost'}
      </button>
    </div>
  );
}
