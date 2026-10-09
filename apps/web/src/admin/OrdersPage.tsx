import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { useAdminOrders, type AdminOrder } from './useAdminOrders';
import { Button } from '@/components/ui';
import {
  SearchIcon,
  PackageIcon,
  TruckIcon,
  AlertCircleIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  DownloadIcon,
  XIcon,
  MapPinIcon,
  BanknoteIcon,
  TrendingUpIcon,
} from '@/components/icons';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  EmptyBlock,
  Pill,
  StatCard,
  StatGrid,
  StatusPill,
  TableCard,
  TableSkeleton,
  Toolbar,
  controlClass,
} from './ui';
import { Monogram, formatDate, relativeTime } from './registryUi';

const LIMIT = 100;

/** Happy-path lifecycle, in order. */
export const ORDER_STAGES = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
] as const;

const EXCEPTIONS = [
  { key: 'disputed', label: 'Disputed', dot: 'bg-rose' },
  { key: 'cancelled', label: 'Cancelled', dot: 'bg-ink-4' },
  { key: 'rejected', label: 'Rejected', dot: 'bg-rose/60' },
] as const;

const STAGE_INDEX: Record<string, number> = Object.fromEntries(ORDER_STAGES.map((s, i) => [s.key, i]));
const FULFILMENT = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'];

type SortOption = 'newest' | 'oldest' | 'amount-high' | 'amount-low';
type Direction = 'all' | 'domestic' | 'export' | 'import';

