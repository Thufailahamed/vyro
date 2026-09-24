import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { useAdminOrders, type AdminOrder } from './useAdminOrders';
import { Button } from '@/components/ui';
import {
  SearchIcon,
  PackageIcon,
  TruckIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  DownloadIcon,
  XIcon,
} from '@/components/icons';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  CellStack,
  EmptyBlock,
  Pill,
  StatCard,
  StatGrid,
  StatusPill,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
} from './ui';

const STATUS_TABS = [
  { key: 'all', label: 'All Orders' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'rejected', label: 'Rejected' },
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
  const [directionFilter, setDirectionFilter] = useState<'all' | 'domestic' | 'export' | 'import'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Fetch orders from API
  const { data, isLoading, isError, isFetching, refetch } = useAdminOrders({
    ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
    ...(directionFilter !== 'all' ? { direction: directionFilter } : {}),
    limit: 100,
  });

  const rawOrders = data?.orders ?? [];

  // Filter & Sort
  const processedOrders = useMemo(() => {
    const list = [...rawOrders];

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

  const filtered = selectedStatus !== 'all' || searchQuery.trim() !== '' || directionFilter !== 'all';

  return (
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Operations</span>
            <span className="text-ink-5">/</span>
            <span>B2B Fulfillment &amp; Logistics</span>
          </>
        }
        title="Orders Control"
        description="Real-time cross-tenant purchase orders, verification audit, and delivery tracking."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              loading={isFetching}
              icon={isFetching ? undefined : <RefreshCwIcon size={14} />}
            >
              {isFetching ? 'Syncing…' : 'Refresh'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCsv}
              disabled={processedOrders.length === 0}
              icon={<DownloadIcon size={14} />}
            >
              Export CSV
            </Button>
          </>
        }
      />

      <StatGrid cols={5}>
        <StatCard label="Total orders" value={metrics.totalOrders} sub="Tracked in registry" icon={<PackageIcon size={16} />} loading={isLoading} />
        <StatCard
          label="Gross volume"
          value={metrics.totalVolumeLkr}
          sub="Filtered orders value"
          status={<Pill tone="brand">GMV</Pill>}
          loading={isLoading}
        />
        <StatCard
          label="In fulfilment"
          value={metrics.inFulfillmentCount}
          sub="Confirmed & dispatching"
          icon={<TruckIcon size={16} />}
          tone={metrics.inFulfillmentCount > 0 ? 'warning' : 'neutral'}
          loading={isLoading}
        />
        <StatCard
          label="Delivered"
          value={metrics.deliveredCount}
          sub="Completed deliveries"
          icon={<CheckCircleIcon size={16} />}
          tone={metrics.deliveredCount > 0 ? 'success' : 'neutral'}
          loading={isLoading}
        />
        <StatCard
          label="Disputed / holds"
          value={metrics.disputedCount}
          sub="Requires intervention"
          icon={<AlertCircleIcon size={16} />}
          tone={metrics.disputedCount > 0 ? 'danger' : 'neutral'}
          loading={isLoading}
        />
      </StatGrid>

      <Tabs items={STATUS_TABS} value={selectedStatus} onChange={setSelectedStatus} ariaLabel="Filter by order status" />

      <TableCard
        title="Purchase orders"
        toolbar={
          <Toolbar
            actions={
              <>
                <select
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value as typeof directionFilter)}
                  className={cn(controlClass, 'h-9 w-auto')}
                  aria-label="Direction"
                >
                  <option value="all">All directions</option>
                  <option value="domestic">Domestic</option>
                  <option value="export">Export</option>
                  <option value="import">Import</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className={cn(controlClass, 'h-9 w-auto')}
                  aria-label="Sort orders"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="amount-high">Highest amount</option>
                  <option value="amount-low">Lowest amount</option>
                </select>
              </>
            }
          >
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search PO#, buyer, supplier, city…"
                className={cn(controlClass, 'h-9 pl-9 pr-8')}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <XIcon size={14} />
                </button>
              ) : null}
            </div>
          </Toolbar>
        }
        footer={
          <>
            <span>
              Showing <strong className="text-ink">{processedOrders.length}</strong>{' '}
              {processedOrders.length === 1 ? 'order' : 'orders'}
              {filtered ? ' · filters applied' : ''}
            </span>
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus('all');
                  setSearchQuery('');
                  setDirectionFilter('all');
                }}
                className="font-semibold text-copper transition-colors hover:text-ink"
              >
                Reset filters
              </button>
            ) : null}
          </>
        }
      >
        {isError ? (
          <Callout
            tone="danger"
            className="m-4 sm:m-6"
            title="Couldn't load purchase orders"
            action={
              <Button variant="secondary" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          >
            The backend API didn't respond. Check the service and try again.
          </Callout>
        ) : null}
        {isLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : processedOrders.length === 0 ? (
          <EmptyBlock
            icon={<PackageIcon size={22} />}
            title="No orders found"
            description={
              filtered
                ? 'No purchase orders match the current filters.'
                : 'There are currently no purchase orders registered in the system.'
            }
            action={
              filtered ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedStatus('all');
                    setSearchQuery('');
                    setDirectionFilter('all');
                  }}
                >
                  Reset all filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>PO number &amp; date</th>
                <th>Buyer business</th>
                <th>Supplier</th>
                <th>Direction</th>
                <th>Destination</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {processedOrders.map((o: AdminOrder) => {
                const ts = formatTimestamp(o.createdAt);
                return (
                  <tr key={o.id}>
                    <td>
                      <CellStack
                        mono
                        primary={o.poNumber ?? o.id.slice(0, 8)}
                        secondary={`${ts.date} · ${ts.relative}`}
                      />
                    </td>
                    <td>
                      <CellStack
                        primary={o.businessName ?? <span className="font-normal text-ink-4">Direct buyer</span>}
                        secondary={o.businessCity ?? undefined}
                      />
                    </td>
                    <td>
                      <CellStack
                        primary={o.supplierName ?? <span className="font-normal text-ink-4">Direct supplier</span>}
                        secondary={o.supplierCity ?? undefined}
                      />
                    </td>
                    <td>
                      {o.direction && o.direction !== 'domestic' ? (
                        <CellStack
                          primary={
                            <Pill tone={o.direction === 'export' ? 'brand' : 'info'} className="capitalize">
                              {o.direction}
                            </Pill>
                          }
                          secondary={o.incoterms ?? undefined}
                        />
                      ) : (
                        <span className="text-ink-4">Domestic</span>
                      )}
                    </td>
                    <td>
                      {o.deliveryCity ? (
                        <CellStack primary={o.deliveryCity} secondary={o.deliveryDistrict ?? undefined} />
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>
                    <td className="num">
                      <div className="font-semibold">{formatLKR(o.totalCents ?? 0)}</div>
                      <div className="text-[10px] uppercase text-ink-4">{o.currency ?? 'LKR'}</div>
                    </td>
                    <td>
                      <StatusPill status={o.status} />
                    </td>
                    <td className="text-right">
                      <Link
                        to={`/admin/orders/${o.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-colors hover:bg-ink hover:text-paper"
                      >
                        Open
                        <ArrowRightIcon size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
    </AdminPage>
  );
}
