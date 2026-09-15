import { useState } from 'react';
import { useCrmSummary, useLeads } from '../useLeadManager';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { ConversionBadge } from './ConversionBadge';
import { VerifiedBuyerBadge } from './VerifiedBuyerBadge';
import { useSupplierId } from '../useSupplierId';
import type { LeadsListQuery, LeadTag, LeadConversionStatus, LeadRow } from '@vyro/validation';

export function LeadsPage() {
  const { supplierId } = useSupplierId();
  const [filter, setFilter] = useState<LeadsListQuery>({ limit: 25 });
  const [activeLead, setActiveLead] = useState<string | null>(null);

  const summary = useCrmSummary(supplierId);
  const leads = useLeads(supplierId, filter);

  if (!supplierId) {
    return <div className="p-6 text-sm text-ink-4">No supplier context.</div>;
  }

  const byTag = summary.data?.byTag;
  const byStatus = summary.data?.byStatus;

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-1">Leads</h1>
          <p className="text-sm text-ink-4">
            Track buyer RFQs your supplier was invited to. Tag, mark status, and add notes as you work
            them.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Hot" value={byTag?.hot ?? 0} accent="text-red-700" />
        <SummaryCard label="Warm" value={byTag?.warm ?? 0} accent="text-amber-700" />
        <SummaryCard label="Cold" value={byTag?.cold ?? 0} accent="text-blue-700" />
        <SummaryCard label="Won" value={byStatus?.won ?? 0} accent="text-green-700" />
        <SummaryCard
          label="Conversion"
          value={
            summary.data
              ? `${Math.round((summary.data.totals.conversionRate ?? 0) * 100)}%`
              : '—'
          }
          accent="text-ink-1"
        />
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-md border border-ink-3 bg-paper p-3 text-xs">
        <FilterGroup<LeadTag>
          label="Tag"
          options={['hot', 'warm', 'cold']}
          value={filter.tag ?? null}
          onChange={(t) => setFilter({ ...filter, tag: t ?? undefined, cursor: undefined })}
        />
        <FilterGroup<LeadConversionStatus>
          label="Status"
          options={['new', 'contacted', 'quoted', 'won', 'lost']}
          value={filter.status ?? null}
          onChange={(s) => setFilter({ ...filter, status: s ?? undefined, cursor: undefined })}
        />
        {(filter.tag || filter.status) && (
          <button
            type="button"
            onClick={() => setFilter({ limit: 25 })}
            className="ml-auto text-ink-4 underline hover:text-ink-2"
          >
            clear filters
          </button>
        )}
      </section>

      <section>
        {leads.isLoading ? (
          <div className="text-sm text-ink-4">Loading leads…</div>
        ) : leads.isError ? (
          <div className="text-sm text-red-600">
            Could not load leads. Confirm the Lead Manager feature is enabled for your platform.
          </div>
        ) : (leads.data?.leads ?? []).length === 0 ? (
          <div className="text-sm text-ink-4">No leads match these filters.</div>
        ) : (
          <ul className="divide-y divide-ink-3 rounded-md border border-ink-3 bg-paper">
            {(leads.data?.leads ?? []).map((l: LeadRow) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setActiveLead(l.id)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-ink-3/5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink-1">
                      RFQ {l.rfqId}{' '}
                      <VerifiedBuyerBadge
                        verified={l.buyerVerified}
                        level={l.buyerKycLevel}
                        verifiedAt={l.buyerVerifiedAt}
                      />
                    </div>
                    <div className="text-xs text-ink-4">
                      Invited {new Date(l.invitedAt).toLocaleString()}
                      {l.tag && (
                        <span className="ml-2 inline-flex rounded-full border border-ink-3 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                          {l.tag}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ConversionBadge status={l.conversionStatus} />
                    {l.orderValueCents != null && (
                      <span className="text-xs text-ink-4">
                        {(l.orderValueCents / 100).toFixed(2)} LKR
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {leads.data?.nextCursor && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setFilter({ ...filter, cursor: leads.data!.nextCursor ?? undefined })}
              className="text-xs font-semibold text-ink-1 underline"
            >
              Load more
            </button>
          </div>
        )}
      </section>

      <LeadDetailDrawer
        supplierId={supplierId}
        leadId={activeLead}
        onClose={() => setActiveLead(null)}
      />
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className="rounded-md border border-ink-3 bg-paper p-3">
      <div className="text-xs uppercase tracking-wide text-ink-4">{label}</div>
      <div className={`text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onChange: (next: T | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-4">{label}:</span>
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(active ? null : o)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${
              active
                ? 'border-ink bg-ink text-paper'
                : 'border-ink-3 bg-paper text-ink-3 hover:border-ink-2'
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}
