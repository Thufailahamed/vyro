import React from 'react';
import { useAdminSlots, useAdminUpsertSlot, useAdminDeleteSlot } from '../../hooks/useSponsored';

export function SlotsAdmin() {
  const slots = useAdminSlots();
  const upsert = useAdminUpsertSlot();
  const del = useAdminDeleteSlot();
  const [draft, setDraft] = React.useState({ surface: 'search' as 'search'|'category'|'homepage'|'storefront', position: 0, categoryId: null as string | null, label: '', dailyRateCents: 0, active: true });
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Slots</h1>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>Surface</th><th>Position</th><th>Label</th><th>Daily LKR</th><th>Category</th><th>Active</th><th></th></tr>
        </thead>
        <tbody>
          {slots.data?.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="py-2">{s.surface}</td>
              <td>{s.position}</td>
              <td>{s.label}</td>
              <td>{(s.dailyRateCents / 100).toLocaleString()}</td>
              <td>{s.categoryId ?? '—'}</td>
              <td>{s.active ? 'Yes' : 'No'}</td>
              <td>
                <button type="button" className="text-red-700 underline disabled:opacity-50" disabled={del.isPending} onClick={() => del.mutate(s.id)}>Delete</button>
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
        <select className="rounded border p-2" value={draft.surface} onChange={(e) => setDraft({ ...draft, surface: e.target.value as 'search'|'category'|'homepage'|'storefront' })}>
          <option>search</option><option>category</option><option>homepage</option><option>storefront</option>
        </select>
        <input className="rounded border p-2 w-20" type="number" placeholder="Position" onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })} />
        <input className="rounded border p-2" placeholder="Label" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <input className="rounded border p-2 w-32" type="number" placeholder="Daily cents" onChange={(e) => setDraft({ ...draft, dailyRateCents: Number(e.target.value) })} />
        <input className="rounded border p-2" placeholder="Category ID (optional)" onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> active</label>
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-white">Add slot</button>
      </form>
    </div>
  );
}