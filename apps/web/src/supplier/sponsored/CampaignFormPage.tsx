import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCreateCampaign } from '../../hooks/useSponsored';
import { useSupplierId } from '../useSupplierId';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface ProductRow { id: string; name: string }

export function CampaignFormPage() {
  const { supplierId } = useSupplierId();
  const [params] = useSearchParams();
  const slotId = params.get('slotId') || '';
  const navigate = useNavigate();
  const [productId, setProductId] = React.useState('');
  const [startsAt, setStartsAt] = React.useState('');
  const [endsAt, setEndsAt] = React.useState('');
  const create = useCreateCampaign(supplierId);
  const products = useQuery({
    queryKey: ['supplierProducts', supplierId],
    queryFn: async () => {
      const qs = new URLSearchParams({ supplierId, status: 'published' });
      return api.get<ProductRow[]>(`/supplier/products?${qs.toString()}`);
    },
    enabled: !!supplierId,
  });
  return (
    <form
      className="space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            supplierId,
            slotId,
            productId,
            startsAt: Math.floor(new Date(startsAt).getTime() / 1000),
            endsAt: Math.floor(new Date(endsAt).getTime() / 1000),
          },
          { onSuccess: () => navigate('/supplier/sponsored/campaigns') },
        );
      }}
    >
      <h1 className="text-2xl font-semibold">New campaign</h1>
      <p className="text-sm text-gray-600">Slot: {slotId}</p>
      <label className="block">
        <span className="text-sm">Product</span>
        <select className="mt-1 block w-full rounded border p-2" value={productId} onChange={(e) => setProductId(e.target.value)} required>
          <option value="">Choose…</option>
          {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm">Starts at</span>
        <input type="datetime-local" className="mt-1 block rounded border p-2" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
      </label>
      <label className="block">
        <span className="text-sm">Ends at</span>
        <input type="datetime-local" className="mt-1 block rounded border p-2" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
      </label>
      {create.isError ? <p className="text-sm text-red-600">{(create.error as Error).message}</p> : null}
      <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={create.isPending}>
        Create campaign
      </button>
    </form>
  );
}