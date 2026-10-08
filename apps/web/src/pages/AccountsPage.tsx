import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Button,
  EmptyState,
  ErrorBanner,
  Input,
  Select,
  Label,
  Badge,
} from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { PageHero, HeroStatusPill, heroActionClass } from '@/components/brand/PageHero';
import { SavedCardsPanel } from '@/components/payments/SavedCardsPanel';
import { useToast } from '@vyro/ui';
import { Money, StatusPill, time, useBusinessId, useConfirm } from '@/accounts/shared';
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
import { invoiceTypeLabel } from '@/lib/orderLifecycle';
import { formatLKR } from '@/lib/format';
import { Amount } from '@/components/brand/Amount';

type Tab = 'overview' | 'payments' | 'invoices' | 'refunds' | 'transactions' | 'credit';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: 'Overview', icon: <TrendingUpIcon size={12} /> },
  { id: 'payments', label: 'Payments', icon: <CreditCardIcon size={12} /> },
  { id: 'invoices', label: 'Invoices', icon: <FileTextIcon size={12} /> },
  { id: 'refunds', label: 'Refunds', icon: <RefreshCwIcon size={12} /> },
  { id: 'transactions', label: 'Transactions', icon: <BanknoteIcon size={12} /> },
  { id: 'credit', label: 'Credit', icon: <CreditCardIcon size={12} /> },
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

