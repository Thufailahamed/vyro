import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@vyro/ui';
import { CheckCircleIcon, ArrowRightIcon } from '@/components/icons';
import { AlertCircleIcon } from './icons';

type Outcome = 'refund_business' | 'release_supplier';

export function DisputeResolutionPanel({
  poId,
  onResolved,
}: {
  poId: string;
  onResolved?: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  const mut = useMutation({
    mutationFn: (outcome: Outcome) =>
      api.post<{ ok: true; status: string }>(`/admin/disputes/${poId}/resolve`, {
        outcome,
        note: note || undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Dispute resolved → Order ${data.status}`);
      void qc.invalidateQueries({ queryKey: ['admin-disputed'] });
      void qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      setOpen(false);
      setNote('');
      onResolved?.();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Arbitration action failed'),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-ink text-paper hover:bg-charcoal transition-colors shadow-sm"
      >
        <span>Arbitrate</span>
        <ArrowRightIcon size={12} className="text-volt" />
      </button>
    );
  }

  return (
    <div className="p-4 bg-paper border border-ink/20 shadow-md text-left space-y-3 min-w-[280px] max-w-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">
          Arbitration Decision
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-mono text-ink-4 hover:text-ink"
        >
          Cancel
        </button>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Reason for arbitration ruling (audit log notice)..."
        className="w-full h-16 border border-ink/20 bg-bone/30 p-2 text-xs font-mono text-ink placeholder:text-ink-4 focus:outline-none focus:border-ink"
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={mut.isPending}
          onClick={() => mut.mutate('refund_business')}
          className="flex-1 inline-flex items-center justify-center gap-1 h-8 px-2.5 text-[11px] font-mono font-bold uppercase tracking-wider bg-rose text-paper hover:bg-rose-deep disabled:opacity-50 transition-colors"
        >
          <AlertCircleIcon size={12} />
          <span>Refund Buyer</span>
        </button>
        <button
          type="button"
          disabled={mut.isPending}
          onClick={() => mut.mutate('release_supplier')}
          className="flex-1 inline-flex items-center justify-center gap-1 h-8 px-2.5 text-[11px] font-mono font-bold uppercase tracking-wider bg-ink text-volt hover:bg-charcoal disabled:opacity-50 transition-colors"
        >
          <CheckCircleIcon size={12} />
          <span>Release Payout</span>
        </button>
      </div>
    </div>
  );
}
