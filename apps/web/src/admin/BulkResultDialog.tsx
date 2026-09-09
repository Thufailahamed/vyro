import { Surface, Button } from '@/components/ui';
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
  if (!open || !result) return null;
  const failedIds = result.failed.map((f) => f.id);
  return (
    <div
      className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-paper border border-ink/15 rounded-lg w-full max-w-md p-4 space-y-3 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium">Bulk action complete</h3>
        <p className="text-sm">
          <span className="text-mint font-mono">{result.succeeded.length}</span> succeeded ·{' '}
          <span className="text-rose font-mono">{result.failed.length}</span> failed ·{' '}
          <span className="text-ink-4 font-mono">{result.total}</span> total
        </p>
        {result.failed.length > 0 ? (
          <details className="text-xs">
            <summary className="cursor-pointer text-ink-3">Failures ({result.failed.length})</summary>
            <ul className="mt-2 space-y-1">
              {result.failed.map((f) => (
                <li key={f.id} className="flex gap-2 font-mono">
                  <span className="truncate flex-1">{f.id}</span>
                  <span className="text-rose">{f.code}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="flex gap-2 justify-end">
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
