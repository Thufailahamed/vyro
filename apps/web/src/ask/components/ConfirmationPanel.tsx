import { useState } from 'react';
import type { ComponentEnvelope } from '@vyro/ai';
import { formatLKR } from '@/lib/format';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { CheckCircleIcon } from '@/components/icons';

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
      const res = await fetch((import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '') + '/api/ai/confirm', {
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
    <Surface kind="flat" className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-copper">Draft order</div>
          <p className="mt-0.5 text-sm text-ink-3">Nothing is placed until you confirm.</p>
        </div>
        {state === 'confirmed' ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-mint/15 px-2 py-1 text-[11px] font-medium text-mint">
            <CheckCircleIcon size={11} />
            {card.data.poRef ?? 'Placed'}
          </span>
        ) : null}
      </div>

      <div className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
        {card.data.items.map((item, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{item.product}</div>
              <div className="text-[11px] text-ink-4">
                {item.quantity} {item.unit} · {item.supplier}
              </div>
            </div>
            <div className="shrink-0 font-mono text-sm font-semibold text-ink num-tabular">
              {formatLKR(item.priceCents * item.quantity)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-lg bg-bone/60 px-3 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-ink-3">Estimated total</span>
          <span className="font-mono text-lg font-bold text-ink num-tabular">{formatLKR(card.data.totalCents)}</span>
        </div>
        <p className="mt-1 text-[11px] text-ink-4">
          Dispatch {card.data.estimatedDelivery}
        </p>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-xs text-rose">{error}</div>
      ) : null}

      {state !== 'confirmed' ? (
        <div className="mt-4">
          <Button type="button" onClick={submit} disabled={state === 'submitting'} data-testid="confirm-button">
            {state === 'submitting' ? 'Placing…' : 'Place order'}
          </Button>
        </div>
      ) : null}
    </Surface>
  );
}
