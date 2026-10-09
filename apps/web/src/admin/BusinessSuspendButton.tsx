import { useEffect, useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn, useToast } from '@vyro/ui';
import { api, ApiError } from '@/lib/api';
import { Button, controlClass } from './ui';
import { AlertTriangleIcon, ShieldCheckIcon, XCircleIcon } from '@/components/icons';

const REASONS = [
  { key: 'policy', label: 'Policy violation' },
  { key: 'payment_default', label: 'Payment default' },
  { key: 'kyc_review', label: 'KYC under review' },
  { key: 'fraud_investigation', label: 'Fraud investigation' },
  { key: 'owner_request', label: 'Requested by owner' },
] as const;

export function BusinessSuspendButton({
  businessId,
  businessName,
  status,
}: {
  businessId: string;
  businessName?: string | undefined;
  status: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const suspended = status === 'suspended';
  const [open, setOpen] = useState(false);

  const mut = useMutation({
    mutationFn: (reason?: string) =>
      suspended
        ? api.post(`/admin/businesses/${businessId}/unfreeze`)
        : api.post(`/admin/businesses/${businessId}/freeze`, { reason: reason ?? 'policy' }),
    onSuccess: () => {
      setOpen(false);
      toast.show(toast.success(suspended ? 'Business account restored' : 'Business account suspended'));
      void qc.invalidateQueries({ queryKey: ['admin-business', businessId] });
      void qc.invalidateQueries({ queryKey: ['admin-businesses'] });
    },
    onError: (e) => toast.show(toast.error(e instanceof ApiError ? e.message : 'Action failed')),
  });

  if (suspended) {
    return (
      <Button variant="volt" onClick={() => mut.mutate(undefined)} disabled={mut.isPending}>
        <ShieldCheckIcon size={14} />
        {mut.isPending ? 'Restoring…' : 'Restore access'}
      </Button>
    );
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <XCircleIcon size={14} />
        Suspend account
      </Button>
      {open && (
        <SuspendDialog
          name={businessName}
          pending={mut.isPending}
          onCancel={() => setOpen(false)}
          onConfirm={(reason) => mut.mutate(reason)}
        />
      )}
    </>
  );
}

function SuspendDialog({
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  name?: string | undefined;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string>(REASONS[0].key);
  const [note, setNote] = useState('');
  const titleId = useId();
  const noteId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const submit = () => {
    const label = REASONS.find((r) => r.key === reason)?.label ?? reason;
    onConfirm((note.trim() ? `${label}: ${note.trim()}` : label).slice(0, 500));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="vyro-floating w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-rose/[0.1] text-rose">
            <AlertTriangleIcon size={18} />
          </span>
          <h3 id={titleId} className="mt-4 font-sans text-lg font-semibold tracking-normal text-ink">
            Suspend {name ?? 'this business'}?
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
            The buyer can’t place purchase orders or receive invoices until access is restored. Open orders are not
            cancelled.
          </p>

          <fieldset className="mt-5">
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">Reason</legend>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={reason === r.key}
                  onClick={() => setReason(r.key)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                    reason === r.key
                      ? 'bg-ink text-paper shadow-[0_4px_12px_-6px_rgba(12,14,11,0.6)]'
                      : 'bg-ink/[0.045] text-ink-3 hover:bg-ink/[0.08] hover:text-ink',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor={noteId} className="mb-2 mt-5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">
            Note for the audit log <span className="font-normal normal-case tracking-normal text-ink-5">(optional)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            maxLength={400}
            onChange={(e) => setNote(e.currentTarget.value)}
            rows={3}
            placeholder="Ticket reference, context for other admins…"
            className={cn(controlClass, 'h-auto w-full resize-none py-2.5 leading-relaxed')}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-ink/[0.07] bg-bone/50 px-6 py-3.5">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={submit} disabled={pending}>
            {pending ? 'Suspending…' : 'Suspend account'}
          </Button>
        </div>
      </div>
    </div>
  );
}
