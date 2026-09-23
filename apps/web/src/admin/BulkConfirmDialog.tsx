import { useId, useState } from 'react';
import { cn } from '@vyro/ui';
import { Button } from '@/components/ui';
import { controlClass } from './ui';

export function BulkConfirmDialog({
  open,
  count,
  action,
  requireReason = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  action: string;
  requireReason?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const titleId = useId();
  const reasonId = useId();
  if (!open) return null;
  const ready = !requireReason || reason.trim().length > 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="vyro-floating w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 id={titleId} className="font-sans text-lg font-semibold tracking-normal text-ink">
          {action} {count} item{count === 1 ? '' : 's'}?
        </h3>
        <p className="mt-1.5 text-sm text-ink-3">
          This applies to all {count} selected item{count === 1 ? '' : 's'}.
        </p>
        {requireReason ? (
          <div className="mt-5">
            <label htmlFor={reasonId} className="mb-1.5 block text-xs font-medium text-ink-3">
              Reason
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              rows={3}
              className={cn(controlClass, 'h-auto w-full resize-y py-2')}
            />
          </div>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!ready}
            onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
          >
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}
