import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, ErrorBanner, Surface } from '@/components/ui';
import { CreditCardIcon, Trash2Icon } from '@/components/icons';
import { useAuth } from '@/lib/auth';

interface SavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  createdAt: number;
}

export function SavedCardsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const businessId = user?.memberships?.[0]?.businessId ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['saved-cards', businessId],
    queryFn: () => api.get<{ cards: SavedCard[] }>(`/payments/saved-cards?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const forget = useMutation({
    mutationFn: (id: string) => api.del(`/payments/saved-cards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-cards', businessId] }),
    onError: (e) => setErr(e instanceof Error ? e.message : 'Delete failed'),
  });

  const cards = data?.cards ?? [];

  return (
    <Surface className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-volt/15 text-volt-deep flex items-center justify-center">
            <CreditCardIcon size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink-1 leading-tight">Saved cards</h3>
            <p className="text-[11px] text-ink-4 mt-0.5">Cards kept on file with payments.lk</p>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4 font-bold">
          {cards.length} on file
        </span>
      </div>
      <div className="p-5 space-y-3">
        <ErrorBanner message={err} />
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 vyro-surface animate-pulse" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 bg-ink/[0.03] px-6 py-8 text-center">
            <div className="mx-auto size-11 rounded-xl bg-ink/[0.07] text-ink-3 flex items-center justify-center">
              <CreditCardIcon size={18} />
            </div>
            <div className="mt-3 font-display text-sm font-semibold text-ink">No saved cards</div>
            <p className="mt-1 text-xs text-ink-4 max-w-xs mx-auto leading-relaxed">
              Tick "save card" at checkout to keep one for one-tap payments.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {cards.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-ink/[0.03] px-4 py-3 hover:bg-ink/[0.05] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-ink text-paper font-mono text-[10px] font-bold uppercase tracking-wider shrink-0">
                    {c.brand ?? 'Card'}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold text-ink-1">····{c.last4}</div>
                    <div className="text-[10px] text-ink-4 font-mono mt-0.5">
                      exp {c.expiryMonth}/{c.expiryYear}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={forget.isPending}
                  onClick={() => forget.mutate(c.id)}
                  className="text-xs text-ink-3 hover:text-rose"
                >
                  <Trash2Icon size={13} />
                  Forget
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Surface>
  );
}
