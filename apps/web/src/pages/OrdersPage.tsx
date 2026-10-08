import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner } from '@/components/ui';
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

  const tabs = STATUS_FILTERS.map((tab) => ({
    ...tab,
    count: tab.id === 'all' ? allOrders.length : allOrders.filter((o) => o.status.toLowerCase() === tab.id).length,
  })).filter((t) => t.id === 'all' || t.count > 0 || t.id === filter);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero: identity, actions, pipeline stats & pending cart */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-ink text-paper shadow-soft-lg">
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(250,247,240,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(250,247,240,0.6) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              maskImage: 'radial-gradient(ellipse 60% 80% at 85% 10%, black, transparent)',
              WebkitMaskImage: 'radial-gradient(ellipse 60% 80% at 85% 10%, black, transparent)',
            }}
          />
          <div className="absolute -top-40 right-[-4rem] size-[26rem] rounded-full bg-volt/15 blur-[120px]" />
          <div className="absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-copper/25 blur-[120px]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-volt/50 to-transparent" />
        </div>

        <div className="px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-volt">
                  <PackageIcon size={14} />
                  Procurement · {businessName}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-paper/15 bg-paper/5 px-2.5 py-1 text-[11px] text-paper/70">
                  <span className="size-1.5 rounded-full bg-mint animate-pulse" />
                  Digital GRN active
                </span>
              </div>
              <h1 className="font-display font-extrabold text-3xl sm:text-5xl leading-[0.95] tracking-tight">
                Purchase Orders
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-paper/55">
                Track every PO from supplier confirmation and dispatch through dockside GRN sign-off to SVAT invoice
                settlement.
              </p>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
              <Link
                to="/ask"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-5 text-sm font-medium text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
              >
                <SparklesIcon size={15} className="text-copper-soft" />
                Ask AI
              </Link>
              <Link
                to="/orders/conversational"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-5 text-sm font-medium text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
              >
                WhatsApp bot
              </Link>
              <Link
                to="/search"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-volt px-5 text-sm font-semibold text-ink transition-colors hover:bg-volt-glow"
              >
                <SearchIcon size={15} />
                Browse catalog
              </Link>
            </div>
          </div>

          {/* Pending cart callout */}
          {cartItemsCount > 0 && (
            <Link
              to="/cart"
              className="group mt-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-volt/25 bg-volt/[0.07] p-4 sm:px-5 transition-colors hover:bg-volt/[0.12]"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-volt text-ink">
                  <ShoppingCartIcon size={19} />
                  <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-paper font-mono text-[10px] font-bold text-ink ring-2 ring-ink">
                    {cartItemsCount}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-paper">
                    {cartItemsCount} item{cartItemsCount === 1 ? '' : 's'} waiting in your cart
                    {cartTotalCents > 0 && <span className="text-paper/50 font-normal"> · {formatLKR(cartTotalCents)}</span>}
                  </div>
                  <div className="text-xs text-paper/50">
                    Checkout splits it into legally binding POs, one per supplier.
                  </div>
                </div>
              </div>
              <span className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-volt px-5 text-sm font-semibold text-ink transition-colors group-hover:bg-volt-glow">
                Review &amp; issue PO
                <ArrowRightIcon size={15} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          )}
        </div>

        {/* Pipeline stats */}
        <dl className="grid grid-cols-2 lg:grid-cols-4 border-t border-paper/10 bg-paper/[0.03]">
          {[
            { label: 'Purchase orders', value: stats.total, hint: 'Issued to date', icon: <PackageIcon size={14} /> },
            {
              label: 'In flight',
              value: (
                <span className="inline-flex items-center gap-2.5">
                  {stats.inFlight}
                  {stats.inFlight > 0 && (
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-volt opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-volt" />
                    </span>
                  )}
                </span>
              ),
              hint: 'Confirmed → out for delivery',
              icon: <TruckIcon size={14} />,
            },
            { label: 'Delivered', value: stats.completed, hint: 'Dockside GRN confirmed', icon: <CheckCircleIcon size={14} /> },
            { label: 'Total spend', value: <SpendValue cents={stats.totalSpendCents} />, hint: 'SVAT invoice total', icon: <BanknoteIcon size={14} /> },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`min-w-0 px-5 sm:px-8 lg:px-10 py-5 border-paper/10 ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
            >
              <dt className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-paper/45">
                <span className="text-copper-soft">{s.icon}</span>
                {s.label}
              </dt>
              <dd className="mt-2">
                <div className="truncate font-display text-2xl sm:text-3xl font-bold leading-none tracking-tight text-paper">
                  {s.value}
                </div>
                <div className="mt-1.5 truncate text-xs text-paper/45">{s.hint}</div>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Reorder Error Banner */}
      <ErrorBanner message={reorderError} />

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-paper">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 border-t border-ink/[0.06] px-6 py-5 first:border-t-0">
              <div className="size-10 rounded-xl bg-bone animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-40 rounded bg-ink/10 animate-pulse" />
                <div className="h-3 w-24 rounded bg-ink/5 animate-pulse" />
              </div>
              <div className="h-4 w-24 rounded bg-ink/10 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state (no orders yet) */}
      {!isLoading && allOrders.length === 0 && (
        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-soft-md">
          <div className="px-6 py-12 sm:py-16 text-center">
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-ink text-volt shadow-soft-md">
              <PackageIcon size={26} />
            </div>
            <div className="vyro-kicker text-copper">Purchase ledger empty</div>
            <h3 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              No purchase orders issued yet
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-3">
              Add products from verified millers and distributors to your cart. On checkout VYRO issues independent,
              legally binding POs with live tracking and digital GRN.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <Link
                to="/search"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-paper transition-colors hover:bg-ink-2"
              >
                <SearchIcon size={15} />
                Browse wholesale catalog
              </Link>
              <Link
                to="/ask"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-ink/15 px-5 text-sm font-medium text-ink transition-colors hover:bg-bone"
              >
                <SparklesIcon size={15} className="text-copper" />
                Ask AI: “Build my usual order”
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-ink/10 bg-pearl/60">
            {[
              { n: '01', t: 'Multi-supplier split', b: 'Combine goods from different millers in one cart — the engine splits them into separate legal POs.' },
              { n: '02', t: 'Dispatch & route staging', b: 'Suppliers confirm dispatch with truck plate numbers and real-time transit milestones.' },
              { n: '03', t: 'Dockside goods receipt', b: 'Electronic GRN sign-off locks the audit trail and triggers SVAT tax invoicing.' },
            ].map((step, i) => (
              <div key={step.n} className={`p-6 ${i > 0 ? 'border-t sm:border-t-0 sm:border-l border-ink/10' : ''}`}>
                <div className="font-mono text-[11px] text-copper">{step.n}</div>
                <h4 className="mt-2 font-display text-base font-bold text-ink">{step.t}</h4>
                <p className="mt-1 text-xs leading-relaxed text-ink-3">{step.b}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Orders ledger */}
      {!isLoading && allOrders.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-soft-md">
          {/* Toolbar */}
          <div className="space-y-4 border-b border-ink/10 px-5 py-4 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold leading-tight text-ink">Order ledger</h2>
                <p className="text-xs text-ink-4">
                  {filteredOrders.length === allOrders.length
                    ? `${allOrders.length} purchase ${allOrders.length === 1 ? 'order' : 'orders'}`
                    : `Showing ${filteredOrders.length} of ${allOrders.length}`}
                </p>
              </div>
              <div className="relative sm:w-72">
                <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
                <input
                  type="text"
                  aria-label="Search orders"
                  placeholder="Search PO #, supplier, city…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 w-full rounded-full border border-ink/10 bg-bone/60 pl-10 pr-4 text-sm text-ink placeholder:text-ink-4 outline-none transition focus:border-ink/30 focus:bg-paper focus:ring-4 focus:ring-volt/25"
                />
              </div>
            </div>
            <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 scrollbar-none">
              {tabs.map((tab) => {
                const active = filter === tab.id;
                const meta = tab.id === 'all' ? null : statusMeta(tab.id);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                      active ? 'bg-ink text-paper' : 'text-ink-3 hover:bg-bone hover:text-ink'
                    }`}
                  >
                    {meta && <span className={`size-1.5 rounded-full ${meta.dot}`} />}
                    {tab.label}
                    <span className={`font-mono text-[11px] ${active ? 'text-volt' : 'text-ink-4'}`}>{tab.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-ink/10 bg-bone text-ink-4">
                <SearchIcon size={22} />
              </div>
              <p className="font-display text-lg font-bold text-ink">No orders match</p>
              <p className="mt-1 text-sm text-ink-4">Try clearing the search or switching the status filter.</p>
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  setSearchQuery('');
                }}
                className="mt-5 inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-xs font-semibold text-ink transition-colors hover:bg-bone cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">
                    <th className="px-6 py-3 font-medium">Purchase order</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Destination</th>
                    <th className="px-4 py-3 font-medium">Issued</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-6 py-3 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => {
                    const status = o.status.toLowerCase();
                    const meta = statusMeta(status);
                    const canReorder = REORDERABLE.has(status);
                    const isReordering = reorderingId === o.id;
                    const supplier = o.supplierName ?? 'Wholesale Supplier';

                    return (
                      <tr key={o.id} className="group border-t border-ink/[0.06] transition-colors hover:bg-bone/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3.5">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink font-display text-sm font-bold text-volt">
                              {supplier.trim().charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <Link
                                to={`/orders/${o.id}`}
                                className="font-mono text-sm font-semibold text-ink transition-colors hover:text-copper"
                              >
                                {o.poNumber}
                              </Link>
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-4">
                                <span className="truncate max-w-[14rem] font-medium text-ink-3">{supplier}</span>
                                <ShieldCheckIcon size={12} className="shrink-0 text-mint" aria-label="Verified facility" />
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.pill}`}
                          >
                            <span className={`size-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          {meta.step != null && (
                            <div className="mt-2 flex items-center gap-1" aria-label={`Step ${meta.step + 1} of ${PIPELINE_STEPS}`}>
                              {Array.from({ length: PIPELINE_STEPS }, (_, i) => (
                                <span
                                  key={i}
                                  className={`h-1 w-4 rounded-full ${i <= meta.step! ? meta.dot : 'bg-ink/10'}`}
                                />
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4 text-xs text-ink-3">
                          {o.deliveryCity ? (
                            <>
                              <div className="font-medium text-ink-2">{o.deliveryCity}</div>
                              {o.deliveryDistrict && <div className="text-ink-4">{o.deliveryDistrict}</div>}
                            </>
                          ) : (
                            <span className="text-ink-4">Colombo Depot</span>
                          )}
                        </td>

                        <td className="px-4 py-4 text-xs text-ink-3 whitespace-nowrap">
                          {new Date(o.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>

                        <td className="px-4 py-4 text-right font-mono text-sm font-semibold text-ink whitespace-nowrap">
                          {formatLKR(o.totalCents)}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canReorder && (
                              <button
                                type="button"
                                disabled={isReordering}
                                onClick={(e) => {
                                  e.preventDefault();
                                  void reorder(o);
                                }}
                                aria-label={`Reorder ${o.poNumber}`}
                                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-ink/15 px-3 text-xs font-medium text-ink transition-colors hover:bg-paper disabled:opacity-60 cursor-pointer"
                              >
                                <RefreshCwIcon size={12} className={isReordering ? 'animate-spin' : ''} />
                                Reorder
                              </button>
                            )}
                            <Link
                              to={`/orders/${o.id}`}
                              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3.5 text-xs font-semibold text-paper transition-colors hover:bg-ink-2"
                            >
                              Details
                              <ArrowRightIcon size={12} className="text-volt transition-transform group-hover:translate-x-0.5" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const PIPELINE_STEPS = 6;

/** Large-format LKR: small currency prefix, cents dropped when whole, full value on hover. */
function SpendValue({ cents }: { cents: number }) {
  const rupees = cents / 100;
  const whole = Number.isInteger(rupees);
  return (
    <span title={formatLKR(cents)}>
      <span className="mr-1 text-base font-medium text-paper/45">Rs.</span>
      {rupees.toLocaleString('en-LK', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}
    </span>
  );
}

type StatusMeta = { label: string; dot: string; pill: string; step: number | null };

const STATUS_META: Record<string, StatusMeta> = {
  pending: { label: 'Pending', dot: 'bg-amber', pill: 'bg-amber/10 text-amber', step: 0 },
  accepted: { label: 'Accepted', dot: 'bg-copper', pill: 'bg-copper/10 text-copper-deep', step: 1 },
  preparing: { label: 'Preparing', dot: 'bg-copper', pill: 'bg-copper/10 text-copper-deep', step: 2 },
  ready_for_pickup: { label: 'Ready for pickup', dot: 'bg-volt-deep', pill: 'bg-volt/20 text-volt-deep', step: 3 },
  out_for_delivery: { label: 'Out for delivery', dot: 'bg-volt-deep', pill: 'bg-volt/20 text-volt-deep', step: 4 },
  delivered: { label: 'Delivered', dot: 'bg-mint', pill: 'bg-mint/10 text-mint', step: 5 },
  completed: { label: 'Completed', dot: 'bg-mint', pill: 'bg-mint/10 text-mint', step: 5 },
  cancelled: { label: 'Cancelled', dot: 'bg-ink-4', pill: 'bg-ink/[0.06] text-ink-3', step: null },
  rejected: { label: 'Rejected', dot: 'bg-rose', pill: 'bg-rose/10 text-rose', step: null },
  disputed: { label: 'Disputed', dot: 'bg-rose', pill: 'bg-rose/10 text-rose', step: null },
};

function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
      dot: 'bg-ink-4',
      pill: 'bg-ink/[0.06] text-ink-3',
      step: null,
    }
  );
}