function methodTone(method: string): Tone {
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
    <div className="mx-auto max-w-7xl px-4 pb-16 space-y-6">
      <PageHero
        icon={BanknoteIcon}
        kicker="Business · Settlement Desk"
        title="Accounts"
        description="What you paid, how you paid, what's pending, and what was refunded — across every supplier PO."
        status={<HeroStatusPill label="Vyro Escrow Protected" tone="mint" />}
        actions={
          <>
            <Link to="/orders" className={heroActionClass}>
              <FileTextIcon size={13} />
              View orders
            </Link>
            <Link to="/ask" className={heroActionClass}>
              <SparklesIcon size={13} className="text-copper" />
              Ask finance AI
            </Link>
          </>
        }
        footer={
          <>
            <span>Funds release to suppliers only after GRN confirmation</span>
          </>
        }
      />

      <div className="sticky top-[65px] z-20 -mx-4 px-4 py-3 bg-bone/85 backdrop-blur-md border-b border-ink/[0.08] flex items-center justify-between gap-4">
        <nav
          role="tablist"
          aria-label="Accounts sections"
          className="inline-flex items-center gap-0.5 p-1 rounded-full bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)] max-w-full overflow-x-auto scrollbar-none"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  'h-9 px-4 rounded-full text-[13px] font-medium transition-all duration-200 whitespace-nowrap cursor-pointer flex items-center gap-2',
                  active
                    ? 'bg-ink text-paper shadow-[0_6px_16px_-8px_rgba(12,14,11,0.6)]'
                    : 'text-ink-4 hover:text-ink hover:bg-ink/[0.04]',
                )}
              >
                <span className={cn('transition-colors', active ? 'text-volt' : 'text-ink-5')}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="hidden lg:flex items-center gap-2 text-[11px] text-ink-4 shrink-0">
          <span className="relative flex size-2">
            <span className="absolute inset-0 rounded-full bg-mint/60 animate-ping" />
            <span className="relative size-2 rounded-full bg-mint" />
          </span>
          Live ledger · LKR
        </div>
      </div>

      <div>
        {tab === 'overview' && <Overview businessId={businessId} />}
        {tab === 'payments' && <Payments businessId={businessId} />}
        {tab === 'invoices' && <Invoices businessId={businessId} />}
        {tab === 'refunds' && <Refunds businessId={businessId} />}
        {tab === 'transactions' && <Transactions businessId={businessId} />}
        {tab === 'credit' && <CreditPanel businessId={businessId} />}
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
      <div className="space-y-5 animate-pulse">
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-8 h-[260px] vyro-surface rounded-2xl" />
          <div className="lg:col-span-4 h-[260px] rounded-2xl bg-ink/80" />
        </div>
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-7 h-64 vyro-surface rounded-2xl" />
          <div className="lg:col-span-5 h-64 vyro-surface rounded-2xl" />
        </div>
      </div>
    );
  }
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const d = q.data!;
  const totalByMethod = d.byMethod.reduce((sum, m) => sum + m.cents, 0);
  const methods = d.byMethod.slice().sort((a, b) => b.cents - a.cents);

  const segments = [
    { key: 'paid', label: 'Paid', sub: 'Cleared through escrow', cents: d.paidCents, dot: 'bg-mint', text: 'text-mint', icon: <CheckCircle2Icon size={14} /> },
    { key: 'pending', label: 'Pending', sub: 'Awaiting settlement', cents: d.pendingCents, dot: 'bg-amber', text: 'text-amber', icon: <ClockIcon size={14} /> },
    { key: 'refunded', label: 'Refunded', sub: 'Returned to you', cents: d.refundedCents, dot: 'bg-copper', text: 'text-copper-deep', icon: <RefreshCwIcon size={14} /> },
    { key: 'outstanding', label: 'Outstanding', sub: 'Due on open POs', cents: d.outstandingCents, dot: 'bg-rose', text: 'text-rose', icon: <CreditCardIcon size={14} /> },
  ];
  const segmentTotal = segments.reduce((s, x) => s + Math.max(0, x.cents), 0);
  const settledPct = d.totalSpendCents > 0 ? Math.min(100, (d.paidCents / d.totalSpendCents) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Settlement position */}
        <Surface className="lg:col-span-8 rounded-2xl p-0">
          <div className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Eyebrow>Total spend · lifetime</Eyebrow>
                <div className="mt-3 text-[40px] sm:text-[52px] leading-none font-semibold tracking-[-0.035em] text-ink">
                  <Amount cents={d.totalSpendCents} />
                </div>
                <p className="mt-3 text-[13px] text-ink-4">
                  Across every supplier PO ·{' '}
                  <span className="text-ink-2 font-medium tabular-nums">{settledPct.toFixed(0)}%</span> settled
                </p>
              </div>
              <div className="hidden sm:flex size-11 rounded-xl bg-ink text-volt items-center justify-center shrink-0 shadow-[0_10px_24px_-12px_rgba(12,14,11,0.7)]">
                <BanknoteIcon size={18} />
              </div>
            </div>

            {/* Composition bar */}
            <div className="mt-7">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.06] gap-[2px]">
                {segmentTotal > 0 &&
                  segments
                    .filter((s) => s.cents > 0)
                    .map((s) => (
                      <div
                        key={s.key}
                        title={`${s.label}: ${formatLKR(s.cents)}`}
                        className={cn('h-full first:rounded-l-full last:rounded-r-full transition-all duration-500', s.dot)}
                        style={{ width: `${(s.cents / segmentTotal) * 100}%` }}
                      />
                    ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink/[0.08] border-t border-ink/[0.08]">
            {segments.map((s) => {
              const zero = s.cents === 0;
              const pct = segmentTotal > 0 ? (s.cents / segmentTotal) * 100 : 0;
              return (
                <div key={s.key} className="bg-paper px-5 sm:px-6 py-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[12px] font-medium text-ink-3">
                      <span className={cn('size-2 rounded-full', zero ? 'bg-ink/15' : s.dot)} />
                      {s.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-ink-5">{pct.toFixed(0)}%</span>
                  </div>
                  <div
                    className={cn(
                      'mt-2 text-[19px] sm:text-[21px] leading-tight font-semibold tracking-[-0.02em]',
                      zero ? 'text-ink-5' : 'text-ink',
                    )}
                  >
                    <Amount cents={s.cents} />
                  </div>
                  <div className="mt-1 text-[11px] text-ink-4">{s.sub}</div>
                </div>
              );
            })}
          </div>
        </Surface>

        {/* Amount due */}
        <div className="lg:col-span-4 relative overflow-hidden rounded-2xl bg-ink text-paper p-6 sm:p-7 flex flex-col">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-volt/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(250,247,240,1)_1px,transparent_1px),linear-gradient(90deg,rgba(250,247,240,1)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
          />
          <div className="relative flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-paper/50">Amount due</span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider',
                d.outstandingCents > 0 ? 'bg-rose/20 text-[#F0A396]' : 'bg-mint/20 text-[#8FD3B6]',
              )}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {d.outstandingCents > 0 ? 'Action needed' : 'All clear'}
            </span>
          </div>
          <div className="relative mt-5 text-[36px] sm:text-[40px] leading-none font-semibold tracking-[-0.035em] text-paper">
            <Amount cents={d.outstandingCents} tone="dark" />
          </div>
          <p className="relative mt-3 text-[13px] leading-relaxed text-paper/55">
            {d.outstandingCents > 0
              ? 'Open on supplier POs. Pay now — funds stay in escrow until you confirm GRN.'
              : 'Nothing outstanding. Every open PO is fully funded.'}
          </p>
          <div className="relative mt-auto pt-6 flex flex-col gap-2">
            <Link
              to="/orders"
              className="group inline-flex h-11 items-center justify-between rounded-xl bg-volt px-4 text-sm font-semibold text-ink transition-all hover:bg-volt-glow hover:-translate-y-px"
            >
              {d.outstandingCents > 0 ? 'Settle open POs' : 'View purchase orders'}
              <ArrowRightIcon size={15} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <div className="flex items-center gap-2 text-[11px] text-paper/45">
              <ShieldCheckIcon size={12} className="text-volt/80" />
              Escrow-protected · released only after GRN
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Payment method breakdown */}
        <Surface className="lg:col-span-7 rounded-2xl p-0 flex flex-col">
          <PanelHeader
            icon={<CreditCardIcon size={15} />}
            title="By payment method"
            subtitle="Cumulative volume per method"
            meta={`${methods.length} ${methods.length === 1 ? 'method' : 'methods'}`}
          />
          <div className="p-6 flex-1">
            {methods.length === 0 ? (
              <PanelEmpty
                icon={<CreditCardIcon size={18} />}
                title="No payments yet"
                description="Once you settle a PO, your payment method mix shows up here."
              />
            ) : (
              <div className="space-y-6">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink/[0.06] gap-[2px]">
                  {methods.map((m) => (
                    <div
                      key={m.method}
                      className={cn('h-full transition-all duration-500', TONE_BG[methodTone(m.method)])}
                      style={{ width: `${totalByMethod > 0 ? (m.cents / totalByMethod) * 100 : 0}%` }}
                    />
                  ))}
                </div>
                <ul className="divide-y divide-ink/[0.06]">
                  {methods.map((m) => {
                    const pct = totalByMethod > 0 ? Math.min(100, (m.cents / totalByMethod) * 100) : 0;
                    return (
                      <li key={m.method} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={cn('size-2.5 rounded-[3px] shrink-0', TONE_BG[methodTone(m.method)])} />
                          <span className="text-[13px] font-medium text-ink-1 truncate">{methodLabel(m.method)}</span>
                          <span className="text-[11px] text-ink-5 tabular-nums">
                            {m.count} {m.count === 1 ? 'payment' : 'payments'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-[13px] font-semibold text-ink-1">
                            <Amount cents={m.cents} />
                          </span>
                          <span className="w-10 text-right text-[11px] tabular-nums text-ink-4">{pct.toFixed(0)}%</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </Surface>

        {/* Recent payments */}
        <Surface className="lg:col-span-5 rounded-2xl p-0 flex flex-col">
          <PanelHeader
            icon={<BanknoteIcon size={15} />}
            title="Recent payments"
            subtitle="Latest 5 settled transactions"
            action={
              <Link
                to="/accounts?tab=payments"
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-ink-3 hover:text-ink hover:bg-ink/[0.05] transition-colors"
              >
                See all
                <ChevronRightIcon size={12} />
              </Link>
            }
          />
          <div className="p-3 flex-1">
            {d.recentPayments.length === 0 ? (
              <PanelEmpty
                icon={<BanknoteIcon size={18} />}
                title="No payments yet"
                description="Settled payments and escrow releases will show up here."
              />
            ) : (
              <ul>
                {d.recentPayments.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/accounts/payments/${p.id}`}
                      className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-ink/[0.035] transition-colors"
                    >
                      <span
                        className={cn(
                          'size-9 rounded-full flex items-center justify-center shrink-0 ring-1 ring-inset ring-ink/[0.06]',
                          TONE_SOFT[methodTone(p.method)],
                        )}
                      >
                        <CreditCardIcon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-ink-1 truncate">{methodLabel(p.method)}</div>
                        <div className="text-[11px] text-ink-4 mt-0.5 tabular-nums">{time(p.createdAt)}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[13px] font-semibold text-ink-1">
                          <Amount cents={p.amountCents} />
                        </span>
                        <StatusPill status={p.status} />
                      </div>
                      <ChevronRightIcon
                        size={14}
                        className="text-ink-5 group-hover:text-ink group-hover:translate-x-0.5 transition-all"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Surface>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <SavedCardsPanel businessId={businessId} className="lg:col-span-7 rounded-2xl" />

        {/* Escrow trust card */}
        <Surface className="lg:col-span-5 rounded-2xl p-0 flex flex-col">
          <PanelHeader
            icon={<ShieldCheckIcon size={15} />}
            iconClassName="bg-mint/[0.12] text-mint"
            title="Escrow-protected settlement"
            subtitle="Licensed escrow on every PayHere & bank payment"
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-mint">
                <span className="size-1.5 rounded-full bg-mint animate-pulse" />
                Live
              </span>
            }
          />
          <ol className="p-6 flex-1 relative">
            {[
              { t: 'You pay', d: 'Funds move into escrow, not to the supplier.' },
              { t: 'Supplier dispatches', d: 'You inspect and confirm the GRN.' },
              { t: 'Escrow releases', d: 'Supplier is paid only after confirmation.' },
            ].map((step, i, arr) => (
              <li key={step.t} className="relative flex gap-4 pb-5 last:pb-0">
                {i < arr.length - 1 && (
                  <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-gradient-to-b from-mint/40 to-ink/10" />
                )}
                <span className="relative z-[1] size-7 rounded-full bg-paper ring-1 ring-mint/40 text-mint text-[11px] font-semibold tabular-nums flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="pt-0.5">
                  <div className="text-[13px] font-semibold text-ink-1">{step.t}</div>
                  <div className="text-[12px] text-ink-4 mt-0.5 leading-relaxed">{step.d}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mx-6 mb-6 flex items-center gap-2 rounded-xl bg-ink/[0.035] px-3.5 py-2.5 text-[12px] text-ink-3">
            <RefreshCwIcon size={13} className="text-copper" />
            Refunds settle within 1–2 business days.
          </div>
        </Surface>
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
      <Surface className="p-3 rounded-2xl">
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

      {q.isLoading && <div className="h-40 vyro-surface animate-pulse" />}
      {q.isError && <ErrorBanner message={(q.error as ApiError).message} />}

      <div className="overflow-x-auto vyro-surface rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/[0.08] text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-4 bg-ink/[0.025]">
              <th className="px-6 py-3.5">Reference</th>
              <th className="px-6 py-3.5">Method</th>
              <th className="px-6 py-3.5">Status</th>
              <th className="px-6 py-3.5 text-right">Amount</th>
              <th className="px-6 py-3.5">Date</th>
              <th className="px-6 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.06]">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-ink/[0.025] transition-colors group">
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
                  <span className="font-semibold text-ink-1 text-[14px] tracking-[-0.01em]">
                    <Amount cents={p.amountCents} />
                  </span>
                </td>
                <td className="px-6 py-4 text-xs font-mono text-ink-3">{time(p.createdAt)}</td>
                <td className="px-6 py-4 text-right">
                  <Link
                    to={`/accounts/payments/${p.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2 transition-all px-3 py-1.5 rounded-full bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] hover:bg-ink hover:text-paper hover:shadow-none"
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
            <PanelEmpty
              icon={<SearchIcon size={18} />}
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
  if (q.isLoading) return <div className="h-40 vyro-surface animate-pulse" />;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const invoices = q.data?.invoices ?? [];

  const totalInvoiced = invoices.reduce((s, i) => s + i.totalCents, 0);
  const paidInvoices = invoices.filter((i) => i.paymentId).length;

  return (
    <div className="space-y-4">
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

      <div className="overflow-x-auto vyro-surface rounded-2xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/[0.08] text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-4 bg-ink/[0.025]">
              <th className="px-6 py-3.5">Invoice</th>
              <th className="px-6 py-3.5">Type</th>
              <th className="px-6 py-3.5 text-right">Total</th>
              <th className="px-6 py-3.5">Issued</th>
              <th className="px-6 py-3.5 text-center">Status</th>
              <th className="px-6 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.06]">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-ink/[0.025] transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-mono text-xs font-bold text-ink-1">{inv.number}</div>
                  <div className="text-[10px] text-ink-4 font-mono mt-0.5">
                    PO {inv.purchaseOrderId.slice(0, 8)}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-bone border border-ink/10 text-ink-2">
                    {invoiceTypeLabel(inv.type)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="font-semibold text-ink-1 text-[14px] tracking-[-0.01em]">
                    <Amount cents={inv.totalCents} />
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
                    className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2 transition-all px-3 py-1.5 rounded-full bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] hover:bg-ink hover:text-paper hover:shadow-none"
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
            <PanelEmpty
              icon={<FileTextIcon size={18} />}
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
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const { ask, dialog } = useConfirm();
  const withdraw = useMutation({
    mutationFn: (id: string) => api.post(`/refunds/${id}/cancel`, {}),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['accounts', 'business-refunds', businessId] });
      toast.success('Refund withdrawn');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not withdraw refund'),
  });
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
          requestedByUserId?: string;
          createdAt: number;
        }>;
      }>(`/finance/business/refunds?businessId=${businessId}`),
  });
  if (q.isLoading) return <div className="h-40 vyro-surface animate-pulse" />;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const refunds = q.data?.refunds ?? [];
  const totalRefunded = refunds.reduce((s, r) => s + r.amountCents, 0);
  const pendingCount = refunds.filter((r) => ['pending', 'requested'].includes(r.status)).length;

  return (
    <>
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
        <PanelEmpty
          icon={<RefreshCwIcon size={18} />}
          title="No refunds"
          description="Refund requests and their outcomes will appear here."
        />
      ) : (
        <ul className="vyro-surface rounded-2xl divide-y divide-ink/[0.06] overflow-hidden">
          {refunds.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink/[0.025] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-full bg-copper/[0.12] text-copper-deep flex items-center justify-center shrink-0">
                  <RefreshCwIcon size={15} />
                </div>
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
              </div>
              {r.status === 'requested' && r.requestedByUserId === user?.userId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    ask({
                      title: 'Withdraw refund request',
                      body: (
                        <>
                          Withdraw the refund of <Money cents={r.amountCents} />? The amount becomes
                          refundable again.
                        </>
                      ),
                      confirmLabel: 'Withdraw',
                      action: async () => {
                        await withdraw.mutateAsync(r.id);
                      },
                    })
                  }
                >
                  Withdraw
                </Button>
              )}
              <span className="font-semibold text-ink-1 text-[14px] tracking-[-0.01em]">
                <Amount cents={r.amountCents} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
    {dialog}
    </>
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
  if (q.isLoading) return <div className="h-40 vyro-surface animate-pulse" />;
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
        <PanelEmpty
          icon={<BanknoteIcon size={18} />}
          title="No transactions"
          description="Your financial ledger entries will appear here."
        />
      ) : (
        <ul className="vyro-surface rounded-2xl divide-y divide-ink/[0.06] overflow-hidden">
          {transactions.map((t) => {
            const isCredit = t.direction === 'credit';
            return (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-ink/[0.025] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'size-9 rounded-full flex items-center justify-center shrink-0',
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
                    'inline-flex items-baseline gap-0.5 font-semibold text-[14px] tracking-[-0.01em]',
                    isCredit ? 'text-mint' : 'text-rose',
                  )}
                >
                  {isCredit ? '+' : '−'}
                  <Amount cents={t.amountCents} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CreditPanel({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['credit-facility', businessId],
    queryFn: () =>
      api.get<{ facility: { limitCents: number; usedCents: number; status: string } | null; availableCents: number; eligible: boolean; reason: string | null; overdueCount: number }>(
        `/credit/facility?businessId=${businessId}`,
      ),
  });
  if (q.isLoading) return <div className="h-40 vyro-surface animate-pulse" />;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const f = q.data;
  if (!f?.facility) return <PanelEmpty icon={<CreditCardIcon size={18} />} title="Credit not available" description={f?.reason ?? 'Complete 3 paid orders to unlock VYRO Credit.'} />;
  const usedPct = f.facility.limitCents > 0 ? Math.min(100, (f.facility.usedCents / f.facility.limitCents) * 100) : 0;
  return (
    <div className="vyro-surface rounded-2xl p-6 sm:p-7 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="size-11 rounded-xl bg-ink text-volt flex items-center justify-center shrink-0 shadow-[0_10px_24px_-12px_rgba(12,14,11,0.7)]">
            <CreditCardIcon size={18} />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
              Available credit
            </div>
            <div className="text-[30px] leading-none font-semibold tracking-[-0.03em] text-ink mt-2">
              <Amount cents={f.availableCents} />
            </div>
            <div className="text-[11px] text-ink-4 mt-0.5">
              Limit <span className="font-mono text-ink-2"><Money cents={f.facility.limitCents} /></span>
              {' · '}Used <span className="font-mono text-ink-2"><Money cents={f.facility.usedCents} /></span>
              {' · '}<span className="capitalize">{f.facility.status}</span>
            </div>
          </div>
        </div>
        <Link to="/credit" className="shrink-0">
          <Button variant="secondary" size="sm">Open VYRO Credit</Button>
        </Link>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-ink-4">
          <span>Facility utilisation</span>
          <span>{usedPct.toFixed(0)}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-ink/[0.06] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300', usedPct >= 80 ? 'bg-rose' : usedPct >= 50 ? 'bg-amber' : 'bg-volt')}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        {f.overdueCount > 0 && (
          <p className="text-xs text-rose font-medium pt-1">
            {f.overdueCount} overdue repayment{f.overdueCount === 1 ? '' : 's'} — settle to keep the facility active.
          </p>
        )}
      </div>
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

type Tone = 'volt' | 'copper' | 'mint' | 'amber' | 'ink';

const TONE_BG: Record<Tone, string> = {
  volt: 'bg-volt',
  copper: 'bg-copper',
  mint: 'bg-mint',
  amber: 'bg-amber',
  ink: 'bg-ink-4',
};

const TONE_SOFT: Record<Tone, string> = {
  volt: 'bg-volt/15 text-volt-deep',
  copper: 'bg-copper/[0.12] text-copper-deep',
  mint: 'bg-mint/[0.12] text-mint',
  amber: 'bg-amber/[0.12] text-amber',
  ink: 'bg-ink/[0.06] text-ink-3',
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-ink-4">{children}</div>
  );
}

function PanelHeader({
  icon,
  iconClassName,
  title,
  subtitle,
  meta,
  action,
}: {
  icon: React.ReactNode;
  iconClassName?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-4 border-b border-ink/[0.08] flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            'size-9 rounded-xl flex items-center justify-center shrink-0',
            iconClassName ?? 'bg-ink text-volt',
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-ink-1 leading-tight truncate">{title}</h3>
          {subtitle && <p className="text-[12px] text-ink-4 mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action ??
        (meta ? (
          <span className="shrink-0 rounded-full bg-ink/[0.05] px-2.5 py-1 text-[11px] font-medium tabular-nums text-ink-3">
            {meta}
          </span>
        ) : null)}
    </div>
  );
}

function PanelEmpty({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="relative mx-auto size-12">
        <div className="absolute inset-0 rounded-2xl bg-ink/[0.04] rotate-6" />
        <div className="relative size-12 rounded-2xl bg-paper shadow-[0_8px_20px_-12px_rgba(12,14,11,0.35),inset_0_0_0_1px_rgba(12,14,11,0.08)] text-ink-3 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="mt-5 font-display text-[15px] font-semibold text-ink">{title}</div>
      {description ? (
        <p className="mt-1.5 text-[13px] text-ink-4 max-w-xs mx-auto leading-relaxed">{description}</p>
      ) : null}
    </div>
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
  const accentIcon = {
    volt: 'bg-volt/15 text-volt-deep',
    mint: 'bg-mint/[0.12] text-mint',
    amber: 'bg-amber/[0.12] text-amber',
    rose: 'bg-rose/[0.12] text-rose',
    copper: 'bg-copper/[0.12] text-copper-deep',
    ink: 'bg-ink text-volt',
  }[accent];
  const accentBar = {
    volt: 'bg-volt',
    mint: 'bg-mint',
    amber: 'bg-amber',
    rose: 'bg-rose',
    copper: 'bg-copper',
    ink: 'bg-ink',
  }[accent];
  const zero = (value ?? cents ?? 0) === 0;
  return (
    <div className="group relative overflow-hidden rounded-2xl vyro-surface p-5 transition-shadow hover:shadow-[0_16px_36px_-20px_rgba(12,14,11,0.3),inset_0_0_0_1px_rgba(12,14,11,0.1)]">
      <span aria-hidden className={cn('absolute left-0 top-5 h-6 w-[3px] rounded-r-full', zero ? 'bg-ink/10' : accentBar)} />
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px] font-medium text-ink-3">{label}</div>
        <div className={cn('size-8 rounded-lg flex items-center justify-center shrink-0', accentIcon)}>{icon}</div>
      </div>
      <div
        className={cn(
          'mt-3 text-[24px] sm:text-[26px] leading-none font-semibold tracking-[-0.03em]',
          zero ? 'text-ink-5' : 'text-ink',
        )}
      >
        {value !== undefined ? <span className="tabular-nums">{value}</span> : <Amount cents={cents ?? 0} />}
      </div>
      <div className="mt-2 text-[12px] text-ink-4">{sub}</div>
    </div>
  );
}
