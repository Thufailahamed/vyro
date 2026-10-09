import { cn } from '@vyro/ui';
import { CheckIcon, XCircleIcon, AlertTriangleIcon } from '@/components/icons';
import { statusLabel } from '@/lib/orderLifecycle';

/** Happy-path order lifecycle, in order. */
export const ORDER_STEPS = [
  { status: 'pending', label: 'Placed' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready_for_pickup', label: 'Ready' },
  { status: 'out_for_delivery', label: 'Dispatched' },
  { status: 'delivered', label: 'Delivered' },
  { status: 'completed', label: 'Completed' },
] as const;

const TERMINAL = new Set(['rejected', 'cancelled', 'disputed']);

type ProgressEvent = { toStatus: string; fromStatus?: string | null; createdAt: number };

/**
 * Index of the furthest happy-path step reached. For terminal statuses this is the
 * step the order was in when it left the happy path (derived from events).
 */
export function orderProgressIndex(status: string, events: ProgressEvent[] = []): number {
  const direct = ORDER_STEPS.findIndex((s) => s.status === status);
  if (direct >= 0) return direct;
  const exit = [...events].reverse().find((e) => e.toStatus === status);
  const from = exit?.fromStatus ? ORDER_STEPS.findIndex((s) => s.status === exit.fromStatus) : -1;
  return Math.max(0, from);
}

function stepTimestamp(status: string, events: ProgressEvent[], placedAt?: number): number | undefined {
  if (status === 'pending') return placedAt;
  return [...events].reverse().find((e) => e.toStatus === status)?.createdAt;
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function OrderProgress({
  status,
  events = [],
  placedAt,
  tone = 'light',
  compact = false,
}: {
  status: string;
  events?: ProgressEvent[];
  placedAt?: number;
  tone?: 'light' | 'dark';
  compact?: boolean;
}) {
  const terminal = TERMINAL.has(status);
  const current = orderProgressIndex(status, events);
  const dark = tone === 'dark';
  const pct = (current / (ORDER_STEPS.length - 1)) * 100;

  if (compact) {
    return (
      <div>
        <div className={cn('relative h-1.5 overflow-hidden rounded-full', dark ? 'bg-paper/10' : 'bg-ink/[0.07]')}>
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-vyro',
              terminal ? 'bg-rose' : 'bg-volt shadow-[0_0_12px_rgba(198,220,74,0.6)]',
            )}
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
        <div
          className={cn(
            'mt-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]',
            dark ? 'text-paper/45' : 'text-ink-4',
          )}
        >
          <span>
            Step {current + 1} / {ORDER_STEPS.length}
          </span>
          <span className={cn('font-bold', terminal ? 'text-rose' : dark ? 'text-volt' : 'text-ink')}>
            {terminal ? statusLabel(status) : ORDER_STEPS[current]?.label}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {terminal && (
        <div
          className={cn(
            'mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
            dark ? 'border-rose/40 bg-rose/15 text-paper' : 'border-rose/30 bg-rose/10 text-rose',
          )}
        >
          {status === 'disputed' ? <AlertTriangleIcon size={13} /> : <XCircleIcon size={13} />}
          {statusLabel(status)} after {ORDER_STEPS[current]?.label.toLowerCase()}
        </div>
      )}
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${ORDER_STEPS.length}, minmax(0, 1fr))` }}>
        {/* Rail */}
        <div
          aria-hidden
          className={cn('absolute left-[7.14%] right-[7.14%] top-[11px] h-px', dark ? 'bg-paper/15' : 'bg-ink/10')}
        />
        <div
          aria-hidden
          className={cn(
            'absolute left-[7.14%] top-[10px] h-[3px] rounded-full transition-[width] duration-700 ease-vyro',
            terminal ? 'bg-rose/70' : 'bg-volt shadow-[0_0_14px_rgba(198,220,74,0.55)]',
          )}
          style={{ width: `${(pct * 85.72) / 100}%` }}
        />
        {ORDER_STEPS.map((step, i) => {
          const done = i < current || (i === current && status === 'completed');
          const active = i === current && !done;
          const ts = i <= current ? stepTimestamp(step.status, events, placedAt) : undefined;
          return (
            <li key={step.status} className="relative flex flex-col items-center text-center">
              <span
                className={cn(
                  'relative z-10 flex size-[23px] items-center justify-center rounded-full border transition-colors duration-300',
                  done && (terminal ? 'border-rose/60 bg-rose/80 text-paper' : 'border-volt bg-volt text-ink'),
                  active &&
                    (terminal
                      ? 'border-rose bg-rose text-paper'
                      : dark
                        ? 'border-volt bg-ink text-volt ring-4 ring-volt/20'
                        : 'border-ink bg-paper text-ink ring-4 ring-volt/40'),
                  !done && !active && (dark ? 'border-paper/20 bg-ink text-paper/30' : 'border-ink/15 bg-paper text-ink-5'),
                )}
              >
                {done ? (
                  <CheckIcon size={12} />
                ) : active ? (
                  terminal ? (
                    <XCircleIcon size={12} />
                  ) : (
                    <span className={cn('size-2 rounded-full', dark ? 'bg-volt animate-pulse' : 'bg-ink animate-pulse')} />
                  )
                ) : (
                  <span className="size-1 rounded-full bg-current" />
                )}
              </span>
              <span
                className={cn(
                  'mt-2.5 text-[11px] font-semibold leading-tight',
                  dark
                    ? done || active
                      ? 'text-paper'
                      : 'text-paper/35'
                    : done || active
                      ? 'text-ink'
                      : 'text-ink-5',
                )}
              >
                {step.label}
              </span>
              <span
                className={cn(
                  'mt-0.5 hidden font-mono text-[10px] sm:block',
                  dark ? 'text-paper/40' : 'text-ink-4',
                )}
              >
                {ts ? shortDate(ts) : ' '}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
