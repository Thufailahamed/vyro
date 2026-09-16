import React from 'react';
import { useAdminPlans, useAdminUpsertPlan, useAdminDeletePlan } from '../../hooks/useSponsored';

export function PlansAdmin() {
  const plans = useAdminPlans();
  const upsert = useAdminUpsertPlan();
  const del = useAdminDeletePlan();
  const [draft, setDraft] = React.useState({ tier: 'bronze' as 'bronze'|'silver'|'gold', name: '', monthlyRateCents: 0, includedSlotCredits: 0, active: true });
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Plans</h1>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>Tier</th><th>Name</th><th>Monthly LKR</th><th>Credits</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>
          {plans.data?.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2">{p.tier}</td>
              <td>{p.name}</td>
              <td>{(p.monthlyRateCents / 100).toLocaleString()}</td>
              <td>{p.includedSlotCredits}</td>
              <td>{p.active ? 'Yes' : 'No'}</td>
              <td>
                <button type="button" className="text-red-700 underline disabled:opacity-50" disabled={del.isPending} onClick={() => del.mutate(p.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="mt-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          upsert.mutate({ id: null, input: draft });
        }}
      >
        <select className="rounded border p-2" value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value as 'bronze'|'silver'|'gold' })}>
          <option value="bronze">bronze</option><option value="silver">silver</option><option value="gold">gold</option>
        </select>
        <input className="rounded border p-2" placeholder="Name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input className="rounded border p-2" type="number" placeholder="Monthly cents" onChange={(e) => setDraft({ ...draft, monthlyRateCents: Number(e.target.value) })} />
        <input className="rounded border p-2" type="number" placeholder="Slot credits" onChange={(e) => setDraft({ ...draft, includedSlotCredits: Number(e.target.value) })} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> active</label>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white">Add plan</button>
      </form>
    </div>
  );
}