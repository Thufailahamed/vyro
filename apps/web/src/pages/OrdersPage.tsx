import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { Button, Card, EmptyState, ErrorBanner, StatusDots } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { PageHero, HeroStatusPill, heroActionClass } from '@/components/brand/PageHero';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import {
  PackageIcon,
  SearchIcon,
  RefreshCwIcon,
  ShoppingCartIcon,
  StoreIcon,
  TruckIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  BanknoteIcon,
  SparklesIcon,
} from '@/components/icons';
import { MetricNumber } from '@/components/brand/Surface';

interface Order {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName?: string;
  deliveryCity?: string;
  deliveryDistrict?: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: number;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All Orders' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready_for_pickup', label: 'Ready for Pickup' },
  { id: 'out_for_delivery', label: 'Out for Delivery' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'disputed', label: 'Disputed' },
];

// Active pipeline statuses (1:1 with ORDER_TRANSITIONS, no synthetic keys).
const IN_FLIGHT_STATUSES = ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'];

const REORDERABLE: ReadonlySet<string> = new Set(['delivered', 'completed']);

export function OrdersPage() {
  usePageTitle('Purchase Orders · Procurement Operations');
  const { user } = useAuth();
  const business = user?.memberships?.[0];
  const businessId = business?.businessId;
  const businessName = business?.businessName ?? 'Purchasing Entity';

  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState('');
  const qc = useQueryClient();

  // 1. Purchase Orders Query
  const { data, isLoading } = useQuery({
    queryKey: ['orders', businessId],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });

  // 2. Active Cart Query (to check if buyer has uncommitted draft items)
  const { data: cartData } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ items: Array<{ id: string }>; totalCents?: number }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 10_000,
  });

  const cartItemsCount = cartData?.items?.length ?? 0;
  const cartTotalCents = cartData?.totalCents ?? 0;

  async function reorder(o: Order) {
    setReorderError('');
    setReorderingId(o.id);
    try {
      await api.post(`/purchase-orders/${o.id}/reorder`);
      void qc.invalidateQueries({ queryKey: ['orders', businessId] });
    } catch (e) {
      setReorderError(
        e instanceof ApiError
          ? e.message
          : 'Could not reorder — some items may no longer be available in current wholesale catalog.',
      );
    } finally {
      setReorderingId(null);
    }
  }

  const allOrders = data?.orders ?? [];

  // Summary Metrics
  const stats = useMemo(() => {
    const inFlight = allOrders.filter((o) =>
      IN_FLIGHT_STATUSES.includes(o.status.toLowerCase()),
    ).length;
    const completed = allOrders.filter((o) =>
      ['completed', 'delivered'].includes(o.status.toLowerCase()),
    ).length;
    const disputed = allOrders.filter((o) => o.status.toLowerCase() === 'disputed').length;
    const totalSpendCents = allOrders
      .filter((o) => o.status.toLowerCase() !== 'cancelled')
      .reduce((sum, o) => sum + (o.totalCents || 0), 0);

    return { total: allOrders.length, inFlight, completed, disputed, totalSpendCents };
  }, [allOrders]);

  // Filtered and searched orders
  const filteredOrders = useMemo(() => {
    let list = allOrders;

    if (filter !== 'all') {
      list = list.filter((o) => o.status.toLowerCase() === filter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.poNumber.toLowerCase().includes(q) ||
          (o.supplierName && o.supplierName.toLowerCase().includes(q)) ||
          (o.deliveryCity && o.deliveryCity.toLowerCase().includes(q)) ||
          (o.deliveryDistrict && o.deliveryDistrict.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [allOrders, filter, searchQuery]);

  if (!user) {
    return (
      <div className="py-16 text-center space-y-4 max-w-lg mx-auto">
        <div className="size-12 rounded-xl bg-ink text-volt mx-auto flex items-center justify-center">
          <PackageIcon size={24} />
        </div>
        <h2 className="vyro-display text-3xl text-ink">Sign in to view orders</h2>
        <p className="text-sm text-ink-3">
          Sign in to your authenticated commercial workspace to access active PO tracking, dispatch logs, and Goods Receipt (GRN).
        </p>
        <Link to="/login" className="mt-4 inline-block">
          <Button>Sign in to Workspace</Button>
        </Link>
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="py-16 text-center space-y-4 max-w-lg mx-auto">
        <div className="size-12 rounded-xl bg-ink text-copper mx-auto flex items-center justify-center">
          <StoreIcon size={24} />
        </div>
        <h2 className="vyro-display text-3xl text-ink">No registered business entity</h2>
        <p className="text-sm text-ink-3">
          Register or connect a commercial purchasing business to unlock legally binding purchase order creation.
        </p>
        <Link to="/onboarding/business" className="mt-4 inline-block">
          <Button>Register Business (2 min) →</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Executive Page Header */}
      <PageHero
        icon={PackageIcon}
        kicker={`Procurement Operations · ${businessName}`}
        title="Purchase Orders"
        description="Track commercial purchase orders from supplier confirmation, driver freight dispatch, and dockside Goods Receipt (GRN) to SVAT digital invoice settlement."
        status={<HeroStatusPill label="Digital GRN Active" tone="mint" />}
        actions={
          <>
            {cartItemsCount > 0 ? (
              <Link
                to="/cart"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-volt px-3 text-xs font-bold text-ink transition-colors hover:bg-volt-glow"
              >
                <ShoppingCartIcon size={13} />
                Open Cart ({cartItemsCount})
              </Link>
            ) : (
              <Link to="/search" className={heroActionClass}>
                <SearchIcon size={13} />
                Browse Catalog
              </Link>
            )}
            <Link to="/orders/conversational" className={heroActionClass}>
              WhatsApp Bot
            </Link>
            <Link to="/ask" className={heroActionClass}>
              <SparklesIcon size={13} className="text-copper" />
              Ask AI
            </Link>
          </>
        }
        footer={
          <>
            <span>Every PO settles on dockside GRN sign-off</span>
            <span className="text-paper/40">
              {stats.total} orders · {stats.inFlight} in flight · {formatLKR(stats.totalSpendCents)} spend
            </span>
          </>
        }
      />

      {/* Metric Tiles (Shown when orders exist) */}
      {allOrders.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                Total Purchase Orders
              </span>
              <span className="size-8 rounded-lg bg-ink/[0.05] text-ink-3 flex items-center justify-center shrink-0">
                <PackageIcon size={15} />
              </span>
            </div>
            <MetricNumber size="md" className="text-ink">{stats.total}</MetricNumber>
            <div className="text-[10px] text-ink-4">Issued across Sri Lanka</div>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                In Flight / Staged
              </span>
              <span className="size-8 rounded-lg bg-volt/20 text-ink flex items-center justify-center shrink-0">
                <TruckIcon size={15} />
              </span>
            </div>
            <MetricNumber size="md" className="text-volt-deep flex items-center gap-2">
              <span>{stats.inFlight}</span>
              {stats.inFlight > 0 && (
                <span className="size-2 rounded-full bg-volt animate-ping" />
              )}
            </MetricNumber>
            <div className="text-[10px] text-ink-4">Active route delivery</div>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                Delivered & Completed
              </span>
              <span className="size-8 rounded-lg bg-mint/15 text-mint flex items-center justify-center shrink-0">
                <CheckCircleIcon size={15} />
              </span>
            </div>
            <MetricNumber size="md" className="text-mint">{stats.completed}</MetricNumber>
            <div className="text-[10px] text-ink-4">Dockside GRN confirmed</div>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
                Commercial Volume
              </span>
              <span className="size-8 rounded-lg bg-copper/15 text-copper flex items-center justify-center shrink-0">
                <BanknoteIcon size={15} />
              </span>
            </div>
            <MetricNumber size="md" className="text-ink">
              {formatLKR(stats.totalSpendCents)}
            </MetricNumber>
            <div className="text-[10px] text-ink-4">SVAT invoice total</div>
          </Card>
        </div>
      )}

      {/* Active Cart Notification Banner (If user has cart items waiting) */}
      {cartItemsCount > 0 && (
        <div className="p-5 rounded-2xl bg-ink text-paper border border-volt/30 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="size-10 rounded-xl bg-volt text-ink flex items-center justify-center shrink-0 font-bold">
              <ShoppingCartIcon size={20} />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="vyro-kicker text-volt">Pending Cart Ready</span>
                <span className="size-1.5 rounded-full bg-mint animate-pulse" />
              </div>
              <h4 className="font-display text-base font-semibold text-paper">
                You have {cartItemsCount} item{cartItemsCount === 1 ? '' : 's'} waiting in your active cart
              </h4>
              <p className="text-xs text-paper/70">
                Totaling {cartTotalCents > 0 ? formatLKR(cartTotalCents) : 'prepared wholesale items'}. Checkout to split into automated, legally binding supplier POs.
              </p>
            </div>
          </div>
          <Link to="/cart" className="shrink-0 w-full sm:w-auto">
            <Button className="w-full sm:w-auto bg-volt text-ink hover:bg-volt-glow font-bold text-xs uppercase tracking-wider py-2.5">
              Review Cart & Issue PO →
            </Button>
          </Link>
        </div>
      )}

      {/* Reorder Error Banner */}
      <ErrorBanner message={reorderError} />

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="inline-flex items-center gap-1 p-1 bg-ink/[0.05] rounded-full max-w-full overflow-x-auto scrollbar-none">
          {STATUS_FILTERS.map((tab) => {
            let count = 0;
            if (tab.id === 'all') count = allOrders.length;
            else count = allOrders.filter((o) => o.status.toLowerCase() === tab.id).length;

            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`h-8 px-3.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-ink text-paper shadow-sm'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${active ? 'bg-volt/25 text-volt' : 'bg-ink/[0.06] text-ink-4'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {allOrders.length > 0 && (
          <div className="relative min-w-[240px]">
            <SearchIcon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="text"
              placeholder="Search PO #, supplier, city…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3.5 bg-paper rounded-full text-xs text-ink placeholder:text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-shadow duration-200 outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)]"
            />
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 vyro-surface animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty State Redesign (When 0 orders) */}
      {!isLoading && allOrders.length === 0 && (
        <div className="space-y-8">
          <div className="vyro-surface p-8 sm:p-12 text-center space-y-6">
            <div className="size-14 rounded-xl bg-ink text-volt mx-auto flex items-center justify-center shadow-md">
              <PackageIcon size={28} />
            </div>

            <div className="space-y-2 max-w-lg mx-auto">
              <div className="vyro-kicker text-copper">Wholesale Purchase Ledger Empty</div>
              <h3 className="vyro-display text-2xl sm:text-3xl text-ink font-bold">
                No purchase orders issued yet
              </h3>
              <p className="text-sm text-ink-3 leading-relaxed">
                Add products from verified millers and distributors to your cart. Once confirmed, VYRO automatically issues legally-binding independent POs with live tracking and SVAT digital GRN.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link to="/search">
                <Button className="bg-ink text-paper hover:bg-charcoal px-6 py-2.5 text-xs uppercase tracking-wider font-bold">
                  <SearchIcon size={14} />
                  <span>Browse Wholesale Catalog</span>
                </Button>
              </Link>
              <Link to="/ask">
                <Button variant="secondary" className="px-5 py-2.5 text-xs uppercase tracking-wider font-semibold">
                  <SparklesIcon size={14} className="text-copper" />
                  <span>Ask AI: "Build My Usual Order"</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* 3-Step Lifecycle Guidance */}
          <div className="space-y-3">
            <div className="vyro-kicker text-copper">Procurement Automation</div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Card className="space-y-2">
                <div className="size-7 rounded-md bg-ink text-volt font-mono text-xs font-bold flex items-center justify-center">
                  01
                </div>
                <h4 className="font-display font-semibold text-ink text-sm">
                  Automated Multi-Supplier Split
                </h4>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Combine goods from different regional millers into one cart. The engine splits them into separate, legal POs.
                </p>
              </Card>

              <Card className="space-y-2">
                <div className="size-7 rounded-md bg-ink text-volt font-mono text-xs font-bold flex items-center justify-center">
                  02
                </div>
                <h4 className="font-display font-semibold text-ink text-sm">
                  Driver Plate & Route Staging
                </h4>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Suppliers acknowledge dispatch with assigned delivery truck plate numbers and real-time transit milestones.
                </p>
              </Card>

              <Card className="space-y-2">
                <div className="size-7 rounded-md bg-ink text-volt font-mono text-xs font-bold flex items-center justify-center">
                  03
                </div>
                <h4 className="font-display font-semibold text-ink text-sm">
                  Dockside Goods Receipt (GRN)
                </h4>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Electronic sign-off upon pallet receiving locks audit trails and triggers digital SVAT tax invoicing.
                </p>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Orders Table Ledger (When orders exist) */}
      {!isLoading && allOrders.length > 0 && filteredOrders.length === 0 && (
        <EmptyState
          icon={<SearchIcon size={22} />}
          title="No orders match your filter"
          description={`No purchase orders found matching "${filter}" status or query "${searchQuery}".`}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setFilter('all');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </Button>
          }
        />
      )}

      {!isLoading && filteredOrders.length > 0 && (
        <div className="vyro-surface overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/60 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                <th className="py-3 px-4">PO Number</th>
                <th className="py-3 px-4">Supplier Facility</th>
                <th className="py-3 px-4">Status & Milestone</th>
                <th className="py-3 px-4">Destination</th>
                <th className="py-3 px-4">Date Issued</th>
                <th className="py-3 px-4 text-right">Order Amount</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 text-sm">
              {filteredOrders.map((o) => {
                const canReorder = REORDERABLE.has(o.status.toLowerCase());
                const isReordering = reorderingId === o.id;

                return (
                  <tr key={o.id} className="hover:bg-bone/40 transition-colors group">
                    <td className="py-4 px-4 font-mono">
                      <Link
                        to={`/orders/${o.id}`}
                        className="font-bold text-ink hover:text-copper transition-colors block"
                      >
                        {o.poNumber}
                      </Link>
                      <span className="text-[10px] text-ink-4">ID: {o.id.slice(0, 8)}…</span>
                    </td>

                    <td className="py-4 px-4">
                      <div className="font-display font-semibold text-ink text-sm flex items-center gap-1.5">
                        <StoreIcon size={14} className="text-copper shrink-0" />
                        <span className="truncate max-w-[180px]">
                          {o.supplierName ?? 'Wholesale Supplier'}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-ink-4 mt-0.5 flex items-center gap-1">
                        <ShieldCheckIcon size={11} className="text-volt-deep" /> Verified Facility
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                    </td>

                    <td className="py-4 px-4 text-xs font-mono text-ink-3">
                      {o.deliveryCity ? (
                        <span>
                          {o.deliveryCity}
                          {o.deliveryDistrict ? `, ${o.deliveryDistrict}` : ''}
                        </span>
                      ) : (
                        <span className="text-ink-4">Colombo Depot</span>
                      )}
                    </td>

                    <td className="py-4 px-4 text-xs font-mono text-ink-3">
                      {new Date(o.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="py-4 px-4 text-right font-mono font-bold text-ink text-base">
                      {formatLKR(o.totalCents)}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/orders/${o.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-copper transition-colors px-3 py-1.5 rounded-full bg-bone border border-ink/10 hover:border-ink"
                        >
                          <span>Details</span>
                          <ArrowRightIcon size={12} />
                        </Link>
                        {canReorder && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={isReordering}
                            onClick={(e) => {
                              e.preventDefault();
                              void reorder(o);
                            }}
                            className="text-xs px-2.5 py-1"
                            aria-label={`Reorder ${o.poNumber}`}
                          >
                            <RefreshCwIcon size={12} /> Reorder
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
