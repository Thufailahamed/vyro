import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, ErrorBanner, Surface } from '@/components/ui';
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
    <Surface className="p-5 space-y-3">
      <div>
        <div className="vyro-kicker">Saved cards</div>
        <h3 className="font-display text-lg mt-1">Cards kept on file with payments.lk</h3>
      </div>
      <ErrorBanner message={err} />
      {isLoading ? (
        <p className="text-sm text-ink-4">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-ink-4">
          No saved cards. Tick "save card" at checkout to keep one for one-tap payments.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center justify-between border-b border-ink/5 pb-2">
              <span>
                {c.brand ?? 'Card'} ····{c.last4}{' '}
                <span className="text-[11px] text-ink-4">
                  exp {c.expiryMonth}/{c.expiryYear}
                </span>
              </span>
              <Button size="sm" variant="secondary" loading={forget.isPending} onClick={() => forget.mutate(c.id)}>
                Forget
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
