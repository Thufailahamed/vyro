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
import type React from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { AlertCircleIcon, ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon } from '@/components/icons';

type Maybe<T> = T | undefined;

/* ---------------------------------------------------------------- Page layout */

export function AdminPage({ children, className }: { children: ReactNode; className?: Maybe<string> }) {
  return <div className={cn('mx-auto max-w-7xl space-y-7 pb-20 animate-fade-in', className)}>{children}</div>;
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
    <header
      className={cn(
        'flex flex-col gap-5 border-b border-ink/[0.07] pb-6 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {back && (
          <Link
            to={back.to}
            className="group mb-4 flex w-fit items-center gap-1.5 rounded-full bg-paper py-1 pl-2 pr-3 text-xs font-medium text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] transition-all hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]"
          >
            <ArrowLeftIcon size={13} className="transition-transform group-hover:-translate-x-0.5" />
            {back.label}
          </Link>
        )}
        {kicker && (
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-4">
            <span className="size-1.5 rotate-45 bg-volt-deep" aria-hidden />
            {kicker}
          </div>
        )}
        <h1 className="mt-2 font-display text-[1.75rem] font-bold leading-[1.08] tracking-[-0.035em] text-ink text-balance sm:text-[2.125rem]">
          {title}
        </h1>
        {description && <p className="mt-2.5 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-4 text-pretty">{description}</p>}
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
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-sans text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-ink-4 text-pretty">{description}</p>}
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
      {footer && <div className="border-t border-ink/[0.07] bg-bone/50 px-5 py-3 text-xs text-ink-4 sm:px-6">{footer}</div>}
    </section>
  );
}

/** Small uppercase label for grouping content inside a card or page. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: Maybe<string> }) {
  return (
    <div className={cn('flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-4', className)}>
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-ink/10 to-transparent" aria-hidden />
    </div>
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
        <span className="truncate text-[13px] font-medium text-ink-3">{label}</span>
        {icon && (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)] transition-all duration-240',
              to && 'group-hover:from-ink group-hover:to-charcoal group-hover:text-volt group-hover:shadow-[0_6px_16px_-6px_rgba(12,14,11,0.5)]',
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
            <span className={cn('vyro-metric text-[2rem] leading-none sm:text-[2.375rem]', valueTone)}>{value}</span>
            {status}
          </div>
        )}
        {sub && (
          <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-ink-4">
            <span className="truncate">{sub}</span>
            {to && (
              <ArrowRightIcon
                size={13}
                className="shrink-0 -translate-x-1 text-ink-4 opacity-0 transition-all duration-240 group-hover:translate-x-0 group-hover:opacity-100"
                aria-hidden
              />
            )}
          </div>
        )}
      </div>
    </>
  );

  const cls = cn('vyro-surface relative flex flex-col justify-between gap-6 overflow-hidden p-5', className);
  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          cls,
          'group transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12),0_18px_36px_-20px_rgba(12,14,11,0.35)]',
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/* ---------------------------------------------------------------- Pills & status */

export type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'dark';

const PILL_TONES: Record<PillTone, { cls: string; dot: string }> = {
  neutral: { cls: 'bg-ink/[0.045] text-ink-3 ring-ink/10', dot: 'bg-ink-4' },
  success: { cls: 'bg-mint/[0.08] text-mint ring-mint/25', dot: 'bg-mint' },
  warning: { cls: 'bg-amber/[0.1] text-[#a86c28] ring-amber/30', dot: 'bg-amber' },
  danger: { cls: 'bg-rose/[0.08] text-rose ring-rose/25', dot: 'bg-rose' },
  info: { cls: 'bg-copper/[0.08] text-copper-deep ring-copper/25', dot: 'bg-copper' },
  brand: { cls: 'bg-volt-soft text-ink ring-volt-deep/30', dot: 'bg-volt-deep' },
  dark: { cls: 'bg-ink text-paper ring-ink', dot: 'bg-volt' },
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
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5 ring-1 ring-inset',
        t.cls,
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.5)]', t.dot)} aria-hidden />}
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
      <div role="tablist" aria-label={ariaLabel} className="mx-1 inline-flex min-w-max gap-0.5 rounded-xl bg-ink/[0.045] p-1 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.05),inset_0_1px_2px_rgba(12,14,11,0.05)]">
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
                'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-all duration-200',
                active
                  ? 'bg-paper text-ink shadow-[0_0_0_1px_rgba(12,14,11,0.06),0_1px_2px_rgba(12,14,11,0.08),0_4px_10px_-4px_rgba(12,14,11,0.12)]'
                  : 'text-ink-4 hover:bg-paper/50 hover:text-ink',
              )}
            >
              {t.icon && <span className={active ? 'text-ink' : 'text-ink-4'}>{t.icon}</span>}
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] font-semibold leading-4 num-tabular',
                    active ? 'bg-volt text-ink' : 'bg-ink/[0.08] text-ink-3',
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
  'h-9 rounded-lg bg-paper px-3 text-[13px] text-ink placeholder:text-ink-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12),0_1px_2px_rgba(12,14,11,0.04)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.22),0_1px_2px_rgba(12,14,11,0.04)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)] disabled:cursor-not-allowed disabled:opacity-60';

