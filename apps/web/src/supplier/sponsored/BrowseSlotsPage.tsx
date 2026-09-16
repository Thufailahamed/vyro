import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSlots } from '../../hooks/useSponsored';
import { useSupplierId } from '../useSupplierId';

export function BrowseSlotsPage() {
  const { supplierId } = useSupplierId();
  const [params, setParams] = useSearchParams();
  const surface = params.get('surface') || 'search';
  const categoryId = params.get('categoryId') || null;
  const slots = useSlots(surface, categoryId, supplierId);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Available slots</h1>
      <div className="mt-4 flex gap-2 text-sm">
        {['search', 'category', 'homepage', 'storefront'].map((s) => (
          <button
            key={s}
            type="button"
            className={`rounded px-3 py-1 ${s === surface ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
            onClick={() => setParams({ surface: s })}
          >
            {s}
          </button>
        ))}
      </div>
      {slots.isLoading ? <div className="mt-4">Loading…</div> : null}
      <div className="mt-4 grid grid-cols-3 gap-4">
        {slots.data?.map((s) => (
          <div key={s.id} className="rounded border p-4">
            <h3 className="font-medium">{s.label}</h3>
            <p className="mt-1 text-sm text-gray-600">Position #{s.position}</p>
            <p className="mt-2 text-lg font-semibold">LKR {(s.dailyRateCents / 100).toLocaleString()}/day</p>
            <Link
              to={`/supplier/sponsored/campaigns/new?slotId=${s.id}`}
              className="mt-3 inline-block rounded bg-blue-600 px-3 py-1 text-white"
            >
              Create campaign
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}