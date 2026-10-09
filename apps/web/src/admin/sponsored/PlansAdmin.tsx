import { useState } from 'react';
import { useAdminPlans, useAdminUpsertPlan, useAdminDeletePlan } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Button, Callout, EmptyBlock, Panel, StatCard, StatGrid } from '../ui';
import { BanknoteIcon, PlusIcon, SparklesIcon } from '@/components/icons';
import { ConfirmButton, Field, SponsoredNav, TIERS, TierCard, Toggle, fieldControl, fmtCount, fmtLkr, type Tier } from './sponsoredUi';

const EMPTY_DRAFT = { tier: 'bronze' as Tier, name: '', monthlyRateCents: 0, includedSlotCredits: 0, active: true };

export function PlansAdmin() {
  const plans = useAdminPlans();
  const upsert = useAdminUpsertPlan();
  const del = useAdminDeletePlan();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const rows = [...(plans.data ?? [])].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
  const activePlans = rows.filter((p) => p.active);
  const credits = activePlans.reduce((sum, p) => sum + p.includedSlotCredits, 0);
  const error = upsert.error ?? del.error;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sponsored · Pricing"
        title="Plans"
        description="Subscription tiers suppliers buy, with the slot credits each one includes."
      />
      <SponsoredNav />

      <StatGrid cols={3}>
        <StatCard label="Plans" value={fmtCount(rows.length)} sub="Across all tiers" icon={<BanknoteIcon size={17} />} loading={plans.isLoading} />
        <StatCard label="Active" value={fmtCount(activePlans.length)} sub="Available to suppliers" icon={<SparklesIcon size={17} />} loading={plans.isLoading} />
        <StatCard label="Credits offered" value={fmtCount(credits)} sub="Slot credits in active plans" icon={<PlusIcon size={17} />} loading={plans.isLoading} />
      </StatGrid>

      {error && (
        <Callout tone="danger" title="That action didn't go through">
          {(error as Error).message || 'Try again in a moment.'}
        </Callout>
      )}

      {plans.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="vyro-surface h-56 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="vyro-surface">
          <EmptyBlock icon={<BanknoteIcon size={20} />} title="No plans yet" description="Create the first bronze, silver or gold plan below. Suppliers can subscribe once it is active." />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <TierCard
              key={p.id}
              tier={p.tier}
              name={p.name}
              monthlyRateCents={p.monthlyRateCents}
              includedSlotCredits={p.includedSlotCredits}
              active={p.active}
              footer={<ConfirmButton label="Delete plan" confirmLabel="Confirm delete" pending={del.isPending} onConfirm={() => del.mutate(p.id)} />}
            />
          ))}
        </div>
      )}

      <Panel title="Add a plan" description="Create a tier suppliers can subscribe to. The rate is entered in cents." icon={<PlusIcon size={16} />}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form
            className="grid gap-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              upsert.mutate({ id: null, input: draft }, { onSuccess: () => setDraft(EMPTY_DRAFT) });
            }}
          >
            <Field label="Tier">
              <select className={fieldControl} value={draft.tier} onChange={(e) => setDraft({ ...draft, tier: e.target.value as Tier })}>
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name">
              <input className={fieldControl} placeholder="e.g. Growth" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Monthly rate (cents)" hint={draft.monthlyRateCents > 0 ? `Shows as ${fmtLkr(draft.monthlyRateCents)} a month` : 'Enter 100 for LKR 1.00'}>
              <input
                className={fieldControl}
                type="number"
                min={0}
                placeholder="0"
                value={draft.monthlyRateCents || ''}
                onChange={(e) => setDraft({ ...draft, monthlyRateCents: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              />
            </Field>
            <Field label="Included slot credits">
              <input
                className={fieldControl}
                type="number"
                min={0}
                placeholder="0"
                value={draft.includedSlotCredits || ''}
                onChange={(e) => setDraft({ ...draft, includedSlotCredits: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
              />
            </Field>
            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-4 border-t border-ink/[0.07] pt-5">
              <Toggle checked={draft.active} onChange={(active) => setDraft({ ...draft, active })} label="Active" />
              <Button type="submit" variant="primary" disabled={upsert.isPending || !draft.name.trim()}>
                <PlusIcon size={14} />
                Add plan
              </Button>
            </div>
          </form>

          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">Preview</span>
            <TierCard
              preview
              tier={draft.tier}
              name={draft.name}
              monthlyRateCents={draft.monthlyRateCents}
              includedSlotCredits={draft.includedSlotCredits}
              active={draft.active}
            />
          </div>
        </div>
      </Panel>
    </AdminPage>
  );
}