export function OrdersPage() {
  const navigate = useNavigate();
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState<Direction>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Unfiltered snapshot feeds the pipeline counts so they stay stable while filtering.
  const overview = useAdminOrders({ limit: LIMIT });
  const { data, isLoading, isError, isFetching, refetch } = useAdminOrders({
    ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
    ...(searchQuery ? { q: searchQuery } : {}),
    ...(directionFilter !== 'all' ? { direction: directionFilter } : {}),
    limit: LIMIT,
  });

  const allOrders = overview.data?.orders ?? [];
  const rawOrders = data?.orders ?? [];

  const processedOrders = useMemo(() => {
    const list = [...rawOrders];
    list.sort((a, b) => {
      if (sortBy === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (sortBy === 'oldest') return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      if (sortBy === 'amount-high') return (b.totalCents ?? 0) - (a.totalCents ?? 0);
      return (a.totalCents ?? 0) - (b.totalCents ?? 0);
    });
    return list;
  }, [rawOrders, sortBy]);

  const metrics = useMemo(() => {
    const counts: Record<string, number> = {};
    let gmv = 0;
    let liveGmv = 0;
    for (const o of allOrders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
      gmv += o.totalCents ?? 0;
      if (!['cancelled', 'rejected'].includes(o.status)) liveGmv += o.totalCents ?? 0;
    }
    const total = allOrders.length;
    const inFulfilment = FULFILMENT.reduce((n, k) => n + (counts[k] ?? 0), 0);
    const live = total - (counts.cancelled ?? 0) - (counts.rejected ?? 0);
    return {
      counts,
      total,
      gmv,
      avg: live > 0 ? Math.round(liveGmv / live) : 0,
      inFulfilment,
      attention: (counts.pending ?? 0) + (counts.disputed ?? 0),
    };
  }, [allOrders]);

  const exportCsv = () => {
    if (processedOrders.length === 0) return;
    const headers = ['PO Number', 'Date', 'Status', 'Buyer', 'Supplier', 'Destination City', 'Amount (LKR)'];
    const rows = processedOrders.map((o) => [
      `"${o.poNumber ?? o.id}"`,
      `"${o.createdAt ? formatDate(o.createdAt) : ''}"`,
      `"${o.status}"`,
      `"${(o.businessName ?? 'Unknown').replace(/"/g, '""')}"`,
      `"${(o.supplierName ?? 'Unknown').replace(/"/g, '""')}"`,
      `"${o.deliveryCity ?? ''}"`,
      (o.totalCents ?? 0) / 100,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `vyro_orders_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = selectedStatus !== 'all' || searchQuery !== '' || directionFilter !== 'all';
  const resetFilters = () => {
    setSelectedStatus('all');
    setSearchInput('');
    setSearchQuery('');
    setDirectionFilter('all');
  };
  const toggleStatus = (key: string) => setSelectedStatus((cur) => (cur === key ? 'all' : key));
  const refreshAll = () => {
    void refetch();
    void overview.refetch();
  };
  const syncing = isFetching || overview.isFetching;
  const statsLoading = overview.isLoading;

  const openRow = (e: React.MouseEvent<HTMLTableRowElement>, id: string) => {
    if ((e.target as HTMLElement).closest('a,button,input,select')) return;
    navigate(`/admin/orders/${id}`);
  };

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
              onClick={refreshAll}
              loading={syncing}
              icon={syncing ? undefined : <RefreshCwIcon size={14} />}
            >
              {syncing ? 'Syncing…' : 'Refresh'}
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

      <StatGrid cols={4}>
        <StatCard
          label="Gross volume"
          value={formatCompactLKR(metrics.gmv)}
          sub={`Across ${metrics.total} ${metrics.total === 1 ? 'order' : 'orders'}`}
          icon={<BanknoteIcon size={16} />}
          loading={statsLoading}
        />
        <StatCard
          label="Average order"
          value={formatCompactLKR(metrics.avg)}
          sub="Excludes cancelled & rejected"
          icon={<TrendingUpIcon size={16} />}
          loading={statsLoading}
        />
        <StatCard
          label="In fulfilment"
          value={metrics.inFulfilment}
          sub="Accepted through out for delivery"
          icon={<TruckIcon size={16} />}
          loading={statsLoading}
        />
        <StatCard
          label="Needs attention"
          value={metrics.attention}
          sub={`${metrics.counts.pending ?? 0} pending · ${metrics.counts.disputed ?? 0} disputed`}
          icon={<AlertCircleIcon size={16} />}
          tone={metrics.attention > 0 ? 'warning' : 'neutral'}
          loading={statsLoading}
        />
      </StatGrid>

      {/* Lifecycle pipeline — doubles as the status filter */}
      <section className="vyro-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">Order pipeline</h2>
            <p className="mt-0.5 text-xs text-ink-4">
              Click a stage to filter the ledger.
              {metrics.total >= LIMIT ? ` Counts cover the latest ${LIMIT} orders.` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedStatus('all')}
            className={cn(
              'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-all',
              selectedStatus === 'all'
                ? 'bg-ink text-paper shadow-[0_6px_14px_-6px_rgba(12,14,11,0.5)]'
                : 'text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] hover:text-ink',
            )}
          >
            All orders
            <span
              className={cn(
                'rounded-full px-1.5 text-[10px] font-semibold leading-4 num-tabular',
                selectedStatus === 'all' ? 'bg-volt text-ink' : 'bg-ink/[0.08]',
              )}
            >
              {metrics.total}
            </span>
          </button>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <ol className="flex min-w-max gap-1.5 px-5 pb-5 pt-4 sm:px-6">
            {ORDER_STAGES.map((s, i) => {
              const count = metrics.counts[s.key] ?? 0;
              const active = selectedStatus === s.key;
              return (
                <li key={s.key} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleStatus(s.key)}
                    aria-pressed={active}
                    className={cn(
                      'group flex w-[132px] flex-col items-start rounded-xl px-3.5 py-3 text-left transition-all duration-200',
                      active
                        ? 'bg-ink text-paper shadow-[0_10px_24px_-12px_rgba(12,14,11,0.6)]'
                        : 'bg-bone/50 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)] hover:bg-bone hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)]',
                    )}
                  >
                    <span className={cn('font-mono text-[10px] font-semibold', active ? 'text-volt' : 'text-ink-5')}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={cn(
                        'vyro-metric mt-1.5 text-2xl leading-none',
                        active ? 'text-paper' : count > 0 ? 'text-ink' : 'text-ink-5',
                      )}
                    >
                      {statsLoading ? '·' : count}
                    </span>
                    <span className={cn('mt-1.5 truncate text-xs', active ? 'text-paper/75' : 'text-ink-4')}>
                      {s.label}
                    </span>
                  </button>
                  {i < ORDER_STAGES.length - 1 ? (
                    <ArrowRightIcon size={12} className="shrink-0 text-ink-5" aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink/[0.07] bg-bone/40 px-5 py-3 sm:px-6">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-5">Exceptions</span>
          {EXCEPTIONS.map((x) => {
            const count = metrics.counts[x.key] ?? 0;
            const active = selectedStatus === x.key;
            return (
              <button
                key={x.key}
                type="button"
                onClick={() => toggleStatus(x.key)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-7 items-center gap-2 rounded-full px-3 text-xs font-medium transition-all',
                  active
                    ? 'bg-ink text-paper'
                    : 'bg-paper text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] hover:text-ink',
                )}
              >
                <span className={cn('size-1.5 rounded-full', x.dot)} aria-hidden />
                {x.label}
                <span className="font-mono font-semibold num-tabular">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <TableCard
        title="Purchase orders"
        description={
          selectedStatus !== 'all'
            ? `Filtered to ${selectedStatus.replace(/_/g, ' ')}`
            : 'Every purchase order across buyers and suppliers'
        }
        toolbar={
          <Toolbar
            actions={
              <>
                <select
                  value={directionFilter}
                  onChange={(e) => setDirectionFilter(e.target.value as Direction)}
                  className={cn(controlClass, 'w-auto')}
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
                  className={cn(controlClass, 'w-auto')}
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
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search PO#, buyer, supplier, city…"
                aria-label="Search orders"
                className={cn(controlClass, 'w-full pl-9 pr-8')}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
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
              {rawOrders.length >= LIMIT ? ` · latest ${LIMIT}` : ''}
            </span>
            {filtered ? (
              <button type="button" onClick={resetFilters} className="font-semibold text-copper transition-colors hover:text-ink">
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
          <TableSkeleton rows={6} cols={6} />
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
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Reset all filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Purchase order</th>
                <th>Buyer</th>
                <th>Supplier</th>
                <th>Destination</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {processedOrders.map((o) => (
                <OrderRow key={o.id} o={o} onClick={(e) => openRow(e, o.id)} />
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </AdminPage>
  );
}

function OrderRow({ o, onClick }: { o: AdminOrder; onClick: (e: React.MouseEvent<HTMLTableRowElement>) => void }) {
  const crossBorder = o.direction && o.direction !== 'domestic';
  return (
    <tr onClick={onClick} className="group/row cursor-pointer">
      <td>
        <Link
          to={`/admin/orders/${o.id}`}
          className="block font-mono text-[13px] font-semibold tracking-[-0.01em] text-ink transition-colors hover:text-copper-deep"
        >
          {o.poNumber ?? o.id.slice(0, 8)}
        </Link>
        <div className="mt-1 flex items-center gap-2 text-xs text-ink-4">
          {o.createdAt ? (
            <span title={new Date(o.createdAt).toLocaleString()}>
              {formatDate(o.createdAt)} · {relativeTime(o.createdAt)}
            </span>
          ) : (
            '—'
          )}
          {crossBorder ? (
            <Pill tone={o.direction === 'export' ? 'brand' : 'info'} className="capitalize">
              {o.direction}
              {o.incoterms ? ` · ${o.incoterms}` : ''}
            </Pill>
          ) : null}
        </div>
      </td>
      <td>
        <Party name={o.businessName} fallback="Direct buyer" seed={o.businessId} sub={o.businessCity} />
      </td>
      <td>
        <Party name={o.supplierName} fallback="Direct supplier" seed={o.supplierId} sub={o.supplierCity} />
      </td>
      <td>
        {o.deliveryCity ? (
          <div className="flex items-start gap-2">
            <MapPinIcon size={13} className="mt-0.5 shrink-0 text-ink-5" />
            <div className="min-w-0">
              <div className="truncate capitalize text-ink">{o.deliveryCity}</div>
              {o.deliveryDistrict && o.deliveryDistrict.toLowerCase() !== o.deliveryCity.toLowerCase() ? (
                <div className="mt-0.5 truncate text-xs text-ink-4">{o.deliveryDistrict}</div>
              ) : null}
            </div>
          </div>
        ) : (
          <span className="text-ink-5">—</span>
        )}
      </td>
      <td className="num whitespace-nowrap">
        <div className="font-semibold text-ink">{formatLKR(o.totalCents ?? 0)}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-4">{o.currency ?? 'LKR'}</div>
      </td>
      <td>
        <div className="flex flex-col items-start gap-1.5">
          <StatusPill status={o.status} />
          <StageDots status={o.status} />
        </div>
      </td>
      <td className="text-right">
        <Link
          to={`/admin/orders/${o.id}`}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] transition-all hover:bg-ink hover:text-paper hover:shadow-[0_6px_14px_-6px_rgba(12,14,11,0.5)] group-hover/row:text-ink group-hover/row:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]"
        >
          Open
          <ArrowRightIcon size={12} />
        </Link>
      </td>
    </tr>
  );
}

function Party({
  name,
  fallback,
  seed,
  sub,
}: {
  name: string | null | undefined;
  fallback: string;
  seed: string | undefined;
  sub: string | null | undefined;
}) {
  return (
    <div className="flex min-w-[160px] items-center gap-2.5">
      <Monogram name={name ?? fallback} seed={seed} size="sm" />
      <div className="min-w-0">
        <div className={cn('max-w-[200px] truncate font-medium', name ? 'text-ink' : 'text-ink-4')}>{name ?? fallback}</div>
        {sub ? <div className="mt-0.5 truncate text-xs capitalize text-ink-4">{sub}</div> : null}
      </div>
    </div>
  );
}

/** Compact progress through the happy-path lifecycle; hidden for exception states. */
function StageDots({ status }: { status: string }) {
  const idx = STAGE_INDEX[status];
  if (idx === undefined) return null;
  return (
    <span className="flex items-center gap-[3px] pl-1" aria-label={`Stage ${idx + 1} of ${ORDER_STAGES.length}`}>
      {ORDER_STAGES.map((s, i) => (
        <span
          key={s.key}
          className={cn('h-1 w-2.5 rounded-full', i < idx ? 'bg-ink/45' : i === idx ? 'bg-volt-deep' : 'bg-ink/10')}
        />
      ))}
    </span>
  );
}
