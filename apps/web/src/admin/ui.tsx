/**
 * Admin UI kit: the shared building blocks for every VYRO Control page.
 *
 * Pages should compose these instead of hand-rolling cards, headers, tables and
 * badges, so the whole console reads as one system. Tables use the plain
 * <table className="admin-table"> markup (styles live in index.css) wrapped in
 * <TableCard>, which keeps existing table logic untouched.
 *
 * Optional props accept `undefined` explicitly because the app compiles with
 * `exactOptionalPropertyTypes`.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { AlertCircleIcon, ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon } from '@/components/icons';

type Maybe<T> = T | undefined;

/* ---------------------------------------------------------------- Page layout */

export function AdminPage({ children, className }: { children: ReactNode; className?: Maybe<string> }) {
  return <div className={cn('mx-auto max-w-7xl space-y-6 pb-16 animate-fade-in', className)}>{children}</div>;
}

export function AdminPageHeader({
  kicker,
  title,
  description,
  actions,
  back,
  meta,
  className,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Renders a "back" link above the title. */
  back?: Maybe<{ to: string; label: string }>;
  /** Small pills / facts shown under the description (IDs, statuses, dates). */
  meta?: ReactNode;
  className?: Maybe<string>;
}) {
  return (
    <header className={cn('flex flex-col gap-5 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0 max-w-3xl">
        {back && (
          <Link
            to={back.to}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-4 transition-colors hover:text-ink"
          >
            <ArrowLeftIcon size={13} />
            {back.label}
          </Link>
        )}
        {kicker && <div className="vyro-kicker">{kicker}</div>}
        <h1 className="mt-1.5 vyro-display text-3xl text-ink text-balance sm:text-4xl">{title}</h1>
        {description && <p className="mt-2.5 max-w-2xl text-sm text-ink-3 text-pretty">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:shrink-0">{actions}</div>}
    </header>
  );
}

/* ---------------------------------------------------------------- Cards */

export function Card({
  children,
  className,
  padded = true,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode; padded?: Maybe<boolean> }) {
  return (
    <div {...rest} className={cn('vyro-surface', padded && 'p-5 sm:p-6', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: Maybe<string>;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-bone text-ink-3">{icon}</span>
        )}
        <div className="min-w-0">
          <h2 className="font-sans text-base font-semibold tracking-normal text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-4 text-pretty">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A card with a header row and a divided body. */
export function Panel({
  title,
  description,
  actions,
  icon,
  children,
  footer,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: Maybe<string>;
  bodyClassName?: Maybe<string>;
}) {
  return (
    <section className={cn('vyro-surface overflow-hidden', className)}>
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <CardHeader title={title} description={description} actions={actions} icon={icon} />
      </div>
      <div className={cn('border-t border-ink/[0.07] px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-ink/[0.07] bg-bone/40 px-5 py-3 sm:px-6">{footer}</div>}
    </section>
  );
}

/** Small uppercase label for grouping content inside a card or page. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: Maybe<string> }) {
  return (
    <div className={cn('text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4', className)}>{children}</div>
  );
}

/* ---------------------------------------------------------------- Stats */

export function StatGrid({
  children,
  className,
  cols = 4,
}: {
  children: ReactNode;
  className?: Maybe<string>;
  cols?: Maybe<2 | 3 | 4 | 5>;
}) {
  const colClass = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5',
  }[cols];
  return <div className={cn('grid gap-4', colClass, className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  status,
  to,
  loading,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  /** Colours the value. Use sparingly: only when the number itself signals state. */
  tone?: Maybe<'neutral' | 'success' | 'warning' | 'danger'>;
  /** Optional pill beside the value (e.g. <Pill tone="danger">Elevated</Pill>). */
  status?: ReactNode;
  to?: Maybe<string>;
  loading?: Maybe<boolean>;
  className?: Maybe<string>;
}) {
  const valueTone = {
    neutral: 'text-ink',
    success: 'text-mint',
    warning: 'text-amber',
    danger: 'text-rose',
  }[tone];

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-ink-3">{label}</span>
        {icon && (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg bg-bone text-ink-3 transition-colors',
              to && 'group-hover:bg-ink group-hover:text-volt',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className={cn('vyro-metric text-3xl leading-none sm:text-4xl', valueTone)}>{value}</span>
            {status}
          </div>
        )}
        {sub && <div className="mt-2 truncate text-xs text-ink-4">{sub}</div>}
      </div>
    </>
  );

  const cls = cn('vyro-surface flex flex-col justify-between gap-5 p-5', className);
  if (to) {
    return (
      <Link to={to} className={cn(cls, 'group transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-2')}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/* ---------------------------------------------------------------- Pills & status */

export type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'dark';

const PILL_TONES: Record<PillTone, { cls: string; dot: string }> = {
  neutral: { cls: 'bg-ink/[0.06] text-ink-3', dot: 'bg-ink-4' },
  success: { cls: 'bg-mint/10 text-mint', dot: 'bg-mint' },
  warning: { cls: 'bg-amber/15 text-amber', dot: 'bg-amber' },
  danger: { cls: 'bg-rose/10 text-rose', dot: 'bg-rose' },
  info: { cls: 'bg-copper/10 text-copper-deep', dot: 'bg-copper' },
  brand: { cls: 'bg-volt-soft text-ink', dot: 'bg-volt-deep' },
  dark: { cls: 'bg-ink text-paper', dot: 'bg-volt' },
};

export function Pill({
  children,
  tone = 'neutral',
  dot = false,
  icon,
  className,
  title,
}: {
  children: ReactNode;
  tone?: Maybe<PillTone>;
  dot?: Maybe<boolean>;
  icon?: ReactNode;
  className?: Maybe<string>;
  title?: Maybe<string>;
}) {
  const t = PILL_TONES[tone];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-5',
        t.cls,
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', t.dot)} aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

/**
 * Maps common workflow statuses to a pill tone. Unknown statuses fall back to
 * neutral, so it is safe to pass any string straight from the API.
 */
export function statusTone(status: string | null | undefined): PillTone {
  const s = (status ?? '').toLowerCase();
  if (/(fail|error|reject|cancel|disput|suspend|block|ban|revok|overdue|breach|critical|declin|fraud|expired)/.test(s)) return 'danger';
  if (/(pend|review|await|hold|queue|draft|warn|processing|progress|open|retry|partial|unverified|flag)/.test(s)) return 'warning';
  if (/(success|succeed|complete|deliver|paid|approv|verif|active|resolv|settled|healthy|ok|enabled|live|accept|confirm|sent|published|clear)/.test(s)) return 'success';
  if (/(transit|ship|prepar|dispatch|scheduled|refund|return)/.test(s)) return 'info';
  return 'neutral';
}

export function StatusPill({
  status,
  label,
  className,
}: {
  status: string | null | undefined;
  label?: ReactNode;
  className?: Maybe<string>;
}) {
  const text = label ?? (status ?? '-').replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return (
    <Pill tone={statusTone(status)} dot className={className}>
      {text}
    </Pill>
  );
}

/* ---------------------------------------------------------------- Tabs & toolbars */

export interface TabItem<K extends string = string> {
  key: K;
  label: ReactNode;
  count?: number | null | undefined;
  icon?: ReactNode;
}

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className,
  ariaLabel = 'Sections',
}: {
  items: ReadonlyArray<TabItem<K>>;
  value: K;
  onChange: (key: K) => void;
  className?: Maybe<string>;
  ariaLabel?: Maybe<string>;
}) {
  return (
    <div className={cn('-mx-1 overflow-x-auto scrollbar-thin', className)}>
      <div role="tablist" aria-label={ariaLabel} className="mx-1 inline-flex min-w-max gap-1 rounded-xl bg-ink/[0.05] p-1">
        {items.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-all duration-200',
                active ? 'bg-paper text-ink shadow-pop' : 'text-ink-4 hover:text-ink',
              )}
            >
              {t.icon && <span className={active ? 'text-ink' : 'text-ink-4'}>{t.icon}</span>}
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] font-semibold leading-4 num-tabular',
                    active ? 'bg-ink text-paper' : 'bg-ink/10 text-ink-3',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A single row that holds search / filters on the left and actions on the right. */
export function Toolbar({
  children,
  actions,
  className,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  className?: Maybe<string>;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Class string for native <input>/<select> controls placed in toolbars and forms. */
export const controlClass =
  'h-10 rounded-lg bg-paper px-3 text-sm text-ink placeholder:text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-shadow duration-200 focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)] disabled:cursor-not-allowed disabled:opacity-60';

/* ---------------------------------------------------------------- Tables */

/**
 * Wraps a <table className="admin-table"> in a card with optional header and
 * footer (pagination). Horizontal overflow scrolls inside the card.
 */
export function TableCard({
  title,
  description,
  actions,
  toolbar,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: Maybe<string>;
}) {
  const hasHeader = Boolean(title || actions);
  return (
    <section className={cn('vyro-surface overflow-hidden', className)}>
      {hasHeader && (
        <div className="px-5 pt-5 pb-4 sm:px-6">
          <CardHeader title={title} description={description} actions={actions} />
        </div>
      )}
      {toolbar && <div className={cn('px-5 pb-4 sm:px-6', !hasHeader && 'pt-4')}>{toolbar}</div>}
      <div className="overflow-x-auto scrollbar-thin">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] px-5 py-3 text-xs text-ink-4 sm:px-6">
          {footer}
        </div>
      )}
    </section>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: Maybe<number>; cols?: Maybe<number> }) {
  return (
    <div className="divide-y divide-ink/[0.06]">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-6 px-6 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-40' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Cell content: a primary line with an optional muted secondary line. */
export function CellStack({ primary, secondary, mono }: { primary: ReactNode; secondary?: ReactNode; mono?: Maybe<boolean> }) {
  return (
    <div className="min-w-0">
      <div className={cn('truncate font-medium text-ink', mono && 'font-mono text-xs')}>{primary}</div>
      {secondary && <div className="mt-0.5 truncate text-xs text-ink-4">{secondary}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Detail lists */

export function DetailList({
  items,
  columns = 1,
  className,
}: {
  items: Array<{ label: ReactNode; value: ReactNode; key?: Maybe<string> }>;
  columns?: Maybe<1 | 2 | 3>;
  className?: Maybe<string>;
}) {
  const colClass = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns];
  return (
    <dl className={cn('grid gap-x-8 gap-y-4', colClass, className)}>
      {items.map((it, i) => (
        <div key={it.key ?? i} className="min-w-0">
          <dt className="text-xs font-medium text-ink-4">{it.label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{it.value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------- Feedback */

export function Skeleton({ className }: { className?: Maybe<string> }) {
  return <div className={cn('rounded-md bg-mist/70 animate-pulse', className)} aria-hidden />;
}

export function EmptyBlock({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: Maybe<string>;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon && (
        <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-bone text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
          {icon}
        </span>
      )}
      <h3 className="font-sans text-base font-semibold tracking-normal text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-4 text-pretty">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Callout({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Maybe<'info' | 'success' | 'warning' | 'danger'>;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: Maybe<string>;
}) {
  const cfg = {
    info: { cls: 'bg-copper/[0.07] shadow-[inset_0_0_0_1px_rgba(184,122,78,0.22)]', icon: <AlertCircleIcon size={16} className="text-copper" /> },
    success: { cls: 'bg-mint/[0.07] shadow-[inset_0_0_0_1px_rgba(61,139,110,0.22)]', icon: <CheckCircleIcon size={16} className="text-mint" /> },
    warning: { cls: 'bg-amber/[0.08] shadow-[inset_0_0_0_1px_rgba(196,132,58,0.25)]', icon: <AlertCircleIcon size={16} className="text-amber" /> },
    danger: { cls: 'bg-rose/[0.07] shadow-[inset_0_0_0_1px_rgba(196,90,74,0.25)]', icon: <AlertCircleIcon size={16} className="text-rose" /> },
  }[tone];
  return (
    <div className={cn('flex items-start gap-3 rounded-xl p-4 text-ink', cfg.cls, className)} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="mt-0.5 shrink-0">{cfg.icon}</span>
      <div className="min-w-0 flex-1 text-sm">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn('text-ink-3', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Inline "View all" style link for card headers. */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-copper transition-colors hover:text-ink">
      {children}
      <ArrowRightIcon size={12} />
    </Link>
  );
}
