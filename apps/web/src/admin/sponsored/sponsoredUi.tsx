/**
 * Shared pieces for the Sponsored listings admin pages. They sit on the admin
 * UI kit (../ui) and add the section navigation, the decision dialog, the
 * two-step delete and the tier, window and performance visuals that the
 * sponsored pages reuse.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { Button, Pill, type PillTone } from '../ui';
import { SparklesIcon, XIcon } from '@/components/icons';
import { useAdminCampaigns } from '../../hooks/useSponsored';

type Maybe<T> = T | undefined;

export type Tier = 'bronze' | 'silver' | 'gold';
export type Surface = 'search' | 'category' | 'homepage' | 'storefront';

export const DAY = 86_400;
export const TIERS: ReadonlyArray<Tier> = ['bronze', 'silver', 'gold'];
export const SURFACES: ReadonlyArray<{ key: Surface; label: string }> = [
  { key: 'search', label: 'Search' },
  { key: 'category', label: 'Category' },
  { key: 'homepage', label: 'Homepage' },
  { key: 'storefront', label: 'Storefront' },
];
export const CAMPAIGN_STATUSES = ['pending_approval', 'pending_payment', 'approved', 'live', 'expired', 'rejected', 'revoked', 'cancelled'];

/* ---------------------------------------------------------------- Formatting */

