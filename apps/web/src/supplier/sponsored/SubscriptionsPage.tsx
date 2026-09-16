import React from 'react';
import { useMySubscription, useCancelSubscription } from '../../hooks/useSponsored';
import { useSupplierId } from '../useSupplierId';

export function SubscriptionsPage() {
  const { supplierId } = useSupplierId();
  const sub = useMySubscription(supplierId);
  const cancel = useCancelSubscription(supplierId);
  if (sub.isLoading) return <div className="p-6">Loading…</div>;
  if (!sub.data) return <div className="p-6">No active subscription. <a className="underline" href="/supplier/sponsored/plans">Browse plans</a>.</div>;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Subscription</h1>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-gray-500">Plan</dt><dd>{sub.data.planId}</dd></div>
        <div><dt className="text-gray-500">Status</dt><dd>{sub.data.status}</dd></div>
        <div><dt className="text-gray-500">Starts</dt><dd>{new Date(sub.data.startsAt * 1000).toLocaleDateString()}</dd></div>
        <div><dt className="text-gray-500">Ends</dt><dd>{new Date(sub.data.endsAt * 1000).toLocaleDateString()}</dd></div>
        <div><dt className="text-gray-500">Slot credits remaining</dt><dd>{sub.data.slotCreditsRemaining}</dd></div>
      </dl>
      <button
        type="button"
        className="mt-6 rounded border border-red-300 px-3 py-1 text-red-700 disabled:opacity-50"
        disabled={cancel.isPending}
        onClick={() => cancel.mutate(sub.data!.id)}
      >
        Cancel subscription
      </button>
    </div>
  );
}