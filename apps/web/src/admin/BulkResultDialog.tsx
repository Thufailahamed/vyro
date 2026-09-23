import { useId } from 'react';
import { Button } from '@/components/ui';
import { CheckCircleIcon, AlertCircleIcon } from '@/components/icons';
import type { BulkResult } from './useBulkAction';

export function BulkResultDialog({
  open,
  result,
  onClose,
  onRetryFailed,
}: {
  open: boolean;
  result: BulkResult | null;
  onClose: () => void;
  onRetryFailed?: (ids: string[]) => void;
}) {
  const titleId = useId();
  if (!open || !result) return null;
  const failedIds = result.failed.map((f) => f.id);
  const hasFailures = result.failed.length > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="vyro-floating w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span
            className={
              hasFailures
                ? 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber/15 text-amber'
                : 'flex size-9 shrink-0 items-center justify-center rounded-lg bg-mint/10 text-mint'
            }
            aria-hidden
          >
            {hasFailures ? <AlertCircleIcon size={18} /> : <CheckCircleIcon size={18} />}
          </span>
          <div className="min-w-0">
            <h3 id={titleId} className="font-sans text-lg font-semibold tracking-normal text-ink">
              Bulk action complete
            </h3>
            <p className="mt-0.5 text-sm text-ink-3">
              {hasFailures ? 'Some items could not be processed.' : 'All items were processed.'}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2">
          <ResultStat label="Succeeded" value={result.succeeded.length} tone="text-mint" />
          <ResultStat label="Failed" value={result.failed.length} tone={hasFailures ? 'text-rose' : 'text-ink'} />
          <ResultStat label="Total" value={result.total} tone="text-ink" />
        </dl>

        {hasFailures ? (
          <details className="mt-4 rounded-lg bg-bone/60 text-xs shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-ink-3 hover:text-ink">
              Failures ({result.failed.length})
            </summary>
            <ul className="max-h-48 divide-y divide-ink/[0.06] overflow-y-auto border-t border-ink/[0.07] scrollbar-thin">
              {result.failed.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 truncate font-mono text-ink-3">{f.id}</span>
                  <span className="shrink-0 font-mono font-semibold text-rose">{f.code}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          {onRetryFailed && failedIds.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onRetryFailed(failedIds)}>
              Retry failed
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-bone/60 px-3 py-2.5">
      <dt className="text-xs font-medium text-ink-4">{label}</dt>
      <dd className={`mt-1 vyro-metric text-2xl leading-none ${tone}`}>{value}</dd>
    </div>
  );
}
