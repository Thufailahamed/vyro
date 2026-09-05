import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Label, PageHeader, Textarea } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ArrowLeftIcon } from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { formatLKR } from '@/lib/format';

interface CartItem {
  id: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
  product: { name: string };
  supplier: { name: string };
}

export function CheckoutPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const cart = useQuery({
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
    const map = new Map<string, { items: CartItem[]; subtotalCents: number }>();
    for (const it of cart.data?.items ?? []) {
      const entry = map.get(it.supplier.name) ?? { items: [], subtotalCents: 0 };
      entry.items.push(it);
      entry.subtotalCents += it.lineTotalCents;
      map.set(it.supplier.name, entry);
    }
    return Array.from(map.entries());
  }, [cart.data?.items]);

  if (!businessId) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">No business profile found</h2>
        <Link to="/onboarding/business" className="mt-4 inline-block">
          <Button>Set up business</Button>
        </Link>
      </div>
    );
  }

  if (cart.isLoading) return <div className="h-48 bg-mist animate-pulse" />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await api.post<{ poIds: string[]; count: number }>('/purchase-orders/checkout', {
        businessId,
        notes,
      });
      if (res.poIds && res.poIds.length > 0) {
        navigate(`/orders/${res.poIds[0]}`);
      } else {
        navigate('/orders');
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to place purchase orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const subtotalCents = cart.data?.subtotalCents ?? 0;
  const supplierCount = cart.data?.supplierCount ?? 0;
  const lineCount = cart.data?.items?.length ?? 0;
  const empty = !cart.data?.items?.length;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="max-w-xl">
        <FlowLine
          nodes={[
            { label: 'Cart', state: 'done' },
            { label: 'Checkout', state: 'active' },
            { label: 'Purchase orders', state: 'idle' },
          ]}
        />
      </div>
      <PageHeader
        kicker="Checkout"
        title="Issue purchase orders."
        sub="One PO per supplier. Acceptance logged on the order journey."
        actions={
          <Link to="/cart" className="text-xs text-ink-4 inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeftIcon size={14} /> Cart
          </Link>
        }
      />
      <ErrorBanner message={err} />

      {empty ? (
        <Surface className="p-10 text-center text-ink-4">
          Your cart is empty. Add lines before checking out.
        </Surface>
      ) : (
        <>
          <Surface kind="elevated" className="p-6 space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-xl">Order summary</h2>
              <span className="text-xs text-ink-4">
                {supplierCount} supplier{supplierCount === 1 ? '' : 's'} · {lineCount} line{lineCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="divide-y divide-ink/10 border-y border-ink/10">
              {grouped.map(([supplier, entry]) => (
                <div key={supplier} className="py-3 flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{supplier}</div>
                    <div className="text-xs text-ink-4 truncate">
                      {entry.items.map((it) => `${it.product.name} × ${it.quantity}`).join(' · ')}
                    </div>
                  </div>
                  <span className="font-mono text-sm shrink-0">{formatLKR(entry.subtotalCents)}</span>
                </div>
              ))}
            </div>
            <div className="pt-3 flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Subtotal</span>
              <MetricNumber size="md">{formatLKR(subtotalCents)}</MetricNumber>
            </div>
          </Surface>

          <div className="grid lg:grid-cols-[1fr_300px] gap-8">
            <Surface className="p-6">
              <h2 className="font-display text-xl">Delivery notes</h2>
              <p className="mt-2 text-xs text-ink-4">Appended to every supplier PO issued from this cart.</p>
              <form id="checkout-form" onSubmit={submit} className="mt-5">
                <Label htmlFor="notes">Special instructions</Label>
                <Textarea
                  id="notes"
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Dock hours, contact on arrival, warehouse notes…"
                />
              </form>
            </Surface>
            <Surface kind="floating" className="p-6">
              <p className="text-sm text-ink-3 leading-relaxed">
                Each supplier receives an independent purchase order. Acceptance is logged on the order journey.
              </p>
              <Button type="submit" form="checkout-form" loading={loading} size="lg" className="w-full mt-6">
                Confirm & issue
              </Button>
            </Surface>
          </div>
        </>
      )}
    </div>
  );
}
