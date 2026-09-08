import { Link } from 'react-router-dom';
import type { ComponentEnvelope, Action } from '@vyro/ai';
import { ConfirmationPanel } from './ConfirmationPanel';

export function formatLKR(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `Rs. ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Source({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-1.5 border-t border-stone-200 pt-2.5 text-[11px] leading-snug text-stone-500">
      <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400" />
      <span>{children}</span>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{children}</div>
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
          className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}

function leadText(days: number | null | undefined): string | null {
  if (days == null) return null;
  return days === 1 ? '1 day lead' : `${days} day lead`;
}

export function RecommendationCard({ data }: { data: any }) {
  if (data.message && !data.supplierName) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <Eyebrow>Availability notice</Eyebrow>
        <div className="mt-1 font-medium text-stone-900">{data.productName ?? 'Notice'}</div>
        <div className="mt-1 text-sm text-stone-700">{data.message}</div>
        <Source>Based on current supplier offers.</Source>
      </div>
    );
  }
  const reasons: string[] = [];
  if (data.offerCount && data.offerCount > 1) reasons.push(`Lowest of ${data.offerCount} live offers`);
  if (data.savingVsHighestCents > 0) reasons.push(`${formatLKR(data.savingVsHighestCents)} below the priciest option`);
  if (data.deliveryAvailable) reasons.push('Delivery available');
  else if (data.deliveryAvailable === false) reasons.push('Pickup only — confirm delivery');
  if (data.leadTimeDays != null) reasons.push(leadText(data.leadTimeDays)!);
  if (data.availabilityStatus === 'low') reasons.push('Low stock — order soon');
  if (data.minOrderQty > 1) reasons.push(`Min. order ${data.minOrderQty}`);

  return (
    <div className="overflow-hidden rounded-xl border border-stone-900/10 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-3 bg-stone-900 px-4 py-3 text-white">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-300">Recommendation</div>
          <div className="mt-0.5 text-base font-semibold leading-tight">{data.productName}</div>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-stone-900">
          Best value
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm text-stone-600">{data.supplierName}</div>
          <div className="text-xl font-semibold text-stone-900">{formatLKR(data.priceCents)}</div>
        </div>
        {reasons.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-stone-700">Why this pick</div>
            <ul className="mt-1.5 space-y-1 text-sm text-stone-600">
              {reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="text-emerald-700">✓</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Source>Based on current supplier prices{data.offerCount ? ` across ${data.offerCount} live offers` : ''}.</Source>
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
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <Eyebrow>{isSearch ? 'Product matches' : 'Supplier comparison'}</Eyebrow>
      <div className="mt-1 text-sm font-semibold text-stone-900">{data.title ?? 'Results'}</div>
      <div className="mt-2 divide-y divide-stone-100">
        {list.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {row.rank != null && !isSearch && (
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white">
                    {row.rank}
                  </span>
                )}
                <span className="truncate font-medium text-stone-900">{row.supplierName ?? row.productName}</span>
                {row.badge && (
                  <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-700">
                    {row.badge.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-stone-500">
                {[
                  row.bestSupplierName ? `via ${row.bestSupplierName} · ${row.offerCount} offer${row.offerCount === 1 ? '' : 's'}` : null,
                  row.leadTimeDays != null ? leadText(row.leadTimeDays) : null,
                  row.deliveryAvailable === true ? 'delivery' : row.deliveryAvailable === false ? 'pickup' : null,
                  row.minOrderQty > 1 ? `min ${row.minOrderQty}` : null,
                  row.savingVsHighestCents > 0 ? `saves ${formatLKR(row.savingVsHighestCents)}` : null,
                  typeof row.fillRate === 'number' ? `${Math.round(row.fillRate * 100)}% fulfilled` : null,
                  row.availabilityStatus ? String(row.availabilityStatus).replace(/_/g, ' ') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <div className="shrink-0 text-right font-semibold text-stone-900">
              {formatLKR(row.priceCents ?? row.bestPriceCents)}
            </div>
          </div>
        ))}
        {!list.length && <div className="py-2 text-sm text-stone-500">No matches.</div>}
      </div>
      <Source>{isSearch ? 'Matched against the live product catalog.' : 'Ranked by price, then delivery speed. Based on current live offers.'}</Source>
    </div>
  );
}

export function SpendSummaryCard({ data }: { data: any }) {
  if (data.scope === 'price_changes') {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <Eyebrow>Price movements</Eyebrow>
        <div className="mt-3 space-y-1.5 text-sm">
          {(data.movers ?? []).map((m: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-stone-800">{m.productName}</span>
              <span className="text-xs text-stone-500">{formatLKR(m.from)} → {formatLKR(m.to)}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${m.pct >= 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {m.pct >= 0 ? '+' : ''}{m.pct}%
              </span>
            </div>
          ))}
          {(!data.movers || data.movers.length === 0) && <div className="text-stone-500">No significant price changes.</div>}
        </div>
        <Source>Computed from unit prices you actually paid in the last {data.period ?? 'month'}.</Source>
      </div>
    );
  }
  const title =
    data.scope === 'product' ? 'Product spend' : data.scope === 'supplier' ? 'Supplier spend' : 'Spend summary';
  return (
    <div className="rounded-xl bg-stone-900 p-4 text-white">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{title}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight">{formatLKR(data.totalCents)}</div>
      <div className="mt-1 text-xs text-stone-300">
        {[data.period ? `Last ${data.period}` : null, data.orderCount != null ? `${data.orderCount} orders` : null]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {(data.productName || data.supplierName) && (
        <div className="mt-1 text-xs text-stone-300">{data.productName ?? data.supplierName}</div>
      )}
      <div className="mt-3 border-t border-white/10 pt-2.5 text-[11px] leading-snug text-stone-400">
        Based on {data.orderCount ?? 'your'} completed purchase order{data.orderCount === 1 ? '' : 's'}.
      </div>
    </div>
  );
}

export function SavingsCard({ data }: { data: any }) {
  const opps: any[] = data.opportunities ?? [];
  return (
    <div className="rounded-xl border border-emerald-900/20 bg-emerald-50/60 p-4">
      <Eyebrow>Potential saving</Eyebrow>
      <div className="mt-2 space-y-2 text-sm">
        {opps.slice(0, 5).map((o: any, i: number) => (
          <div key={i} className="rounded-lg border border-emerald-900/10 bg-white p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-medium text-stone-900">{o.productName}</div>
              <div className="shrink-0 text-sm font-bold text-emerald-800">−{formatLKR(o.savingCents)}</div>
            </div>
            <div className="mt-1 text-xs text-stone-600">
              Now {formatLKR(o.currentPriceCents)} with {o.currentSupplierName} → {formatLKR(o.alternativePriceCents)} with {o.alternativeSupplierName}
            </div>
          </div>
        ))}
        {!opps.length && <div className="text-stone-500">No savings opportunities found.</div>}
      </div>
      {data.disclaimer && <div className="mt-2 text-xs italic text-stone-500">{data.disclaimer}</div>}
      <Source>Estimated from your recent paid prices vs current live offers. Confirm delivery before switching.</Source>
    </div>
  );
}

export function ProcurementPlanCard({ data }: { data: any }) {
  const lines: any[] = data.lines ?? [];
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <Eyebrow>{data.title ?? 'Procurement plan'}</Eyebrow>
      <div className="mt-2 divide-y divide-stone-100 text-sm">
        {lines.map((l: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1.5">
            <span className="text-stone-800">
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-100 text-[11px] font-bold text-stone-600">{i + 1}</span>
              {l.productName}
            </span>
            <span className="shrink-0 text-xs font-medium text-stone-500">qty {l.typicalQuantity}</span>
          </div>
        ))}
        {!lines.length && <div className="py-1 text-stone-500">Nothing to suggest.</div>}
      </div>
      {data.disclaimer && <div className="mt-2 text-xs italic text-stone-500">{data.disclaimer}</div>}
      <Source>Observed from your recent order history — quantities are averages, not predictions. Review in your cart before ordering.</Source>
    </div>
  );
}

export function ClarificationCard({ data, onPick }: { data: any; onPick?: ((opt: string) => void) | undefined }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4">
      <div className="text-sm font-medium text-stone-800">{data.question ?? 'Could you clarify?'}</div>
      {data.options?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {data.options.map((o: string, i: number) => (
            onPick ? (
              <button
                key={i}
                type="button"
                onClick={() => onPick(o)}
                className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white transition hover:bg-stone-700"
              >
                {o}
              </button>
            ) : (
              <span key={i} className="rounded-full bg-white px-3 py-1 text-xs text-stone-700 ring-1 ring-stone-200">{o}</span>
            )
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { ToolTimeline } from './ToolTimeline';
export { ConfirmationPanel } from './ConfirmationPanel';export { ActionRow };

export function renderComponent(env: ComponentEnvelope, idx: number, onPick?: (opt: string) => void) {
  const data = env.data as any;
  switch (env.type) {
    case 'recommendation_card': return <RecommendationCard key={idx} data={data} />;
    case 'supplier_list_card': return <SupplierListCard key={idx} data={data} />;
    case 'spend_summary_card': return <SpendSummaryCard key={idx} data={data} />;
    case 'savings_card': return <SavingsCard key={idx} data={data} />;
    case 'procurement_plan_card': return <ProcurementPlanCard key={idx} data={data} />;
    case 'clarification_card': return <ClarificationCard key={idx} data={data} onPick={onPick} />;
    case 'confirmation_card': return <ConfirmationPanel key={idx} card={{ id: String(idx), ...(env as object), data } as any} />;
  }
  return null;
}
