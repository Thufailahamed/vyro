import { Link } from 'react-router-dom';
import type { ComponentEnvelope, Action } from '@vyro/ai';
import { ConfirmationPanel } from './ConfirmationPanel';
import {
  CheckCircleIcon,
  StoreIcon,
  TruckIcon,
  TrendingUpIcon,
  SparklesIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
} from '@/components/icons';

export function formatLKR(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `Rs. ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Source({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-1.5 border-t border-ink/10 pt-2.5 text-[11px] font-mono leading-snug text-ink-4">
      <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-copper" />
      <span>{children}</span>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-copper">{children}</div>
  );
}

function ActionRow({ actions }: { actions: Action[] }) {
  if (!actions?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a, i) => (
        <Link
          key={i}
          to={a.href}
          className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-mono font-bold uppercase tracking-wider bg-paper border border-ink/15 hover:border-ink text-ink transition-colors shadow-xs"
        >
          <span>{a.label}</span>
          <ArrowRightIcon size={11} className="text-volt-deep" />
        </Link>
      ))}
    </div>
  );
}

function leadText(days: number | null | undefined): string | null {
  if (days == null) return null;
  return days === 1 ? '1 day dispatch' : `${days}d dispatch`;
}

export function RecommendationCard({ data }: { data: any }) {
  if (data.message && !data.supplierName) {
    return (
      <div className="p-4 bg-amber/10 border border-amber/30 text-ink shadow-sm space-y-2">
        <Eyebrow>Catalog Notice</Eyebrow>
        <div className="font-display font-semibold text-ink text-base">{data.productName ?? 'Notice'}</div>
        <div className="text-xs text-ink-3 leading-relaxed">{data.message}</div>
        <Source>Based on current wholesale supplier offers.</Source>
      </div>
    );
  }
  const reasons: string[] = [];
  if (data.offerCount && data.offerCount > 1) reasons.push(`Lowest landed rate across ${data.offerCount} live suppliers`);
  if (data.savingVsHighestCents > 0) reasons.push(`${formatLKR(data.savingVsHighestCents)} cheaper than standard wholesale list`);
  if (data.deliveryAvailable) reasons.push('Direct freight delivery available');
  else if (data.deliveryAvailable === false) reasons.push('Dock pickup only — confirm freight logistics');
  if (data.leadTimeDays != null) reasons.push(leadText(data.leadTimeDays)!);
  if (data.availabilityStatus === 'low') reasons.push('Low inventory at mill — recommend immediate PO');
  if (data.minOrderQty > 1) reasons.push(`Minimum purchase batch: ${data.minOrderQty} units`);

  return (
    <div className="bg-paper border border-ink/20 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 bg-ink px-4 py-3.5 text-paper">
        <div>
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-volt">
            Prime Value Recommendation
          </div>
          <div className="mt-0.5 font-display text-lg font-bold tracking-tight">{data.productName}</div>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 bg-volt text-ink text-[10px] font-mono font-bold uppercase tracking-wider shadow-xs">
          <SparklesIcon size={11} />
          Best Landed Value
        </span>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-ink/10">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Authorized Wholesale Mill</div>
            <div className="text-sm font-display font-semibold text-ink flex items-center gap-1.5 mt-0.5">
              <StoreIcon size={13} className="text-copper" />
              <span>{data.supplierName}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Wholesale Unit Price</div>
            <div className="vyro-metric text-2xl font-bold text-ink num-tabular">
              {formatLKR(data.priceCents)}
            </div>
          </div>
        </div>

        {reasons.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-3 font-bold">
              Procurement Audit Highlights
            </div>
            <ul className="space-y-1.5">
              {reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-ink-2 font-sans">
                  <span aria-hidden className="text-mint font-bold shrink-0">✓</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Source>
          Audited against current wholesale catalog{data.offerCount ? ` across ${data.offerCount} certified suppliers` : ''}.
        </Source>
      </div>
    </div>
  );
}

export function SupplierListCard({ data }: { data: any }) {
  const suppliers: Array<any> | undefined = data.suppliers;
  const hits: Array<any> | undefined = data.hits;
  const isSearch = !suppliers && !!hits;
  const list: Array<any> = suppliers ?? hits ?? [];

  return (
    <div className="bg-paper border border-ink/15 p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <Eyebrow>{isSearch ? 'Catalog Matches' : 'Multi-Supplier Comparison'}</Eyebrow>
        <span className="text-[10px] font-mono text-ink-4 uppercase">
          {list.length} Verified Facilities
        </span>
      </div>

      <div className="font-display font-bold text-ink text-base">
        {data.title ?? 'Wholesale Benchmark Rates'}
      </div>

      <div className="divide-y divide-ink/10 border-t border-b border-ink/10">
        {list.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-bone/40 transition-colors">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                {row.rank != null && !isSearch && (
                  <span className="inline-flex size-5 shrink-0 items-center justify-center bg-ink text-[10px] font-mono font-bold text-paper">
                    #{row.rank}
                  </span>
                )}
                <span className="truncate font-semibold text-ink text-sm">
                  {row.supplierName ?? row.productName}
                </span>
                {row.badge && (
                  <span className="shrink-0 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-volt/20 text-ink border border-volt/35">
                    {row.badge.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div className="text-[11px] font-mono text-ink-4 flex flex-wrap items-center gap-x-2">
                {[
                  row.bestSupplierName ? `via ${row.bestSupplierName}` : null,
                  row.leadTimeDays != null ? leadText(row.leadTimeDays) : null,
                  row.deliveryAvailable === true ? 'freight dispatch' : row.deliveryAvailable === false ? 'dock pickup' : null,
                  row.minOrderQty > 1 ? `min ${row.minOrderQty} units` : null,
                  row.savingVsHighestCents > 0 ? `saves ${formatLKR(row.savingVsHighestCents)}` : null,
                  typeof row.fillRate === 'number' ? `${Math.round(row.fillRate * 100)}% fill rate` : null,
                  row.availabilityStatus ? String(row.availabilityStatus).replace(/_/g, ' ') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-sm font-bold text-ink num-tabular">
                {formatLKR(row.priceCents ?? row.bestPriceCents)}
              </div>
              <div className="text-[9px] font-mono text-ink-4 uppercase">per wholesale unit</div>
            </div>
          </div>
        ))}
        {!list.length && <div className="py-4 text-xs font-mono text-ink-4">No matching suppliers located.</div>}
      </div>

      <Source>
        {isSearch ? 'Matched against live commodity lots.' : 'Ranked by unit price, fulfillment velocity, and supplier tier status.'}
      </Source>
    </div>
  );
}

export function SpendSummaryCard({ data }: { data: any }) {
  if (data.scope === 'price_changes') {
    return (
      <div className="bg-paper border border-ink/15 p-5 shadow-sm space-y-3">
        <Eyebrow>Wholesale Price Volatility</Eyebrow>
        <div className="font-display font-semibold text-ink text-base">Commodity Shifts</div>
        <div className="space-y-2 text-sm border-t border-ink/10 pt-3">
          {(data.movers ?? []).map((m: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 p-2 bg-bone/40 border border-ink/5">
              <span className="font-medium text-ink text-xs">{m.productName}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-ink-4">
                  {formatLKR(m.from)} → {formatLKR(m.to)}
                </span>
                <span
                  className={`inline-flex px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
                    m.pct >= 0 ? 'bg-rose/15 text-rose border border-rose/30' : 'bg-mint/15 text-mint border border-mint/30'
                  }`}
                >
                  {m.pct >= 0 ? '+' : ''}{m.pct}%
                </span>
              </div>
            </div>
          ))}
          {(!data.movers || data.movers.length === 0) && (
            <div className="text-xs font-mono text-ink-4">No price fluctuations detected over this period.</div>
          )}
        </div>
        <Source>Computed from settled commercial purchase orders in the last {data.period ?? 'month'}.</Source>
      </div>
    );
  }

  const title =
    data.scope === 'product' ? 'Product Spend Volume' : data.scope === 'supplier' ? 'Supplier Spend Volume' : 'Total Procurement Spend';

  return (
    <div className="bg-ink text-paper p-6 border border-ink/20 shadow-sm space-y-3 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-volt font-bold">
          {title}
        </span>
        <span className="text-[10px] font-mono text-paper/50">
          Last {data.period || '30 days'}
        </span>
      </div>

      <div className="vyro-metric text-4xl font-bold tracking-tight text-paper num-tabular">
        {formatLKR(data.totalCents)}
      </div>

      {(data.productName || data.supplierName) && (
        <div className="text-xs text-paper/80 font-mono">
          Entity focus: <span className="text-volt font-semibold">{data.productName ?? data.supplierName}</span>
        </div>
      )}

      <div className="pt-3 border-t border-paper/10 text-[11px] font-mono text-paper/60 flex items-center justify-between">
        <span>Grounded on {data.orderCount ?? 0} settled Purchase Order{data.orderCount === 1 ? '' : 's'}.</span>
        <span className="text-paper/40">SVAT Audited</span>
      </div>
    </div>
  );
}

export function SavingsCard({ data }: { data: any }) {
  const opps: any[] = data.opportunities ?? [];
  return (
    <div className="bg-paper border border-mint/40 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <Eyebrow>Procurement Arbitrage Opportunity</Eyebrow>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-mint/15 text-mint border border-mint/30 text-[10px] font-mono font-bold uppercase tracking-wider">
          <TrendingUpIcon size={11} />
          Cost Reduction
        </span>
      </div>

      <div className="space-y-2.5">
        {opps.slice(0, 5).map((o: any, i: number) => (
          <div key={i} className="p-3.5 bg-bone/40 border border-ink/10 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-display font-semibold text-ink text-sm">{o.productName}</div>
              <div className="shrink-0 font-mono text-sm font-bold text-mint num-tabular">
                −{formatLKR(o.savingCents)}
              </div>
            </div>
            <div className="text-[11px] font-mono text-ink-3 flex flex-wrap items-center gap-1.5">
              <span>Currently {formatLKR(o.currentPriceCents)} ({o.currentSupplierName})</span>
              <span>→</span>
              <span className="text-ink font-semibold">{formatLKR(o.alternativePriceCents)} ({o.alternativeSupplierName})</span>
            </div>
          </div>
        ))}
        {!opps.length && <div className="text-xs font-mono text-ink-4">No viable savings opportunities identified.</div>}
      </div>

      {data.disclaimer && <div className="text-[11px] font-mono italic text-ink-4">{data.disclaimer}</div>}
      <Source>Calculated against live quotes vs your last invoice rates. Freight terms may vary.</Source>
    </div>
  );
}

export function ProcurementPlanCard({ data }: { data: any }) {
  const lines: any[] = data.lines ?? [];
  return (
    <div className="bg-paper border border-ink/15 p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <Eyebrow>Recommended Replenishment Schedule</Eyebrow>
        <span className="text-[10px] font-mono text-ink-4 uppercase">
          {lines.length} Line Items
        </span>
      </div>

      <div className="font-display font-semibold text-ink text-base">
        {data.title ?? 'Suggested Stock Reorder Plan'}
      </div>

      <div className="divide-y divide-ink/10 border-t border-b border-ink/10">
        {lines.map((l: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="flex items-center gap-2 font-medium text-ink">
              <span className="inline-flex size-5 shrink-0 items-center justify-center bg-bone text-[10px] font-mono font-bold text-ink-3 border border-ink/10">
                {i + 1}
              </span>
              <span className="text-xs">{l.productName}</span>
            </div>
            <span className="shrink-0 font-mono text-xs font-bold text-copper bg-mist px-2 py-0.5 border border-line">
              Qty: {l.typicalQuantity}
            </span>
          </div>
        ))}
        {!lines.length && <div className="py-3 text-xs font-mono text-ink-4">No replenishment items suggested.</div>}
      </div>

      {data.disclaimer && <div className="text-[11px] font-mono text-ink-4 italic">{data.disclaimer}</div>}
      <Source>Model calculates typical order rhythm from past deliveries. Review quantities in cart.</Source>
    </div>
  );
}

export function ClarificationCard({ data, onPick }: { data: any; onPick?: ((opt: string) => void) | undefined }) {
  return (
    <div className="p-4 bg-paper border border-copper/40 shadow-sm space-y-3">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-copper animate-pulse" />
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-copper">
          Clarification Required
        </span>
      </div>
      <div className="text-sm font-display font-semibold text-ink">{data.question ?? 'Please select your target parameter:'}</div>
      {data.options?.length ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {data.options.map((o: string, i: number) =>
            onPick ? (
              <button
                key={i}
                type="button"
                onClick={() => onPick(o)}
                className="px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-ink text-paper hover:bg-charcoal hover:text-volt transition-colors shadow-xs"
              >
                {o}
              </button>
            ) : (
              <span key={i} className="px-3 py-1.5 text-xs font-mono bg-bone text-ink border border-ink/15">
                {o}
              </span>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export { ToolTimeline } from './ToolTimeline';
export { ConfirmationPanel } from './ConfirmationPanel';
export { ActionRow };

export function WhyCard({ data }: { data: any }) {
  const evidence: Array<{ label: string; value: string }> = data.evidence ?? [];
  return (
    <div className="bg-paper border border-copper/30 p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <Eyebrow>VYRO · Why</Eyebrow>
        <span className="text-[10px] font-mono text-ink-4 uppercase">Evidence-backed</span>
      </div>
      <div className="font-display text-lg font-bold tracking-tight text-ink">{data.question ?? 'Why?'}</div>
      <p className="text-sm leading-relaxed text-ink-2">{data.answer ?? ''}</p>
      {evidence.length > 0 && (
        <ul className="border-t border-ink/10 pt-3 space-y-1.5">
          {evidence.map((e, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-mono uppercase tracking-wider text-ink-4">{e.label}</span>
              <span className="font-mono font-bold text-ink num-tabular">{e.value}</span>
            </li>
          ))}
        </ul>
      )}
      {data.recommendation && (
        <div className="text-xs font-mono text-mint border-t border-ink/10 pt-3">
          → {data.recommendation}
        </div>
      )}
      <Source>Sourced from your live procurement history and current wholesale offers.</Source>
    </div>
  );
}

export function SimulationCard({ data }: { data: any }) {
  const saving = (data.monthlyDeltaCents ?? 0) < 0;
  const monthly = Math.abs(Number(data.monthlyDeltaCents ?? 0) / 100);
  const annual = Math.abs(Number(data.annualDeltaCents ?? 0) / 100);
  const pct = Number(data.savingsPct ?? 0);
  const leadDelta = Number(data.leadDeltaDays ?? 0);
  const confidence = String(data.confidence ?? 'medium');
  return (
    <div className="bg-paper border border-ink/20 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <Eyebrow>VYRO · Supplier Switch Simulation</Eyebrow>
        <span className="text-[10px] font-mono text-ink-4 uppercase">confidence: {confidence}</span>
      </div>
      <div className="font-display text-lg font-bold tracking-tight text-ink">
        Switch {data.productName ?? 'product'} suppliers
      </div>
      <div className="grid grid-cols-2 gap-3 border-y border-ink/10 py-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Current</div>
          <div className="text-sm font-display font-semibold text-ink">{data.currentSupplier ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Alternative</div>
          <div className="text-sm font-display font-semibold text-ink">{data.alternativeSupplier ?? '—'}</div>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
            {saving ? 'Estimated saving' : 'Estimated cost'}
          </div>
          <div className={`font-display text-3xl font-bold tracking-tight num-tabular ${saving ? 'text-mint' : 'text-rose'}`}>
            {`${pct.toFixed(1)}%`}
          </div>
        </div>
        <div className="text-right space-y-0.5 text-xs font-mono text-ink-2">
          <div>Monthly: <span className="num-tabular font-bold">Rs. {monthly.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          <div>Annual: <span className="num-tabular font-bold">Rs. {annual.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        </div>
      </div>
      <div className="text-[11px] font-mono text-ink-4">
        Lead time {leadDelta >= 0 ? '+' : ''}{leadDelta}d · {data.monthlyQuantity ?? 0} units/mo
      </div>
      <Source>Pricing uses your live cadence and current wholesale offers — review before converting.</Source>
    </div>
  );
}

export function renderComponent(env: ComponentEnvelope, idx: number, onPick?: (opt: string) => void) {
  const data = env.data as any;
  switch (env.type) {
    case 'recommendation_card':
      return <RecommendationCard key={idx} data={data} />;
    case 'supplier_list_card':
      return <SupplierListCard key={idx} data={data} />;
    case 'spend_summary_card':
      return <SpendSummaryCard key={idx} data={data} />;
    case 'savings_card':
      return <SavingsCard key={idx} data={data} />;
    case 'procurement_plan_card':
      return <ProcurementPlanCard key={idx} data={data} />;
    case 'clarification_card':
      return <ClarificationCard key={idx} data={data} onPick={onPick} />;
    case 'confirmation_card':
      return <ConfirmationPanel key={idx} card={{ id: String(idx), ...(env as object), data } as any} />;
    case 'why_card':
      return <WhyCard key={idx} data={data} />;
    case 'simulation_card':
      return <SimulationCard key={idx} data={data} />;
  }
  return null;
}

/**
 * MetricTile: small numeric readout for dashboards. Neutral language; never
 * labels a value as "AI performance" — these are operational counters.
 */
export function MetricTile({
  kicker,
  value,
  suffix,
}: {
  kicker: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="border border-ink/15 bg-paper p-3 shadow-xs">
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-ink-3">
        {kicker}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="vyro-metric text-2xl text-ink tabular-nums">{value}</span>
        {suffix && (
          <span className="text-[10px] font-mono text-ink-3">{suffix}</span>
        )}
      </div>
    </div>
  );
}

