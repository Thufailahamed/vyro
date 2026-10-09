import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { cn, useToast } from '@vyro/ui';
import { api } from '@/lib/api';
import { Button, StatusBadge } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import {
  ArrowRightIcon,
  BanknoteIcon,
  Building2Icon,
  ChevronRightIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  StoreIcon,
  TrendingUpIcon,
  UsersIcon,
  XIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import type { ConsoleOrder } from '@/components/orders/console';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { SupplierHero, HeroStatusPill, heroActionClass } from './SupplierHero';

type Customer = {
  businessId: string;
  name: string;
  totalOrders: number;
  totalCents: number;
  lastOrderAt: number;
};

type Segment = 'champion' | 'repeat' | 'new' | 'lapsing';
type SortKey = 'spend' | 'orders' | 'recent';

const DAY = 86_400_000;

const SEGMENTS: Record<Segment, { label: string; hint: string; dot: string; chip: string }> = {
  champion: {
    label: 'Champion',
    hint: '3+ orders, active in the last 45 days',
    dot: 'bg-volt-deep',
    chip: 'bg-volt-soft text-ink ring-volt-deep/30',
  },
  repeat: { label: 'Repeat', hint: 'Ordered more than once', dot: 'bg-mint', chip: 'bg-mint/[0.08] text-mint ring-mint/25' },
  new: { label: 'New', hint: 'First order placed', dot: 'bg-copper', chip: 'bg-copper/[0.08] text-copper-deep ring-copper/25' },
  lapsing: {
    label: 'Lapsing',
    hint: 'No order in 60+ days',
    dot: 'bg-amber',
    chip: 'bg-amber/[0.1] text-[#a86c28] ring-amber/30',
  },
};

function segmentOf(c: Customer, now: number): Segment {
  const days = (now - c.lastOrderAt) / DAY;
  if (days > 60) return 'lapsing';
  if (c.totalOrders >= 3 && days <= 45) return 'champion';
  if (c.totalOrders >= 2) return 'repeat';
  return 'new';
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function ago(ts: number, now = Date.now()) {
  const days = Math.round((ts - now) / DAY);
  if (Math.abs(days) < 1) return 'today';
  if (Math.abs(days) < 30) return RTF.format(days, 'day');
  if (Math.abs(days) < 365) return RTF.format(Math.round(days / 30), 'month');
  return RTF.format(Math.round(days / 365), 'year');
}

const MONO_TONES = [
  'from-[#E9EFC9] to-[#D6E28F] text-[#4C5A12]',
  'from-[#F1E2D4] to-[#E2C3A6] text-copper-deep',
  'from-[#DCEBE3] to-[#B7D6C6] text-[#2B6650]',
  'from-[#EFE7D8] to-[#DCCDB1] text-[#6B5634]',
];

function Monogram({ name, seed, large }: { name: string; seed: string; large?: boolean }) {
  const words = name.trim().split(/\s+/);
  const letters = ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? words[0]?.[1] ?? '')).toUpperCase() || '?';
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center bg-gradient-to-br font-display font-bold tracking-[-0.02em] shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]',
        large ? 'size-14 rounded-2xl text-lg' : 'size-10 rounded-[11px] text-[13px]',
        MONO_TONES[Math.abs(h) % MONO_TONES.length],
      )}
      aria-hidden
    >
      {letters}
    </span>
  );
}