/* ---------------------------------------------------------------- Buttons */

export type ButtonVariant = 'primary' | 'volt' | 'secondary' | 'ghost' | 'danger';

/** Class string for admin buttons; works on <button>, <a> and <Link>. */
// Literal class names so Tailwind keeps them (it can't see template-built names).
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'admin-btn-primary',
  volt: 'admin-btn-volt',
  secondary: 'admin-btn-secondary',
  ghost: 'admin-btn-ghost',
  danger: 'admin-btn-danger',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: 'md' | 'sm' = 'md', className?: Maybe<string>) {
  return cn('admin-btn', BUTTON_VARIANTS[variant], size === 'sm' && 'admin-btn-sm', className);
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Maybe<ButtonVariant>;
  size?: Maybe<'md' | 'sm'>;
}) {
  return <button type={type} {...rest} className={buttonClass(variant, size, className)} />;
}

/** Compact segmented control (e.g. date ranges). */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  dark,
  className,
}: {
  items: ReadonlyArray<{ key: K; label: ReactNode }>;
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  dark?: Maybe<boolean>;
  className?: Maybe<string>;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex rounded-[10px] p-[3px]',
        dark
          ? 'bg-paper/[0.05] shadow-[inset_0_0_0_1px_rgba(250,247,240,0.09)] backdrop-blur'
          : 'bg-ink/[0.045] shadow-[inset_0_0_0_1px_rgba(12,14,11,0.05)]',
        className,
      )}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.key)}
            className={cn(
              'h-7 rounded-[7px] px-3 text-[11px] font-semibold tracking-wide transition-all duration-200',
              active
                ? dark
                  ? 'bg-volt text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_12px_-4px_rgba(198,220,74,0.6)]'
                  : 'bg-paper text-ink shadow-[0_0_0_1px_rgba(12,14,11,0.06),0_1px_3px_rgba(12,14,11,0.1)]'
                : dark
                  ? 'text-paper/55 hover:text-paper'
                  : 'text-ink-4 hover:text-ink',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] bg-bone/40 px-5 py-3 text-xs text-ink-4 sm:px-6">
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
          <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-5">{it.label}</dt>
          <dd className="mt-1.5 break-words text-sm text-ink">{it.value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------- Feedback */

export function Skeleton({ className }: { className?: Maybe<string> }) {
  return (
    <div
      className={cn(
        'rounded-md bg-[linear-gradient(90deg,rgba(229,224,212,0.6)_0%,rgba(229,224,212,1)_50%,rgba(229,224,212,0.6)_100%)] bg-[length:200%_100%] animate-shimmer',
        className,
      )}
      aria-hidden
    />
  );
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
        <span className="relative mb-5 flex size-14 items-center justify-center">
          <span className="absolute inset-0 rotate-6 rounded-2xl bg-volt-soft/70" aria-hidden />
          <span className="relative flex size-14 items-center justify-center rounded-2xl bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_8px_20px_-10px_rgba(12,14,11,0.3)]">
            {icon}
          </span>
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
    <div className={cn('flex items-start gap-3 rounded-[14px] p-4 text-ink', cfg.cls, className)} role={tone === 'danger' ? 'alert' : undefined}>
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
    <Link
      to={to}
      className="group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink"
    >
      {children}
      <ArrowRightIcon size={12} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
