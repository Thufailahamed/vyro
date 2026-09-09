import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useAdminPaymentSearch,
  type PaymentStatus,
  type PaymentMethod,
  type PaymentRow,
} from './useAdminPaymentSearch';
import { useAdminPaymentOptions, type PaymentOptions } from './useAdminPaymentOptions';

const ALL_STATUSES: PaymentStatus[] = ['pending', 'confirmed', 'failed', 'refunded'];

function fmtCents(c: number, currency: string) {
  return `${(c / 100).toFixed(2)} ${currency}`;
}

function statusBadge(status: PaymentRow['status']) {
  const cls = status === 'confirmed'
    ? 'bg-mint/15 text-mint border-mint/25'
    : status === 'failed'
      ? 'bg-rose/15 text-rose border-rose/30'
      : status === 'refunded'
        ? 'bg-amber/15 text-amber border-amber/25'
        : 'bg-mist text-ink-3 border-line';
  return `inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${cls}`;
}

function fmtTs(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

export function PaymentsPage() {
  const can = usePermission('payment:read');
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const f: Parameters<typeof useAdminPaymentSearch>[0] = {};
    const q = params.get('q'); if (q) f.q = q;
    const status = params.get('status'); if (status) f.status = status.split(',') as PaymentStatus[];
    const method = params.get('method') as PaymentMethod | null;
    if (method) f.method = method;
    const businessId = params.get('businessId'); if (businessId) f.businessId = businessId;
    const supplierId = params.get('supplierId'); if (supplierId) f.supplierId = supplierId;
    const minCents = params.get('minCents'); if (minCents) f.minCents = Number(minCents);
    const maxCents = params.get('maxCents'); if (maxCents) f.maxCents = Number(maxCents);
    const sort = params.get('sort');
    if (sort === 'createdAt-asc' || sort === 'createdAt-desc' || sort === 'amount-asc' || sort === 'amount-desc') f.sort = sort;
    return f;
  }, [params]);

  const search = useAdminPaymentSearch(filters);
  const options = useAdminPaymentOptions();
  const [cursor, setCursor] = useState<string | null>(null);

  if (!can) return <ErrorBanner message="You need payment:read permission" />;
  if (search.isError) return <ErrorBanner message={(search.error as Error).message} />;

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '' || value === undefined) next.delete(key);
    else next.set(key, value);
    setParams(next);
    setCursor(null);
  };

  const toggleStatus = (s: PaymentStatus) => {
    const cur = (params.get('status') ?? '').split(',').filter(Boolean) as PaymentStatus[];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    updateParam('status', next.length ? next.join(',') : null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" sub="Cross-tenant payment search and detail" />

      <Surface className="p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col text-xs flex-1 min-w-[200px]">
            <span className="text-ink-500">Search (id, txn ref, gateway ref)</span>
            <input
              type="text"
              defaultValue={params.get('q') ?? ''}
              onBlur={(e) => updateParam('q', e.currentTarget.value || null)}
              placeholder="pay_… or gateway ref"
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Method</span>
            <select
              value={params.get('method') ?? ''}
              onChange={(e) => updateParam('method', e.currentTarget.value || null)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            >
              <option value="">Any</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="online">Online</option>
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Sort</span>
            <select
              value={params.get('sort') ?? 'createdAt-desc'}
              onChange={(e) => updateParam('sort', e.currentTarget.value)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            >
              <option value="createdAt-desc">Newest first</option>
              <option value="createdAt-asc">Oldest first</option>
              <option value="amount-desc">Amount high → low</option>
              <option value="amount-asc">Amount low → high</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Business</span>
            <select
              value={params.get('businessId') ?? ''}
              onChange={(e) => updateParam('businessId', e.currentTarget.value || null)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            >
              <option value="">Any</option>
              {(options.data?.businesses ?? []).map((b: PaymentOptions['businesses'][number]) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Supplier</span>
            <select
              value={params.get('supplierId') ?? ''}
              onChange={(e) => updateParam('supplierId', e.currentTarget.value || null)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            >
              <option value="">Any</option>
              {(options.data?.suppliers ?? []).map((s: PaymentOptions['suppliers'][number]) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Min (LKR)</span>
            <input
              type="number" min={0} step={0.01}
              defaultValue={params.get('minCents') ? String(Number(params.get('minCents')) / 100) : ''}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                updateParam('minCents', v ? String(Math.round(Number(v) * 100)) : null);
              }}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper w-32"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Max (LKR)</span>
            <input
              type="number" min={0} step={0.01}
              defaultValue={params.get('maxCents') ? String(Number(params.get('maxCents')) / 100) : ''}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                updateParam('maxCents', v ? String(Math.round(Number(v) * 100)) : null);
              }}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper w-32"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-500">Status:</span>
          {ALL_STATUSES.map((s) => {
            const active = (params.get('status') ?? '').split(',').includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`text-[10px] font-mono uppercase px-2 py-1 border rounded ${
                  active ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15 text-ink-3'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Surface>

      <Surface className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-500 bg-bone/70">
              <th className="py-2 px-3">Payment</th>
              <th className="py-2 px-3">PO</th>
              <th className="py-2 px-3">Business</th>
              <th className="py-2 px-3">Supplier</th>
              <th className="py-2 px-3 text-right">Amount</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Method</th>
              <th className="py-2 px-3">When</th>
            </tr>
          </thead>
          <tbody>
            {(search.data?.payments ?? []).map((p) => (
              <tr key={p.id} className="border-t border-ink/10 hover:bg-bone/30">
                <td className="py-2 px-3">
                  <Link to={`/admin/payments/${p.id}`} className="font-mono text-xs text-copper hover:underline">
                    {p.id.slice(0, 16)}…
                  </Link>
                </td>
                <td className="py-2 px-3 font-mono text-xs">{p.poNumber}</td>
                <td className="py-2 px-3">{p.businessName}</td>
                <td className="py-2 px-3">{p.supplierName}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtCents(p.amountCents, p.currency)}</td>
                <td className="py-2 px-3"><span className={statusBadge(p.status)}>{p.status}</span></td>
                <td className="py-2 px-3">{p.method}</td>
                <td className="py-2 px-3 text-xs">{fmtTs(p.createdAt)}</td>
              </tr>
            ))}
            {!search.data?.payments?.length ? (
              <tr><td colSpan={8} className="py-6 text-center text-ink-500">No payments match these filters</td></tr>
            ) : null}
          </tbody>
        </table>
      </Surface>

      {search.data?.nextCursor ? (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setCursor(search.data!.nextCursor!)}>
            Load next page
          </Button>
        </div>
      ) : null}
    </div>
  );
}
