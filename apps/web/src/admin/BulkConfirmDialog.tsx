import { useState } from 'react';
import { Surface, Button } from '@/components/ui';

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
  if (!open) return null;
  const ready = !requireReason || reason.trim().length > 0;
  return (
    <div
      className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-paper border border-ink/15 rounded-lg w-full max-w-md p-4 space-y-3 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium">
          {action} {count} item{count === 1 ? '' : 's'}?
        </h3>
        {requireReason ? (
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Reason</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              rows={3}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            />
          </label>
        ) : null}
        <div className="flex gap-2 justify-end">
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