function SegmentPill({ segment }: { segment: Segment }) {
  const s = SEGMENTS[segment];
  return (
    <span
      title={s.hint}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', s.chip)}
    >
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export function SupplierCustomersPage() {
  const { supplierId } = useSupplierId();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('spend');
  const [segment, setSegment] = useState<'all' | Segment>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const customers = useInfiniteQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      api.get<{ items: Customer[]; nextCursor: string | null }>(
        `/suppliers/${supplierId}/customers?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
    refetchInterval: 30_000,
  });

  const now = Date.now();
  const list = useMemo(() => (customers.data?.pages ?? []).flatMap((p) => p.items), [customers.data]);
  const enriched = useMemo(() => list.map((c) => ({ ...c, segment: segmentOf(c, now) })), [list, now]);

  const totalSpend = list.reduce((n, c) => n + c.totalCents, 0);
  const totalOrders = list.reduce((n, c) => n + c.totalOrders, 0);
  const repeat = list.filter((c) => c.totalOrders > 1).length;
  const repeatRate = list.length ? Math.round((repeat / list.length) * 100) : 0;
  const active30 = list.filter((c) => now - c.lastOrderAt <= 30 * DAY).length;
  const topShare = totalSpend
    ? Math.round((Math.max(0, ...list.map((c) => c.totalCents)) / totalSpend) * 100)
    : 0;

  const segCounts = useMemo(() => {
    const out: Record<Segment, number> = { champion: 0, repeat: 0, new: 0, lapsing: 0 };
    for (const c of enriched) out[c.segment] += 1;
    return out;
  }, [enriched]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return enriched
      .filter((c) => (segment === 'all' || c.segment === segment) && (!needle || c.name.toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (sortBy === 'orders') return b.totalOrders - a.totalOrders;
        if (sortBy === 'recent') return b.lastOrderAt - a.lastOrderAt;
        return b.totalCents - a.totalCents;
      });
  }, [enriched, q, segment, sortBy]);

  const open = openId ? enriched.find((c) => c.businessId === openId) ?? null : null;

  if (customers.isLoading) return <SupplierLoadingState label="Loading customers" />;
  if (customers.isError) {
    return <SupplierErrorState message="Could not load your customers." onRetry={() => void customers.refetch()} />;
  }

  const refresh = async () => {
    await customers.refetch();
    toast.success('Customers up to date');
  };

  return (
    <div className="space-y-6">
      <SupplierHero
        icon={UsersIcon}
        kicker="Buyer network"
        title="Customers"
        description={
          list.length === 0
            ? 'Businesses that buy from your depot will appear here after their first purchase order.'
            : `${list.length} ${list.length === 1 ? 'business buys' : 'businesses buy'} from your depot · ${active30} ordered in the last 30 days.`
        }
        status={
          list.length > 0 ? <HeroStatusPill label={`${active30} active this month`} tone="mint" /> : <HeroStatusPill label="Awaiting first buyer" tone="amber" />
        }
        actions={
          <>
            <button type="button" onClick={() => void refresh()} disabled={customers.isFetching} className={heroActionClass}>
              <RefreshCwIcon size={13} className={customers.isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link to="/supplier/orders" className={heroActionClass}>
              Orders
              <ArrowRightIcon size={12} />
            </Link>
          </>
        }
        footer={
          list.length > 0 ? (
            <>
              <span>Excludes cancelled orders</span>
              <span className="text-paper/40">
                Top customer = {topShare}% of revenue{topShare >= 50 ? ' · high concentration' : ''}
              </span>
            </>
          ) : undefined
        }
      />

      {list.length === 0 ? (
        <EmptyCustomers />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Customers" icon={<StoreIcon size={15} />} value={String(list.length)} sub={`${active30} active in 30 days`} />
            <Kpi label="Lifetime revenue" icon={<TrendingUpIcon size={15} />} value={formatLKR(totalSpend)} sub={`${totalOrders} purchase orders`} tone="mint" />
            <Kpi
              label="Avg per customer"
              icon={<BanknoteIcon size={15} />}
              value={formatLKR(list.length ? Math.round(totalSpend / list.length) : 0)}
              sub={`${formatLKR(totalOrders ? Math.round(totalSpend / totalOrders) : 0)} per order`}
            />
            <Kpi label="Repeat rate" icon={<UsersIcon size={15} />} value={`${repeatRate}%`} sub={`${repeat} of ${list.length} reordered`}>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="h-full rounded-full bg-volt-deep transition-[width] duration-500" style={{ width: `${repeatRate}%` }} />
              </div>
            </Kpi>
          </div>

          {/* Segment mix */}
          <section className="vyro-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">Customer mix</h2>
              <span className="text-xs text-ink-4">Click a segment to filter the list</span>
            </div>
            <div className="mt-3 flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-ink/[0.05]">
              {(Object.keys(SEGMENTS) as Segment[])
                .filter((k) => segCounts[k] > 0)
                .map((k) => (
                  <span key={k} className={cn('h-full rounded-full', SEGMENTS[k].dot)} style={{ width: `${(segCounts[k] / list.length) * 100}%` }} />
                ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(SEGMENTS) as Segment[]).map((k) => {
                const on = segment === k;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSegment(on ? 'all' : k)}
                    className={cn(
                      'rounded-xl p-3 text-left transition-all',
                      on
                        ? 'bg-ink text-paper shadow-[0_10px_24px_-14px_rgba(12,14,11,0.7)]'
                        : 'bg-ink/[0.03] hover:bg-ink/[0.06]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn('size-2 rounded-full', SEGMENTS[k].dot)} aria-hidden />
                      <span className={cn('text-xs font-semibold', on ? 'text-paper' : 'text-ink')}>{SEGMENTS[k].label}</span>
                      <span className={cn('ml-auto vyro-metric text-lg leading-none', on ? 'text-paper' : 'text-ink')}>{segCounts[k]}</span>
                    </div>
                    <div className={cn('mt-1 text-[11px] leading-snug', on ? 'text-paper/60' : 'text-ink-4')}>{SEGMENTS[k].hint}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Directory */}
          <Surface kind="elevated" className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="relative w-full sm:w-80">
                <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
                <input
                  type="search"
                  placeholder="Search customers…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="h-9 w-full rounded-lg bg-paper pl-9 pr-3 text-[13px] text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] outline-none transition-shadow placeholder:text-ink-5 focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-ink-4 sm:inline">Sort</span>
                <div className="inline-flex rounded-[10px] bg-ink/[0.045] p-[3px]">
                  {(
                    [
                      { id: 'spend', label: 'Revenue' },
                      { id: 'orders', label: 'Orders' },
                      { id: 'recent', label: 'Recent' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={sortBy === t.id}
                      onClick={() => setSortBy(t.id)}
                      className={cn(
                        'h-7 rounded-[7px] px-3 text-xs font-semibold transition-all',
                        sortBy === t.id ? 'bg-paper text-ink shadow-[0_0_0_1px_rgba(12,14,11,0.06),0_1px_3px_rgba(12,14,11,0.1)]' : 'text-ink-4 hover:text-ink',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="space-y-3 p-12 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-ink/[0.06] text-ink-4">
                  <SearchIcon size={20} />
                </div>
                <p className="text-sm font-medium text-ink">No matching customers</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQ('');
                    setSegment('all');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,2.2fr)_0.7fr_1.6fr_1fr_24px] gap-4 border-b border-line bg-bone/50 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4 md:grid">
                  <span>Customer</span>
                  <span className="text-right">Orders</span>
                  <span>Revenue</span>
                  <span className="text-right">Last order</span>
                  <span />
                </div>
                <ul className="divide-y divide-ink/[0.05]">
                  {rows.map((c, i) => {
                    const share = totalSpend ? (c.totalCents / totalSpend) * 100 : 0;
                    return (
                      <li key={c.businessId}>
                        <button
                          type="button"
                          onClick={() => setOpenId(c.businessId)}
                          className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-bone/50 md:grid-cols-[minmax(0,2.2fr)_0.7fr_1.6fr_1fr_24px]"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="relative">
                              <Monogram name={c.name} seed={c.businessId} />
                              {sortBy === 'spend' && segment === 'all' && !q && i < 3 && (
                                <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-volt ring-2 ring-paper">
                                  {i + 1}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-ink">{c.name}</div>
                              <div className="mt-1 flex items-center gap-2">
                                <SegmentPill segment={c.segment} />
                                <span className="text-[11px] text-ink-4 md:hidden">
                                  {c.totalOrders} orders · {ago(c.lastOrderAt, now)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="hidden text-right text-sm font-semibold text-ink num-tabular md:block">{c.totalOrders}</div>
                          <div className="text-right md:text-left">
                            <div className="vyro-metric text-sm font-bold text-ink">{formatLKR(c.totalCents)}</div>
                            <div className="mt-1.5 hidden items-center gap-2 md:flex">
                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                                <div className="h-full rounded-full bg-mint" style={{ width: `${Math.max(2, share)}%` }} />
                              </div>
                              <span className="w-9 text-right text-[10px] text-ink-4 num-tabular">{Math.round(share)}%</span>
                            </div>
                          </div>
                          <div className="hidden text-right md:block">
                            <div className="text-xs font-medium text-ink-2">{ago(c.lastOrderAt, now)}</div>
                            <div className="text-[11px] text-ink-5 num-tabular">
                              {new Date(c.lastOrderAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                          <ChevronRightIcon size={16} className="hidden text-ink-5 transition-all group-hover:translate-x-0.5 group-hover:text-ink md:block" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {customers.hasNextPage && (
              <div className="border-t border-line p-4 text-center">
                <Button variant="secondary" size="sm" onClick={() => void customers.fetchNextPage()} disabled={customers.isFetchingNextPage}>
                  {customers.isFetchingNextPage ? 'Loading…' : 'Load more customers'}
                </Button>
              </div>
            )}
          </Surface>
        </>
      )}

      {open && supplierId && (
        <CustomerDrawer customer={open} supplierId={supplierId} totalSpend={totalSpend} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function Kpi({
  label,
  icon,
  value,
  sub,
  tone,
  children,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  sub: string;
  tone?: 'mint';
  children?: ReactNode;
}) {
  return (
    <div className="vyro-surface p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">{label}</span>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', tone === 'mint' ? 'bg-mint/15 text-mint' : 'bg-ink/[0.06] text-ink-3')}>
          {icon}
        </span>
      </div>
      <MetricNumber size="md" className={cn('mt-2 block truncate', tone === 'mint' ? 'text-mint' : 'text-ink')}>
        {value}
      </MetricNumber>
      <div className="mt-1 text-xs text-ink-4">{sub}</div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Detail drawer */

function CustomerDrawer({
  customer,
  supplierId,
  totalSpend,
  onClose,
}: {
  customer: Customer & { segment: Segment };
  supplierId: string;
  totalSpend: number;
  onClose: () => void;
}) {
  // Same key as the Orders console, so the cache is shared.
  const orders = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: ConsoleOrder[] }>(`/purchase-orders?supplierId=${supplierId}`),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const mine = useMemo(
    () => (orders.data?.orders ?? []).filter((o) => o.businessId === customer.businessId).sort((a, b) => b.createdAt - a.createdAt),
    [orders.data, customer.businessId],
  );

  const live = mine.filter((o) => o.status !== 'cancelled');
  const first = live.length ? live[live.length - 1]!.createdAt : null;
  const cadenceDays =
    live.length >= 2 && first ? Math.round((live[0]!.createdAt - first) / DAY / (live.length - 1)) : null;
  const share = totalSpend ? Math.round((customer.totalCents / totalSpend) * 100) : 0;
  const openCount = mine.filter((o) => ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)).length;
  const ordersLink = `/supplier/orders?buyer=${encodeURIComponent(customer.businessId)}&buyerName=${encodeURIComponent(customer.name)}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={customer.name}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-paper shadow-[-24px_0_60px_-20px_rgba(12,14,11,0.45)] animate-fade-in">
        <header className="relative overflow-hidden bg-ink px-6 pb-6 pt-5 text-paper">
          <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-volt/15 blur-3xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-volt">Customer</span>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 flex size-8 items-center justify-center rounded-full text-paper/60 transition-colors hover:bg-paper/10 hover:text-paper"
              aria-label="Close"
            >
              <XIcon size={16} />
            </button>
          </div>
          <div className="relative mt-3 flex items-center gap-4">
            <Monogram name={customer.name} seed={customer.businessId} large />
            <div className="min-w-0">
              <h2 className="vyro-display truncate text-xl font-bold text-paper">{customer.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-paper/55">
                <SegmentPill segment={customer.segment} />
                <span>Last order {ago(customer.lastOrderAt)}</span>
              </div>
            </div>
          </div>
          <dl className="relative mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-paper/10">
            {[
              ['Revenue', formatLKR(customer.totalCents)],
              ['Orders', String(customer.totalOrders)],
              ['Avg order', formatLKR(customer.totalOrders ? Math.round(customer.totalCents / customer.totalOrders) : 0)],
            ].map(([k, v]) => (
              <div key={k} className="bg-ink/70 px-3 py-3">
                <dt className="text-[9px] font-mono uppercase tracking-[0.14em] text-paper/45">{k}</dt>
                <dd className="mt-1 truncate font-mono text-sm font-bold text-paper num-tabular">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-3 gap-3">
            <Insight label="Share of revenue" value={`${share}%`} />
            <Insight label="Order cadence" value={cadenceDays != null ? `${cadenceDays}d` : '—'} hint={cadenceDays != null ? 'avg between orders' : 'needs 2+ orders'} />
            <Insight label="Open orders" value={String(openCount)} hint={openCount ? 'in progress' : 'none open'} />
          </div>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-4">Order history</h3>
              <span className="text-xs text-ink-4">{mine.length} total</span>
            </div>
            {orders.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-ink/[0.05]" />
                ))}
              </div>
            ) : orders.isError ? (
              <p className="rounded-xl bg-rose/[0.07] p-4 text-sm text-rose">Couldn’t load this customer’s orders.</p>
            ) : mine.length === 0 ? (
              <p className="rounded-xl bg-ink/[0.03] p-4 text-sm text-ink-4">No orders found.</p>
            ) : (
              <ol className="relative space-y-2 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-ink/[0.08]">
                {mine.map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/supplier/orders/${o.id}`}
                      className="group relative flex items-center gap-3 rounded-xl p-2 pr-3 transition-colors hover:bg-bone/70"
                    >
                      <span className="relative z-10 flex size-[30px] shrink-0 items-center justify-center rounded-full bg-paper text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]">
                        <Building2Icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-xs font-semibold text-ink">{o.poNumber}</span>
                          <StatusBadge status={o.status} />
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-4">
                          {new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {o.deliveryCity ? ` · ${o.deliveryCity}` : ''}
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold text-ink num-tabular">{formatLKR(o.totalCents)}</span>
                      <ChevronRightIcon size={14} className="text-ink-5 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-bone/50 px-6 py-4">
          <span className="text-xs text-ink-4">{SEGMENTS[customer.segment].hint}</span>
          <Link
            to={ordersLink}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-xs font-semibold text-paper transition-colors hover:bg-charcoal"
          >
            Open in orders
            <ArrowRightIcon size={12} />
          </Link>
        </footer>
      </aside>
    </div>
  );
}

function Insight({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-ink/[0.03] p-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.05)]">
      <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-ink-4">{label}</div>
      <div className="mt-1 vyro-metric text-xl leading-none text-ink">{value}</div>
      {hint && <div className="mt-1 text-[10px] text-ink-5">{hint}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Empty state */

function EmptyCustomers() {
  const steps = [
    { title: 'Publish staple products', body: 'Procurement desks search most for rice, sugar, flour and spices. Keep stock levels live.' },
    { title: 'Add volume price tiers', body: 'Discounts at 10+, 50+ and 100+ units encourage larger, consolidated orders.' },
    { title: 'Commit to fast turnaround', body: 'Reliable 24–48h dispatch earns repeat orders from hotels, grocers and caterers.' },
  ];
  return (
    <Surface kind="elevated" className="overflow-hidden">
      <div className="flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-volt-soft text-ink">
            <Building2Icon size={22} />
          </span>
          <div>
            <h2 className="vyro-display text-xl font-bold text-ink">No customers yet</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-3">
              Hotels, restaurants, grocers and caterers find your depot through your published products. Your first buyer
              appears here after they place a purchase order.
            </p>
          </div>
        </div>
        <Link
          to="/supplier/products/new"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-paper transition-colors hover:bg-charcoal"
        >
          <PlusIcon size={15} />
          Publish a product
        </Link>
      </div>
      <ol className="grid gap-px border-t border-line bg-line md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="bg-paper p-5">
            <span className="flex size-6 items-center justify-center rounded-md bg-ink font-mono text-[11px] font-bold text-volt">{i + 1}</span>
            <div className="mt-3 text-sm font-semibold text-ink">{s.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-4">{s.body}</p>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bone/40 px-6 py-3">
        <span className="text-xs text-ink-4">Volume tiers live in your rate cards.</span>
        <Link to="/supplier/pricing" className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-copper">
          Configure pricing <ArrowRightIcon size={11} />
        </Link>
      </div>
    </Surface>
  );
}
