import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { PaymentConfirmButton } from './PaymentConfirmButton';
import { formatLKR } from '@/lib/format';

type Payment = {
  id: string;
  purchaseOrderId: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  method: string;
  status: string;
  transactionReference: string | null;
  createdAt: number;
};

type Payout = {
  id: string;
  amountCents: number;
  netCents: number;
  status: string;
  method: string;
  periodStart: number;
  periodEnd: number;
  reference: string | null;
  paidAt: number | null;
  createdAt: number;
};

type LedgerEntry = {
  id: string;
  direction: 'debit' | 'credit';
  amountCents: number;
  refType: string;
  refId: string;
  description: string;
  createdAt: number;
  runningBalanceCents: number;
};

type Statement = {
  entries: LedgerEntry[];
  openingBalanceCents: number;
  closingBalanceCents: number;
  nextCursor: number | null;
};

type Tab = 'payments' | 'payouts' | 'statement';

export function SupplierPaymentsPage() {
  const { supplierId } = useSupplierId();
  const [tab, setTab] = useState<Tab>('payments');
  const [status, setStatus] = useState<string>('all');

  const balance = useQuery({
    queryKey: ['supplier', supplierId, 'balance'],
    queryFn: () =>
      api.get<{ balanceCents: number; currency: string }>(
        `/accounts/balance?accountType=supplier&accountId=${supplierId}`,
      ),
  });

  const payments = useQuery({
    queryKey: ['supplier', supplierId, 'payments', status],
    queryFn: () =>
      api.get<{ items: Payment[] }>(
        `/payments?supplierId=${supplierId}${status === 'all' ? '' : `&status=${status}`}`,
      ),
    retry: false,
    refetchInterval: 30_000,
    enabled: tab === 'payments',
  });
  const list = payments.data?.items ?? [];

  const payouts = useQuery({
    queryKey: ['supplier', supplierId, 'payouts'],
    queryFn: () => api.get<{ items: Payout[] }>(`/payouts?supplierId=${supplierId}`),
    enabled: tab === 'payouts',
  });
  const payoutList = payouts.data?.items ?? [];

  const statement = useQuery({
    queryKey: ['supplier', supplierId, 'statement'],
    queryFn: () =>
      api.get<Statement>(
        `/accounts/statement?accountType=supplier&accountId=${supplierId}`,
      ),
    enabled: tab === 'statement',
  });

  const balanceCents = balance.data?.balanceCents ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Finance" title="Payments" sub="Settlements, payouts, and account statement." />

      <div className="grid sm:grid-cols-3 gap-px bg-ink/10">
        <div className="bg-ink text-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-volt">Balance</div>
          <MetricNumber size="lg" className="mt-2 text-paper">
            {formatLKR(balanceCents)}
          </MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Pending payments</div>
          <MetricNumber size="md" className="mt-2">
            {formatLKR(
              list
                .filter((p) => p.status === 'pending')
                .reduce((s, p) => s + p.netCents, 0),
            )}
          </MetricNumber>
        </div>
        <div className="bg-paper p-6">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Confirmed</div>
          <MetricNumber size="md" className="mt-2">
            {formatLKR(
              list
                .filter((p) => p.status === 'confirmed')
                .reduce((s, p) => s + p.netCents, 0),
            )}
          </MetricNumber>
        </div>
      </div>

      <div className="flex border-b border-ink/10">
        {(['payments', 'payouts', 'statement'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              'px-4 py-2.5 text-xs uppercase tracking-[0.14em] border-b-2 -mb-px transition-colors ' +
              (t === tab
                ? 'border-ink text-ink font-medium'
                : 'border-transparent text-ink-4 hover:text-ink')
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'payments' && (
        <>
          <div className="flex flex-wrap gap-2">
            {['all', 'pending', 'confirmed', 'failed', 'refunded'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={
                  'px-3 py-1.5 text-xs border rounded-xs transition-colors ' +
                  (s === status
                    ? 'bg-ink text-paper border-ink'
                    : 'border-line text-ink-2 hover:bg-ink hover:text-paper')
                }
              >
                {s}
              </button>
            ))}
          </div>

          <Surface kind="elevated" className="overflow-hidden">
            {list.length === 0 ? (
              <p className="p-10 text-center text-sm text-ink-4">No payments yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                  <tr>
                    <th className="text-left px-4 py-3 font-normal">Payment</th>
                    <th className="text-left px-4 py-3 font-normal">Method</th>
                    <th className="text-right px-4 py-3 font-normal">Amount</th>
                    <th className="text-right px-4 py-3 font-normal">Net</th>
                    <th className="text-left px-4 py-3 font-normal">Status</th>
                    <th className="text-right px-4 py-3 font-normal">Created</th>
                    <th className="text-right px-4 py-3 font-normal">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="px-4 py-3 font-mono text-xs text-ink-2">{p.id.slice(0, 10)}…</td>
                      <td className="px-4 py-3 text-xs uppercase text-ink-4">{p.method}</td>
                      <td className="px-4 py-3 text-right vyro-metric text-xs">{formatLKR(p.amountCents)}</td>
                      <td className="px-4 py-3 text-right vyro-metric text-xs">{formatLKR(p.netCents)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === 'confirmed' ? 'success' : p.status === 'pending' ? 'warning' : p.status === 'failed' ? 'danger' : 'neutral'}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-3">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PaymentConfirmButton paymentId={p.id} status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Surface>
        </>
      )}

      {tab === 'payouts' && (
        <Surface kind="elevated" className="overflow-hidden">
          {payoutList.length === 0 ? (
            <p className="p-10 text-center text-sm text-ink-4">No payouts yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                <tr>
                  <th className="text-left px-4 py-3 font-normal">Period</th>
                  <th className="text-left px-4 py-3 font-normal">Method</th>
                  <th className="text-right px-4 py-3 font-normal">Net</th>
                  <th className="text-left px-4 py-3 font-normal">Status</th>
                  <th className="text-right px-4 py-3 font-normal">Paid at</th>
                </tr>
              </thead>
              <tbody>
                {payoutList.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-3 text-xs">
                      {new Date(p.periodStart).toLocaleDateString()} –{' '}
                      {new Date(p.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs uppercase">{p.method}</td>
                    <td className="px-4 py-3 text-right vyro-metric text-xs">{formatLKR(p.netCents)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={p.status === 'paid' ? 'success' : p.status === 'failed' ? 'danger' : 'warning'}>{p.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-ink-3">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Surface>
      )}

      {tab === 'statement' && (
        <Surface kind="elevated" className="overflow-hidden">
          {statement.data && (
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Closing balance</div>
                <div className="vyro-metric text-xl">{formatLKR(statement.data.closingBalanceCents)}</div>
              </div>
              <a
                href={`/api/accounts/statement.csv?accountType=supplier&accountId=${supplierId}`}
                className="text-xs uppercase tracking-[0.14em] text-copper hover:text-ink"
              >
                Export CSV
              </a>
            </div>
          )}
          {statement.isLoading ? (
            <p className="p-10 text-center text-sm text-ink-4">Loading…</p>
          ) : !statement.data || statement.data.entries.length === 0 ? (
            <p className="p-10 text-center text-sm text-ink-4">No statement entries yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                <tr>
                  <th className="text-left px-4 py-3 font-normal">When</th>
                  <th className="text-left px-4 py-3 font-normal">Description</th>
                  <th className="text-right px-4 py-3 font-normal">Debit</th>
                  <th className="text-right px-4 py-3 font-normal">Credit</th>
                  <th className="text-right px-4 py-3 font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {statement.data.entries.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="px-4 py-3 text-ink-3 text-xs">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{e.description}</div>
                      <div className="text-[10px] uppercase text-ink-4">{e.refType}</div>
                    </td>
                    <td className="px-4 py-3 text-right vyro-metric text-xs">
                      {e.direction === 'debit' ? formatLKR(e.amountCents) : ''}
                    </td>
                    <td className="px-4 py-3 text-right vyro-metric text-xs">
                      {e.direction === 'credit' ? formatLKR(e.amountCents) : ''}
                    </td>
                    <td className="px-4 py-3 text-right vyro-metric text-xs">
                      {formatLKR(e.runningBalanceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Surface>
      )}
    </div>
  );
}
