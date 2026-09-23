import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@vyro/ui';
import { CheckCircleIcon, ArrowRightIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { AlertCircleIcon } from './icons';

type Outcome = 'refund_business' | 'release_supplier' | 'partial';

/** Parse an LKR amount typed by an admin ("1,250.50") into integer cents. */
function lkrToCents(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole = '0', frac = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function DisputeResolutionPanel({
  poId,
  totalCents,
  defaultOpen = false,
  onResolved,
}: {
  poId: string;
  /** Order total; a partial refund must be below it. */
  totalCents?: number;
  defaultOpen?: boolean;
  onResolved?: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(defaultOpen);
  const [partialOpen, setPartialOpen] = useState(false);
  const [amount, setAmount] = useState('');

  const amountCents = lkrToCents(amount);
  const amountError =
    amount && amountCents === null
      ? 'Enter an amount in LKR, e.g. 12500.00'
      : amountCents !== null && amountCents <= 0
        ? 'Amount must be greater than zero'
        : amountCents !== null && totalCents !== undefined && amountCents >= totalCents
          ? `Must be less than the order total (${formatLKR(totalCents)}) — use Refund Buyer for a full refund`
          : '';

  const mut = useMutation({
    mutationFn: (outcome: Outcome) =>
      api.post<{ ok: true; status: string }>(`/admin/disputes/${poId}/resolve`, {
        outcome,
        ...(outcome === 'partial' && amountCents !== null ? { amountCents } : {}),
        note: note || undefined,
      }),
    onSuccess: (data) => {
      toast.show(toast.success(`Dispute resolved → Order ${data.status}`));
      void qc.invalidateQueries({ queryKey: ['admin-disputed'] });
      void qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      setOpen(defaultOpen);
      setPartialOpen(false);
      setNote('');
      setAmount('');
      onResolved?.();
    },
    onError: (e) => toast.show(toast.error(e instanceof ApiError ? e.message : 'Arbitration action failed')),
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
        {!defaultOpen && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-mono text-ink-4 hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
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

      {!partialOpen ? (
        <button
          type="button"
          disabled={mut.isPending}
          onClick={() => setPartialOpen(true)}
          className="w-full h-8 px-2.5 text-[11px] font-mono font-bold uppercase tracking-wider border border-copper/40 text-copper-deep hover:bg-copper/10 disabled:opacity-50 transition-colors"
        >
          Partial Refund…
        </button>
      ) : (
        <div className="space-y-2 p-3 border border-copper/30 bg-copper/5">
          <label className="block text-[10px] font-mono uppercase text-ink-4">Refund to buyer (LKR)</label>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 12500.00"
            className="w-full h-8 px-2.5 text-xs font-mono border border-ink/20 bg-paper focus:outline-none focus:border-ink"
          />
          {amountError ? (
            <p className="text-[11px] text-rose">{amountError}</p>
          ) : amountCents !== null && totalCents !== undefined ? (
            <p className="text-[11px] text-ink-4">
              Buyer refunded {formatLKR(amountCents)} · supplier receives {formatLKR(totalCents - amountCents)}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPartialOpen(false);
                setAmount('');
              }}
              className="h-8 px-2.5 text-[11px] font-mono text-ink-4 hover:text-ink"
            >
              Back
            </button>
            <button
              type="button"
              disabled={mut.isPending || amountCents === null || !!amountError}
              onClick={() => mut.mutate('partial')}
              className="flex-1 h-8 px-2.5 text-[11px] font-mono font-bold uppercase tracking-wider bg-copper text-paper hover:bg-copper-deep disabled:opacity-50 transition-colors"
            >
              Apply Partial Refund
            </button>
          </div>
        </div>
      )}
      <p className="text-[10px] text-ink-4 leading-relaxed">
        Refund Buyer cancels the order. Release Payout and Partial Refund complete it.
      </p>
    </div>
  );
}