export const nowSec = () => Math.floor(Date.now() / 1000);
export const fmtDate = (s: number) => new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtShortDate = (s: number) => new Date(s * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const fmtLkr = (cents: number) => `LKR ${(cents / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
export const fmtCount = (n: number) => n.toLocaleString('en-GB');
export const fmtCtr = (impressions: number, clicks: number) => `${(impressions > 0 ? (clicks / impressions) * 100 : 0).toFixed(2)}%`;
export const ctrOf = (impressions: number, clicks: number) => (impressions > 0 ? (clicks / impressions) * 100 : 0);
export const shortId = (id: string) => id.slice(0, 8);
export const labelize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const daysBetween = (from: number, to: number) => Math.max(1, Math.round((to - from) / DAY));
export const daysAgo = (ts: number) => Math.max(0, Math.floor((nowSec() - ts) / DAY));

/* ---------------------------------------------------------------- Navigation */

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: '/admin/sponsored', label: 'Overview', end: true },
  { to: '/admin/sponsored/approvals', label: 'Approvals' },
  { to: '/admin/sponsored/campaigns', label: 'Campaigns' },
  { to: '/admin/sponsored/plans', label: 'Plans' },
  { to: '/admin/sponsored/slots', label: 'Slots' },
  { to: '/admin/sponsored/analytics', label: 'Analytics' },
];

/** Section switcher shown at the top of every sponsored subpage. */
export function SponsoredNav() {
  const pending = useAdminCampaigns({ status: 'pending_approval' });
  const waiting = pending.data?.length ?? 0;
  return (
    <nav aria-label="Sponsored listings sections" className="-mx-1 overflow-x-auto scrollbar-thin">
      <ul className="mx-1 inline-flex min-w-max gap-0.5 rounded-xl bg-ink/[0.045] p-1 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.05),inset_0_1px_2px_rgba(12,14,11,0.05)]">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-[13px] font-medium transition-all duration-200',
                  isActive
                    ? 'bg-paper text-ink shadow-[0_0_0_1px_rgba(12,14,11,0.06),0_1px_2px_rgba(12,14,11,0.08),0_4px_10px_-4px_rgba(12,14,11,0.12)]'
                    : 'text-ink-4 hover:bg-paper/50 hover:text-ink',
                )
              }
            >
              {item.label}
              {item.to.endsWith('/approvals') && waiting > 0 && (
                <span className="rounded-full bg-volt px-1.5 text-[10px] font-semibold leading-4 text-ink num-tabular">{waiting}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---------------------------------------------------------------- Forms */

/** A labelled form field. Wrapping the control in <label> keeps it accessible without aria-label. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: Maybe<ReactNode>; children: ReactNode; className?: Maybe<string> }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-ink-5">{hint}</span>}
    </label>
  );
}

/** Full-width control styling for inputs and selects inside a Field. */
export const fieldControl =
  'h-10 w-full rounded-xl bg-paper px-3.5 text-sm text-ink placeholder:text-ink-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12),0_1px_2px_rgba(12,14,11,0.04)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.22),0_1px_2px_rgba(12,14,11,0.04)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)] disabled:cursor-not-allowed disabled:opacity-60';

/** On/off switch. Keeps the native checkbox for keyboard and screen-reader use. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative inline-flex h-5 w-9 shrink-0">
        <input
          type="checkbox"
          className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-ink/15 transition-colors duration-200 peer-checked:bg-volt-deep peer-focus-visible:ring-4 peer-focus-visible:ring-volt/30"
        />
        <span
          aria-hidden
          className="absolute left-0.5 top-0.5 size-4 rounded-full bg-paper shadow-[0_1px_3px_rgba(12,14,11,0.3)] transition-transform duration-200 peer-checked:translate-x-4"
        />
      </span>
      <span className="text-sm text-ink-3">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- Dialogs & confirmations */

/**
 * Asks for a written reason before a sensitive action (reject, revoke). Mount it
 * only while open, so the reason resets each time.
 */
export function ReasonDialog({
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: Maybe<boolean>;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/35 backdrop-blur-[2px] animate-fade-in" onClick={onCancel} />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="sponsored-reason-title"
        className="vyro-surface relative w-full max-w-md p-6 animate-fade-in"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !pending) onConfirm(trimmed);
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="sponsored-reason-title" className="font-display text-lg font-bold tracking-[-0.02em] text-ink">
              {title}
            </h2>
            <div className="mt-1.5 text-sm leading-relaxed text-ink-4">{description}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <XIcon size={15} />
          </button>
        </div>
        <label className="mt-5 flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">Reason</span>
          <textarea
            autoFocus
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Write a short, specific reason."
            className="w-full resize-none rounded-xl bg-paper p-3.5 text-sm text-ink placeholder:text-ink-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)]"
          />
          <span className="self-end text-[11px] text-ink-5">{reason.length}/500</span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!trimmed || pending}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Two-step destructive button: the first click arms it, the second confirms. Disarms after a few seconds. */
export function ConfirmButton({ label, confirmLabel = 'Confirm', pending, onConfirm }: { label: string; confirmLabel?: string; pending?: Maybe<boolean>; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <Button size="sm" variant="ghost" className="text-rose hover:bg-rose/[0.07]" disabled={pending} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={pending}
      onClick={() => {
        setArmed(false);
        onConfirm();
      }}
    >
      {confirmLabel}
    </Button>
  );
}

/* ---------------------------------------------------------------- Visuals */

/** Campaign window: date range, a progress bar for how far through it the campaign is, and its state. */
export function WindowCell({ startsAt, endsAt }: { startsAt: number; endsAt: number }) {
  const now = nowSec();
  const total = Math.max(1, endsAt - startsAt);
  const progress = Math.min(100, Math.max(0, ((now - startsAt) / total) * 100));
  const state = now < startsAt ? 'Upcoming' : now > endsAt ? 'Ended' : 'Running';
  return (
    <div className="min-w-[12.5rem]">
      <div className="text-[13px] font-medium text-ink">
        {fmtShortDate(startsAt)} <span className="text-ink-5">→</span> {fmtDate(endsAt)}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-volt-deep to-volt transition-[width] duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-1.5 text-[11px] text-ink-4">
        {state} · {daysBetween(startsAt, endsAt)} days
      </div>
    </div>
  );
}

/** Thin bar showing a campaign's click-through rate relative to the best performer. */
export function CtrMeter({ ctr, max }: { ctr: number; max: number }) {
  const width = max > 0 ? Math.max(2, (ctr / max) * 100) : 0;
  return (
    <div className="flex min-w-[9rem] items-center gap-3">
      <span className="w-14 text-right font-mono text-[13px] font-medium text-ink num-tabular">{ctr.toFixed(2)}%</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-volt-deep to-volt" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

const STATUS_BAR: Record<string, string> = {
  pending_approval: 'bg-amber',
  pending_payment: 'bg-copper',
  approved: 'bg-mint',
  live: 'bg-volt-deep',
  expired: 'bg-ink-5',
  rejected: 'bg-rose',
  revoked: 'bg-rose/60',
  cancelled: 'bg-ink-5/60',
};

/** Stacked bar of campaigns by status, with a legend. */
export function PipelineBar({ statuses }: { statuses: ReadonlyArray<string> }) {
  const total = statuses.length;
  const counts = CAMPAIGN_STATUSES.map((s) => ({ status: s, n: statuses.filter((x) => x === s).length })).filter((c) => c.n > 0);
  if (total === 0) return <p className="text-sm text-ink-4">No campaigns yet. The pipeline fills in once suppliers submit.</p>;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-ink/[0.06]" role="img" aria-label={counts.map((c) => `${labelize(c.status)} ${c.n}`).join(', ')}>
        {counts.map((c) => (
          <span key={c.status} className={cn('h-full', STATUS_BAR[c.status] ?? 'bg-ink-5')} style={{ width: `${(c.n / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {counts.map((c) => (
          <li key={c.status} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="flex min-w-0 items-center gap-2 text-ink-3">
              <span className={cn('size-2 shrink-0 rounded-full', STATUS_BAR[c.status] ?? 'bg-ink-5')} aria-hidden />
              <span className="truncate">{labelize(c.status)}</span>
            </span>
            <span className="font-semibold text-ink num-tabular">{c.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TIER_META: Record<Tier, { label: string; bar: string; tone: PillTone }> = {
  bronze: { label: 'Bronze', bar: 'from-copper to-copper-deep', tone: 'info' },
  silver: { label: 'Silver', bar: 'from-ink-5 to-ink-3', tone: 'neutral' },
  gold: { label: 'Gold', bar: 'from-volt to-volt-deep', tone: 'brand' },
};

/** Plan card. Used for saved plans and for the live preview while a plan is being drafted. */
export function TierCard({
  tier,
  name,
  monthlyRateCents,
  includedSlotCredits,
  active,
  footer,
  preview,
  className,
}: {
  tier: Tier;
  name: string;
  monthlyRateCents: number;
  includedSlotCredits: number;
  active: boolean;
  footer?: Maybe<ReactNode>;
  preview?: Maybe<boolean>;
  className?: Maybe<string>;
}) {
  const meta = TIER_META[tier];
  return (
    <article className={cn('vyro-surface relative flex flex-col overflow-hidden', preview && 'border border-dashed border-ink/15 bg-transparent shadow-none', className)}>
      <div className={cn('h-1 w-full bg-gradient-to-r', meta.bar)} aria-hidden />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <Pill tone={meta.tone}>{meta.label}</Pill>
          {active ? <Pill tone="success" dot>Active</Pill> : <Pill dot>Inactive</Pill>}
        </div>
        <h3 className="mt-4 font-display text-xl font-bold tracking-[-0.02em] text-ink">{name || <span className="text-ink-5">Untitled plan</span>}</h3>
        <div className="mt-5 flex items-baseline gap-1.5">
          <span className="vyro-metric text-[1.75rem] leading-none text-ink">{fmtLkr(monthlyRateCents)}</span>
          <span className="text-xs text-ink-4">/ month</span>
        </div>
        <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-bone/70 px-3.5 py-3 text-[13px] text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
          <SparklesIcon size={14} className="shrink-0 text-volt-deep" />
          <span>
            <span className="font-semibold text-ink num-tabular">{includedSlotCredits}</span> slot credit{includedSlotCredits === 1 ? '' : 's'} included
          </span>
        </div>
        {footer && <div className="mt-auto flex justify-end pt-5">{footer}</div>}
      </div>
    </article>
  );
}
