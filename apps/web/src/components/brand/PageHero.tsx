import type { ComponentType, ReactNode } from 'react';
import { Surface } from '@/components/brand/Surface';

export function PageHero({
  icon: Icon,
  kicker,
  title,
  description,
  status,
  actions,
  footer,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  kicker: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Surface kind="ink" className="grain rounded-xl shadow-soft-lg">
      <div className="pointer-events-none absolute -top-28 -right-20 size-80 rounded-full bg-volt/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-copper/25 blur-3xl" aria-hidden />

      <div className="relative p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-volt">
              <Icon size={13} />
              {kicker}
            </div>
            <h1 className="vyro-display mt-2 text-2xl sm:text-3xl font-bold text-paper">{title}</h1>
            {description ? (
              <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-paper/60">{description}</p>
            ) : null}
          </div>
          {status || actions ? (
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {status}
              {actions}
            </div>
          ) : null}
        </div>

        {footer ? (
          <div className="mt-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-dashed border-paper/15 pt-5 font-mono text-[11px] uppercase tracking-[0.12em] text-paper/50">
            {footer}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

export const heroActionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-paper/15 bg-paper/5 px-3 text-xs font-semibold text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper disabled:opacity-50 cursor-pointer';

export function HeroStatusPill({
  label,
  tone = 'mint',
}: {
  label: ReactNode;
  tone?: 'mint' | 'amber' | 'volt' | 'paper';
}) {
  const dot =
    tone === 'mint'
      ? 'bg-mint animate-pulse'
      : tone === 'amber'
        ? 'bg-amber'
        : tone === 'volt'
          ? 'bg-volt animate-pulse'
          : 'bg-paper/50';
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-3 py-1.5 font-mono text-xs">
      <span className={`size-2 rounded-full ${dot}`} />
      <span className="font-semibold text-paper">{label}</span>
    </span>
  );
}
