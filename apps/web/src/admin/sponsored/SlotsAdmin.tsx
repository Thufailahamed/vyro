import { useMemo, useState } from 'react';
import { useAdminSlots, useAdminUpsertSlot, useAdminDeleteSlot } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Button, Callout, EmptyBlock, Panel, Pill, StatCard, StatGrid, TableCard, TableSkeleton, Tabs } from '../ui';
import { LayersIcon, PlusIcon, TrendingUpIcon } from '@/components/icons';
import { ConfirmButton, Field, SURFACES, SponsoredNav, Toggle, fieldControl, fmtCount, fmtLkr, type Surface } from './sponsoredUi';

type SurfaceFilter = 'all' | Surface;

const EMPTY_DRAFT = { surface: 'search' as Surface, position: 0, categoryId: null as string | null, label: '', dailyRateCents: 0, active: true };

export function SlotsAdmin() {
  const slots = useAdminSlots();
  const upsert = useAdminUpsertSlot();
  const del = useAdminDeleteSlot();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [filter, setFilter] = useState<SurfaceFilter>('all');
  const all = slots.data ?? [];

  const rows = useMemo(
    () => [...all].filter((s) => filter === 'all' || s.surface === filter).sort((a, b) => a.position - b.position || a.label.localeCompare(b.label)),
    [all, filter],
  );

  const activeSlots = all.filter((s) => s.active);
  const avgDaily = activeSlots.length > 0 ? Math.round(activeSlots.reduce((sum, s) => sum + s.dailyRateCents, 0) / activeSlots.length) : 0;
  const error = upsert.error ?? del.error;

  const tabs = [
    { key: 'all' as SurfaceFilter, label: 'All', count: all.length },
    ...SURFACES.map((s) => ({ key: s.key as SurfaceFilter, label: s.label, count: all.filter((x) => x.surface === s.key).length })),
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sponsored · Placements"
        title="Slots"
        description="Where sponsored listings appear, and the daily rate for each position."
      />
      <SponsoredNav />

      <StatGrid cols={3}>
        <StatCard label="Active placements" value={fmtCount(activeSlots.length)} sub={`${fmtCount(all.length)} slots in total`} icon={<LayersIcon size={17} />} loading={slots.isLoading} />
        <StatCard label="Average daily rate" value={activeSlots.length > 0 ? fmtLkr(avgDaily) : '—'} sub="Across active placements" icon={<TrendingUpIcon size={17} />} loading={slots.isLoading} />
        <StatCard
          label="Surfaces covered"
          value={`${SURFACES.filter((s) => activeSlots.some((x) => x.surface === s.key)).length}/${SURFACES.length}`}
          sub="Search, category, homepage, storefront"
          icon={<LayersIcon size={17} />}
          loading={slots.isLoading}
        />
      </StatGrid>

      {error && (
        <Callout tone="danger" title="That action didn't go through">
          {(error as Error).message || 'Try again in a moment.'}
        </Callout>
      )}

      <TableCard
        title="Placement slots"
        description={`${fmtCount(rows.length)} ${filter === 'all' ? 'in total' : `on ${SURFACES.find((s) => s.key === filter)?.label.toLowerCase()}`}, in position order`}
        toolbar={<Tabs items={tabs} value={filter} onChange={setFilter} ariaLabel="Filter by surface" />}
      >
        {slots.isLoading ? (
          <TableSkeleton cols={6} />
        ) : rows.length === 0 ? (
          <EmptyBlock
            icon={<LayersIcon size={20} />}
            title={all.length === 0 ? 'No slots yet' : 'No slots on this surface'}
            description={all.length === 0 ? 'Add the first placement below. Each slot has a surface, a position and a daily rate.' : 'Pick another surface, or add a slot for this one below.'}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-20">Position</th>
                <th>Placement</th>
                <th>Category</th>
                <th className="num">Daily rate</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="inline-flex size-8 items-center justify-center rounded-lg bg-ink/[0.05] font-mono text-[13px] font-semibold text-ink num-tabular shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
                      {s.position}
                    </span>
                  </td>
                  <td>
                    <div className="font-medium text-ink">{s.label}</div>
                    <div className="mt-1">
                      <Pill>{SURFACES.find((x) => x.key === s.surface)?.label ?? s.surface}</Pill>
                    </div>
                  </td>
                  <td>
                    {s.categoryId ? <span className="font-mono text-xs text-ink-3">{s.categoryId}</span> : <span className="text-xs text-ink-4">All categories</span>}
                  </td>
                  <td className="num">
                    <span className="font-medium text-ink">{fmtLkr(s.dailyRateCents)}</span>
                    <span className="text-ink-4"> /day</span>
                  </td>
                  <td>{s.active ? <Pill tone="success" dot>Active</Pill> : <Pill dot>Inactive</Pill>}</td>
                  <td>
                    <div className="flex justify-end">
                      <ConfirmButton label="Delete" confirmLabel="Confirm delete" pending={del.isPending} onConfirm={() => del.mutate(s.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <Panel title="Add a slot" description="Set where the placement appears and its daily rate. The category is optional and narrows the placement to one category." icon={<PlusIcon size={16} />}>
        <form
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            upsert.mutate({ id: null, input: draft }, { onSuccess: () => setDraft(EMPTY_DRAFT) });
          }}
        >
          <Field label="Surface">
            <select className={fieldControl} value={draft.surface} onChange={(e) => setDraft({ ...draft, surface: e.target.value as Surface })}>
              {SURFACES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Position" hint="Lower numbers sit first.">
            <input
              className={fieldControl}
              type="number"
              min={0}
              max={50}
              placeholder="0"
              value={draft.position || ''}
              onChange={(e) => setDraft({ ...draft, position: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field label="Label">
            <input className={fieldControl} placeholder="e.g. Search top slot" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Daily rate (cents)" hint={draft.dailyRateCents > 0 ? `Shows as ${fmtLkr(draft.dailyRateCents)} a day` : 'Enter 100 for LKR 1.00'}>
            <input
              className={fieldControl}
              type="number"
              min={0}
              placeholder="0"
              value={draft.dailyRateCents || ''}
              onChange={(e) => setDraft({ ...draft, dailyRateCents: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
            />
          </Field>
          <Field label="Category ID" hint="Leave empty to show on all categories.">
            <input
              className={fieldControl}
              placeholder="Optional"
              value={draft.categoryId ?? ''}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value.trim() || null })}
            />
          </Field>
          <div className="flex flex-col justify-end gap-4">
            <Toggle checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} label="Active" />
            <Button type="submit" variant="primary" disabled={upsert.isPending || !draft.label.trim()}>
              <PlusIcon size={14} />
              Add slot
            </Button>
          </div>
        </form>
      </Panel>
    </AdminPage>
  );
}
