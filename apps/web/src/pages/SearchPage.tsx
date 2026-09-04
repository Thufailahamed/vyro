import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, Input } from '@/components/ui';
import { formatLKR } from '@/lib/format';

interface Hit {
  product: { id: string; name: string; unit: string; brand: string | null };
  bestOffer: { priceCents: number; supplier: { id: string; name: string } } | null;
  offerCount: number;
}

export function SearchPage() {
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<{ hits: Hit[] }>(`/search/products?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 1,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Search products</h1>
      <Input placeholder="e.g. rice, sugar, cement" value={q} onChange={(e) => setQ(e.target.value)} className="mb-6 max-w-xl" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.hits.map((h) => (
          <Card key={h.product.id}>
            <h3 className="font-semibold">
              <Link to={`/products/${h.product.id}`} className="hover:underline">{h.product.name}</Link>
            </h3>
            <p className="text-sm text-muted">{h.product.brand ? `${h.product.brand} · ` : ''}{h.product.unit}</p>
            {h.bestOffer ? (
              <div className="mt-3">
                <div className="text-sm text-muted">Best price</div>
                <div className="text-lg font-bold text-brand-700">{formatLKR(h.bestOffer.priceCents)}</div>
                <div className="text-xs text-muted">{h.bestOffer.supplier.name}</div>
                {h.offerCount > 1 && <div className="text-xs text-muted mt-1">+{h.offerCount - 1} more offers</div>}
              </div>
            ) : (
              <p className="text-sm text-muted mt-3">No live offers</p>
            )}
            <Link to={`/products/${h.product.id}`}>
              <Button className="mt-3 w-full">Compare</Button>
            </Link>
          </Card>
        ))}
      </div>
      {!data?.hits.length && q && <p className="text-muted">No results.</p>}
    </div>
  );
}
