import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import {
  PageHeader,
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Select,
  Label,
  Badge,
} from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { Money, Stat, StatusPill, time, useBusinessId, useConfirm } from '@/accounts/shared';
import {
  BanknoteIcon,
  CreditCardIcon,
  FileTextIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  ArrowRightIcon,
  SearchIcon,
  SparklesIcon,
  CheckCircle2Icon,
  ClockIcon,
  ChevronRightIcon,
} from '@/components/icons';
import { cn } from '@vyro/ui';

type Tab = 'overview' | 'payments' | 'invoices' | 'refunds' | 'transactions';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <TrendingUpIcon size={12} /> },
  { id: 'payments', label: 'Payments', icon: <CreditCardIcon size={12} /> },
  { id: 'invoices', label: 'Invoices', icon: <FileTextIcon size={12} /> },
  { id: 'refunds', label: 'Refunds', icon: <RefreshCwIcon size={12} /> },
  { id: 'transactions', label: 'Transactions', icon: <BanknoteIcon size={12} /> },
];

const METHOD_META: Record<string, { label: string; tone: 'volt' | 'copper' | 'mint' | 'amber' }> = {
  online: { label: 'PayHere Online', tone: 'volt' },
  payhere: { label: 'PayHere Online', tone: 'volt' },
  card: { label: 'Card', tone: 'volt' },
  bank_transfer: { label: 'Bank Transfer', tone: 'copper' },
  bank: { label: 'Bank Transfer', tone: 'copper' },
  wire: { label: 'Bank Wire', tone: 'copper' },
  cash: { label: 'Cash on Delivery', tone: 'mint' },
  cod: { label: 'Cash on Delivery', tone: 'mint' },
  escrow: { label: 'Escrow', tone: 'amber' },
};

function methodTone(method: string): 'volt' | 'copper' | 'mint' | 'amber' | 'ink' {
  return METHOD_META[method.toLowerCase()]?.tone ?? 'ink';
}

function methodLabel(method: string): string {
  return METHOD_META[method.toLowerCase()]?.label ?? method.replace(/_/g, ' ');
}

export function AccountsPage() {
  const businessId = useBusinessId();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'overview';
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p);
  };

  if (!businessId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          title="No business workspace"
          description="Join or create a business to see your accounts."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 space-y-8">
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Business</span>
            <span className="size-1.5 rounded-full bg-copper animate-pulse" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-copper border border-copper/30 bg-copper/10 px-2 py-0.5">
              Vyro Escrow Protected
            </span>
          </div>
        }
        title="Accounts"
        sub="What you paid, how you paid, what's pending, and what was refunded — across every supplier PO."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to="/orders">
              <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-semibold">
                <FileTextIcon size={14} />
                <span>View orders</span>
              </Button>
            </Link>
            <Link to="/ask">
              <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-semibold bg-paper">
                <SparklesIcon size={14} className="text-copper" />
                <span>Ask finance AI</span>
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'h-8 px-3 text-xs font-mono tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5',
                  active
                    ? 'bg-ink text-volt font-bold shadow-sm'
                    : 'bg-paper text-ink-3 border border-ink/15 hover:border-ink hover:text-ink',
                )}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {tab === 'overview' && <Overview businessId={businessId} />}
        {tab === 'payments' && <Payments businessId={businessId} />}
        {tab === 'invoices' && <Invoices businessId={businessId} />}
        {tab === 'refunds' && <Refunds businessId={businessId} />}
        {tab === 'transactions' && <Transactions businessId={businessId} />}
      </div>
    </div>
  );
}

