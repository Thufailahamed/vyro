import { useEffect, useId, useState } from 'react';
import { cn } from '@vyro/ui';
import { BellIcon } from '@/components/icons';
import { Button, Callout, controlClass } from '../ui';

const PRESETS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 1440, label: '1 day' },
  { minutes: 10080, label: '1 week' },
];

export function SilenceDialog({
  ruleName,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  ruleName: string;
  pending?: boolean | undefined;
  error?: string | null | undefined;
  onConfirm: (durationMinutes: number, reason: string) => void;
  onCancel: () => void;
}) {
  const [duration, setDuration] = useState(60);
  const [reason, setReason] = useState('');
  const titleId = useId();
  const reasonId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const until = new Date(Date.now() + duration * 60_000).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const ready = reason.trim().length > 0 && duration > 0 && duration <= 43200;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="vyro-floating w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-amber/[0.12] text-[#a86c28]">
            <BellIcon size={18} />
          </span>
          <h2 id={titleId} className="mt-4 font-sans text-lg font-semibold tracking-normal text-ink">
            Silence <span className="font-mono text-base">{ruleName}</span>
          </h2>
          <p className="mt-1 text-sm text-ink-3">The rule keeps evaluating, but no notifications are sent until the silence ends.</p>

          <fieldset className="mt-5">
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">Duration</legend>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.minutes}
                  type="button"
                  aria-pressed={duration === p.minutes}
                  onClick={() => setDuration(p.minutes)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    duration === p.minutes
                      ? 'bg-ink text-paper shadow-[0_4px_12px_-6px_rgba(12,14,11,0.6)]'
                      : 'bg-ink/[0.045] text-ink-3 hover:bg-ink/[0.08] hover:text-ink',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-4">
              Silenced until <span className="font-medium text-ink">{until}</span>
            </p>
          </fieldset>

          <label htmlFor={reasonId} className="mb-2 mt-5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">
            Reason
          </label>
          <textarea
            id={reasonId}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Planned D1 migration, tracking in INC-142"
            className={cn(controlClass, 'h-auto w-full resize-none py-2.5 leading-relaxed')}
            autoFocus
          />
          {error && (
            <Callout tone="danger" className="mt-4">
              {error}
            </Callout>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink/[0.07] bg-bone/50 px-6 py-3.5">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!ready || pending} onClick={() => onConfirm(duration, reason.trim())}>
            {pending ? 'Silencing…' : 'Silence rule'}
          </Button>
        </div>
      </div>
    </div>
  );
}
