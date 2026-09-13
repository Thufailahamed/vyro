import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { CreditCardIcon, CopyIcon, BanknoteIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { cn } from '@vyro/ui';

interface WireInstructions {
  poId: string;
  poNumber: string;
  paymentMethod: 'wire';
  totalLkrCents: number;
  equivalents: Array<{ currency: string; amountCents: number; rateScaled: string; fetchedAt: number }>;
  beneficiary: {
    name: string;
    address?: string;
    bankName: string;
    bankAddress?: string;
    accountNumber: string;
    swiftBic: string;
    iban?: string;
    intermediaryName?: string;
    intermediarySwift?: string;
    reference: string;
    memo: string;
  };
  initiatedAt: number;
}

function formatForeign(amountCents: number, currency: string): string {
  const major = (amountCents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${currency} ${major}`;
}

function formatRow(label: string, value: string | null | undefined, mono = false) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
        {label}
      </span>
      <span
        className={cn(
          'text-xs text-ink-1 text-right break-all max-w-[60%]',
          mono && 'font-mono',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function WireInstructionsPanel({ purchaseOrderId, poStatus }: { purchaseOrderId: string; poStatus: string }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const enabled = !!purchaseOrderId && poStatus !== 'cancelled' && poStatus !== 'rejected';

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['wire-instructions', purchaseOrderId],
    queryFn: () => api.post<WireInstructions>(`/purchase-orders/${purchaseOrderId}/wire-instructions`, {}),
    enabled: enabled && expanded,
    retry: false,
  });

  function copy(value: string, label: string) {
    navigator.clipboard
      ?.writeText(value)
      .then(() => toast.show(toast.success(`${label} copied`)))
      .catch(() => toast.show(toast.error('Copy failed')));
  }

  return (
    <Surface className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="size-8 rounded-lg bg-copper/15 text-copper-deep flex items-center justify-center">
          <BanknoteIcon size={16} />
        </div>
        <h3 className="font-display text-base font-semibold text-ink-1">Bank wire payment</h3>
      </div>
      <p className="text-xs text-ink-3 leading-relaxed">
        Cross-border orders settle via international bank wire. Initiate a transfer from your bank
        using the beneficiary details below, then mark the wire as initiated so the supplier and
        finance team can reconcile.
      </p>

      {!expanded && (
        <Button variant="primary" onClick={() => setExpanded(true)} className="w-full">
          <CreditCardIcon size={14} /> Initiate wire payment
        </Button>
      )}

      {expanded && (
        <div className="space-y-4 pt-1">
          {isLoading && (
            <div className="rounded-lg bg-bone/40 p-4 border border-ink/10 animate-pulse">
              <div className="h-3 w-32 bg-mist rounded mb-2" />
              <div className="h-3 w-48 bg-mist rounded" />
            </div>
          )}

          {isError && (
            <div className="rounded-lg bg-rose/10 border border-rose/30 p-3 flex items-start gap-2">
              <AlertCircleIcon size={14} className="text-rose mt-0.5 shrink-0" />
              <div className="text-xs text-rose">
                {error instanceof ApiError ? error.message : 'Wire instructions unavailable'}
                <button
                  onClick={() => refetch()}
                  className="ml-2 underline font-semibold"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {data && (
            <>
              <div className="rounded-xl bg-ink text-paper p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                      Amount due (LKR)
                    </div>
                    <div className="font-mono text-2xl mt-1 text-volt">
                      {formatLKR(data.totalLkrCents)}
                    </div>
                  </div>
                  <button
                    onClick={() => copy(String(data.totalLkrCents / 100), 'Amount')}
                    className="text-volt hover:text-paper"
                    title="Copy amount"
                  >
                    <CopyIcon size={14} />
                  </button>
                </div>
                {data.equivalents.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-paper/15 grid grid-cols-3 gap-2 text-[11px]">
                    {data.equivalents.map((eq) => (
                      <div key={eq.currency} className="text-paper">
                        <div className="font-mono font-bold">{formatForeign(eq.amountCents, eq.currency)}</div>
                        <div className="font-mono text-paper/60 text-[10px]">≈ rate {Number(eq.rateScaled) / 1e8}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-ink/10 bg-bone/30 p-4 space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-copper font-bold mb-2">
                  Beneficiary details
                </div>
                {formatRow('Beneficiary', data.beneficiary.name)}
                {formatRow('Address', data.beneficiary.address)}
                {formatRow('Bank', data.beneficiary.bankName)}
                {formatRow('Bank address', data.beneficiary.bankAddress)}
                <Row label="Account #" value={data.beneficiary.accountNumber} mono onCopy={copy} />
                <Row label="SWIFT / BIC" value={data.beneficiary.swiftBic} mono onCopy={copy} />
                {data.beneficiary.iban && <Row label="IBAN" value={data.beneficiary.iban} mono onCopy={copy} />}
                {data.beneficiary.intermediaryName && (
                  formatRow('Intermediary', data.beneficiary.intermediaryName)
                )}
                {data.beneficiary.intermediarySwift && (
                  <Row label="Intermediary SWIFT" value={data.beneficiary.intermediarySwift} mono onCopy={copy} />
                )}
                <Row label="Reference" value={data.beneficiary.reference} mono onCopy={copy} />
                {formatRow('Memo', data.beneficiary.memo)}
              </div>

              <div className="rounded-lg bg-mint/10 border border-mint/30 p-3 flex items-start gap-2">
                <CheckCircleIcon size={14} className="text-mint mt-0.5 shrink-0" />
                <div className="text-xs text-ink-2 leading-relaxed">
                  Wire initiated at {new Date(data.initiatedAt).toLocaleString('en-GB')}. Supplier
                  will be notified. Reconciliation completes within 1–2 business days.
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Surface>
  );
}

function Row({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy: (v: string, label: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'text-xs text-ink-1 text-right break-all max-w-[60%]',
            mono && 'font-mono',
          )}
        >
          {value}
        </span>
        <button
          onClick={() => onCopy(value, label)}
          className="text-copper hover:text-ink shrink-0"
          title={`Copy ${label}`}
        >
          <CopyIcon size={12} />
        </button>
      </span>
    </div>
  );
}
