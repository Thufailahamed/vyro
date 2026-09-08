import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { SparklesIcon, XIcon } from '@/components/icons';
import { dismissKey, isDismissed } from './floatHelpers';

interface CartHint {
  kind: 'switch_save' | 'delivery' | 'budget';
  evidence: string;
  action: string;
  savingCents?: number;
  dismissKey: string;
}

/**
 * Slim dismissible banner above the supplier groups. Never blocks checkout.
 * Dismissed hints persist in localStorage so the buyer controls noise.
 */
export function CartHintsBanner({ businessId }: { businessId?: string }) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const { data } = useQuery({
    queryKey: ['ai-cart-hints', businessId],
    queryFn: () => api.get<{ hints: CartHint[] }>(`/api/ai/cart-hints?businessId=${businessId ?? ''}`),
    enabled: !!businessId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const allHints = data?.hints ?? [];
  const visible = allHints.filter((h) => !dismissed[h.dismissKey] && !isDismissed(h.dismissKey));

  if (!visible.length) return null;

  return (
    <Surface kind="flat" className="border border-line p-4 space-y-2 bg-paper">
      <div className="flex items-center gap-2">
        <SparklesIcon size={16} />
        <span className="vyro-kicker text-copper">VYRO · Cart hints</span>
      </div>
      <ul className="space-y-2">
        {visible.map((h) => (
          <li key={h.dismissKey} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-ink/80 leading-relaxed">{h.evidence}</span>
            <div className="flex items-center gap-2 shrink-0">
              {h.action && (
                <Link to={h.action} className="vyro-link text-xs">
                  View
                </Link>
              )}
              <button
                type="button"
                aria-label="Dismiss hint"
                onClick={() => {
                  localStorage.setItem(dismissKey(h.dismissKey), '1');
                  setDismissed((prev) => ({ ...prev, [h.dismissKey]: true }));
                }}
                className="text-ink/40 hover:text-ink/80"
              >
                <XIcon size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
