import React from 'react';
import { usePlans, useSubscribe } from '../../hooks/useSponsored';
import { useQueryClient } from '@tanstack/react-query';

export function PlansPage() {
  const plans = usePlans();
  const subscribe = useSubscribe();
  const qc = useQueryClient();
  if (plans.isLoading) return <div className="p-6">Loading…</div>;
  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      {plans.data?.map((p) => (
        <div key={p.id} className="rounded border p-4">
          <h2 className="text-xl font-semibold">{p.name}</h2>
          <p className="mt-1 text-sm text-gray-600">{p.includedSlotCredits} slot credits included</p>
          <p className="mt-2 text-2xl font-semibold">LKR {(p.monthlyRateCents / 100).toLocaleString()}/mo</p>
          <button
            type="button"
            className="mt-4 rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
            disabled={!p.active || subscribe.isPending}
            onClick={() =>
              subscribe.mutate(p.id, {
                onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsored', 'subscription'] }),
              })
            }
          >
            Subscribe
          </button>
        </div>
      ))}
    </div>
  );
}