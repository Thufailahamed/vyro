import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Badge, Button, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { PaymentConfirmButton } from './PaymentConfirmButton';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { SupplierHero, HeroStatusPill, heroActionClass } from './SupplierHero';
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
      <SupplierHero
        icon={BanknoteIcon}
        kicker={`${supplierName} / Treasury & Settlement`}
        title="Financial Ledger"
        description="Automated escrow settlements, digital SVAT invoices, and weekly bank sweep payouts."
        status={
          <HeroStatusPill
            tone="mint"
            label={
              <>
                <ShieldCheckIcon size={11} className="text-mint" />
                SVAT Registered
              </>
            }
          />
        }
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={payments.isFetching || balance.isFetching}
              className={heroActionClass}
              title="Refresh treasury balances"
            >
              <RefreshCwIcon size={13} className={payments.isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link to="/supplier/settings" className={heroActionClass}>
              <BanknoteIcon size={13} />
              Payout Settings
            </Link>
          </>
        }
        footer={
          <>
            <span>Payouts swept to your verified bank every Friday</span>
            <span className="text-paper/40">
              {formatCompactLKR(balanceCents)} available · {list.length} payments on record
            </span>
          </>
        }
      />

      {/* Harmonious Executive KPI Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="vyro-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="size-8 rounded-lg bg-mint/15 text-mint flex items-center justify-center">
              <BanknoteIcon size={15} />
            </div>
            <span className="text-[10px] text-mint font-mono font-semibold">Ready for Sweep</span>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 font-bold">Available Balance</div>
            <MetricNumber size="md" className="text-ink">
              {formatLKR(balanceCents)}
            </MetricNumber>
            <div className="text-xs text-ink-4 mt-0.5">Disbursed on Friday sweep</div>
          </div>
        </div>

        <div className="vyro-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="size-8 rounded-lg bg-amber/15 text-amber flex items-center justify-center">
              <ClockIcon size={15} />
            </div>
            <span className="text-[10px] text-amber font-mono font-semibold">In Transit</span>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 font-bold">Pending Escrow</div>
            <MetricNumber size="md" className="text-amber">
              {formatLKR(pendingCents)}
            </MetricNumber>
            <div className="text-xs text-ink-4 mt-0.5">Locked pending delivery sign-off</div>
          </div>
        </div>

        <div className="vyro-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="size-8 rounded-lg bg-volt/20 text-volt-deep flex items-center justify-center">
              <TrendingUpIcon size={15} />
            </div>
            <span className="text-[10px] text-ink-4 font-mono">Current Cycle</span>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 font-bold">Confirmed Collections</div>
            <MetricNumber size="md" className="text-mint">
              {formatLKR(confirmedCents)}
            </MetricNumber>
            <div className="text-xs text-ink-4 mt-0.5">Verified buyer payments</div>
          </div>
        </div>

        <div className="vyro-surface p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="size-8 rounded-lg bg-copper/15 text-copper flex items-center justify-center">
              <Building2Icon size={15} />
            </div>
            {bank?.bankVerified ? (
              <span className="text-[10px] text-mint font-mono font-semibold">Verified</span>
            ) : (
              <span className="text-[10px] text-amber font-mono font-semibold">Action Req.</span>
            )}
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 font-bold">Settlement Bank</div>
            {bank?.bankName ? (
              <div className="mt-1">
                <div className="font-semibold text-ink text-sm truncate">{bank.bankName}</div>
                <div className="text-xs font-mono text-ink-4">
                  •••• {bank.bankAccountNo ? bank.bankAccountNo.slice(-4) : '••••'}
                </div>
              </div>
            ) : (
              <div className="mt-1">
                <div className="text-xs text-amber font-medium">Bank not configured</div>
                <Link to="/supplier/settings" className="text-xs text-copper hover:underline font-semibold block mt-0.5">
                  Link Payout Account →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Escrow & Settlement Workflow Radar */}
      <Surface kind="elevated" className="p-6 space-y-4">
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
          <div className="p-4 bg-ink/[0.03] border border-ink/10 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-copper font-bold uppercase">Phase 1</span>
              <ShieldCheckIcon size={14} className="text-copper" />
            </div>
            <div className="text-xs font-semibold text-ink">Buyer Escrow Funded</div>
            <p className="text-[11px] text-ink-4 leading-relaxed">
              Wholesale buyer funds are secured in escrow as soon as a purchase order is accepted.
            </p>
          </div>

          <div className="p-4 bg-ink/[0.03] border border-ink/10 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-copper font-bold uppercase">Phase 2</span>
              <CheckCircle2Icon size={14} className="text-mint" />
            </div>
            <div className="text-xs font-semibold text-ink">Delivery Sign-off (eGRN)</div>
            <p className="text-[11px] text-ink-4 leading-relaxed">
              Upon freight arrival at buyer dock, goods are verified and escrow is released to Available Balance.
            </p>
          </div>

          <div className="p-4 bg-ink/[0.03] border border-ink/10 rounded-xl space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-copper font-bold uppercase">Phase 3</span>
              <BanknoteIcon size={14} className="text-mint" />
            </div>
            <div className="text-xs font-semibold text-ink">Automated Bank Sweep</div>
            <p className="text-[11px] text-ink-4 leading-relaxed">
              Net balance is transferred directly into your linked corporate bank account via SLIPS / CEFT.
            </p>
          </div>
        </div>
      </Surface>

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 p-1 bg-ink/[0.05] rounded-full max-w-full overflow-x-auto scrollbar-none">
        {[
          { id: 'payments', label: `Order Settlements`, count: list.length, icon: CreditCardIcon },
          { id: 'payouts', label: `Bank Payout Batches`, count: payoutList.length, icon: BanknoteIcon },
          { id: 'statement', label: 'Running Account Statement', count: null, icon: FileTextIcon },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as Tab)}
              className={`flex items-center gap-2 h-9 px-4 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-ink text-paper shadow-sm'
                  : 'text-ink-3 hover:text-ink'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-volt' : 'text-ink-4'} />
              {t.label}
              {t.count !== null && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  isActive ? 'bg-volt/25 text-volt' : 'bg-ink/[0.06] text-ink-4'
                }`}>
                  {t.count}
                </span>
              )}
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
                <div className="inline-flex items-center gap-1 p-1 bg-ink/[0.05] rounded-full max-w-full overflow-x-auto scrollbar-none">
                  {['all', 'pending', 'confirmed', 'failed', 'refunded'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={
                        'h-8 px-3.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer capitalize ' +
                        (s === status
                          ? 'bg-ink text-paper shadow-sm'
                          : 'text-ink-3 hover:text-ink')
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
                <Surface kind="elevated" className="overflow-hidden p-8 sm:p-12 text-center">
                  <div className="max-w-xl mx-auto space-y-6 py-2">
                    <div className="size-14 rounded-xl bg-volt/20 text-volt-deep mx-auto flex items-center justify-center shadow-xs">
                      <CreditCardIcon size={24} />
                    </div>

                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-mint/15 border border-mint/30 text-ink font-mono text-[11px] font-semibold">
                        <span className="size-1.5 rounded-full bg-mint animate-pulse" />
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
                      <div className="p-4 bg-amber/10 border border-amber/30 rounded-xl text-left flex items-start gap-3">
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
                <Surface kind="elevated" className="overflow-hidden p-12 text-center space-y-2">
                  <SearchIcon size={32} className="mx-auto text-ink-4 opacity-50" />
                  <p className="text-sm font-semibold text-ink">No settlements match "{searchQuery}"</p>
                  <p className="text-xs text-ink-4">Try clearing the search query or adjusting filters.</p>
                  <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="mt-2 text-xs">
                    Clear Search
                  </Button>
                </Surface>
              ) : (
                <Surface kind="elevated" className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-bone/60 text-ink-4 text-[10px] font-mono uppercase tracking-[0.14em] border-b border-ink/10">
                        <tr>
                          <th className="text-left px-5 py-3.5 font-bold">Payment ID</th>
                          <th className="text-left px-4 py-3.5 font-bold">Channel</th>
                          <th className="text-right px-4 py-3.5 font-bold">Gross Total</th>
                          <th className="text-right px-4 py-3.5 font-bold">Platform Fee</th>
                          <th className="text-right px-4 py-3.5 font-bold">Net Remittance</th>
                          <th className="text-left px-4 py-3.5 font-bold">Escrow Status</th>
                          <th className="text-right px-4 py-3.5 font-bold">Timestamp</th>
                          <th className="text-right px-5 py-3.5 font-bold">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink/5">
                        {filteredPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-bone/40 transition-colors">
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
        <Surface kind="elevated" className="overflow-hidden">
          {payouts.isLoading ? (
            <div className="p-6"><div className="h-40 vyro-surface animate-pulse" /></div>
          ) : payouts.isError ? (
            <div className="p-6">
              <SupplierErrorState
                message="Could not load payouts."
                onRetry={() => void payouts.refetch()}
              />
            </div>
          ) : payoutList.length === 0 ? (
            <div className="p-12 text-center text-ink-4 space-y-4 max-w-lg mx-auto">
              <div className="size-14 rounded-xl bg-ink/[0.05] flex items-center justify-center mx-auto text-ink-4">
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
                <thead className="bg-bone/60 text-ink-4 text-[10px] font-mono uppercase tracking-[0.14em] border-b border-ink/10">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-bold">Billing Period</th>
                    <th className="text-left px-4 py-3.5 font-bold">Disbursement Method</th>
                    <th className="text-right px-4 py-3.5 font-bold">Net Remittance</th>
                    <th className="text-left px-4 py-3.5 font-bold">Payout Status</th>
                    <th className="text-right px-5 py-3.5 font-bold">Settlement Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {payoutList.map((p) => (
                    <tr key={p.id} className="hover:bg-bone/40 transition-colors">
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
        <Surface kind="elevated" className="overflow-hidden">
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
                    toast.error(err instanceof Error ? err.message : 'Could not export statement.');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-ink/20 bg-paper text-ink hover:bg-ink hover:text-paper transition-colors rounded-lg shadow-xs shrink-0"
              >
                <DownloadIcon size={13} />
                Export Statement (CSV)
              </a>
            </div>
          )}

          {statement.isLoading ? (
            <div className="p-6"><div className="h-40 vyro-surface animate-pulse" /></div>
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
                <thead className="bg-bone/60 text-ink-4 text-[10px] font-mono uppercase tracking-[0.14em] border-b border-ink/10">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-bold">Timestamp</th>
                    <th className="text-left px-4 py-3.5 font-bold">Description</th>
                    <th className="text-right px-4 py-3.5 font-bold">Debit (−)</th>
                    <th className="text-right px-4 py-3.5 font-bold">Credit (+)</th>
                    <th className="text-right px-5 py-3.5 font-bold">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {statement.data.entries.map((e) => (
                    <tr key={e.id} className="hover:bg-bone/40 transition-colors">
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
                      <td className="px-4 py-4 text-right vyro-metric text-xs text-mint font-medium">
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
