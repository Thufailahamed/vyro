import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCrmSummary, useLeads } from '../useLeadManager';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { ConversionBadge } from './ConversionBadge';
import { VerifiedBuyerBadge } from './VerifiedBuyerBadge';
import { useSupplierId } from '../useSupplierId';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, EmptyState } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { formatLKR } from '@/lib/format';
import {
  TargetIcon,
  RefreshCwIcon,
  FileTextIcon,
  ChevronRightIcon,
  XIcon,
  ClockIcon,
  FilterIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-ink/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-bold tracking-widest uppercase bg-ink text-volt rounded">
              <span className="size-1.5 rounded-full bg-volt animate-pulse" />
              B2B Wholesale CRM
            </span>
            <span className="text-[11px] font-mono text-ink-4 hidden sm:inline">
              Pipeline Management
            </span>
          </div>
          <h1 className="vyro-display text-3xl font-bold tracking-tight text-ink-1">
            Leads & RFQ Pipeline
          </h1>
          <p className="text-xs sm:text-sm text-ink-3 max-w-2xl leading-relaxed">
            Track buyer RFQs invited to your facility. Prioritize by temperature, manage conversion stages, log sales notes, and turn inquiries into wholesale orders.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-paper px-3 py-2 text-xs font-semibold text-ink-2 shadow-xs hover:border-ink/30 hover:text-ink-1 transition-all cursor-pointer"
            title="Sync latest lead updates"
          >
            <RefreshCwIcon
              size={13}
              className={isFetching ? 'animate-spin text-volt-deep' : 'text-ink-4'}
            />
            <span>Sync</span>
          </button>
          <Link to="/supplier/quotes">
            <Button
              variant="secondary"
              size="sm"
              className="text-xs font-semibold"
            >
              <FileTextIcon size={14} />
              <span>Quote Requests</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* KPI Metric Summary Cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard
          label="Hot Leads"
          sublabel="High priority"
          value={byTag?.hot ?? 0}
          indicator="bg-rose"
          accent="text-rose"
          active={filter.tag === 'hot'}
          onClick={() =>
            setFilter({
              ...filter,
              tag: filter.tag === 'hot' ? undefined : 'hot',
              cursor: undefined,
            })
          }
        />
        <MetricCard
          label="Warm Leads"
          sublabel="Follow-up needed"
          value={byTag?.warm ?? 0}
          indicator="bg-amber-500"
          accent="text-amber-700"
          active={filter.tag === 'warm'}
          onClick={() =>
            setFilter({
              ...filter,
              tag: filter.tag === 'warm' ? undefined : 'warm',
              cursor: undefined,
            })
          }
        />
        <MetricCard
          label="Cold Leads"
          sublabel="Low interest"
          value={byTag?.cold ?? 0}
          indicator="bg-sky-500"
          accent="text-sky-700"
          active={filter.tag === 'cold'}
          onClick={() =>
            setFilter({
              ...filter,
              tag: filter.tag === 'cold' ? undefined : 'cold',
              cursor: undefined,
            })
          }
        />
        <MetricCard
          label="Deals Won"
          sublabel="Converted to orders"
          value={byStatus?.won ?? 0}
          indicator="bg-mint"
          accent="text-mint-deep"
          active={filter.status === 'won'}
          onClick={() =>
            setFilter({
              ...filter,
              status: filter.status === 'won' ? undefined : 'won',
              cursor: undefined,
            })
          }
        />
        <MetricCard
          label="Win Conversion"
          sublabel={totals?.leads ? `${totals.leads} total invited` : 'Invite-to-win rate'}
          value={
            summary.data?.totals?.conversionRate != null
              ? `${Math.round(summary.data.totals.conversionRate * 100)}%`
              : '—'
          }
          indicator="bg-volt-deep"
          accent="text-ink-1"
          active={false}
        />
      </section>

      {/* Filter and Query Toolbar */}
      <Surface className="p-3 sm:p-4 shadow-xs border border-ink/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
            {/* Tag Filter */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-4 flex items-center gap-1">
                <FilterIcon size={12} />
                Tag:
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilter({ ...filter, tag: undefined, cursor: undefined })}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                    !filter.tag
                      ? 'bg-ink text-paper shadow-xs'
                      : 'border border-ink/15 bg-paper text-ink-3 hover:border-ink/30 hover:text-ink-1'
                  }`}
                >
                  All
                </button>
                {(['hot', 'warm', 'cold'] as const).map((t) => {
                  const active = filter.tag === t;
                  const dotColor =
                    t === 'hot' ? 'bg-rose' : t === 'warm' ? 'bg-amber-500' : 'bg-sky-500';
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setFilter({
                          ...filter,
                          tag: active ? undefined : t,
                          cursor: undefined,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-all cursor-pointer ${
                        active
                          ? 'bg-ink text-paper shadow-xs'
                          : 'border border-ink/15 bg-paper text-ink-3 hover:border-ink/30 hover:text-ink-1'
                      }`}
                    >
                      <span className={`size-1.5 rounded-full ${active ? 'bg-volt' : dotColor}`} />
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink-4">
                Status:
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilter({ ...filter, status: undefined, cursor: undefined })}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                    !filter.status
                      ? 'bg-ink text-paper shadow-xs'
                      : 'border border-ink/15 bg-paper text-ink-3 hover:border-ink/30 hover:text-ink-1'
                  }`}
                >
                  All
                </button>
                {(['new', 'contacted', 'quoted', 'won', 'lost'] as const).map((s) => {
                  const active = filter.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setFilter({
                          ...filter,
                          status: active ? undefined : s,
                          cursor: undefined,
                        })
                      }
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-all cursor-pointer ${
                        active
                          ? 'bg-ink text-paper shadow-xs'
                          : 'border border-ink/15 bg-paper text-ink-3 hover:border-ink/30 hover:text-ink-1'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Filter Clear */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilter({ limit: 25 })}
              className="inline-flex items-center gap-1 text-xs text-ink-4 hover:text-rose transition-colors cursor-pointer self-start lg:self-auto"
            >
              <XIcon size={13} />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </Surface>

      {/* Main Leads Content / Pipeline Table */}
      <section>
        {leads.isLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-16 rounded-xl bg-mist/60 border border-ink/5" />
            <div className="h-16 rounded-xl bg-mist/50 border border-ink/5" />
            <div className="h-16 rounded-xl bg-mist/40 border border-ink/5" />
          </div>
        ) : leads.isError ? (
          <div className="rounded-xl border border-amber-300/80 bg-amber-500/10 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="rounded-lg bg-ink p-2 text-volt shrink-0 mt-0.5">
                  <TargetIcon size={20} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-ink-1">
                    Lead Manager Platform Feature Notice
                  </h3>
                  <p className="text-xs text-ink-3 leading-relaxed max-w-xl">
                    Could not fetch active leads. Confirm that the <code className="px-1.5 py-0.5 rounded bg-amber-500/20 font-mono text-[11px] text-ink font-semibold">LEAD_MANAGER_ENABLED</code> platform feature flag is enabled in your environment.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRefresh()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-paper shadow-xs hover:bg-charcoal transition-colors cursor-pointer shrink-0"
              >
                <RefreshCwIcon size={13} />
                <span>Retry Connection</span>
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilter({ limit: 25 })}
                  className="mt-2 text-xs"
                >
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
          <div className="rounded-xl border border-ink/10 bg-paper overflow-hidden shadow-xs">
            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-ink/10 bg-bone/40 text-[11px] font-mono font-bold uppercase tracking-wider text-ink-4">
              <div className="col-span-5">Buyer Request & Verification</div>
              <div className="col-span-3">Invited Timeline</div>
              <div className="col-span-2">Conversion Status</div>
              <div className="col-span-2 text-right">Order Value</div>
            </div>

            {/* Leads List Rows */}
            <ul className="divide-y divide-ink/10">
              {(leads.data?.leads ?? []).map((l: LeadRow) => {
                const tagColor =
                  l.tag === 'hot'
                    ? 'bg-rose/10 text-rose border-rose/30'
                    : l.tag === 'warm'
                      ? 'bg-amber-500/10 text-amber-700 border-amber-500/30'
                      : l.tag === 'cold'
                        ? 'bg-sky-500/10 text-sky-700 border-sky-500/30'
                        : null;

                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setActiveLead(l.id)}
                      className="w-full text-left p-4 sm:px-5 sm:py-3.5 hover:bg-bone/50 transition-colors flex flex-col sm:grid sm:grid-cols-12 sm:items-center gap-3 sm:gap-4 group cursor-pointer"
                    >
                      {/* Column 1: RFQ and Buyer Badge */}
                      <div className="sm:col-span-5 flex flex-col gap-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-sm text-ink-1 group-hover:text-ink-2 transition-colors">
                            RFQ #{l.rfqId}
                          </span>
                          <VerifiedBuyerBadge
                            verified={l.buyerVerified}
                            level={l.buyerKycLevel}
                            verifiedAt={l.buyerVerifiedAt}
                          />
                          {l.tag && tagColor && (
                            <span
                              className={`inline-flex items-center px-2 py-0.2 rounded-full border text-[10px] font-mono font-bold uppercase tracking-wider ${tagColor}`}
                            >
                              {l.tag}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-4 truncate">
                          Supplier Lead ID: {l.id}
                        </div>
                      </div>

                      {/* Column 2: Invited Date */}
                      <div className="sm:col-span-3 text-xs text-ink-3 flex items-center gap-1.5 font-mono">
                        <ClockIcon size={13} className="text-ink-4 shrink-0" />
                        <span>
                          {new Date(l.invitedAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      {/* Column 3: Conversion Status */}
                      <div className="sm:col-span-2 flex items-center">
                        <ConversionBadge status={l.conversionStatus} />
                      </div>

                      {/* Column 4: Value and Arrow */}
                      <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-3 text-right">
                        <div>
                          {l.orderValueCents != null ? (
                            <span className="font-mono font-bold text-xs sm:text-sm text-ink-1">
                              {formatLKR(l.orderValueCents)}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-4 font-mono">—</span>
                          )}
                        </div>
                        <ChevronRightIcon
                          size={15}
                          className="text-ink-4 group-hover:text-ink-1 group-hover:translate-x-0.5 transition-all shrink-0"
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
            <button
              type="button"
              onClick={() =>
                setFilter({ ...filter, cursor: leads.data!.nextCursor ?? undefined })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-ink/20 bg-paper px-4 py-2 text-xs font-semibold text-ink-1 shadow-xs hover:border-ink/40 transition-all cursor-pointer"
            >
              <span>Load older leads</span>
            </button>
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

function MetricCard({
  label,
  sublabel,
  value,
  indicator,
  accent,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  value: number | string;
  indicator: string;
  accent: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`rounded-xl border bg-paper p-4 transition-all shadow-xs select-none ${
        onClick ? 'cursor-pointer hover:border-ink/30 hover:shadow-sm' : ''
      } ${active ? 'border-ink ring-2 ring-ink/10' : 'border-ink/10'}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink-4">
          {label}
        </span>
        <span className={`size-2 rounded-full ${indicator}`} />
      </div>
      <div className={`mt-2 text-2xl sm:text-3xl font-bold tracking-tight ${accent}`}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-ink-4 truncate">{sublabel}</div>
    </div>
  );
}

