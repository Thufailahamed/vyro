import { useState } from 'react';
import { Button, Input } from '@/components/ui';

export function SilenceDialog({
  ruleName,
  onConfirm,
  onCancel,
}: {
  ruleName: string;
  onConfirm: (durationMinutes: number, reason: string) => void;
  onCancel: () => void;
}) {
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="silence-dialog-title" className="vyro-floating w-full max-w-md p-6">
        <h2 id="silence-dialog-title" className="font-sans text-lg font-semibold tracking-normal text-ink">
          Silence <span className="font-mono text-base">{ruleName}</span>
        </h2>
        <p className="mt-1 text-sm text-ink-3">Notifications for this rule are paused until the silence expires.</p>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-ink-3">
            Duration (minutes)
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="mt-1.5 num-tabular"
            />
          </label>
          <label className="block text-sm font-medium text-ink-3">
            Reason
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1.5" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => onConfirm(duration, reason)}>
            Silence
          </Button>
        </div>
      </div>
    </div>
  );
}
