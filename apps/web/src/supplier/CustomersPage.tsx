import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Input, Button, Badge } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import {
  StoreIcon,
  SearchIcon,
  Building2Icon,
  CalendarIcon,
  ArrowRightIcon,
  UsersIcon,
  TrendingUpIcon,
  BanknoteIcon,
  RefreshCwIcon,
  PlusIcon,
  CheckCircle2Icon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { useToast } from '@vyro/ui';

type Customer = {
  businessId: string;
  name: string;
  totalOrders: number;
  totalCents: number;
  lastOrderAt: number;
};

export function SupplierCustomersPage() {
  const { supplierId } = useSupplierId();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<'spend' | 'orders' | 'recent'>('spend');

  const customers = useInfiniteQuery({
    queryKey: ['supplier', supplierId, 'customers'],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      api.get<{ items: Customer[]; nextCursor: string | null }>(
        `/suppliers/${supplierId}/customers?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    retry: false,
    refetchInterval: 30_000,
  });

  const list = (customers.data?.pages ?? []).flatMap((p) => p.items);

  const handleRefresh = async () => {
    toast.info('Refreshing commercial accounts…');
    await customers.refetch();
    toast.success('Accounts synchronized');
  };

  const filtered = useMemo(() => {
    return q ? list.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : list;
  }, [list, q]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'orders') return b.totalOrders - a.totalOrders;
      if (sortBy === 'recent') return (b.lastOrderAt ?? 0) - (a.lastOrderAt ?? 0);
      return b.totalCents - a.totalCents;
    });
  }, [filtered, sortBy]);

  const totalSpendCents = list.reduce((acc, c) => acc + c.totalCents, 0);
  const avgSpendCents = list.length > 0 ? Math.round(totalSpendCents / list.length) : 0;
  const repeatBuyersCount = list.filter((c) => c.totalOrders > 1).length;
  const repeatRatio = list.length > 0 ? Math.round((repeatBuyersCount / list.length) * 100) : 0;

  if (customers.isLoading) return <SupplierLoadingState label="Loading commercial buyers" />;
  if (customers.isError) {
    return (
      <SupplierErrorState
        message="Could not load commercial buyers."
        onRetry={() => void customers.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            Enterprise Accounts · Buyer Network
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">
            Commercial Buyers & Accounts
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            {list.length === 0
              ? 'Corporate retail, hospitality, and catering businesses procuring wholesale goods from your depot.'
              : `${list.length} verified commercial business${list.length === 1 ? '' : 'es'} have placed purchase orders with your depot.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Badge
            variant="neutral"
            className="gap-1.5 font-mono text-xs bg-paper border border-ink/10 shadow-xs py-1.5 px-3"
          >
            {list.length > 0 ? (
              <>
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-semibold text-ink">Active Client Base</span>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-amber" />
                <span className="font-semibold text-ink">Awaiting First Buyer</span>
              </>
            )}
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={customers.isFetching}
            className="text-xs gap-1.5"
            title="Refresh accounts directory"
          >
            <RefreshCwIcon size={14} className={customers.isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link to="/supplier/orders">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs font-semibold">
              <span>Orders Console</span>
              <ArrowRightIcon size={12} />
            </Button>
          </Link>

          <Link to="/supplier/products/new">
            <Button variant="primary" size="sm" className="gap-1.5 text-xs font-semibold shadow-soft-sm hover:brightness-105">
              <PlusIcon size={14} />
              + Add Product
            </Button>
          </Link>
        </div>
      </header>

      {/* Harmonious 4-Card Client Intelligence Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10 overflow-hidden rounded-lg shadow-soft-sm">
        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <StoreIcon size={13} className="text-copper" />
              Total Accounts
            </span>
            <span className="text-[10px] font-mono text-ink-3">
              {list.length > 0 ? 'Verified Base' : 'New Depot'}
            </span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {list.length}
          </MetricNumber>
          <div className="text-xs text-ink-4">Commercial wholesale buyers</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <TrendingUpIcon size={13} className="text-copper" />
              Cumulative Bookings
            </span>
            <span className="text-[10px] text-emerald-800 font-mono font-semibold">Lifetime GMV</span>
          </div>
          <MetricNumber size="md" className="text-emerald-800">
            {formatLKR(totalSpendCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4">Invoiced through escrow</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <BanknoteIcon size={13} className="text-copper" />
              Average Client Spend
            </span>
            <span className="text-[10px] text-ink-4 font-mono">Per Account</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {formatLKR(avgSpendCents)}
          </MetricNumber>
          <div className="text-xs text-ink-4">Average spend per buyer</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <UsersIcon size={13} className="text-copper" />
              Repeat Client Ratio
            </span>
            <span className="text-[10px] text-emerald-800 font-mono font-semibold">
              {repeatBuyersCount} Recurring
            </span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {repeatRatio}%
          </MetricNumber>
          <div className="text-xs text-ink-4">Buyers with 2+ completed orders</div>
        </div>
      </div>

      {/* Buyer Segments & Procurement Channels Surface */}
      <Surface kind="ink" className="p-6 rounded-lg relative overflow-hidden grain shadow-soft-sm">
        <div className="flex items-start gap-4">
          <div className="size-10 rounded-lg bg-volt/15 border border-volt/30 flex items-center justify-center text-volt shrink-0 mt-0.5">
            <Building2Icon size={20} />
          </div>
          <div className="space-y-3 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div className="text-xs font-mono uppercase tracking-[0.16em] text-volt font-bold">
                Enterprise Buyer Ecosystem & Procurement Channels
              </div>
              <span className="text-[11px] font-mono text-paper/60">Automated SVAT Invoicing</span>
            </div>
            <p className="text-xs text-paper/80 leading-relaxed max-w-4xl">
              Commercial accounts are verified businesses operating in Sri Lanka. Orders placed against your rate cards
              generate legal digital SVAT tax invoices with automated delivery tracking:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  HORECA & Hospitality
                </div>
                <div className="text-[11px] text-paper/70 mt-1">
                  Hotels, resorts, and restaurants procure bulk staple grains, sugar, and cooking oils weekly.
                </div>
              </div>

              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  Supermarkets & Grocers
                </div>
                <div className="text-[11px] text-paper/70 mt-1">
                  Independent grocers and retail chains purchasing packaged consumer commodities by the pallet.
                </div>
              </div>

              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  Institutions & Caterers
                </div>
                <div className="text-[11px] text-paper/70 mt-1">
                  Commercial cloud kitchens and catering networks relying on prompt 24h–48h dock turnarounds.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {/* When NO buyers have ordered yet: Onboarding Hub */}
      {list.length === 0 ? (
        <div className="space-y-6">
          <Surface kind="elevated" className="p-6 sm:p-8 border border-ink/10 rounded-lg shadow-soft-sm space-y-6 bg-paper">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-line">
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-xl bg-copper/10 border border-copper/20 flex items-center justify-center text-copper shrink-0">
                  <Building2Icon size={24} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold font-display text-ink">
                    No commercial buyers yet — Connect your depot to buyer desks
                  </h2>
                  <p className="text-sm text-ink-3 mt-1 max-w-2xl">
                    Commercial retail, restaurant, and distribution buyers discover your depot automatically when your
                    commodities are published with active stock and competitive volume tiers.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                <Link to="/supplier/products/new" className="w-full sm:w-auto">
                  <Button variant="primary" size="md" className="w-full sm:w-auto gap-2 shadow-soft-sm font-semibold">
                    <PlusIcon size={16} />
                    + Publish Wholesale Products
                  </Button>
                </Link>
              </div>
            </div>

            {/* 3-Step Buyer Acquisition Roadmap */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-4 font-semibold mb-3">
                How to Accelerate Commercial Buyer Adoption
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      1
                    </div>
                    <span className="text-xs font-bold text-ink">Publish Standard Commodities</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Corporate procurement desks frequently search for Rice (Keeri Samba, Nadu), White Sugar, Flour, and Spices.
                  </p>
                </div>

                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      2
                    </div>
                    <span className="text-xs font-bold text-ink">Offer Structured Volume Tiers</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Configuring discounts for 10+, 50+, and 100+ units incentivizes commercial buyers to consolidate larger POs.
                  </p>
                </div>

                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      3
                    </div>
                    <span className="text-xs font-bold text-ink">Commit to 48h Turnaround</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Reliable lead times earn preferred supplier placement on buyers' repeat re-ordering dashboards.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line">
              <span className="text-xs text-ink-4">
                Have questions about buyer onboarding? Review your depot fulfillment settings.
              </span>
              <div className="flex items-center gap-2">
                <Link to="/supplier/pricing">
                  <Button variant="secondary" size="sm" className="text-xs font-semibold">
                    Configure Rate Cards
                  </Button>
                </Link>
                <Link to="/supplier/settings">
                  <Button variant="ghost" size="sm" className="text-xs">
                    Depot Hub Settings
                  </Button>
                </Link>
              </div>
            </div>
          </Surface>
        </div>
      ) : (
        /* When buyers exist: Filters & Enhanced Directory Table */
        <div className="space-y-4">
          {/* Filters & Sorting Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <Input
                placeholder="Search accounts by trading name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { id: 'spend', label: 'Highest Spend' },
                  { id: 'orders', label: 'Most Orders' },
                  { id: 'recent', label: 'Recently Active' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSortBy(tab.id)}
                  className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors border rounded ${
                    sortBy === tab.id
                      ? 'bg-ink text-paper border-ink font-semibold'
                      : 'bg-paper text-ink-3 border-ink/10 hover:bg-mist/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Directory Surface Table */}
          <Surface kind="elevated" className="overflow-hidden border border-ink/10 rounded-lg shadow-soft-sm">
            {sorted.length === 0 ? (
              <div className="p-12 text-center text-ink-4 space-y-2">
                <Building2Icon size={28} className="mx-auto text-ink-4 opacity-50 mb-2" />
                <p className="text-sm font-medium text-ink-3">No matching commercial buyers.</p>
                <p className="text-xs">Try searching by a different trading name or keyword.</p>
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="text-xs font-semibold text-copper hover:underline mt-2 inline-block"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                    <tr>
                      <th className="text-left px-5 py-3.5 font-medium">Business Account</th>
                      <th className="text-right px-4 py-3.5 font-medium">Total Orders</th>
                      <th className="text-right px-4 py-3.5 font-medium">Lifetime GMV</th>
                      <th className="text-right px-4 py-3.5 font-medium">Most Recent Order</th>
                      <th className="text-right px-5 py-3.5 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sorted.map((c) => (
                      <tr key={c.businessId} className="hover:bg-mist/30 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-mist/60 border border-ink/10 flex items-center justify-center text-ink-3 shrink-0">
                              <Building2Icon size={18} />
                            </div>
                            <div>
                              <div className="font-semibold text-ink hover:text-copper transition-colors">
                                {c.name}
                              </div>
                              <div className="text-xs font-mono text-ink-4 flex items-center gap-2 mt-0.5">
                                <span>ID: {c.businessId.slice(0, 10)}…</span>
                                {c.totalOrders > 1 && (
                                  <Badge variant="success" className="font-mono text-[9px] py-0 px-1">
                                    Recurring Client
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-mono text-xs bg-bone px-2 py-1 border border-ink/10 rounded font-semibold text-ink">
                            {c.totalOrders} {c.totalOrders === 1 ? 'order' : 'orders'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right vyro-metric text-sm font-bold text-ink">
                          {formatLKR(c.totalCents)}
                        </td>
                        <td className="px-4 py-4 text-right text-xs text-ink-3">
                          {c.lastOrderAt ? (
                            <span className="inline-flex items-center justify-end gap-1.5 font-mono">
                              <CalendarIcon size={12} className="text-ink-4" />
                              {new Date(c.lastOrderAt).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-ink-4 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            to={`/supplier/orders?buyer=${c.businessId}`}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border border-ink/20 bg-paper text-ink hover:bg-ink hover:text-paper transition-colors rounded shadow-xs"
                          >
                            <span>View Orders</span>
                            <ArrowRightIcon size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {customers.hasNextPage && (
              <div className="p-4 text-center border-t border-line">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void customers.fetchNextPage()}
                  disabled={customers.isFetchingNextPage}
                >
                  {customers.isFetchingNextPage ? 'Loading…' : 'Load more buyers'}
                </Button>
              </div>
            )}
          </Surface>
        </div>
      )}
    </div>
  );
}
