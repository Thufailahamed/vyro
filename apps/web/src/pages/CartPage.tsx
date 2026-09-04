import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';

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
  const businessId = user?.memberships[0]?.businessId;
  const { data, refetch } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ cart: { id: string }; items: CartItem[]; subtotalCents: number; supplierCount: number }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
  });

  if (!user || !businessId) return <p className="text-muted">Sign in and set up a business first.</p>;
  if (!data) return <p className="text-muted">Loading…</p>;

  async function remove(id: string) {
    await api.del(`/cart/items/${id}`);
    await refetch();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Cart</h1>
      {data.items.length === 0 ? (
        <Card><p>Cart empty. <Link to="/search" className="text-brand-600">Browse products</Link></p></Card>
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((it) => (
              <Card key={it.id} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="font-semibold">{it.product.name}</div>
                  <div className="text-xs text-muted">{it.supplier.name} · qty {it.quantity} · {formatLKR(it.priceCents)} ea</div>
                </div>
                <div className="font-bold w-32 text-right">{formatLKR(it.lineTotalCents)}</div>
                <Button className="bg-red-600 hover:bg-red-700" onClick={() => remove(it.id)}>Remove</Button>
              </Card>
            ))}
          </div>
          <div className="mt-4 p-4 bg-white border rounded flex items-center justify-between">
            <div>
              <div className="text-sm text-muted">{data.supplierCount} supplier{data.supplierCount === 1 ? '' : 's'} · Subtotal</div>
              <div className="text-2xl font-bold">{formatLKR(data.subtotalCents)}</div>
            </div>
            <Link to="/checkout"><Button>Checkout</Button></Link>
          </div>
        </>
      )}
    </div>
  );
}
