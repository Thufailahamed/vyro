import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, EmptyState } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { ShoppingCartIcon, Trash2Icon, PackageIcon } from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';

interface CartItem {
  id: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
  product: { name: string };
  supplier: { name: string };
  offer: { minOrderQty: number };
}

export function CartPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () =>
      api.get<{
        cart: { id: string };
        items: CartItem[];
        subtotalCents: number;
        supplierCount: number;
      }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    for (const it of data?.items ?? []) {
      const list = map.get(it.supplier.name) ?? [];
      list.push(it);
      map.set(it.supplier.name, list);
    }
    return map;
  }, [data?.items]);

  if (!user || !businessId) {
    return (
      <div className="max-w-lg py-12">
        <h2 className="vyro-display text-3xl">Business profile required</h2>
        <p className="mt-2 text-sm text-ink-4">Sign in and set up your business to use the cart.</p>
        <div className="mt-6 flex gap-3">
          <Link to="/onboarding/business">
            <Button>Set up business</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="h-64 bg-mist animate-pulse" />;

  async function remove(id: string) {
    setDeletingId(id);
    try {
      await api.del(`/cart/items/${id}`);
      await refetch();
    } finally {
      setDeletingId(null);
    }
  }

  const items = data?.items ?? [];
  const subtotal = data?.subtotalCents ?? 0;
  const supplierCount = data?.supplierCount ?? 0;

  return (
    <div className="space-y-8">
      <header>
        <div className="vyro-kicker">Cart</div>
        <h1 className="mt-2 vyro-display text-4xl">Review the flow.</h1>
        <div className="mt-6 max-w-xl">
          <FlowLine
            nodes={[
              { label: 'Cart', state: 'active' },
              { label: 'Checkout', state: 'idle' },
              { label: 'Purchase orders', state: 'idle' },
            ]}
          />
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCartIcon size={20} />}
          title="Your cart is waiting."
          description="Browse verified suppliers and add wholesale lines."
          action={
            <Link to="/search">
              <Button>Open catalog</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
          <div className="space-y-8">
            {Array.from(grouped.entries()).map(([supplier, lines]) => {
              const sub = lines.reduce((a, b) => a + b.lineTotalCents, 0);
              return (
                <Surface key={supplier} kind="flow" className="p-0">
                  <div className="px-5 py-4 border-b border-ink/10 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-copper">Supplier</div>
                      <h2 className="font-display text-xl">{supplier}</h2>
                    </div>
                    <span className="vyro-metric">{formatLKR(sub)}</span>
                  </div>
                  <ul>
                    {lines.map((it) => (
                      <li key={it.id} className="px-5 py-4 flex items-center gap-4 border-b border-ink/5 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{it.product.name}</div>
                          <div className="text-xs text-ink-4 mt-0.5">
                            {formatLKR(it.priceCents)} × {it.quantity}
                          </div>
                        </div>
                        <div className="vyro-metric text-sm">{formatLKR(it.lineTotalCents)}</div>
                        <Button variant="ghost" size="sm" onClick={() => remove(it.id)} loading={deletingId === it.id} aria-label="Remove">
                          <Trash2Icon size={16} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Surface>
              );
            })}
          </div>

          <Surface kind="floating" className="p-6 lg:sticky lg:top-8">
            <h2 className="font-display text-xl">Totals</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between text-ink-3">
                <dt>Suppliers</dt>
                <dd className="vyro-metric text-ink">{supplierCount}</dd>
              </div>
              <div className="flex justify-between text-ink-3">
                <dt>Purchase orders</dt>
                <dd className="vyro-metric text-ink">{supplierCount}</dd>
              </div>
              <div className="pt-4 border-t border-ink/10">
                <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Subtotal</dt>
                <MetricNumber size="md" className="mt-1">
                  {formatLKR(subtotal)}
                </MetricNumber>
              </div>
            </dl>
            <Link to="/checkout" className="block mt-6">
              <Button size="lg" className="w-full">
                Checkout
              </Button>
            </Link>
          </Surface>
        </div>
      )}
    </div>
  );
}

void PackageIcon;
