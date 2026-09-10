import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminOrders, type AdminOrder } from './useAdminOrders';
import { StatusBadge, Surface, EmptyState } from '@/components/ui';
import { SearchIcon, PackageIcon, TruckIcon, AlertCircleIcon, CheckCircleIcon, ArrowRightIcon } from '@/components/icons';
import { formatLKR, formatCompactLKR } from '@/lib/format';

const STATUS_TABS = [
  { id: 'all', label: 'All Orders' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready_for_pickup', label: 'Ready for Pickup' },
  { id: 'out_for_delivery', label: 'Out for Delivery' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed', label: 'Disputed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'rejected', label: 'Rejected' },
] as const;

type SortOption = 'newest' | 'oldest' | 'amount-high' | 'amount-low';

function formatTimestamp(ts?: number | null): { date: string; time: string; relative: string } {
  if (!ts) return { date: '—', time: '—', relative: '—' };
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - ts;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  let relative = 'Just now';
  if (diffDays > 0) {
    relative = `${diffDays}d ago`;
  } else if (diffHours > 0) {
    relative = `${diffHours}h ago`;
  } else {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins > 0) relative = `${diffMins}m ago`;
  }

  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return { date, time, relative };
}

export function OrdersPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Fetch orders from API
  const { data, isLoading, isError, isFetching, refetch } = useAdminOrders({
    ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
    limit: 100,
  });

  const rawOrders = data?.orders ?? [];

  // Filter & Sort
  const processedOrders = useMemo(() => {
    let list = [...rawOrders];

    list.sort((a, b) => {
      if (sortBy === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (sortBy === 'oldest') return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      if (sortBy === 'amount-high') return (b.totalCents ?? 0) - (a.totalCents ?? 0);
      if (sortBy === 'amount-low') return (a.totalCents ?? 0) - (b.totalCents ?? 0);
      return 0;
    });

    return list;
  }, [rawOrders, sortBy]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalCents = 0;
    let pendingCount = 0;
    let inFulfillmentCount = 0;
    let deliveredCount = 0;
    let disputedCount = 0;

    for (const o of rawOrders) {
      totalCents += o.totalCents ?? 0;
      if (o.status === 'pending') pendingCount++;
      if (['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)) {
        inFulfillmentCount++;
      }
      if (['delivered', 'completed'].includes(o.status)) {
        deliveredCount++;
      }
      if (['disputed', 'cancelled', 'rejected'].includes(o.status)) {
        disputedCount++;
      }
    }

    return {
      totalOrders: rawOrders.length,
      totalVolumeLkr: formatCompactLKR(totalCents),
      pendingCount,
      inFulfillmentCount,
      deliveredCount,
      disputedCount,
    };
  }, [rawOrders]);

  // CSV Export Handler
  const exportCsv = () => {
    if (processedOrders.length === 0) return;
    const headers = ['PO Number', 'Date', 'Status', 'Buyer', 'Supplier', 'Destination City', 'Amount (LKR)'];
    const rows = processedOrders.map((o) => [
      `"${o.poNumber ?? o.id}"`,
      `"${formatTimestamp(o.createdAt).date}"`,
      `"${o.status}"`,
      `"${(o.businessName ?? 'Unknown').replace(/"/g, '""')}"`,
      `"${(o.supplierName ?? 'Unknown').replace(/"/g, '""')}"`,
      `"${o.deliveryCity ?? ''}"`,
      (o.totalCents ?? 0) / 100,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vyro_orders_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <p className="vyro-kicker flex items-center gap-1.5 text-ink-4">
            <span>OPERATIONS</span>
            <span>/</span>
            <span>B2B FULFILLMENT & LOGISTICS</span>
          </p>
          <h1 className="vyro-display text-3xl font-bold tracking-tight text-ink mt-0.5">
            Orders Control
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Real-time cross-tenant purchase orders, verification audit, and delivery tracking.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-ink/15 hover:bg-sand/40 bg-paper transition disabled:opacity-50"
            title="Refresh Orders"
          >
            <svg
              className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{isFetching ? 'Syncing…' : 'Refresh'}</span>
          </button>

          <button
            type="button"
            onClick={exportCsv}
            disabled={processedOrders.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-ink/15 hover:bg-sand/40 bg-paper transition disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Operations KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Total Orders</span>
            <PackageIcon size={16} className="text-ink-3" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.totalOrders}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Tracked in registry</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Gross Volume</span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-volt/20 text-ink">GMV</span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.totalVolumeLkr}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Filtered orders value</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">In Fulfillment</span>
            <TruckIcon size={16} className="text-copper" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-copper-deep tracking-tight">
            {metrics.inFulfillmentCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Confirmed & dispatching</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Delivered</span>
            <CheckCircleIcon size={16} className="text-mint" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-mint tracking-tight">
            {metrics.deliveredCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Completed deliveries</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Disputed / Holds</span>
            <AlertCircleIcon size={16} className="text-rose" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose tracking-tight">
            {metrics.disputedCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Requires intervention</div>
        </Surface>
      </div>

      {/* 3. Filter Bar & Search */}
      <Surface className="p-3.5 border border-ink/10 bg-paper space-y-3">
        {/* Status Tab Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
          {STATUS_TABS.map((tab) => {
            const isActive = selectedStatus === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatus(tab.id)}
                className={`px-3 py-1.5 text-xs font-mono font-medium transition-all whitespace-nowrap border ${
                  isActive
                    ? 'bg-ink text-paper border-ink shadow-sm'
                    : 'bg-transparent text-ink-3 border-transparent hover:border-ink/15 hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-ink/5">
          {/* Keyword Search */}
          <div className="relative flex-1 max-w-md">
            <SearchIcon
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PO#, buyer, supplier, city…"
              className="w-full h-9 pl-9 pr-8 text-xs bg-sand/30 border border-ink/15 focus:outline-none focus:border-ink focus:bg-paper transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink text-xs"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Control & Record Count */}
          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-ink-3">
            <span className="font-mono">
              Showing <strong>{processedOrders.length}</strong> {processedOrders.length === 1 ? 'order' : 'orders'}
            </span>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-4 uppercase font-mono">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="h-9 px-2 text-xs font-mono bg-sand/30 border border-ink/15 focus:outline-none focus:border-ink bg-paper"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="amount-high">Highest Amount</option>
                <option value="amount-low">Lowest Amount</option>
              </select>
            </div>
          </div>
        </div>
      </Surface>

      {/* 4. Table / Content Section */}
      <Surface className="border border-ink/10 bg-paper overflow-hidden shadow-sm">
        {/* Error Notice */}
        {isError && (
          <div className="p-4 bg-rose/10 border-b border-rose/20 flex items-center justify-between text-xs text-rose">
            <div className="flex items-center gap-2">
              <AlertCircleIcon size={16} />
              <span>Failed to load purchase orders from the backend API.</span>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="underline font-mono font-medium hover:text-rose-deep"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Shimmer State */}
        {isLoading ? (
          <div className="divide-y divide-ink/5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-ink/10 rounded w-1/4" />
                  <div className="h-3 bg-ink/5 rounded w-1/3" />
                </div>
                <div className="h-4 bg-ink/10 rounded w-1/6" />
                <div className="h-4 bg-ink/10 rounded w-1/6" />
                <div className="h-6 bg-ink/10 rounded w-16" />
              </div>
            ))}
          </div>
        ) : processedOrders.length === 0 ? (
          /* Empty State */
          <EmptyState
            icon={<PackageIcon size={24} />}
            title="No orders found"
            description={
              searchQuery || selectedStatus !== 'all'
                ? `No purchase orders match the status filter "${selectedStatus}" or search "${searchQuery}".`
                : 'There are currently no purchase orders registered in the system.'
            }
            action={
              searchQuery || selectedStatus !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatus('all');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold bg-ink text-paper hover:bg-ink-2 transition"
                >
                  Reset all filters
                </button>
              ) : undefined
            }
          />
        ) : (
          /* Data Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-sand/30 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">PO Number & Date</th>
                  <th className="py-3 px-4">Buyer Business</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Destination</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {processedOrders.map((o: AdminOrder) => {
                  const ts = formatTimestamp(o.createdAt);
                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-sand/20 transition-colors group"
                    >
                      {/* PO Number & Timestamp */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-ink bg-ink/5 border border-ink/10 px-1.5 py-0.5 rounded">
                            {o.poNumber ?? o.id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-ink-4 flex items-center gap-1.5">
                          <span>{ts.date}</span>
                          <span>•</span>
                          <span className="font-mono">{ts.relative}</span>
                        </div>
                      </td>

                      {/* Buyer Business */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-ink text-sm">
                          {o.businessName ?? (
                            <span className="text-ink-4 font-mono font-normal">Direct Buyer</span>
                          )}
                        </div>
                        {o.businessCity && (
                          <div className="text-[11px] text-ink-4 mt-0.5">
                            {o.businessCity}
                          </div>
                        )}
                      </td>

                      {/* Supplier Mill / Merchant */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-ink">
                          {o.supplierName ?? (
                            <span className="text-ink-4 font-mono font-normal">Direct Supplier</span>
                          )}
                        </div>
                        {o.supplierCity && (
                          <div className="text-[11px] text-ink-4 mt-0.5">
                            {o.supplierCity}
                          </div>
                        )}
                      </td>

                      {/* Destination City */}
                      <td className="py-3.5 px-4">
                        {o.deliveryCity ? (
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 bg-mist text-ink-3 text-[10px] font-mono">
                              {o.deliveryCity}
                            </span>
                            {o.deliveryDistrict && (
                              <div className="text-[10px] text-ink-4 mt-0.5">
                                {o.deliveryDistrict}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-ink-4">—</span>
                        )}
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-mono font-bold text-sm text-ink tabular-nums">
                          {formatLKR(o.totalCents ?? 0)}
                        </div>
                        <div className="text-[10px] text-ink-4 uppercase font-mono">
                          {o.currency ?? 'LKR'}
                        </div>
                      </td>

                      {/* Lifecycle Status Badge */}
                      <td className="py-3.5 px-4">
                        <StatusBadge status={o.status} />
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to={`/admin/orders/${o.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium border border-ink/15 bg-paper hover:bg-ink hover:text-paper transition group-hover:border-ink/30"
                        >
                          <span>Open</span>
                          <ArrowRightIcon size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}

