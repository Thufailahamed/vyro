import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAdminDeliveries, type AdminDelivery } from './useAdminDeliveries';
import { StatusBadge, Surface, EmptyState } from '@/components/ui';
import {
  TruckIcon,
  SearchIcon,
  PackageIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  UserIcon,
} from '@/components/icons';

const STATUS_TABS = [
  { id: 'all', label: 'All Shipments' },
  { id: 'pending', label: 'Pending Dispatch' },
  { id: 'assigned', label: 'Driver Assigned' },
  { id: 'picked_up', label: 'Picked Up' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'failed', label: 'Failed / Exception' },
] as const;

type SortOption = 'newest' | 'oldest' | 'driver-az';

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

export function DeliveriesPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Modal / Drawer state for managing a delivery
  const [managingDelivery, setManagingDelivery] = useState<AdminDelivery | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>('assigned');
  const [driverNameInput, setDriverNameInput] = useState<string>('');
  const [driverPhoneInput, setDriverPhoneInput] = useState<string>('');
  const [auditReason, setAuditReason] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const qc = useQueryClient();

  const { data, isLoading, isError, isFetching, refetch } = useAdminDeliveries({
    ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
    ...(searchQuery.trim() ? { q: searchQuery.trim() } : {}),
    limit: 100,
  });

  const rawDeliveries = data?.deliveries ?? [];

  // Filter & Sort
  const processedDeliveries = useMemo(() => {
    let list = [...rawDeliveries];

    list.sort((a, b) => {
      if (sortBy === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (sortBy === 'oldest') return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      if (sortBy === 'driver-az') {
        const dA = a.driverName ?? '';
        const dB = b.driverName ?? '';
        return dA.localeCompare(dB);
      }
      return 0;
    });

    return list;
  }, [rawDeliveries, sortBy]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    let totalShipments = rawDeliveries.length;
    let pendingCount = 0;
    let assignedCount = 0;
    let inTransitCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;

    for (const d of rawDeliveries) {
      if (d.status === 'pending') pendingCount++;
      if (d.status === 'assigned') assignedCount++;
      if (['picked_up', 'in_transit'].includes(d.status)) inTransitCount++;
      if (d.status === 'delivered') deliveredCount++;
      if (d.status === 'failed') failedCount++;
    }

    return {
      totalShipments,
      pendingCount,
      assignedCount,
      inTransitCount,
      deliveredCount,
      failedCount,
    };
  }, [rawDeliveries]);

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: (body: { id: string; status: string; driverName?: string | undefined; driverPhone?: string | undefined; reason: string }) =>
      api.post<{ ok: true }>(`/admin/deliveries/${body.id}/update-status`, {
        status: body.status,
        ...(body.driverName ? { driverName: body.driverName } : {}),
        ...(body.driverPhone ? { driverPhone: body.driverPhone } : {}),
        reason: body.reason,
      }),
    onSuccess: () => {
      setActionError(null);
      setActionSuccess('Delivery status updated successfully.');
      setAuditReason('');
      qc.invalidateQueries({ queryKey: ['admin-deliveries'] });
    },
    onError: (e: unknown) => {
      setActionSuccess(null);
      setActionError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Status update failed');
    },
  });

  const markLostMutation = useMutation({
    mutationFn: (body: { id: string; reason: string }) =>
      api.post<{ ok: true }>(`/admin/deliveries/${body.id}/mark-lost`, { reason: body.reason }),
    onSuccess: () => {
      setActionError(null);
      setActionSuccess('Shipment marked as failed / lost.');
      setAuditReason('');
      qc.invalidateQueries({ queryKey: ['admin-deliveries'] });
    },
    onError: (e: unknown) => {
      setActionSuccess(null);
      setActionError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Mark-lost failed');
    },
  });

  const openManager = (delivery: AdminDelivery) => {
    setManagingDelivery(delivery);
    setTargetStatus(delivery.status);
    setDriverNameInput(delivery.driverName ?? '');
    setDriverPhoneInput(delivery.driverPhone ?? '');
    setAuditReason('');
    setActionError(null);
    setActionSuccess(null);
  };

  const closeManager = () => {
    setManagingDelivery(null);
    setActionError(null);
    setActionSuccess(null);
  };

  // CSV Export
  const exportCsv = () => {
    if (processedDeliveries.length === 0) return;
    const headers = ['Delivery ID', 'PO Number', 'Status', 'Driver', 'Driver Phone', 'Buyer', 'Destination City', 'Date'];
    const rows = processedDeliveries.map((d) => [
      `"${d.id}"`,
      `"${d.poNumber ?? d.purchaseOrderId}"`,
      `"${d.status}"`,
      `"${(d.driverName ?? 'Unassigned').replace(/"/g, '""')}"`,
      `"${d.driverPhone ?? ''}"`,
      `"${(d.businessName ?? 'Unknown').replace(/"/g, '""')}"`,
      `"${d.deliveryCity ?? ''}"`,
      `"${formatTimestamp(d.createdAt).date}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vyro_deliveries_${Date.now()}.csv`);
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
            <span>LOGISTICS & DISPATCH CONTROL</span>
          </p>
          <h1 className="vyro-display text-3xl font-bold tracking-tight text-ink mt-0.5">
            Deliveries Control
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Real-time courier fleet tracking, carrier dispatches, and fulfillment transit audit.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-ink/15 hover:bg-sand/40 bg-paper transition disabled:opacity-50"
            title="Refresh Deliveries"
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
            disabled={processedDeliveries.length === 0}
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
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Total Shipments</span>
            <TruckIcon size={16} className="text-ink-3" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.totalShipments}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Active registry</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">In Transit</span>
            <span className="w-2 h-2 rounded-full bg-copper animate-pulse" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-copper-deep tracking-tight">
            {metrics.inTransitCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">On the road</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Driver Assigned</span>
            <UserIcon size={16} className="text-ink-3" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.assignedCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Awaiting mill pickup</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Completed</span>
            <CheckCircleIcon size={16} className="text-mint" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-mint tracking-tight">
            {metrics.deliveredCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Signed & confirmed</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Exceptions / Failed</span>
            <AlertCircleIcon size={16} className="text-rose" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose tracking-tight">
            {metrics.failedCount}
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
              placeholder="Search delivery ID, PO#, driver, buyer, supplier, city…"
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
              Showing <strong>{processedDeliveries.length}</strong> {processedDeliveries.length === 1 ? 'shipment' : 'shipments'}
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
                <option value="driver-az">Driver Name (A–Z)</option>
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
              <span>Failed to load delivery runs from the backend API.</span>
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
        ) : processedDeliveries.length === 0 ? (
          /* Empty State */
          <EmptyState
            icon={<TruckIcon size={24} />}
            title="No deliveries found"
            description={
              searchQuery || selectedStatus !== 'all'
                ? `No shipments match the status filter "${selectedStatus}" or search "${searchQuery}".`
                : 'There are currently no delivery dispatches recorded in the logistics registry.'
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
                  <th className="py-3 px-4">Delivery & Order</th>
                  <th className="py-3 px-4">Buyer & Destination</th>
                  <th className="py-3 px-4">Supplier (Origin)</th>
                  <th className="py-3 px-4">Driver / Courier</th>
                  <th className="py-3 px-4">Timeline / ETA</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {processedDeliveries.map((d: AdminDelivery) => {
                  const ts = formatTimestamp(d.createdAt);
                  return (
                    <tr
                      key={d.id}
                      className="hover:bg-sand/20 transition-colors group"
                    >
                      {/* Delivery ID & PO Number */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-ink bg-ink/5 border border-ink/10 px-1.5 py-0.5 rounded">
                            {d.id.slice(0, 10)}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-ink-4 flex items-center gap-1.5">
                          <span>PO:</span>
                          {d.purchaseOrderId ? (
                            <Link
                              to={`/admin/orders/${d.purchaseOrderId}`}
                              className="font-mono text-copper hover:underline"
                            >
                              {d.poNumber ?? d.purchaseOrderId.slice(0, 8)}
                            </Link>
                          ) : (
                            <span className="font-mono">—</span>
                          )}
                        </div>
                      </td>

                      {/* Buyer & Destination */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-ink text-sm">
                          {d.businessName ?? (
                            <span className="text-ink-4 font-mono font-normal">Direct Buyer</span>
                          )}
                        </div>
                        {d.deliveryCity && (
                          <div className="text-[11px] text-ink-4 mt-0.5 flex items-center gap-1">
                            <span className="px-1.5 py-0.2 bg-mist text-ink-3 font-mono text-[10px]">
                              {d.deliveryCity}
                            </span>
                            {d.deliveryDistrict && <span>• {d.deliveryDistrict}</span>}
                          </div>
                        )}
                      </td>

                      {/* Supplier Origin */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-ink">
                          {d.supplierName ?? (
                            <span className="text-ink-4 font-mono font-normal">Direct Supplier</span>
                          )}
                        </div>
                        {d.supplierPhone && (
                          <div className="text-[11px] text-ink-4 font-mono mt-0.5">
                            {d.supplierPhone}
                          </div>
                        )}
                      </td>

                      {/* Driver / Courier */}
                      <td className="py-3.5 px-4">
                        {d.driverName ? (
                          <div>
                            <div className="font-semibold text-ink flex items-center gap-1">
                              <UserIcon size={12} className="text-ink-4" />
                              <span>{d.driverName}</span>
                            </div>
                            {d.driverPhone && (
                              <div className="text-[11px] text-ink-4 font-mono mt-0.5">
                                <a href={`tel:${d.driverPhone}`} className="hover:underline">
                                  {d.driverPhone}
                                </a>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono bg-amber/10 text-amber border border-amber/20">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Timeline / ETA */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs text-ink flex items-center gap-1">
                          <ClockIcon size={12} className="text-ink-4" />
                          <span>{ts.date}</span>
                        </div>
                        <div className="text-[10px] text-ink-4 font-mono mt-0.5">
                          {d.deliveredAt ? (
                            <span className="text-mint">Delivered</span>
                          ) : d.estimatedAt ? (
                            <span>ETA: {formatTimestamp(d.estimatedAt).date}</span>
                          ) : (
                            <span>{ts.relative}</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <StatusBadge status={d.status} />
                      </td>

                      {/* Action Button */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openManager(d)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium border border-ink/15 bg-paper hover:bg-ink hover:text-paper transition group-hover:border-ink/30"
                        >
                          <span>Manage</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* 5. Dispatch Management Modal */}
      {managingDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-paper border-2 border-ink shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase text-ink-4 block">Logistics Dispatch Audit</span>
                <h2 className="vyro-display text-xl font-mono font-bold text-ink">
                  {managingDelivery.id}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeManager}
                className="text-ink-4 hover:text-ink font-mono text-sm px-2 py-1"
              >
                ✕ Close
              </button>
            </div>

            {/* Delivery Snapshot Info */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-sand/30 border border-ink/10 text-xs font-mono">
              <div>
                <span className="text-ink-4 block text-[10px] uppercase">Associated Order:</span>
                <span className="font-bold text-ink">{managingDelivery.poNumber ?? managingDelivery.purchaseOrderId}</span>
              </div>
              <div>
                <span className="text-ink-4 block text-[10px] uppercase">Current Status:</span>
                <span className="font-bold text-ink uppercase">{managingDelivery.status}</span>
              </div>
              <div>
                <span className="text-ink-4 block text-[10px] uppercase">Buyer Business:</span>
                <span className="text-ink">{managingDelivery.businessName ?? '—'}</span>
              </div>
              <div>
                <span className="text-ink-4 block text-[10px] uppercase">Destination:</span>
                <span className="text-ink">{managingDelivery.deliveryCity ?? '—'}</span>
              </div>
            </div>

            {actionSuccess && (
              <div className="p-3 bg-mint/10 border border-mint/25 text-mint text-xs flex items-center gap-2">
                <CheckCircleIcon size={16} />
                <span>{actionSuccess}</span>
              </div>
            )}

            {actionError && (
              <div className="p-3 bg-rose/10 border border-rose/25 text-rose text-xs flex items-center gap-2">
                <AlertCircleIcon size={16} />
                <span>{actionError}</span>
              </div>
            )}

            {/* Dispatch Form */}
            <form
              className="space-y-3 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                updateStatusMutation.mutate({
                  id: managingDelivery.id,
                  status: targetStatus,
                  driverName: driverNameInput.trim() || undefined,
                  driverPhone: driverPhoneInput.trim() || undefined,
                  reason: auditReason,
                });
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-ink-4 mb-1">
                    Assign Driver Name
                  </label>
                  <input
                    type="text"
                    value={driverNameInput}
                    onChange={(e) => setDriverNameInput(e.target.value)}
                    placeholder="e.g. Sunil Perera"
                    className="w-full h-9 px-2.5 text-xs border border-ink/20 bg-paper focus:outline-none focus:border-ink"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-ink-4 mb-1">
                    Driver Contact Phone
                  </label>
                  <input
                    type="text"
                    value={driverPhoneInput}
                    onChange={(e) => setDriverPhoneInput(e.target.value)}
                    placeholder="+94 77 …"
                    className="w-full h-9 px-2.5 text-xs font-mono border border-ink/20 bg-paper focus:outline-none focus:border-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-ink-4 mb-1">
                  Target Status
                </label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-ink/20 bg-paper focus:outline-none focus:border-ink uppercase"
                >
                  <option value="pending">Pending Dispatch</option>
                  <option value="assigned">Driver Assigned</option>
                  <option value="picked_up">Picked Up</option>
                  <option value="in_transit">In Transit</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed / Exception</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-ink-4 mb-1">
                  Operational Audit Reason (Required, min 5 chars)
                </label>
                <textarea
                  value={auditReason}
                  onChange={(e) => setAuditReason(e.target.value)}
                  rows={2}
                  placeholder="Specify operational dispatch notes or reason for status update…"
                  className="w-full p-2 text-xs border border-ink/20 bg-paper focus:outline-none focus:border-ink resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={markLostMutation.isPending || auditReason.trim().length < 5}
                  onClick={() =>
                    markLostMutation.mutate({
                      id: managingDelivery.id,
                      reason: auditReason,
                    })
                  }
                  className="px-3 py-2 border border-rose text-rose hover:bg-rose/10 text-xs font-mono font-medium disabled:opacity-40 transition"
                >
                  {markLostMutation.isPending ? 'Marking…' : 'Mark as Failed / Lost'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeManager}
                    className="px-3 py-2 text-xs font-mono text-ink-3 hover:text-ink underline"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateStatusMutation.isPending || auditReason.trim().length < 5}
                    className="px-4 py-2 bg-ink text-paper hover:bg-ink-2 text-xs font-mono font-bold disabled:opacity-40 transition"
                  >
                    {updateStatusMutation.isPending ? 'Applying…' : 'Apply Dispatch Update'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

