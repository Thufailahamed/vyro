import { useState } from 'react';
import type { ComponentEnvelope } from '@vyro/ai';
import { formatLKR } from '@/lib/format';
import { ShoppingCartIcon, CheckCircleIcon, ArrowRightIcon } from '@/components/icons';

interface ConfirmationItem {
  product: string;
  supplier: string;
  quantity: number;
  unit: string;
  priceCents: number;
}

interface ConfirmationData {
  items: ConfirmationItem[];
  totalCents: number;
  estimatedDelivery: string;
  idempotencyKey: string;
  poRef?: string;
  confirmed?: boolean;
}

interface ConfirmationCardProps {
  card: ComponentEnvelope & { id: string; data: ConfirmationData };
}

export function ConfirmationPanel({ card }: ConfirmationCardProps) {
  const [state, setState] = useState<'preview' | 'submitting' | 'confirmed' | 'error'>(
    card.data.confirmed ? 'confirmed' : 'preview',
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setState('submitting');
    setError(null);
    try {
      const res = await fetch('/api/ai/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'idempotency-key': card.data.idempotencyKey },
        body: JSON.stringify({ items: card.data.items }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const result = (await res.json().catch(() => ({}))) as { poRef?: string };
      if (result.poRef) card.data.poRef = result.poRef;
      setState('confirmed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue purchase order');
      setState('error');
    }
  };

  return (
    <div className="bg-paper border border-ink/20 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-ink/10">
        <div className="flex items-center gap-2">
          <ShoppingCartIcon size={16} className="text-copper" />
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-copper">
            Draft Purchase Order Batch
          </div>
        </div>
        {state === 'confirmed' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-mint/15 text-mint border border-mint/30">
            <CheckCircleIcon size={11} />
            Issued · {card.data.poRef ?? 'Committed'}
          </span>
        )}
      </div>

      <div className="divide-y divide-ink/10">
        {card.data.items.map((item, i) => (
          <div key={i} className="py-2.5 flex items-baseline justify-between gap-3 text-sm">
            <div className="min-w-0">
              <div className="font-semibold text-ink text-xs sm:text-sm truncate">
                {item.product}
              </div>
              <div className="text-[11px] font-mono text-ink-4">
                Qty: {item.quantity} {item.unit} · Mill: {item.supplier}
              </div>
            </div>
            <div className="shrink-0 font-mono text-xs sm:text-sm font-semibold text-ink num-tabular">
              {formatLKR(item.priceCents * item.quantity)}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-ink/15 space-y-1.5 bg-bone/40 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-ink-3 font-semibold">
            Gross Estimated Total
          </span>
          <span className="font-mono text-lg font-bold text-ink num-tabular">
            {formatLKR(card.data.totalCents)}
          </span>
        </div>
        <div className="text-[11px] font-mono text-ink-4">
          Estimated dispatch delivery: <span className="text-ink font-medium">{card.data.estimatedDelivery}</span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose/10 border border-rose/30 text-rose text-xs font-mono">
          {error}
        </div>
      )}

      {state !== 'confirmed' && (
        <div className="pt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={state === 'submitting'}
            data-testid="confirm-button"
            className="inline-flex items-center gap-2 h-9 px-4 text-xs font-mono font-bold uppercase tracking-wider bg-ink text-paper hover:bg-charcoal disabled:opacity-50 transition-colors shadow-sm"
          >
            <span>{state === 'submitting' ? 'Transmitting PO…' : 'Issue Purchase Order'}</span>
            <ArrowRightIcon size={12} className="text-volt" />
          </button>
        </div>
      )}
    </div>
  );
}
