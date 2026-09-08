import { Link } from 'react-router-dom';
import type { ComponentEnvelope, Action } from '@vyro/ai';

function formatLKR(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `LKR ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;
}

function ActionRow({ actions }: { actions: Action[] }) {
  if (!actions?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {actions.map((a, i) => (
        <Link
          key={i}
          to={a.href}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-100"
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}

export function RecommendationCard({ data }: { data: any }) {
  if (data.message && !data.supplierName) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="font-medium text-amber-900">{data.productName ?? 'Notice'}</div>
        <div className="text-sm text-amber-800 mt-1">{data.message}</div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="text-xs uppercase tracking-wide text-emerald-700">Best price</div>
      <div className="font-medium text-emerald-900 mt-1">{data.productName}</div>
      <div className="mt-3 text-sm">
        <div className="text-slate-600">Supplier</div>
        <div className="font-medium">{data.supplierName}</div>
      </div>
      <div className="mt-2 text-sm">
        <div className="text-slate-600">Price</div>
        <div className="font-medium">{formatLKR(data.priceCents)}</div>
      </div>
      {data.leadTimeDays != null && (
        <div className="mt-2 text-sm">
          <div className="text-slate-600">Lead time</div>
          <div className="font-medium">{data.leadTimeDays} day{data.leadTimeDays === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  );
}

export function SupplierListCard({ data }: { data: any }) {
  const list: Array<any> = data.suppliers ?? data.hits ?? [];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-medium text-slate-700">{data.title ?? 'Suppliers'}</div>
      <div className="mt-3 divide-y">
        {list.map((row, i) => (
          <div key={i} className="flex items-center justify-between py-2 text-sm">
            <div>
              <div className="font-medium">{row.supplierName ?? row.productName}</div>
              <div className="text-xs text-slate-500">
                {row.bestSupplierName ? `via ${row.bestSupplierName} · ${row.offerCount} offer${row.offerCount === 1 ? '' : 's'}` : null}
                {row.leadTimeDays != null ? ` · ${row.leadTimeDays}d lead` : null}
                {row.badge ? ` · ${row.badge}` : null}
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium">{formatLKR(row.priceCents ?? row.bestPriceCents)}</div>
              {row.availabilityStatus && (
                <div className="text-xs text-slate-500">{row.availabilityStatus.replace('_', ' ')}</div>
              )}
            </div>
          </div>
        ))}
        {!list.length && <div className="text-sm text-slate-500 py-2">No matches.</div>}
      </div>
    </div>
  );
}

export function SpendSummaryCard({ data }: { data: any }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="text-xs uppercase tracking-wide text-blue-700">
        {data.scope === 'product' ? 'Product spend' : data.scope === 'supplier' ? 'Supplier spend' : data.scope === 'price_changes' ? 'Price changes' : 'Spend'}
      </div>
      {data.scope === 'price_changes' ? (
        <div className="mt-3 space-y-1 text-sm">
          {(data.movers ?? []).map((m: any, i: number) => (
            <div key={i} className="flex justify-between">
              <span>{m.productName}</span>
              <span className={m.pct >= 0 ? 'text-rose-700' : 'text-emerald-700'}>
                {m.pct >= 0 ? '+' : ''}{m.pct}%
              </span>
            </div>
          ))}
          {(!data.movers || data.movers.length === 0) && <div className="text-slate-500">No significant price changes.</div>}
        </div>
      ) : (
        <>
          <div className="mt-2 text-2xl font-semibold text-blue-900">{formatLKR(data.totalCents)}</div>
          {data.period && <div className="text-xs text-blue-800 mt-1">Period: {data.period}</div>}
          {data.orderCount != null && <div className="text-xs text-blue-800">Orders: {data.orderCount}</div>}
          {data.productName && <div className="text-xs text-blue-800">Product: {data.productName}</div>}
          {data.supplierName && <div className="text-xs text-blue-800">Supplier: {data.supplierName}</div>}
        </>
      )}
    </div>
  );
}

export function SavingsCard({ data }: { data: any }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="text-xs uppercase tracking-wide text-emerald-700">Estimated potential savings</div>
      <div className="mt-3 space-y-2 text-sm">
        {(data.opportunities ?? []).map((o: any, i: number) => (
          <div key={i} className="bg-white rounded p-2 border border-emerald-100">
            <div className="font-medium">{o.productName}</div>
            <div className="text-xs text-slate-600 mt-1">
              Currently paying {formatLKR(o.currentPriceCents)} to {o.currentSupplierName}
            </div>
            <div className="text-xs text-slate-600">
              Alternative: {o.alternativeSupplierName} at {formatLKR(o.alternativePriceCents)}
            </div>
            <div className="text-xs font-medium text-emerald-700 mt-1">
              Estimated saving: {formatLKR(o.savingCents)}
            </div>
          </div>
        ))}
        {(!data.opportunities || data.opportunities.length === 0) && (
          <div className="text-slate-500">No savings opportunities found.</div>
        )}
      </div>
      {data.disclaimer && (
        <div className="mt-3 text-xs italic text-slate-600">{data.disclaimer}</div>
      )}
    </div>
  );
}

export function ProcurementPlanCard({ data }: { data: any }) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="text-xs uppercase tracking-wide text-indigo-700">{data.title ?? 'Procurement plan'}</div>
      <div className="mt-3 space-y-1 text-sm">
        {(data.lines ?? []).map((l: any, i: number) => (
          <div key={i} className="flex justify-between">
            <span>{l.productName}</span>
            <span className="text-slate-600">qty {l.typicalQuantity}</span>
          </div>
        ))}
        {(!data.lines || data.lines.length === 0) && <div className="text-slate-500">Nothing to suggest.</div>}
      </div>
      {data.disclaimer && (
        <div className="mt-3 text-xs italic text-slate-600">{data.disclaimer}</div>
      )}
    </div>
  );
}

export function ClarificationCard({ data }: { data: any }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-medium text-slate-800">{data.question ?? 'Could you clarify?'}</div>
      {data.options?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {data.options.map((o: string, i: number) => (
            <span key={i} className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">{o}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function renderComponent(env: ComponentEnvelope, idx: number) {
  const data = env.data as any;
  switch (env.type) {
    case 'recommendation_card': return <RecommendationCard key={idx} data={data} />;
    case 'supplier_list_card': return <SupplierListCard key={idx} data={data} />;
    case 'spend_summary_card': return <SpendSummaryCard key={idx} data={data} />;
    case 'savings_card': return <SavingsCard key={idx} data={data} />;
    case 'procurement_plan_card': return <ProcurementPlanCard key={idx} data={data} />;
    case 'clarification_card': return <ClarificationCard key={idx} data={data} />;
  }
}

export { ActionRow };
