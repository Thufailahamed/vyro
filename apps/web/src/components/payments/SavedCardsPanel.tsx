import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { CreditCardIcon, Trash2Icon } from '@/components/icons';
import { useAuth } from '@/lib/auth';
import { cn } from '@vyro/ui';

interface SavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  createdAt: number;
}

function isExpired(c: SavedCard): boolean {
  if (!c.expiryMonth || !c.expiryYear) return false;
  const year = c.expiryYear < 100 ? 2000 + c.expiryYear : c.expiryYear;
  // Cards are valid through the last day of the expiry month.
  return new Date(year, c.expiryMonth, 1).getTime() <= Date.now();
}

export function SavedCardsPanel({ businessId: businessIdProp, className }: { businessId?: string; className?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const businessId = businessIdProp ?? user?.memberships?.[0]?.businessId ?? '';

  const { data, isLoading, isError, error } = useQuery({
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
    <Surface className={cn('p-0 overflow-hidden flex flex-col', className)}>
      <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-volt/15 text-volt-deep flex items-center justify-center">
            <CreditCardIcon size={15} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink-1 leading-tight">Saved cards</h3>
            <p className="text-[11px] text-ink-4 mt-0.5">Kept on file with payments.lk for one-tap checkout</p>
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4 font-bold">
          {cards.length} on file
        </span>
      </div>
      <div className="p-6 space-y-3 flex-1">
        <ErrorBanner message={err || (isError ? (error as Error).message : '')} />
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="h-[92px] rounded-xl bg-ink/[0.05]" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="flex items-center gap-4 rounded-xl border border-dashed border-ink/15 bg-ink/[0.02] px-5 py-4">
            <div
              aria-hidden
              className="relative h-12 w-[72px] shrink-0 rounded-lg bg-gradient-to-br from-ink/80 to-ink shadow-sm"
            >
              <span className="absolute left-2 top-2.5 h-2 w-3 rounded-sm bg-volt/70" />
              <span className="absolute left-2 bottom-2 font-mono text-[7px] tracking-widest text-paper/60">
                •••• ••••
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-display text-sm font-semibold text-ink">No saved cards yet</div>
              <p className="mt-0.5 text-xs text-ink-4 leading-relaxed">
                Tick “save card” at checkout to pay future POs in one tap.
              </p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {cards.map((c) => {
              const expired = isExpired(c);
              return (
                <li
                  key={c.id}
                  className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-ink/90 to-ink px-4 py-3.5 text-paper shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-volt">
                      {c.brand ?? 'Card'}
                    </span>
                    {expired ? (
                      <span className="rounded-full bg-rose/20 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-rose">
                        Expired
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold tracking-widest">•••• {c.last4 ?? '••••'}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-paper/50">
                        exp {c.expiryMonth ? String(c.expiryMonth).padStart(2, '0') : '--'}/{c.expiryYear ?? '--'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={forget.isPending && forget.variables === c.id}
                      onClick={() => forget.mutate(c.id)}
                      className="text-xs text-paper/60 hover:text-rose hover:bg-paper/10"
                    >
                      <Trash2Icon size={13} />
                      Forget
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Surface>
  );
}
