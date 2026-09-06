import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Button, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { PaymentConfirmButton } from './PaymentConfirmButton';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import { SupplierErrorState, SupplierLoadingState, SupplierEmptyState } from './SupplierPageState';
import {
  CreditCardIcon,
  SearchIcon,
  DownloadIcon,
  TrendingUpIcon,
  ShieldCheckIcon,
  CheckCircle2Icon,
} from '@/components/icons';

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
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredPayments = useMemo(() => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.purchaseOrderId.toLowerCase().includes(q) ||
        p.transactionReference?.toLowerCase().includes(q) ||
        p.method.toLowerCase().includes(q),
    );
  }, [list, searchQuery]);

  const balanceCents = balance.data?.balanceCents ?? 0;
  const pendingCents = list
    .filter((p) => p.status === 'pending')
    .reduce((s, p) => s + p.netCents, 0);
  const confirmedCents = list
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + p.netCents, 0);

  if (balance.isLoading && tab === 'payments' && payments.isLoading) {
    return <SupplierLoadingState label="Loading finance ledger & payouts" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader
          kicker="Treasury & Settlement"
          title="Financial Ledger"
          sub="Automated escrow settlements, SVAT digital invoices, and bank payouts."
        />
        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="gap-1 font-mono text-xs">
            <ShieldCheckIcon size={12} className="text-emerald-700" />
            SVAT Registered
          </Badge>
        </div>
      </header>

      {/* Account Balance Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-ink/10 border border-ink/10 overflow-hidden">
        <div className="bg-ink text-paper p-6 relative overflow-hidden grain">
          <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(198,220,74,0.25),transparent_55%)]" />
          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.14em] text-volt font-mono font-bold">
              Current Available Balance
            </div>
            <MetricNumber size="lg" className="mt-2 text-paper">
              {formatLKR(balanceCents)}
            </MetricNumber>
            <div className="text-xs text-paper/55 mt-1 font-mono">Ready for scheduled bank sweep</div>
          </div>
        </div>

        <div className="bg-paper p-6">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-4 font-mono">
            Pending Escrow Settlements
          </div>
          <MetricNumber size="md" className="mt-2 text-amber">
            {formatLKR(pendingCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-1">Awaiting delivery / buyer sign-off</div>
        </div>

        <div className="bg-paper p-6">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-4 font-mono">
            Confirmed Collections
          </div>
          <MetricNumber size="md" className="mt-2 text-emerald-800">
            {formatLKR(confirmedCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4 mt-1">Settled this billing cycle</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ink/10">
        {[
          { id: 'payments', label: 'Order Settlements' },
          { id: 'payouts', label: 'Bank Payout Batches' },
          { id: 'statement', label: 'Running Account Statement' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as Tab)}
            className={
              'px-4 py-2.5 text-xs uppercase tracking-[0.14em] border-b-2 -mb-px transition-colors ' +
              (t.id === tab
                ? 'border-ink text-ink font-bold'
                : 'border-transparent text-ink-4 hover:text-ink')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'payments' && (
        <div className="space-y-4">
          {payments.isError ? (
            <SupplierErrorState
              message="Could not load payments."
              onRetry={() => void payments.refetch()}
            />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5 overflow-x-auto">
                  {['all', 'pending', 'confirmed', 'failed', 'refunded'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={
                        'px-3 py-1.5 text-xs font-mono border transition-colors capitalize ' +
                        (s === status
                          ? 'bg-ink text-paper border-ink font-semibold'
                          : 'bg-paper border-line text-ink-2 hover:bg-ink hover:text-paper')
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="relative max-w-xs">
                  <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search payment ID, PO#…"
                    className="pl-9 text-xs"
                  />
                </div>
              </div>

              <Surface kind="elevated" className="overflow-hidden border border-ink/10 shadow-soft-sm">
                {payments.isLoading ? (
                  <p className="p-10 text-center text-sm text-ink-4">Loading payments…</p>
                ) : list.length === 0 ? (
                  <SupplierEmptyState
                    icon={<CreditCardIcon size={24} className="text-copper" />}
                    title="No payments recorded"
                    description="Incoming buyer payments will appear here as orders are placed."
                  />
                ) : filteredPayments.length === 0 ? (
                  <div className="p-12 text-center text-ink-4 space-y-1">
                    <p className="text-sm font-medium text-ink-3">No payments matched "{searchQuery}"</p>
                    <p className="text-xs">Try clearing the search query.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                        <tr>
                          <th className="text-left px-5 py-3.5 font-medium">Payment ID</th>
                          <th className="text-left px-4 py-3.5 font-medium">Channel</th>
                          <th className="text-right px-4 py-3.5 font-medium">Gross Total</th>
                          <th className="text-right px-4 py-3.5 font-medium">Platform Fee</th>
                          <th className="text-right px-4 py-3.5 font-medium">Net Payout</th>
                          <th className="text-left px-4 py-3.5 font-medium">Status</th>
                          <th className="text-right px-4 py-3.5 font-medium">Timestamp</th>
                          <th className="text-right px-5 py-3.5 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filteredPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-mist/30 transition-colors">
                            <td className="px-5 py-4 font-mono text-xs text-ink font-semibold">
                              {p.id.slice(0, 10)}…
                            </td>
                            <td className="px-4 py-4 text-xs font-mono uppercase text-ink-3">
                              {p.method}
                            </td>
                            <td className="px-4 py-4 text-right vyro-metric text-xs">
                              {formatLKR(p.amountCents)}
                            </td>
                            <td className="px-4 py-4 text-right font-mono text-xs text-ink-4">
                              {p.feeCents > 0 ? formatLKR(p.feeCents) : '—'}
                            </td>
                            <td className="px-4 py-4 text-right vyro-metric text-xs font-bold text-ink">
                              {formatLKR(p.netCents)}
                            </td>
                            <td className="px-4 py-4">
                              <Badge
                                variant={
                                  p.status === 'confirmed'
                                    ? 'success'
                                    : p.status === 'pending'
                                      ? 'warning'
                                      : p.status === 'failed'
                                        ? 'danger'
                                        : 'neutral'
                                }
                              >
                                {p.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-4 text-right text-xs text-ink-3">
                              {new Date(p.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <PaymentConfirmButton paymentId={p.id} status={p.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Surface>
            </>
          )}
        </div>
      )}

      {tab === 'payouts' && (
        <Surface kind="elevated" className="overflow-hidden border border-ink/10 shadow-soft-sm">
          {payouts.isLoading ? (
            <p className="p-10 text-center text-sm text-ink-4">Loading payout batches…</p>
          ) : payouts.isError ? (
            <div className="p-6">
              <SupplierErrorState
                message="Could not load payouts."
                onRetry={() => void payouts.refetch()}
              />
            </div>
          ) : payoutList.length === 0 ? (
            <div className="p-12 text-center text-ink-4 space-y-2">
              <CreditCardIcon size={32} className="mx-auto text-ink-4 opacity-50" />
              <p className="text-sm font-medium text-ink-3">No bank payout batches processed yet</p>
              <p className="text-xs max-w-sm mx-auto">
                Once orders are delivered and settled, automated bank payouts are executed on the weekly settlement schedule.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-medium">Billing Period</th>
                    <th className="text-left px-4 py-3.5 font-medium">Disbursement Method</th>
                    <th className="text-right px-4 py-3.5 font-medium">Net Remittance</th>
                    <th className="text-left px-4 py-3.5 font-medium">Payout Status</th>
                    <th className="text-right px-5 py-3.5 font-medium">Settlement Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payoutList.map((p) => (
                    <tr key={p.id} className="hover:bg-mist/30 transition-colors">
                      <td className="px-5 py-4 text-xs font-mono text-ink">
                        {new Date(p.periodStart).toLocaleDateString()} – {new Date(p.periodEnd).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 text-xs uppercase font-mono text-ink-3">
                        {p.method}
                      </td>
                      <td className="px-4 py-4 text-right vyro-metric text-xs font-bold text-ink">
                        {formatLKR(p.netCents)}
                      </td>
                      <td className="px-4 py-4">
                        <Badge
                          variant={
                            p.status === 'paid'
                              ? 'success'
                              : p.status === 'failed'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-right text-ink-3 text-xs">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : 'Processing'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      )}

      {tab === 'statement' && (
        <Surface kind="elevated" className="overflow-hidden border border-ink/10 shadow-soft-sm">
          {statement.data && (
            <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-mist/30">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] font-mono text-ink-4">
                  Account Closing Ledger Balance
                </div>
                <div className="vyro-metric text-xl font-bold text-ink mt-0.5">
                  {formatLKR(statement.data.closingBalanceCents)}
                </div>
              </div>
              <a
                href={`/api/accounts/statement.csv?accountType=supplier&accountId=${supplierId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-ink/20 bg-paper text-ink hover:bg-ink hover:text-paper transition-colors rounded shadow-xs"
              >
                <DownloadIcon size={13} />
                Export Statement (CSV)
              </a>
            </div>
          )}
          {statement.isLoading ? (
            <p className="p-10 text-center text-sm text-ink-4">Loading ledger statement…</p>
          ) : statement.isError ? (
            <div className="p-6">
              <SupplierErrorState
                message="Could not load statement."
                onRetry={() => void statement.refetch()}
              />
            </div>
          ) : !statement.data || statement.data.entries.length === 0 ? (
            <div className="p-12 text-center text-ink-4">
              <p className="text-sm font-medium text-ink-3">No statement entries recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-medium">Timestamp</th>
                    <th className="text-left px-4 py-3.5 font-medium">Description</th>
                    <th className="text-right px-4 py-3.5 font-medium">Debit (−)</th>
                    <th className="text-right px-4 py-3.5 font-medium">Credit (+)</th>
                    <th className="text-right px-5 py-3.5 font-medium">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {statement.data.entries.map((e) => (
                    <tr key={e.id} className="hover:bg-mist/30 transition-colors">
                      <td className="px-5 py-4 text-ink-3 text-xs font-mono">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <div className="font-semibold text-ink">{e.description}</div>
                        <div className="text-[10px] uppercase font-mono text-ink-4 mt-0.5">{e.refType}</div>
                      </td>
                      <td className="px-4 py-4 text-right vyro-metric text-xs text-rose font-medium">
                        {e.direction === 'debit' ? `− ${formatLKR(e.amountCents)}` : ''}
                      </td>
                      <td className="px-4 py-4 text-right vyro-metric text-xs text-emerald-800 font-medium">
                        {e.direction === 'credit' ? `+ ${formatLKR(e.amountCents)}` : ''}
                      </td>
                      <td className="px-5 py-4 text-right vyro-metric text-xs font-bold text-ink">
                        {formatLKR(e.runningBalanceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
