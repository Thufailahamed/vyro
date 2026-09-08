import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Button, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { PaymentConfirmButton } from './PaymentConfirmButton';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import {
  CreditCardIcon,
  SearchIcon,
  DownloadIcon,
  TrendingUpIcon,
  ShieldCheckIcon,
  CheckCircle2Icon,
  BanknoteIcon,
  ClockIcon,
  RefreshCwIcon,
  FileTextIcon,
  Building2Icon,
  PackageIcon,
  ArrowRightIcon,
} from '@/components/icons';
import { useToast } from '@vyro/ui';

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

type Settings = {
  payoutMethod: 'bank' | 'cash' | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankBranch: string | null;
  bankAccountHolder: string | null;
  bankVerified: boolean;
};

type Tab = 'payments' | 'payouts' | 'statement';

export function SupplierPaymentsPage() {
  const { supplierId, supplierName } = useSupplierId();
  const toast = useToast();
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

  const settingsQuery = useQuery({
    queryKey: ['supplier-settings', supplierId],
    queryFn: () => api.get<{ settings: Settings }>(`/suppliers/${supplierId}/settings`),
    enabled: !!supplierId,
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

  const handleRefresh = async () => {
    toast.info('Synchronizing financial ledger…');
    await Promise.all([balance.refetch(), payments.refetch(), payouts.refetch()]);
    toast.success('Treasury records synchronized');
  };

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

  const bank = settingsQuery.data?.settings;

  if (balance.isLoading && tab === 'payments' && payments.isLoading) {
    return <SupplierLoadingState label="Connecting to treasury desk & ledger" />;
  }

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            {supplierName} / Treasury & Settlement
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">
            Financial Ledger
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Automated escrow settlements, digital SVAT invoices, and weekly bank sweep payouts.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Badge variant="neutral" className="gap-1.5 font-mono text-xs bg-paper border border-ink/10 shadow-xs py-1.5 px-3">
            <ShieldCheckIcon size={13} className="text-emerald-700" />
            <span className="font-semibold text-ink">SVAT Registered</span>
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={payments.isFetching || balance.isFetching}
            className="text-xs gap-1.5"
            title="Refresh treasury balances"
          >
            <RefreshCwIcon size={14} className={payments.isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link to="/supplier/settings">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs font-semibold">
              <BanknoteIcon size={14} />
              Payout Settings
            </Button>
          </Link>
        </div>
      </header>

      {/* Harmonious Executive KPI Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10 overflow-hidden rounded-lg shadow-soft-sm">
        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <BanknoteIcon size={13} className="text-copper" />
              Available Balance
            </span>
            <span className="text-[10px] text-emerald-800 font-mono font-semibold">Ready for Sweep</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {formatLKR(balanceCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4">Disbursed on Friday sweep</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <ClockIcon size={13} className="text-copper" />
              Pending Escrow
            </span>
            <span className="text-[10px] text-amber font-mono font-semibold">In Transit</span>
          </div>
          <MetricNumber size="md" className="text-amber">
            {formatLKR(pendingCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4">Locked pending delivery sign-off</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <TrendingUpIcon size={13} className="text-copper" />
              Confirmed Collections
            </span>
            <span className="text-[10px] text-ink-4 font-mono">Current Cycle</span>
          </div>
          <MetricNumber size="md" className="text-emerald-800">
            {formatLKR(confirmedCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4">Verified buyer payments</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <Building2Icon size={13} className="text-copper" />
              Settlement Bank
            </span>
            {bank?.bankVerified ? (
              <span className="text-[10px] text-emerald-800 font-mono font-semibold">Verified</span>
            ) : (
              <span className="text-[10px] text-amber font-mono font-semibold">Action Req.</span>
            )}
          </div>
          {bank?.bankName ? (
            <div>
              <div className="font-semibold text-ink text-sm truncate">{bank.bankName}</div>
              <div className="text-xs font-mono text-ink-4">
                •••• {bank.bankAccountNo ? bank.bankAccountNo.slice(-4) : '••••'}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs text-amber font-medium">Bank not configured</div>
              <Link to="/supplier/settings" className="text-xs text-copper hover:underline font-semibold block mt-0.5">
                Link Payout Account →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Escrow & Settlement Workflow Radar */}
      <Surface kind="elevated" className="p-6 border border-ink/10 shadow-soft-sm rounded-lg space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="text-xs font-mono uppercase tracking-wider font-bold text-ink flex items-center gap-2">
            <span className="size-2 rounded-full bg-volt" />
            Vyro Commercial Escrow & Payout Cycle
          </div>
          <span className="text-xs text-ink-4 font-mono">
            Weekly Bank Clearing: Every Friday
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="p-4 bg-paper border border-line rounded space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-copper font-bold uppercase">Phase 1</span>
              <ShieldCheckIcon size={14} className="text-copper" />
            </div>
            <div className="text-xs font-semibold text-ink">Buyer Escrow Funded</div>
            <p className="text-[11px] text-ink-4 leading-relaxed">
              Wholesale buyer funds are secured in escrow as soon as a purchase order is accepted.
            </p>
          </div>

          <div className="p-4 bg-paper border border-line rounded space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-copper font-bold uppercase">Phase 2</span>
              <CheckCircle2Icon size={14} className="text-emerald-700" />
            </div>
            <div className="text-xs font-semibold text-ink">Delivery Sign-off (eGRN)</div>
            <p className="text-[11px] text-ink-4 leading-relaxed">
              Upon freight arrival at buyer dock, goods are verified and escrow is released to Available Balance.
            </p>
          </div>

          <div className="p-4 bg-paper border border-line rounded space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-copper font-bold uppercase">Phase 3</span>
              <BanknoteIcon size={14} className="text-emerald-700" />
            </div>
            <div className="text-xs font-semibold text-ink">Automated Bank Sweep</div>
            <p className="text-[11px] text-ink-4 leading-relaxed">
              Net balance is transferred directly into your linked corporate bank account via SLIPS / CEFT.
            </p>
          </div>
        </div>
      </Surface>

      {/* Tabs */}
      <div className="border-b border-line flex items-center gap-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'payments', label: `Order Settlements (${list.length})`, icon: CreditCardIcon },
          { id: 'payouts', label: `Bank Payout Batches (${payoutList.length})`, icon: BanknoteIcon },
          { id: 'statement', label: 'Running Account Statement', icon: FileTextIcon },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as Tab)}
              className={`flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-wider font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-ink text-ink font-bold'
                  : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/30'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-copper' : 'text-ink-4'} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Order Settlements */}
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
                <div className="flex flex-wrap gap-1.5 overflow-x-auto scrollbar-none">
                  {['all', 'pending', 'confirmed', 'failed', 'refunded'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={
                        'px-3.5 py-1.5 text-xs font-mono border transition-colors capitalize rounded ' +
                        (s === status
                          ? 'bg-ink text-paper border-ink font-semibold shadow-xs'
                          : 'bg-paper border-line text-ink-2 hover:bg-mist/60')
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-80">
                  <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search payment ID, PO#, reference…"
                    className="pl-9 text-xs"
                  />
                </div>
              </div>

              {list.length === 0 ? (
                <Surface kind="elevated" className="overflow-hidden border border-ink/10 p-8 sm:p-12 text-center rounded-lg shadow-soft-sm">
                  <div className="max-w-xl mx-auto space-y-6 py-2">
                    <div className="size-14 rounded-full bg-volt-soft border border-volt-deep/30 text-volt-deep mx-auto flex items-center justify-center shadow-xs">
                      <CreditCardIcon size={24} />
                    </div>

                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100/60 text-emerald-900 font-mono text-[11px] font-semibold">
                        <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                        Escrow Treasury Desk Online
                      </div>
                      <h3 className="font-display text-lg font-bold text-ink">
                        No Order Settlements Logged Yet
                      </h3>
                      <p className="text-xs text-ink-3 leading-relaxed">
                        When buyers place purchase orders, gross payments and net settlements appear here automatically. Funds are held in secure escrow until freight delivery is confirmed.
                      </p>
                    </div>

                    {/* Bank Status Callout */}
                    {!bank?.bankAccountNo && (
                      <div className="p-4 bg-amber-50/50 border border-amber/30 rounded-lg text-left flex items-start gap-3">
                        <BanknoteIcon size={18} className="text-amber shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="text-xs font-bold text-ink">Link Your Payout Bank Account</div>
                          <p className="text-[11px] text-ink-4">
                            Configure your corporate bank account (SLIPS/CEFT) to ensure funds from completed orders can be transferred to your business automatically.
                          </p>
                          <Link to="/supplier/settings" className="text-xs text-copper hover:underline font-semibold inline-block pt-1">
                            Configure Bank Account Now →
                          </Link>
                        </div>
                      </div>
                    )}

                    <div className="pt-2 flex flex-wrap justify-center gap-3">
                      <Link to="/supplier/orders">
                        <Button variant="primary" size="sm" className="bg-ink text-paper hover:bg-ink-2">
                          View Orders Console →
                        </Button>
                      </Link>
                      <Link to="/supplier/settings">
                        <Button variant="ghost" size="sm" className="text-xs">
                          Review Treasury Settings
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Surface>
              ) : filteredPayments.length === 0 ? (
                <Surface kind="elevated" className="overflow-hidden border border-ink/10 p-12 text-center rounded-lg shadow-soft-sm space-y-2">
                  <SearchIcon size={32} className="mx-auto text-ink-4 opacity-50" />
                  <p className="text-sm font-semibold text-ink">No settlements match "{searchQuery}"</p>
                  <p className="text-xs text-ink-4">Try clearing the search query or adjusting filters.</p>
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="mt-2 text-xs">
                    Clear Search
                  </Button>
                </Surface>
              ) : (
                <Surface kind="elevated" className="overflow-hidden border border-ink/10 rounded-lg shadow-soft-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                        <tr>
                          <th className="text-left px-5 py-3.5 font-medium">Payment ID</th>
                          <th className="text-left px-4 py-3.5 font-medium">Channel</th>
                          <th className="text-right px-4 py-3.5 font-medium">Gross Total</th>
                          <th className="text-right px-4 py-3.5 font-medium">Platform Fee</th>
                          <th className="text-right px-4 py-3.5 font-medium">Net Remittance</th>
                          <th className="text-left px-4 py-3.5 font-medium">Escrow Status</th>
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
                            <td className="px-4 py-4 text-right text-xs text-ink-3 font-mono">
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
                </Surface>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 2: Bank Payout Batches */}
      {tab === 'payouts' && (
        <Surface kind="elevated" className="overflow-hidden border border-ink/10 rounded-lg shadow-soft-sm">
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
            <div className="p-12 text-center text-ink-4 space-y-4 max-w-lg mx-auto">
              <div className="size-14 rounded-full bg-mist/50 border border-line flex items-center justify-center mx-auto text-ink-4">
                <BanknoteIcon size={24} />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-base font-bold text-ink">
                  No Bank Payout Batches Disbursed Yet
                </h3>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Weekly bank payout batches are processed every Friday for all completed orders. Funds are automatically transferred via direct CEFT / SLIPS clearing into your verified corporate bank account.
                </p>
              </div>

              <div className="pt-2">
                <Link to="/supplier/settings">
                  <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                    <Building2Icon size={13} />
                    Verify Settlement Bank Account
                  </Button>
                </Link>
              </div>
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
                      <td className="px-5 py-4 text-right text-ink-3 text-xs font-mono">
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

      {/* Tab 3: Running Account Statement */}
      {tab === 'statement' && (
        <Surface kind="elevated" className="overflow-hidden border border-ink/10 rounded-lg shadow-soft-sm">
          {statement.data && (
            <div className="px-6 py-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-mist/30">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] font-mono text-ink-4">
                  Account Closing Ledger Balance
                </div>
                <div className="vyro-metric text-xl font-bold text-ink mt-0.5">
                  {formatLKR(statement.data.closingBalanceCents)}
                </div>
              </div>
              <a
                href={`/api/accounts/statement?format=csv&accountType=supplier&accountId=${supplierId}`}
                download={`statement-${supplierId}.csv`}
                rel="noopener"
                onClick={async (e) => {
                  // Programmatic fetch so we can show a real error if the session
                  // expired or the API returns 4xx; a plain <a> would just dump
                  // the user on a blank error page with no recourse.
                  e.preventDefault();
                  try {
                    const res = await fetch(
                      `/api/accounts/statement?format=csv&accountType=supplier&accountId=${supplierId}`,
                      { credentials: 'include' },
                    );
                    if (!res.ok) throw new Error(`Download failed (${res.status})`);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `statement-${supplierId}.csv`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Could not export statement.');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-ink/20 bg-paper text-ink hover:bg-ink hover:text-paper transition-colors rounded shadow-xs shrink-0"
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
            <div className="p-12 text-center text-ink-4 space-y-2">
              <FileTextIcon size={32} className="mx-auto text-ink-4 opacity-50" />
              <p className="text-sm font-semibold text-ink">No Statement Entries Recorded</p>
              <p className="text-xs max-w-sm mx-auto">
                Debits, credits, platform commission adjustments, and bank disbursements will be recorded in this running ledger.
              </p>
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
