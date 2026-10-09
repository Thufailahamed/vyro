import { useState } from 'react';
import { cn } from '@vyro/ui';
import { Link } from 'react-router-dom';
import { useCrmSummary, useLeads } from '../useLeadManager';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { ConversionBadge } from './ConversionBadge';
import { VerifiedBuyerBadge } from './VerifiedBuyerBadge';
import { ALL_STATUSES, STATUS_BAR, TAG_META, TagChip, fmtDate, relTime } from './crmUi';
import { useSupplierId } from '../useSupplierId';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, EmptyState } from '@/components/ui';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { SupplierHero, HeroStatusPill, heroActionClass } from '../SupplierHero';
import { formatLKR } from '@/lib/format';
import {
  TargetIcon,
  RefreshCwIcon,
  FileTextIcon,
  ChevronRightIcon,
  XIcon,
  ClockIcon,
  FilterIcon,
  CheckCircle2Icon,
  TrendingUpIcon,
  UsersIcon,
} from '@/components/icons';
import type { LeadsListQuery, LeadTag, LeadConversionStatus, LeadRow } from '@vyro/validation';

export function LeadsPage() {
  usePageTitle('Buyer Leads & CRM · Supplier Hub');
  const { supplierId } = useSupplierId();
  const [filter, setFilter] = useState<LeadsListQuery>({ limit: 25 });
  const [activeLead, setActiveLead] = useState<string | null>(null);

  const summary = useCrmSummary(supplierId);
  const leads = useLeads(supplierId, filter);

  if (!supplierId) {
    return (
      <div className="rounded-xl border border-ink/10 bg-paper p-8 text-center text-sm text-ink-4">
        No active supplier context found.
      </div>
    );
  }

  const byTag = summary.data?.byTag;
  const byStatus = summary.data?.byStatus;
  const totals = summary.data?.totals;

  const handleRefresh = () => {
    summary.refetch();
    leads.refetch();
  };

  const isFetching = leads.isFetching || summary.isFetching;
  const hasActiveFilters = Boolean(filter.tag || filter.status);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Industrial Page Header */}
      <SupplierHero
        icon={TargetIcon}
        kicker="B2B Wholesale CRM · Pipeline Management"
        title="Leads & RFQ Pipeline"
        description="Track buyer RFQs invited to your facility. Prioritize by temperature, manage conversion stages, log sales notes, and turn inquiries into wholesale orders."
        status={<HeroStatusPill label="CRM Live" tone="volt" />}
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isFetching}
              className={heroActionClass}
              title="Sync latest lead updates"
            >
              <RefreshCwIcon size={13} className={isFetching ? 'animate-spin' : ''} />
              Sync
            </button>
            <Link to="/supplier/quotes" className={heroActionClass}>
              <FileTextIcon size={13} />
              Quote Requests
            </Link>
          </>
        }
        footer={
          <>
            <span>Buyer inquiries score by engagement temperature</span>
            <span className="text-paper/40">
              {totals?.leads ?? 0} leads tracked · {byTag?.hot ?? 0} hot
            </span>
          </>
        }
      />

      {/* KPI Metric Summary Cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Hot leads"
          sublabel="High priority"
          value={byTag?.hot ?? 0}
          icon={<TargetIcon size={14} />}
          tileClass="bg-rose/12 text-rose"
          accent="text-rose"
          bar="bg-rose"
          active={filter.tag === 'hot'}
          onClick={() => setFilter({ ...filter, tag: filter.tag === 'hot' ? undefined : 'hot', cursor: undefined })}
        />
        <MetricCard
          label="Warm leads"
          sublabel="Follow-up needed"
          value={byTag?.warm ?? 0}
          icon={<ClockIcon size={14} />}
          tileClass="bg-amber/12 text-[#a86c28]"
          accent="text-[#a86c28]"
          bar="bg-amber"
          active={filter.tag === 'warm'}
          onClick={() => setFilter({ ...filter, tag: filter.tag === 'warm' ? undefined : 'warm', cursor: undefined })}
        />
        <MetricCard
          label="Cold leads"
          sublabel="Low interest"
          value={byTag?.cold ?? 0}
          icon={<UsersIcon size={14} />}
          tileClass="bg-ink/[0.06] text-ink-3"
          accent="text-ink-2"
          bar="bg-ink/30"
          active={filter.tag === 'cold'}
          onClick={() => setFilter({ ...filter, tag: filter.tag === 'cold' ? undefined : 'cold', cursor: undefined })}
        />
        <MetricCard
          label="Deals won"
          sublabel="Converted to orders"
          value={byStatus?.won ?? 0}
          icon={<CheckCircle2Icon size={14} />}
          tileClass="bg-mint/12 text-mint-deep"
          accent="text-mint-deep"
          bar="bg-mint"
          active={filter.status === 'won'}
          onClick={() => setFilter({ ...filter, status: filter.status === 'won' ? undefined : 'won', cursor: undefined })}
        />
        <MetricCard
          label="Win conversion"
          sublabel={totals?.leads ? `${totals.leads} total invited` : 'Invite-to-win rate'}
          value={totals?.conversionRate != null ? `${Math.round(totals.conversionRate * 100)}%` : '—'}
          icon={<TrendingUpIcon size={14} />}
          tileClass="bg-volt/25 text-volt-deep"
          accent="text-ink-1"
          bar="bg-volt-deep"
          active={false}
          dark
          className="col-span-2 lg:col-span-1"
        />
      </section>

      {/* Pipeline funnel */}
      {(totals?.leads ?? 0) > 0 && (
        <section className="vyro-surface p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">Pipeline by stage</h2>
            <span className="text-xs text-ink-4">Click a stage to filter</span>
          </div>
          <div className="flex h-3 w-full gap-[3px] overflow-hidden rounded-full bg-ink/[0.05]" role="img" aria-label="Leads by stage">
            {ALL_STATUSES.filter((s) => (byStatus?.[s] ?? 0) > 0).map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`${s}: ${byStatus?.[s] ?? 0}`}
                onClick={() => setFilter({ ...filter, status: filter.status === s ? undefined : s, cursor: undefined })}
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-vyro hover:brightness-110',
                  STATUS_BAR[s],
                  filter.status && filter.status !== s && 'opacity-30',
                )}
                style={{ width: `${((byStatus?.[s] ?? 0) / (totals?.leads || 1)) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter({ ...filter, status: filter.status === s ? undefined : s, cursor: undefined })}
                className={cn(
                  'inline-flex items-center gap-2 text-xs capitalize transition-colors',
                  filter.status === s ? 'font-semibold text-ink' : 'text-ink-3 hover:text-ink',
                )}
              >
                <span className={cn('size-2 rounded-full', STATUS_BAR[s])} />
                {s}
                <span className="font-mono font-semibold text-ink">{byStatus?.[s] ?? 0}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filter and Query Toolbar */}
      <div className="vyro-surface flex flex-col justify-between gap-4 p-3 sm:p-4 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-4">
              <FilterIcon size={12} />
              Temperature
            </span>
            <Pills
              ariaLabel="Filter by temperature"
              value={filter.tag}
              onChange={(v) => setFilter({ ...filter, tag: v as LeadTag | undefined, cursor: undefined })}
              options={(['hot', 'warm', 'cold'] as const).map((t) => ({ key: t, label: TAG_META[t].label, dot: TAG_META[t].dot }))}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-4">Status</span>
            <Pills
              ariaLabel="Filter by status"
              value={filter.status}
              onChange={(v) => setFilter({ ...filter, status: v as LeadConversionStatus | undefined, cursor: undefined })}
              options={ALL_STATUSES.map((s) => ({ key: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-4">
          {leads.data ? (
            <span>
              <strong className="font-semibold text-ink">{leads.data.leads.length}</strong> {leads.data.leads.length === 1 ? 'lead' : 'leads'}
              {hasActiveFilters ? ' match' : ''}
            </span>
          ) : null}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilter({ limit: 25 })}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] transition-colors hover:text-rose hover:shadow-[inset_0_0_0_1px_rgba(196,90,74,0.4)]"
            >
              <XIcon size={12} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Leads Content / Pipeline Table */}
      <section>
        {leads.isLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-[72px] vyro-surface" />
            <div className="h-[72px] vyro-surface" />
            <div className="h-[72px] vyro-surface" />
          </div>
        ) : leads.isError ? (
          <div className="rounded-2xl bg-amber/10 p-6 shadow-[inset_0_0_0_1px_rgba(196,132,58,0.35)]">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 shrink-0 rounded-[10px] bg-ink p-2.5 text-volt">
                  <TargetIcon size={18} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-ink-1">Lead Manager unavailable</h3>
                  <p className="max-w-xl text-xs leading-relaxed text-ink-3">
                    Could not fetch active leads. Confirm that the{' '}
                    <code className="rounded bg-amber/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">LEAD_MANAGER_ENABLED</code>{' '}
                    platform feature flag is enabled in your environment.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRefresh()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper transition-colors hover:bg-charcoal"
              >
                <RefreshCwIcon size={13} />
                Retry connection
              </button>
            </div>
          </div>
        ) : (leads.data?.leads ?? []).length === 0 ? (
          <EmptyState
            icon={<TargetIcon size={24} />}
            title={hasActiveFilters ? 'No matching leads' : 'No buyer leads yet'}
            description={
              hasActiveFilters
                ? 'No RFQ leads match your selected tag and status filters. Try clearing filters to view all invited opportunities.'
                : 'When buyers publish RFQs and invite your facility to submit pricing, they will automatically appear here for tracking and sales follow-up.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="secondary" size="sm" onClick={() => setFilter({ limit: 25 })} className="mt-2 text-xs">
                  Clear all filters
                </Button>
              ) : (
                <Link to="/supplier/quotes" className="mt-2 inline-block">
                  <Button variant="primary" size="sm" className="text-xs">
                    View Quote Requests
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <div className="vyro-surface overflow-hidden">
            <div className="hidden grid-cols-12 gap-4 border-b border-ink/[0.07] bg-bone/50 py-3 pl-6 pr-5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-4 sm:grid">
              <div className="col-span-5">Buyer request</div>
              <div className="col-span-3">Invited</div>
              <div className="col-span-2">Stage</div>
              <div className="col-span-2 text-right">Order value</div>
            </div>

            <ul className="divide-y divide-ink/[0.06]">
              {(leads.data?.leads ?? []).map((l: LeadRow) => {
                const meta = l.tag ? TAG_META[l.tag] : null;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setActiveLead(l.id)}
                      className="group relative flex w-full cursor-pointer flex-col gap-3 py-4 pl-6 pr-5 text-left transition-colors hover:bg-bone/60 focus-visible:bg-bone/60 focus-visible:outline-none sm:grid sm:grid-cols-12 sm:items-center sm:gap-4"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'absolute inset-y-3 left-0 w-1 rounded-r-full transition-all duration-300 group-hover:inset-y-2',
                          meta ? meta.bar : 'bg-transparent',
                        )}
                      />
                      <div className="flex min-w-0 items-center gap-3.5 sm:col-span-5">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-[11px] transition-colors',
                            meta ? meta.tile : 'bg-ink/[0.05] text-ink-3 group-hover:bg-ink/[0.08]',
                          )}
                        >
                          <FileTextIcon size={16} />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold tracking-tight text-ink">RFQ #{l.rfqId}</span>
                            <VerifiedBuyerBadge verified={l.buyerVerified} level={l.buyerKycLevel} verifiedAt={l.buyerVerifiedAt} />
                            {l.tag && <TagChip tag={l.tag} />}
                          </div>
                          <div className="truncate font-mono text-[11px] text-ink-4">{l.id}</div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:col-span-3">
                        <span className="text-[13px] font-medium text-ink-2">{relTime(l.invitedAt)}</span>
                        <span className="text-[11px] text-ink-4">{fmtDate(l.invitedAt)}</span>
                      </div>

                      <div className="flex items-center sm:col-span-2">
                        <ConversionBadge status={l.conversionStatus} />
                      </div>

                      <div className="flex items-center justify-between gap-3 text-right sm:col-span-2 sm:justify-end">
                        {l.orderValueCents != null ? (
                          <span className="font-display text-sm font-bold tracking-[-0.01em] text-ink sm:text-[15px]">
                            {formatLKR(l.orderValueCents)}
                          </span>
                        ) : (
                          <span className="text-sm text-ink-5">—</span>
                        )}
                        <ChevronRightIcon
                          size={16}
                          className="shrink-0 text-ink-4 transition-all group-hover:translate-x-0.5 group-hover:text-ink"
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {leads.data?.nextCursor && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFilter({ ...filter, cursor: leads.data!.nextCursor ?? undefined })}
              className="text-xs font-semibold"
            >
              Load older leads
            </Button>
          </div>
        )}
      </section>

      {/* Drawer */}
      <LeadDetailDrawer
        supplierId={supplierId}
        leadId={activeLead}
        onClose={() => setActiveLead(null)}
      />
    </div>
  );
}

function Pills({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ key: string; label: string; dot?: string }>;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  ariaLabel: string;
}) {
  const item = (active: boolean) =>
    cn(
      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-all duration-200',
      active
        ? 'bg-ink text-paper shadow-[0_2px_8px_-2px_rgba(12,14,11,0.5)]'
        : 'text-ink-3 hover:bg-paper/70 hover:text-ink',
    );
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap items-center gap-0.5 rounded-full bg-ink/[0.05] p-[3px] shadow-[inset_0_0_0_1px_rgba(12,14,11,0.04)]"
    >
      <button type="button" aria-pressed={!value} onClick={() => onChange(undefined)} className={item(!value)}>
        All
      </button>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button key={o.key} type="button" aria-pressed={active} onClick={() => onChange(active ? undefined : o.key)} className={item(active)}>
            {o.dot ? <span className={cn('size-1.5 rounded-full', active ? 'bg-volt' : o.dot)} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({
  label,
  sublabel,
  value,
  icon,
  tileClass,
  accent,
  bar,
  active,
  onClick,
  dark,
  className,
}: {
  label: string;
  sublabel: string;
  value: number | string;
  icon: React.ReactNode;
  tileClass: string;
  accent: string;
  bar: string;
  active: boolean;
  onClick?: () => void;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
      role={onClick ? 'button' : undefined}
      aria-pressed={onClick ? active : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn(
        'vyro-surface group relative select-none overflow-hidden p-4 transition-all duration-300 ease-vyro focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-volt/40',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-14px_rgba(12,14,11,0.25)]',
        active && 'ring-2 ring-ink',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-[3px] origin-left transition-transform duration-500 ease-vyro', bar, active ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100')}
      />
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-4">{label}</span>
        <span className={cn('flex size-8 items-center justify-center rounded-[10px]', tileClass)}>{icon}</span>
      </div>
      <MetricNumber size="lg" className={cn('mt-3', accent)}>
        {value}
      </MetricNumber>
      <div className={cn('mt-1 truncate text-xs', dark ? 'text-ink-3' : 'text-ink-4')}>{sublabel}</div>
    </div>
  );
}
