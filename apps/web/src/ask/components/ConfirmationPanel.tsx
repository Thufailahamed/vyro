import { useState } from 'react';
import type { ComponentEnvelope } from '@vyro/ai';

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
      setError(err instanceof Error ? err.message : 'Failed to confirm');
      setState('error');
    }
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-copper">Ready to order</div>
        {state === 'confirmed' && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
            Confirmed · {card.data.poRef ?? 'draft'}
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {card.data.items.map((item, i) => (
          <li key={i} className="flex items-baseline justify-between text-sm text-stone-700">
            <span>
              <span className="font-medium">{item.product}</span>{' '}
              <span className="text-stone-500">— {item.quantity}{item.unit} from {item.supplier}</span>
            </span>
            <span className="font-mono tabular-nums text-stone-700">
              Rs. {((item.priceCents * item.quantity) / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-stone-200 pt-2">
        <span className="text-xs uppercase tracking-wider text-stone-500">Estimated total</span>
        <span className="font-mono text-lg font-semibold tabular-nums text-stone-900">
          Rs. {(card.data.totalCents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="mt-1 text-xs text-stone-500">
        Estimated delivery: <span className="text-stone-700">{card.data.estimatedDelivery}</span>
      </div>
      {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
      {state !== 'confirmed' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={state === 'submitting'}
            data-testid="confirm-button"
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {state === 'submitting' ? 'Confirming…' : 'Confirm order'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:border-stone-900"
          >
            Edit
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-stone-500 hover:text-stone-900"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
