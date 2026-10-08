import React from 'react';
import { useAdminSlots, useAdminUpsertSlot, useAdminDeleteSlot } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Button, EmptyBlock, Panel, Pill, TableCard, TableSkeleton, controlClass } from '../ui';
import { LayersIcon, PlusIcon } from '@/components/icons';

export function SlotsAdmin() {
  const slots = useAdminSlots();
  const upsert = useAdminUpsertSlot();
  const del = useAdminDeleteSlot();
  const [draft, setDraft] = React.useState({ surface: 'search' as 'search'|'category'|'homepage'|'storefront', position: 0, categoryId: null as string | null, label: '', dailyRateCents: 0, active: true });
  const rows = slots.data ?? [];
  return (
    <AdminPage>
      <AdminPageHeader
        back={{ to: '/admin/sponsored', label: 'Sponsored listings' }}
        kicker="Sponsored · Placements"
        title="Slots"
        description="Where sponsored listings appear, and the daily rate for each position."
      />
      <TableCard title="Placement slots" description={`${rows.length} slot${rows.length === 1 ? '' : 's'}`}>
        {slots.isLoading ? (
          <TableSkeleton cols={7} />
        ) : rows.length === 0 ? (
          <EmptyBlock icon={<LayersIcon size={20} />} title="No slots yet" description="Add the first placement below." />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Surface</th>
                <th className="num">Position</th>
                <th>Label</th>
                <th className="num">Daily (LKR)</th>
                <th>Category</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Pill className="capitalize">{s.surface}</Pill>
                  </td>
                  <td className="num">{s.position}</td>
                  <td className="font-medium">{s.label}</td>
                  <td className="num">{(s.dailyRateCents / 100).toLocaleString()}</td>
                  <td className="font-mono text-xs text-ink-3">{s.categoryId ?? '—'}</td>
                  <td>{s.active ? <Pill tone="success" dot>Active</Pill> : <Pill dot>Inactive</Pill>}</td>
                  <td>
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" className="text-rose" disabled={del.isPending} onClick={() => del.mutate(s.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
      <Panel title="Add slot" description="Daily rate is entered in cents. Category is optional." icon={<PlusIcon size={16} />}>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            upsert.mutate({ id: null, input: draft });
          }}
        >
          <select className={controlClass} value={draft.surface} onChange={(e) => setDraft({ ...draft, surface: e.target.value as 'search'|'category'|'homepage'|'storefront' })} aria-label="Surface">
            <option value="search">Search</option>
            <option value="category">Category</option>
            <option value="homepage">Homepage</option>
            <option value="storefront">Storefront</option>
          </select>
          <input className={`${controlClass} w-24`} type="number" placeholder="Position" aria-label="Position" onChange={(e) => setDraft({ ...draft, position: Number(e.target.value) })} />
          <input className={controlClass} placeholder="Label" aria-label="Label" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <input className={`${controlClass} w-36`} type="number" placeholder="Daily cents" aria-label="Daily cents" onChange={(e) => setDraft({ ...draft, dailyRateCents: Number(e.target.value) })} />
          <input className={controlClass} placeholder="Category ID (optional)" aria-label="Category ID" onChange={(e) => setDraft({ ...draft, categoryId: e.target.value || null })} />
          <label className="flex items-center gap-2 px-1 text-[13px] text-ink-3">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active
          </label>
          <Button type="submit" variant="primary" disabled={upsert.isPending}>
            <PlusIcon size={14} />
            Add slot
          </Button>
        </form>
      </Panel>
    </AdminPage>
  );
}
