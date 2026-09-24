import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api, ApiError } from '@/lib/api';
import { useAdminDeliveries, type AdminDelivery } from './useAdminDeliveries';
import { Button, Input, Label, Select, Textarea } from '@/components/ui';
import {
  TruckIcon,
  SearchIcon,
  PackageIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  RefreshCwIcon,
  DownloadIcon,
  XIcon,
} from '@/components/icons';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  CellStack,
  DetailList,
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
  { key: 'all', label: 'All Shipments' },
  { key: 'pending', label: 'Pending Dispatch' },
  { key: 'assigned', label: 'Driver Assigned' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'failed', label: 'Failed / Exception' },
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
    const list = [...rawDeliveries];

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
    const totalShipments = rawDeliveries.length;
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

  const filtered = selectedStatus !== 'all' || searchQuery.trim() !== '';
  const resetFilters = () => {
    setSelectedStatus('all');
    setSearchQuery('');
  };

  return (
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Operations</span>
            <span className="text-ink-5">/</span>
            <span>Logistics &amp; Dispatch Control</span>
          </>
        }
        title="Deliveries Control"
        description="Real-time courier fleet tracking, carrier dispatches, and fulfillment transit audit."
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
              disabled={processedDeliveries.length === 0}
              icon={<DownloadIcon size={14} />}
            >
              Export CSV
            </Button>
          </>
        }
      />

      <StatGrid cols={5}>
        <StatCard label="Total shipments" value={metrics.totalShipments} sub="Active registry" icon={<TruckIcon size={16} />} loading={isLoading} />
        <StatCard
          label="In transit"
          value={metrics.inTransitCount}
          sub="On the road"
          icon={<ClockIcon size={16} />}
          tone={metrics.inTransitCount > 0 ? 'warning' : 'neutral'}
          loading={isLoading}
        />
        <StatCard label="Driver assigned" value={metrics.assignedCount} sub="Awaiting mill pickup" icon={<PackageIcon size={16} />} loading={isLoading} />
        <StatCard
          label="Completed"
          value={metrics.deliveredCount}
          sub="Signed & confirmed"
          icon={<CheckCircleIcon size={16} />}
          tone={metrics.deliveredCount > 0 ? 'success' : 'neutral'}
          loading={isLoading}
        />
        <StatCard
          label="Exceptions / failed"
          value={metrics.failedCount}
          sub="Requires intervention"
          icon={<AlertCircleIcon size={16} />}
          tone={metrics.failedCount > 0 ? 'danger' : 'neutral'}
          loading={isLoading}
        />
      </StatGrid>

      <Tabs items={STATUS_TABS} value={selectedStatus} onChange={setSelectedStatus} ariaLabel="Filter by shipment status" />

      <TableCard
        title="Shipment registry"
        toolbar={
          <Toolbar
            actions={
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className={cn(controlClass, 'h-9 w-auto')}
                aria-label="Sort shipments"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="driver-az">Driver name (A–Z)</option>
              </select>
            }
          >
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search delivery ID, PO#, driver, buyer, supplier, city…"
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
              Showing <strong className="text-ink">{processedDeliveries.length}</strong>{' '}
              {processedDeliveries.length === 1 ? 'shipment' : 'shipments'}
              {filtered ? ' · filters applied' : ''}
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
            title="Couldn't load delivery runs"
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
        ) : processedDeliveries.length === 0 ? (
          <EmptyBlock
            icon={<TruckIcon size={22} />}
            title="No deliveries found"
            description={
              filtered
                ? 'No shipments match the current status filter or search.'
                : 'There are currently no delivery dispatches recorded in the logistics registry.'
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
                <th>Delivery &amp; order</th>
                <th>Buyer &amp; destination</th>
                <th>Supplier (origin)</th>
                <th>Driver / courier</th>
                <th>Timeline / ETA</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {processedDeliveries.map((d: AdminDelivery) => {
                const ts = formatTimestamp(d.createdAt);
                return (
                  <tr key={d.id}>
                    <td>
                      <CellStack
                        mono
                        primary={d.id.slice(0, 10)}
                        secondary={
                          d.purchaseOrderId ? (
                            <Link to={`/admin/orders/${d.purchaseOrderId}`} className="text-copper transition-colors hover:text-ink">
                              PO {d.poNumber ?? d.purchaseOrderId.slice(0, 8)}
                            </Link>
                          ) : (
                            '—'
                          )
                        }
                      />
                    </td>
                    <td>
                      <CellStack
                        primary={d.businessName ?? <span className="font-normal text-ink-4">Direct buyer</span>}
                        secondary={[d.deliveryCity, d.deliveryDistrict].filter(Boolean).join(' · ') || undefined}
                      />
                    </td>
                    <td>
                      <CellStack
                        primary={d.supplierName ?? <span className="font-normal text-ink-4">Direct supplier</span>}
                        secondary={d.supplierPhone ?? undefined}
                      />
                    </td>
                    <td>
                      {d.driverName ? (
                        <CellStack
                          primary={d.driverName}
                          secondary={
                            d.driverPhone ? (
                              <a href={`tel:${d.driverPhone}`} className="text-ink-4 transition-colors hover:text-ink">
                                {d.driverPhone}
                              </a>
                            ) : undefined
                          }
                        />
                      ) : (
                        <Pill tone="warning" dot>
                          Unassigned
                        </Pill>
                      )}
                    </td>
                    <td>
                      <CellStack
                        primary={ts.date}
                        secondary={
                          d.deliveredAt ? (
                            <span className="text-mint">Delivered {formatTimestamp(d.deliveredAt).relative}</span>
                          ) : d.estimatedAt ? (
                            `ETA ${formatTimestamp(d.estimatedAt).date}`
                          ) : (
                            ts.relative
                          )
                        }
                      />
                    </td>
                    <td>
                      <StatusPill status={d.status} />
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => openManager(d)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-colors hover:bg-ink hover:text-paper"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {/* Dispatch management modal */}
      {managingDelivery ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm animate-fade-in" onClick={closeManager}>
          <div className="vyro-surface w-full max-w-lg space-y-5 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="vyro-kicker">Dispatch audit</div>
                <h2 className="mt-1.5 truncate font-mono text-lg font-semibold text-ink">{managingDelivery.id}</h2>
              </div>
              <button
                type="button"
                onClick={closeManager}
                aria-label="Close"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-colors hover:bg-bone hover:text-ink"
              >
                <XIcon size={16} />
              </button>
            </div>

            <DetailList
              columns={2}
              items={[
                { label: 'Associated order', value: managingDelivery.poNumber ?? managingDelivery.purchaseOrderId },
                { label: 'Current status', value: <StatusPill status={managingDelivery.status} /> },
                { label: 'Buyer business', value: managingDelivery.businessName ?? '—' },
                { label: 'Destination', value: managingDelivery.deliveryCity ?? '—' },
              ]}
            />

            {actionSuccess ? <Callout tone="success">{actionSuccess}</Callout> : null}
            {actionError ? <Callout tone="danger">{actionError}</Callout> : null}

            <form
              className="space-y-4 border-t border-ink/[0.07] pt-4"
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="driver-name">Assign driver name</Label>
                  <Input
                    id="driver-name"
                    type="text"
                    value={driverNameInput}
                    onChange={(e) => setDriverNameInput(e.target.value)}
                    placeholder="e.g. Sunil Perera"
                  />
                </div>
                <div>
                  <Label htmlFor="driver-phone">Driver contact phone</Label>
                  <Input
                    id="driver-phone"
                    type="text"
                    value={driverPhoneInput}
                    onChange={(e) => setDriverPhoneInput(e.target.value)}
                    placeholder="+94 77 …"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="target-status">Target status</Label>
                <Select id="target-status" value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)}>
                  <option value="pending">Pending Dispatch</option>
                  <option value="assigned">Driver Assigned</option>
                  <option value="picked_up">Picked Up</option>
                  <option value="in_transit">In Transit</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed / Exception</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="audit-reason">Operational audit reason (required, min 5 chars)</Label>
                <Textarea
                  id="audit-reason"
                  value={auditReason}
                  onChange={(e) => setAuditReason(e.target.value)}
                  rows={2}
                  placeholder="Specify operational dispatch notes or reason for status update…"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={auditReason.trim().length < 5}
                  loading={markLostMutation.isPending}
                  onClick={() =>
                    markLostMutation.mutate({
                      id: managingDelivery.id,
                      reason: auditReason,
                    })
                  }
                >
                  Mark as failed / lost
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={closeManager}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={auditReason.trim().length < 5} loading={updateStatusMutation.isPending}>
                    Apply dispatch update
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
