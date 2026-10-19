import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FlowCanvas } from '@/components/brand/FlowLine';
import { BrandMark } from '@/components/brand/BrandMark';
import { ArrowRightIcon } from '@/components/icons';
import { cn } from '@vyro/ui';

/** Shared building blocks for the dark, premium marketing pages (About, How it works). */

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Dark device frame with window chrome, used around illustrative product UI. */
export function Console({
  route,
  children,
  header,
  footer,
  className,
}: {
  route: string;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[28px] border border-paper/10 bg-gradient-to-b from-ink-2 to-void text-paper',
        'shadow-[0_50px_120px_-40px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(250,247,240,0.06)]',
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-paper/[0.07] px-5 py-3.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-paper/15" />
          <span className="size-2.5 rounded-full bg-paper/15" />
          <span className="size-2.5 rounded-full bg-paper/15" />
        </span>
        <span className="mx-auto truncate rounded-full bg-paper/[0.05] px-3 py-1 font-mono text-[10px] text-paper/50 ring-1 ring-inset ring-paper/[0.07]">
          vyro / <span className="text-paper/80">{route}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-volt">
          <span className="size-1.5 rounded-full bg-volt animate-pulse-soft" />
          Live
        </span>
      </div>
      {header}
      {children}
      {footer}
    </div>
  );
}

/** Dark hero/CTA backdrop: flow lines, volt and copper glows, grain. */
export function DarkBackdrop({ intensity = 'hero' }: { intensity?: 'hero' | 'soft' }) {
  return (
    <>
      <div
        className={cn(
          'absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]',
          intensity === 'hero' ? 'opacity-25' : 'opacity-20',
        )}
      >
        <FlowCanvas tone="paper" density="hero" />
      </div>
      {intensity === 'hero' && (
        <>
          <div className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full bg-volt/[0.09] blur-[140px]" />
          <div className="pointer-events-none absolute -right-32 bottom-[-12rem] size-[32rem] rounded-full bg-copper/[0.12] blur-[140px]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-paper/15 to-transparent" />
        </>
      )}
    </>
  );
}

export function PrimaryCta({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-volt px-6 text-sm font-semibold text-ink shadow-[0_10px_40px_-10px_rgba(198,220,74,0.6)] transition hover:bg-volt-glow"
    >
      {children}
      <ArrowRightIcon size={16} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function GhostCta({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex h-12 items-center justify-center rounded-full border border-paper/15 px-6 text-sm font-semibold text-paper transition hover:border-paper/40 hover:bg-paper/[0.05]"
    >
      {children}
    </Link>
  );
}

type CtaCopy = { title: string; body: string };

/** Closing buyer / supplier conversion pair. */
export function MarketingCta({ buyer, supplier }: { buyer: CtaCopy; supplier: CtaCopy }) {
  return (
    <section className="relative overflow-hidden bg-void text-paper grain">
      <DarkBackdrop intensity="soft" />
      <div className="relative mx-auto grid max-w-stage gap-4 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
        <div className="flex flex-col justify-between rounded-[28px] bg-volt p-8 text-ink sm:p-10">
          <div>
            <div className="flex items-center gap-2">
              <BrandMark size={22} tone="ink" />
              <span className="vyro-kicker text-ink/70">For buyers</span>
            </div>
            <h2 className="vyro-display mt-6 text-3xl sm:text-[2.75rem] text-balance">{buyer.title}</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/75 sm:text-base">{buyer.body}</p>
          </div>
          <Link
            to="/onboarding/business"
            className="group mt-10 inline-flex h-12 items-center gap-2 self-start rounded-full bg-ink px-6 text-sm font-semibold text-paper transition hover:bg-ink-2"
          >
            Register your business
            <ArrowRightIcon size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="flex flex-col justify-between rounded-[28px] border border-paper/10 bg-paper/[0.03] p-8 backdrop-blur sm:p-10">
          <div>
            <div className="flex items-center gap-2">
              <BrandMark size={22} tone="paper" />
              <span className="vyro-kicker text-copper">For suppliers</span>
            </div>
            <h2 className="vyro-display mt-6 text-3xl sm:text-[2.75rem] text-balance">{supplier.title}</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-paper/65 sm:text-base">{supplier.body}</p>
          </div>
          <Link
            to="/onboarding/supplier"
            className="group mt-10 inline-flex h-12 items-center gap-2 self-start rounded-full border border-paper/20 px-6 text-sm font-semibold text-paper transition hover:border-paper/50 hover:bg-paper/[0.05]"
          >
            List as a supplier
            <ArrowRightIcon size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
