import React from 'react';
import { useAdminPlans, useAdminUpsertPlan, useAdminDeletePlan } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Button, EmptyBlock, Panel, Pill, TableCard, TableSkeleton, controlClass } from '../ui';
import { BanknoteIcon, PlusIcon } from '@/components/icons';

export function PlansAdmin() {
  const plans = useAdminPlans();
  const upsert = useAdminUpsertPlan();
  const del = useAdminDeletePlan();
  const [draft, setDraft] = React.useState({ tier: 'bronze' as 'bronze'|'silver'|'gold', name: '', monthlyRateCents: 0, includedSlotCredits: 0, active: true });
  const rows = plans.data ?? [];
  return (
    <AdminPage>
      <AdminPageHeader
        back={{ to: '/admin/sponsored', label: 'Sponsored listings' }}
        kicker="Sponsored · Pricing"
        title="Plans"
        description="Subscription tiers suppliers buy, with the slot credits each one includes."
      />
      <TableCard title="Plan catalogue" description={`${rows.length} plan${rows.length === 1 ? '' : 's'}`}>
        {plans.isLoading ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <EmptyBlock icon={<BanknoteIcon size={20} />} title="No plans yet" description="Add the first plan below." />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Name</th>
                <th className="num">Monthly (LKR)</th>
                <th className="num">Credits</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Pill tone={p.tier === 'gold' ? 'brand' : p.tier === 'silver' ? 'neutral' : 'info'} className="capitalize">
                      {p.tier}
                    </Pill>
                  </td>
                  <td className="font-medium">{p.name}</td>
                  <td className="num">{(p.monthlyRateCents / 100).toLocaleString()}</td>
                  <td className="num">{p.includedSlotCredits}</td>
                  <td>{p.active ? <Pill tone="success" dot>Active</Pill> : <Pill dot>Inactive</Pill>}</td>
                  <td>
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" className="text-rose" disabled={del.isPending} onClick={() => del.mutate(p.id)}>
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
      <Panel title="Add plan" description="Monthly rate is entered in cents." icon={<PlusIcon size={16} />}>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            upsert.mutate({ id: null, input: draft });
          }}
        >
          <select className={controlClass} value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value as 'bronze'|'silver'|'gold' })} aria-label="Tier">
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
          </select>
          <input className={controlClass} placeholder="Name" aria-label="Name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className={controlClass} type="number" placeholder="Monthly cents" aria-label="Monthly cents" onChange={(e) => setDraft({ ...draft, monthlyRateCents: Number(e.target.value) })} />
          <input className={controlClass} type="number" placeholder="Slot credits" aria-label="Slot credits" onChange={(e) => setDraft({ ...draft, includedSlotCredits: Number(e.target.value) })} />
          <label className="flex items-center gap-2 px-1 text-[13px] text-ink-3">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active
          </label>
          <Button type="submit" variant="primary" disabled={upsert.isPending}>
            <PlusIcon size={14} />
            Add plan
          </Button>
        </form>
      </Panel>
    </AdminPage>
  );
}
