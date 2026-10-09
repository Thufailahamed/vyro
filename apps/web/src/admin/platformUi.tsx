/**
 * Presentational pieces for the Platform Configuration console: the dark
 * control-plane hero, modal shell, switch, rollout slider, copy button and the
 * floating unsaved-changes bar.
 */
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@vyro/ui';
import { CheckIcon, CopyIcon, XIcon } from '@/components/icons';
import { Button as BaseButton, type ButtonVariant } from './ui';

type Maybe<T> = T | undefined;

/* ---------------------------------------------------------------- Button */

/** Admin button with optional leading icon and loading spinner. */
export function Button({
  icon,
  loading,
  children,
  disabled,
  ...rest
}: Omit<ComponentProps<typeof BaseButton>, 'variant'> & {
  variant?: Maybe<ButtonVariant>;
  icon?: Maybe<ReactNode>;
  loading?: Maybe<boolean>;
}) {
  return (
    <BaseButton {...rest} disabled={Boolean(disabled || loading)}>
      {loading ? (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </BaseButton>
  );
}

/* ---------------------------------------------------------------- Hero */

export interface HeroMetric {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  icon: ReactNode;
  /** Small live-status dot colour. */
  status?: Maybe<'ok' | 'warn' | 'idle'>;
  loading?: Maybe<boolean>;
}

const DOT = { ok: 'bg-volt shadow-[0_0_10px_2px_rgba(198,220,74,0.55)]', warn: 'bg-amber shadow-[0_0_10px_2px_rgba(196,132,58,0.5)]', idle: 'bg-paper/30' } as const;

/** Dark control-plane band: four metrics separated by hairlines. */
export function ControlHero({ metrics }: { metrics: HeroMetric[] }) {
  return (
    <section className="relative overflow-hidden rounded-[18px] bg-charcoal text-paper shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_24px_48px_-24px_rgba(12,14,11,0.55)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(60% 120% at 0% 0%, rgba(198,220,74,0.16) 0%, transparent 55%), radial-gradient(50% 100% at 100% 100%, rgba(196,132,58,0.12) 0%, transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: 'linear-gradient(rgba(250,247,240,1) 1px, transparent 1px), linear-gradient(90deg, rgba(250,247,240,1) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
          maskImage: 'radial-gradient(70% 100% at 20% 0%, black, transparent)',
          WebkitMaskImage: 'radial-gradient(70% 100% at 20% 0%, black, transparent)',
        }}
      />
      <div className="relative grid grid-cols-1 divide-y divide-paper/[0.08] sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className={cn(
              'flex flex-col gap-4 p-5 sm:p-6',
              i % 2 === 1 && 'sm:border-l sm:border-paper/[0.08] lg:border-l-0',
              i >= 2 && 'sm:border-t sm:border-paper/[0.08] lg:border-t-0',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/50">{m.label}</span>
              <span className="flex size-8 items-center justify-center rounded-[9px] bg-paper/[0.06] text-paper/70 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.1)]">
                {m.icon}
              </span>
            </div>
            <div className="flex items-end gap-2.5">
              {m.loading ? (
                <span className="h-9 w-16 animate-pulse rounded-md bg-paper/10" />
              ) : (
                <span className="font-display text-[2.25rem] font-bold leading-none tracking-[-0.04em] num-tabular">{m.value}</span>
              )}
              {m.status ? <span className={cn('mb-2 size-2 rounded-full', DOT[m.status])} aria-hidden /> : null}
            </div>
            <p className="text-xs leading-snug text-paper/50">{m.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Modal */

export function Modal({
  title,
  sub,
  icon,
  onClose,
  children,
  footer,
  size = 'md',
  tone = 'default',
}: {
  title: string;
  sub?: Maybe<string>;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: Maybe<ReactNode>;
  size?: Maybe<'sm' | 'md' | 'lg'>;
  tone?: Maybe<'default' | 'danger'>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={cn(
          'vyro-surface flex max-h-[92vh] w-full flex-col overflow-hidden !rounded-b-none shadow-[0_32px_80px_-20px_rgba(12,14,11,0.5)] sm:!rounded-[16px]',
          { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-3xl' }[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-[11px] shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]',
                tone === 'danger' ? 'bg-rose/10 text-rose' : 'bg-gradient-to-br from-volt-soft to-volt/60 text-ink',
              )}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-[1.0625rem] font-bold tracking-[-0.02em] text-ink">{title}</h3>
              {sub ? <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{sub}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-ink/[0.07] bg-bone/50 px-5 py-3.5 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Switch */

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: Maybe<boolean>;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative h-[26px] w-[46px] shrink-0 rounded-full transition-all duration-300 ease-vyro focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-volt/40 disabled:cursor-not-allowed disabled:opacity-45',
        checked
          ? 'bg-ink shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)]'
          : 'bg-ink/[0.14] shadow-[inset_0_1px_3px_rgba(12,14,11,0.18)]',
      )}
    >
      <span
        className={cn(
          'absolute left-[3px] top-[3px] size-5 rounded-full shadow-[0_1px_3px_rgba(12,14,11,0.35)] transition-all duration-300 ease-vyro',
          checked ? 'translate-x-5 bg-volt' : 'translate-x-0 bg-paper',
        )}
      />
    </button>
  );
}

/* ---------------------------------------------------------------- Rollout slider */

const PRESETS = [0, 25, 50, 100] as const;

export function RolloutSlider({
  value,
  onChange,
  disabled,
  readOnly,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: Maybe<boolean>;
  readOnly?: Maybe<boolean>;
}) {
  const locked = Boolean(disabled || readOnly);
  return (
    <div className={cn('space-y-2.5', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-4">Rollout cohort</span>
        <span className="font-mono text-sm font-bold tabular-nums text-ink">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={locked}
        aria-label="Rollout percentage"
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(90deg, #0C0E0B ${value}%, rgba(12,14,11,0.1) ${value}%)`,
        }}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed',
          '[&::-webkit-slider-thumb]:size-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-volt [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(12,14,11,0.35)] [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110',
          '[&::-moz-range-thumb]:size-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-volt',
        )}
      />
      <div className="flex items-center gap-1">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={locked}
            onClick={() => onChange(p)}
            className={cn(
              'h-6 rounded-md px-2 font-mono text-[10px] font-semibold transition-colors disabled:cursor-not-allowed',
              value === p ? 'bg-ink text-paper' : 'bg-ink/[0.05] text-ink-4 hover:bg-ink/10 hover:text-ink',
            )}
          >
            {p}%
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Copy */

export function CopyButton({ text, label, className }: { text: string; label: string; className?: Maybe<string> }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      className={cn(
        'rounded-md p-1.5 transition-colors hover:bg-ink/5',
        copied ? 'text-mint' : 'text-ink-4 hover:text-ink',
        className,
      )}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
    </button>
  );
}

/* ---------------------------------------------------------------- Save bar */

/** Floating bar that appears while there are unsaved edits. */
export function SaveBar({
  visible,
  summary,
  onDiscard,
  onSave,
  saving,
}: {
  visible: boolean;
  summary: ReactNode;
  onDiscard: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl bg-charcoal py-2.5 pl-4 pr-2.5 text-paper shadow-[0_20px_50px_-12px_rgba(12,14,11,0.6),inset_0_0_0_1px_rgba(250,247,240,0.1)] animate-fade-in">
        <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
          <span className="size-2 shrink-0 animate-pulse-soft rounded-full bg-amber shadow-[0_0_10px_2px_rgba(196,132,58,0.5)]" aria-hidden />
          <span className="truncate font-medium">{summary}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onDiscard}
            className="h-9 rounded-lg px-3 text-[13px] font-medium text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper"
          >
            Discard
          </button>
          <Button size="sm" variant="volt" onClick={onSave} loading={saving}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Misc */

export function FieldLabel({ children, hint, htmlFor }: { children: ReactNode; hint?: Maybe<ReactNode>; htmlFor?: Maybe<string> }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        {children}
      </label>
      {hint ? <span className="text-[11px] text-ink-4">{hint}</span> : null}
    </div>
  );
}
