import { Link } from 'react-router-dom';
import { ArrowRightIcon, GraduationCapIcon } from '@/components/icons';
import { useOnboardingGate } from './hooks/useLearning';
import { useSupplierId } from '../useSupplierId';

interface Props {
  variant?: 'banner' | 'inline';
}

/**
 * Surfaces missing onboarding lessons when the supplier hasn't cleared the publish gate.
 * MVP floor: drop-in banner for any supplier surface that benefits from training nudge.
 */
export function LearningCta({ variant = 'banner' }: Props) {
  const { supplierId } = useSupplierId();
  const { data } = useOnboardingGate(supplierId);
  if (!data?.required) return null;

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2 text-xs text-amber" role="status">
        <GraduationCapIcon size={14} />
        <div className="flex-1 font-medium">Complete training to publish ({data.missing.length} pending)</div>
        <Link to="/supplier/learning" className="inline-flex items-center gap-1 font-semibold text-ink hover:text-copper">
          Open training <ArrowRightIcon size={12} />
        </Link>
      </div>
    );
  }

  const shown = data.missing.slice(0, 3);
  const extra = data.missing.length - shown.length;

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-2xl border border-amber/25 bg-gradient-to-r from-amber/[0.12] via-amber/[0.06] to-paper p-4 sm:p-5"
      role="status"
    >
      <div className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full bg-amber/10 blur-2xl" aria-hidden />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-paper text-amber shadow-sm ring-1 ring-amber/20">
            <GraduationCapIcon size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">Finish training to publish</span>
              <span className="rounded-full bg-amber/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-amber">
                {data.missing.length} pending
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-3">
              Complete these short lessons to publish listings to buyers.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {shown.map((m) => (
                <Link
                  key={m.slug}
                  to={`/supplier/learning/${m.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-paper/80 px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors hover:border-ink/30 hover:text-ink"
                >
                  <span className="size-1.5 rounded-full border border-amber" aria-hidden />
                  {m.title}
                </Link>
              ))}
              {extra > 0 && (
                <span className="inline-flex items-center rounded-full px-2 py-1 text-[11px] text-ink-4">+{extra} more</span>
              )}
            </div>
          </div>
        </div>
        <Link
          to="/supplier/learning"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-xl bg-ink px-4 text-[13px] font-semibold text-paper transition-colors hover:bg-charcoal md:self-center"
        >
          Open training <ArrowRightIcon size={13} />
        </Link>
      </div>
    </div>
  );
}
