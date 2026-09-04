import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, Input } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';

interface Offer { offer: { id: string; priceCents: number; minOrderQty: number; leadTimeDays: number; availabilityStatus: string }; supplier: { id: string; name: string } }

export function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [qty, setQty] = useState<{ [k: string]: number }>({});
  const [err, setErr] = useState('');
  const { data } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<{ product: { id: string; name: string; unit: string }; offers: Array<{ rank: number; offer: Offer['offer']; supplier: Offer['supplier'] }>; priceStats: { count: number; min: number; max: number } }>(`/search/products/${id}/offers`),
  });

  async function add(businessId: string, offerId: string, q: number) {
    setErr('');
    try {
      await api.post('/cart/items', { businessId, supplierProductId: offerId, quantity: q });
      navigate('/cart');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed');
    }
  }

  if (!data) return <p className="text-muted">Loading…</p>;
  const businessId = user?.memberships[0]?.businessId;

  return (
    <div>
      <Link to="/search" className="text-sm text-muted">← Back</Link>
      <h1 className="text-2xl font-bold mt-2">{data.product.name}</h1>
      <p className="text-muted mb-6">Unit: {data.product.unit}</p>
      <ErrorBanner message={err} />
      {!user && <p className="text-muted">Sign in to add to cart.</p>}
      {user && !businessId && (
        <Card className="mb-4">
          <p>No business yet. <Link to="/onboarding/business" className="text-brand-600">Set up your business</Link> to start ordering.</p>
        </Card>
      )}
      {data.offers.length === 0 ? (
        <p className="text-muted">No live offers.</p>
      ) : (
        <div className="space-y-2">
          {data.offers.map((row) => (
            <Card key={row.offer.id} className="flex items-center gap-4">
              <div className="text-2xl font-bold text-brand-600 w-12">#{row.rank}</div>
              <div className="flex-1">
                <div className="font-semibold">{row.supplier.name}</div>
                <div className="text-xs text-muted">MOQ {row.offer.minOrderQty} · lead {row.offer.leadTimeDays}d · {row.offer.availabilityStatus}</div>
              </div>
              <div className="text-lg font-bold w-32 text-right">{formatLKR(row.offer.priceCents)}</div>
              {businessId && (
                <div className="flex items-center gap-2">
                  <Input type="number" min={row.offer.minOrderQty} className="w-24" value={qty[row.offer.id] ?? row.offer.minOrderQty} onChange={(e) => setQty({ ...qty, [row.offer.id]: Number(e.target.value) })} />
                  <Button onClick={() => add(businessId, row.offer.id, qty[row.offer.id] ?? row.offer.minOrderQty)}>Add</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