function Overview({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-overview', businessId],
    queryFn: () =>
      api.get<{
        totalSpendCents: number;
        paidCents: number;
        pendingCents: number;
        refundedCents: number;
        outstandingCents: number;
        byMethod: Array<{ method: string; cents: number; count: number }>;
        recentPayments: Array<{
          id: string;
          amountCents: number;
          method: string;
          status: string;
          purchaseOrderId: string;
          createdAt: number;
        }>;
      }>(`/finance/business/overview?businessId=${businessId}`),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-mist" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-48 bg-mist" />
          <div className="h-48 bg-mist" />
        </div>
      </div>
    );
  }
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const d = q.data!;
  const totalByMethod = d.byMethod.reduce((sum, m) => sum + m.cents, 0);

  return (
    <div className="space-y-6">
      {/* 5 KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile
          label="Total spend"
          cents={d.totalSpendCents}
          sub="Lifetime across all POs"
          accent="ink"
          icon={<BanknoteIcon size={16} />}
        />
        <KpiTile
          label="Paid"
          cents={d.paidCents}
          sub="Cleared through escrow"
          accent="mint"
          icon={<CheckCircle2Icon size={16} />}
        />
        <KpiTile
          label="Pending"
          cents={d.pendingCents}
          sub="Awaiting settlement"
          accent="amber"
          icon={<ClockIcon size={16} />}
        />
        <KpiTile
          label="Refunded"
          cents={d.refundedCents}
          sub="Returned to your account"
          accent="copper"
          icon={<RefreshCwIcon size={16} />}
        />
        <KpiTile
          label="Outstanding"
          cents={d.outstandingCents}
          sub="Due on open POs"
          accent="rose"
          icon={<CreditCardIcon size={16} />}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Payment method breakdown */}
        <Surface className="lg:col-span-7 p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-ink text-volt flex items-center justify-center">
                <CreditCardIcon size={15} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-1 leading-tight">By payment method</h3>
                <p className="text-[11px] text-ink-4 mt-0.5">Cumulative volume per method</p>
              </div>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4 font-bold">
              {d.byMethod.length} methods
            </span>
          </div>
          <div className="p-6">
            {d.byMethod.length === 0 ? (
              <EmptyState
                icon={<CreditCardIcon size={22} />}
                title="No payments yet"
                description="Once you settle a PO, your payment method mix shows up here."
              />
            ) : (
              <ul className="space-y-3">
                {d.byMethod
                  .slice()
                  .sort((a, b) => b.cents - a.cents)
                  .map((m) => {
                    const pct = totalByMethod > 0 ? Math.min(100, (m.cents / totalByMethod) * 100) : 0;
                    const tone = methodTone(m.method);
                    const barColor =
                      tone === 'volt'
                        ? 'bg-volt'
                        : tone === 'copper'
                        ? 'bg-copper'
                        : tone === 'mint'
                        ? 'bg-mint'
                        : tone === 'amber'
                        ? 'bg-amber'
                        : 'bg-ink-4';
                    return (
                      <li key={m.method}>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                'size-2 rounded-full shrink-0',
                                tone === 'volt' && 'bg-volt',
                                tone === 'copper' && 'bg-copper',
                                tone === 'mint' && 'bg-mint',
                                tone === 'amber' && 'bg-amber',
                                tone === 'ink' && 'bg-ink-4',
                              )}
                            />
                            <span className="font-semibold text-ink-1 truncate">
                              {methodLabel(m.method)}
                            </span>
                            <span className="text-ink-4 font-mono">× {m.count}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-semibold text-ink-1">
                              <Money cents={m.cents} />
                            </span>
                            <span className="font-mono text-[10px] text-ink-4 w-10 text-right">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-bone overflow-hidden">
                          <div
                            className={cn('h-full transition-all duration-300', barColor)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        </Surface>

        {/* Recent payments */}
        <Surface className="lg:col-span-5 p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-copper/10 text-copper flex items-center justify-center">
                <CreditCardIcon size={15} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-1 leading-tight">Recent payments</h3>
                <p className="text-[11px] text-ink-4 mt-0.5">Latest 5 settled transactions</p>
              </div>
            </div>
            <RecentPaymentsTabSwitcher />
          </div>
          <div className="p-6">
            {d.recentPayments.length === 0 ? (
              <EmptyState
                icon={<CreditCardIcon size={22} />}
                title="No payments yet"
                description="Settled payments and escrow releases will show up here."
              />
            ) : (
              <ul className="space-y-2">
                {d.recentPayments.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/accounts/payments/${p.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 hover:bg-bone/40 transition-colors group border border-transparent hover:border-ink/10"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusPill status={p.status} />
                          <span className="text-[11px] text-ink-4 capitalize">
                            {methodLabel(p.method)}
                          </span>
                        </div>
                        <div className="text-[10px] text-ink-4 mt-0.5 font-mono">
                          {time(p.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-semibold text-ink-1 text-sm">
                          <Money cents={p.amountCents} />
                        </span>
                        <ChevronRightIcon
                          size={12}
                          className="text-ink-4 group-hover:text-copper group-hover:translate-x-0.5 transition-all"
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>
      </div>

      {/* Footer trust strip */}
      <div className="p-4 bg-paper border border-ink/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="size-9 rounded-lg bg-mint/15 text-mint flex items-center justify-center shrink-0">
            <ShieldCheckIcon size={18} />
          </div>
          <div>
            <div className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold">
              Escrow-protected settlement
            </div>
            <p className="text-xs text-ink-3 leading-relaxed">
              Every PayHere / bank transfer payment is held in licensed escrow until GRN or order completion. Refunds settle within 1–2 business days.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-ink-3 shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-mint animate-pulse" />
            Finance API live
          </span>
        </div>
      </div>
    </div>
  );
}

function Payments({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const q = useQuery({
    queryKey: ['accounts', 'business-payments', businessId, status, method],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          paymentNumber: string | null;
          amountCents: number;
          method: string;
          status: string;
          purchaseOrderId: string;
          createdAt: number;
        }>;
      }>(`/finance/business/payments?businessId=${businessId}${status ? `&status=${status}` : ''}${method ? `&method=${method}` : ''}`),
  });

  const items = useMemo(() => {
    const list = q.data?.items ?? [];
    if (!search.trim()) return list;
    const s = search.toLowerCase();
    return list.filter(
      (p) =>
        (p.paymentNumber ?? p.id).toLowerCase().includes(s) ||
        p.method.toLowerCase().includes(s) ||
        p.purchaseOrderId.toLowerCase().includes(s),
    );
  }, [q.data, search]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Surface className="p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
            />
            <Input
              placeholder="Search by reference, method or PO ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-paper"
            />
          </div>
          <div className="grid grid-cols-2 md:flex gap-2 md:items-end">
            <div className="w-full md:w-44">
              <Label className="sr-only">Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-paper">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Paid</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded">Refunded</option>
              </Select>
            </div>
            <div className="w-full md:w-44">
              <Label className="sr-only">Method</Label>
              <Select value={method} onChange={(e) => setMethod(e.target.value)} className="bg-paper">
                <option value="">All methods</option>
                <option value="online">PayHere</option>
                <option value="cash">Cash on delivery</option>
                <option value="bank_transfer">Bank transfer</option>
              </Select>
            </div>
          </div>
        </div>
      </Surface>

      {q.isLoading && <div className="text-sm text-ink-4">Loading payments…</div>}
      {q.isError && <ErrorBanner message={(q.error as ApiError).message} />}

      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-paper shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[10px] font-mono uppercase tracking-[0.14em] text-ink-3 bg-bone/40 font-bold">
              <th className="px-6 py-3.5">Reference</th>
              <th className="px-6 py-3.5">Method</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Amount</th>
              <th className="px-6 py-3.5">Date</th>
              <th className="px-6 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-bone/40 transition-colors group">
                <td className="px-6 py-4">
                  <Link
                    to={`/accounts/payments/${p.id}`}
                    className="font-mono text-xs font-bold text-ink-1 group-hover:text-copper transition-colors"
                  >
                    {p.paymentNumber ?? p.id.slice(0, 12)}
                  </Link>
                  <div className="text-[10px] text-ink-4 font-mono mt-0.5">
                    PO {p.purchaseOrderId.slice(0, 8)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                    <span
                      className={cn(
                        'size-1.5 rounded-full',
                        methodTone(p.method) === 'volt' && 'bg-volt',
                        methodTone(p.method) === 'copper' && 'bg-copper',
                        methodTone(p.method) === 'mint' && 'bg-mint',
                        methodTone(p.method) === 'amber' && 'bg-amber',
                        methodTone(p.method) === 'ink' && 'bg-ink-4',
                      )}
                    />
                    {methodLabel(p.method)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <StatusPill status={p.status} />
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="font-mono font-semibold text-ink-1 text-sm">
                    <Money cents={p.amountCents} />
                  </span>
                </td>
                <td className="px-6 py-4 text-xs font-mono text-ink-3">{time(p.createdAt)}</td>
                <td className="px-6 py-4 text-right">
                  <Link
                    to={`/accounts/payments/${p.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-copper transition-colors px-2.5 py-1 bg-bone border border-ink/10 hover:border-ink"
                  >
                    <span>View</span>
                    <ArrowRightIcon size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && !q.isLoading && (
          <div className="p-6">
            <EmptyState
              title="No payments match"
              description="Try adjusting the filters, or settle a PO to see payments here."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Invoices({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-invoices', businessId],
    queryFn: () =>
      api.get<{
        invoices: Array<{
          id: string;
          number: string;
          type: string;
          totalCents: number;
          purchaseOrderId: string;
          issuedAt: number;
          paymentId: string | null;
        }>;
      }>(`/finance/business/invoices?businessId=${businessId}`),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading invoices…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const invoices = q.data?.invoices ?? [];

  const totalInvoiced = invoices.reduce((s, i) => s + i.totalCents, 0);
  const paidInvoices = invoices.filter((i) => i.paymentId).length;

  return (
    <div className="space-y-4">
      {/* Mini stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiTile
          label="Invoices issued"
          cents={totalInvoiced}
          sub={`${invoices.length} total`}
          accent="ink"
          icon={<FileTextIcon size={16} />}
        />
        <KpiTile
          label="Linked to payment"
          value={paidInvoices}
          sub={`${invoices.length - paidInvoices} pending link`}
          accent="mint"
          icon={<CheckCircle2Icon size={16} />}
        />
        <KpiTile
          label="Avg. invoice value"
          cents={invoices.length > 0 ? Math.round(totalInvoiced / invoices.length) : 0}
          sub="Across all POs"
          accent="copper"
          icon={<TrendingUpIcon size={16} />}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-paper shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[10px] font-mono uppercase tracking-[0.14em] text-ink-3 bg-bone/40 font-bold">
              <th className="px-6 py-3.5">Invoice</th>
              <th className="px-6 py-3.5">Type</th>
              <th className="px-6 py-3.5 text-right">Total</th>
              <th className="px-6 py-3.5">Issued</th>
              <th className="px-6 py-3.5 text-center">Status</th>
              <th className="px-6 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-bone/40 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-mono text-xs font-bold text-ink-1">{inv.number}</div>
                  <div className="text-[10px] text-ink-4 font-mono mt-0.5">
                    PO {inv.purchaseOrderId.slice(0, 8)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-bone border border-ink/10 text-ink-2">
                    {inv.type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="font-mono font-semibold text-ink-1 text-sm">
                    <Money cents={inv.totalCents} />
                  </span>
                </td>
                <td className="px-6 py-4 text-xs font-mono text-ink-3">{time(inv.issuedAt)}</td>
                <td className="px-6 py-4 text-center">
                  {inv.paymentId ? (
                    <Badge variant="success">Linked</Badge>
                  ) : (
                    <Badge variant="warning">Unlinked</Badge>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Link
                    to={`/invoices/${inv.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-copper transition-colors px-2.5 py-1 bg-bone border border-ink/10 hover:border-ink"
                  >
                    <span>Open</span>
                    <ArrowRightIcon size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && (
          <div className="p-6">
            <EmptyState
              icon={<FileTextIcon size={22} />}
              title="No invoices yet"
              description="Invoices are issued automatically when payments complete."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Refunds({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-refunds', businessId],
    queryFn: () =>
      api.get<{
        refunds: Array<{
          id: string;
          refundNumber: string | null;
          paymentId: string;
          amountCents: number;
          status: string;
          reason: string | null;
          createdAt: number;
        }>;
      }>(`/finance/business/refunds?businessId=${businessId}`),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading refunds…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const refunds = q.data?.refunds ?? [];
  const totalRefunded = refunds.reduce((s, r) => s + r.amountCents, 0);
  const pendingCount = refunds.filter((r) => ['pending', 'requested'].includes(r.status)).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiTile
          label="Total refunded"
          cents={totalRefunded}
          sub={`${refunds.length} refund${refunds.length === 1 ? '' : 's'}`}
          accent="copper"
          icon={<RefreshCwIcon size={16} />}
        />
        <KpiTile
          label="Pending review"
          value={pendingCount}
          sub="Awaiting finance team"
          accent="amber"
          icon={<ClockIcon size={16} />}
        />
        <KpiTile
          label="Settled refunds"
          value={refunds.length - pendingCount}
          sub="Returned to account"
          accent="mint"
          icon={<CheckCircle2Icon size={16} />}
        />
      </div>

      {refunds.length === 0 ? (
        <EmptyState
          icon={<RefreshCwIcon size={22} />}
          title="No refunds"
          description="Refund requests and their outcomes will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {refunds.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3 hover:border-ink/30 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-ink-1">
                    {r.refundNumber ?? r.id.slice(0, 12)}
                  </span>
                  <StatusPill status={r.status} />
                </div>
                <div className="text-xs text-ink-4 mt-1">
                  {r.reason ?? 'No reason given'} · {time(r.createdAt)}
                </div>
              </div>
              <span className="font-mono font-semibold text-ink-1 text-sm">
                <Money cents={r.amountCents} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Transactions({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-transactions', businessId],
    queryFn: () =>
      api.get<{
        transactions: Array<{
          id: string;
          direction: string;
          amountCents: number;
          refType: string;
          refId: string;
          category: string | null;
          description: string;
          createdAt: number;
        }>;
      }>(`/finance/business/transactions?businessId=${businessId}`),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading transactions…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const transactions = q.data?.transactions ?? [];
  const totalCredit = transactions
    .filter((t) => t.direction === 'credit')
    .reduce((s, t) => s + t.amountCents, 0);
  const totalDebit = transactions
    .filter((t) => t.direction === 'debit')
    .reduce((s, t) => s + t.amountCents, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiTile
          label="Total credits"
          cents={totalCredit}
          sub="Refunds, returns, adjustments"
          accent="mint"
          icon={<ArrowRightIcon size={16} className="rotate-45" />}
        />
        <KpiTile
          label="Total debits"
          cents={totalDebit}
          sub="Settlements, fees"
          accent="rose"
          icon={<ArrowRightIcon size={16} className="-rotate-45" />}
        />
        <KpiTile
          label="Net movement"
          cents={totalCredit - totalDebit}
          sub="Credit − debit"
          accent={totalCredit - totalDebit >= 0 ? 'mint' : 'rose'}
          icon={<TrendingUpIcon size={16} />}
        />
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon={<BanknoteIcon size={22} />}
          title="No transactions"
          description="Your financial ledger entries will appear here."
        />
      ) : (
        <ul className="space-y-2">
          {transactions.map((t) => {
            const isCredit = t.direction === 'credit';
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3 hover:border-ink/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'size-8 rounded-lg flex items-center justify-center shrink-0',
                      isCredit ? 'bg-mint/15 text-mint' : 'bg-rose/15 text-rose',
                    )}
                  >
                    <ArrowRightIcon
                      size={15}
                      className={isCredit ? 'rotate-45' : '-rotate-45'}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-1 truncate">{t.description}</div>
                    <div className="text-[11px] text-ink-4 mt-0.5 font-mono">
                      {t.category ?? t.refType} · {time(t.createdAt)}
                    </div>
                  </div>
                </div>
                <span
                  className={cn(
                    'font-mono font-semibold text-sm',
                    isCredit ? 'text-mint' : 'text-rose',
                  )}
                >
                  {isCredit ? '+' : '−'}
                  <Money cents={t.amountCents} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function RequestRefundButton({ paymentId, maxCents }: { paymentId: string; maxCents: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          ask({
            title: 'Request refund',
            confirmLabel: 'Submit request',
            body: (
              <div className="space-y-3">
                <p className="text-sm text-ink-3">
                  This sends a refund request to VYRO finance for approval. Money moves only after
                  approval.
                </p>
                <div>
                  <Label>Amount (cents, max {maxCents})</Label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={String(maxCents)}
                    inputMode="numeric"
                    className="bg-paper font-mono"
                  />
                </div>
                <div>
                  <Label>Reason</Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Damaged goods…"
                    className="bg-paper"
                  />
                </div>
              </div>
            ),
            action: async () => {
              const amountCents = amount ? Number(amount) : undefined;
              await api.post(`/finance/payments/${paymentId}/refunds`, { amountCents, reason });
              toast.success('Refund requested');
              void qc.invalidateQueries({ queryKey: ['accounts'] });
            },
          })
        }
      >
        Request refund
      </Button>
      {dialog}
    </>
  );
}

/* ---------- Local helpers ---------- */

function RecentPaymentsTabSwitcher() {
  // Lightweight inline "see all" link that mirrors the existing nav semantics
  return (
    <Link
      to="/accounts?tab=payments"
      className="text-[10px] font-mono uppercase tracking-wider text-copper hover:underline inline-flex items-center gap-1"
    >
      See all
      <ChevronRightIcon size={10} />
    </Link>
  );
}

function KpiTile({
  label,
  cents,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  cents?: number;
  value?: number;
  sub: string;
  accent: 'mint' | 'amber' | 'rose' | 'volt' | 'copper' | 'ink';
  icon: React.ReactNode;
}) {
  const accentText = {
    volt: 'text-volt-deep',
    mint: 'text-mint',
    amber: 'text-amber',
    rose: 'text-rose',
    copper: 'text-copper-deep',
    ink: 'text-ink',
  }[accent];
  const accentBg = {
    volt: 'bg-volt/15 text-volt-deep',
    mint: 'bg-mint/15 text-mint',
    amber: 'bg-amber/15 text-amber',
    rose: 'bg-rose/15 text-rose',
    copper: 'bg-copper/15 text-copper-deep',
    ink: 'bg-ink/10 text-ink',
  }[accent];
  const display = value !== undefined ? value : <Money cents={cents ?? 0} />;
  return (
    <div className="p-4 bg-paper border border-ink/10 hover:border-ink/20 transition-colors shadow-sm space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 font-bold">
          {label}
        </div>
        <div className={cn('size-7 flex items-center justify-center', accentBg)}>{icon}</div>
      </div>
      <div className={cn('font-mono text-xl sm:text-2xl font-bold', accentText)}>{display}</div>
      <div className="text-[10px] text-ink-4">{sub}</div>
    </div>
  );
}
