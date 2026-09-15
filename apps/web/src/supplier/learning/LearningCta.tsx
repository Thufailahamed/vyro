import { Link } from 'react-router-dom';
import { GraduationCapIcon } from '@/components/icons';
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

  const wrap =
    variant === 'banner'
      ? 'mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
      : 'flex items-center gap-2 text-xs text-amber-800';

  return (
    <div className={wrap} role="status">
      <GraduationCapIcon size={variant === 'banner' ? 18 : 14} />
      <div className="flex-1">
        <div className="font-medium">
          Complete training to publish ({data.missing.length} pending)
        </div>
        {variant === 'banner' && (
          <ul className="mt-1 list-inside list-disc text-xs">
            {data.missing.slice(0, 3).map((m) => (
              <li key={m.slug}>
                <Link to={`/supplier/learning/${m.slug}`} className="underline">
                  {m.title}
                </Link>
              </li>
            ))}
            {data.missing.length > 3 && <li>+ {data.missing.length - 3} more</li>}
          </ul>
        )}
      </div>
      <Link to="/supplier/learning" className="ml-auto text-xs font-semibold underline">
        Open training →
      </Link>
    </div>
  );
}
