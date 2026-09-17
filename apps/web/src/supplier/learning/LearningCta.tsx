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

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3.5 shadow-soft-sm"
      role="status"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber/15 text-amber">
        <GraduationCapIcon size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">
          Complete training to publish ({data.missing.length} pending)
        </div>
        <ul className="mt-1.5 space-y-1 text-xs text-ink-3">
          {data.missing.slice(0, 3).map((m) => (
            <li key={m.slug} className="flex items-center gap-1.5">
              <span className="size-1 shrink-0 rounded-full bg-amber" aria-hidden />
              <Link to={`/supplier/learning/${m.slug}`} className="font-medium text-copper-deep hover:underline">
                {m.title}
              </Link>
            </li>
          ))}
          {data.missing.length > 3 && <li className="pl-2.5 text-ink-4">+ {data.missing.length - 3} more</li>}
        </ul>
      </div>
      <Link
        to="/supplier/learning"
        className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-charcoal"
      >
        Open training <ArrowRightIcon size={12} />
      </Link>
    </div>
  );
}
