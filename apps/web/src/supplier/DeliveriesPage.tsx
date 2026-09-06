import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Button, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import {
  TruckIcon,
  SearchIcon,
  MapPinIcon,
  CheckCircle2Icon,
  ClockIcon,
  UserIcon,
  RefreshCwIcon,
  WarehouseIcon,
  ArrowRightIcon,
  PackageIcon,
  ShieldCheckIcon,
} from '@/components/icons';
import { useSupplierId } from './useSupplierId';
import { DeliveryTransitionButtons } from './DeliveryTransitionButtons';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { useToast } from '@vyro/ui';

type Delivery = {
  id: string;
  purchaseOrderId: string;
  status: string;
  estimatedAt: number | null;
  deliveredAt: number | null;
  driverName: string | null;
  driverPhone?: string | null;
};

type Order = {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  deliveryCity?: string;
  deliveryDistrict?: string;
};

type Settings = {
  warehouseAddress: string | null;
  warehouseCity: string | null;
  warehouseDistrict: string | null;
  defaultLeadTimeDays: number | null;
};

type Status = 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
const STATUSES: { id: Status | 'all'; label: string }[] = [
  { id: 'all', label: 'All Shipments' },
  { id: 'pending', label: 'Pending Dispatch' },
  { id: 'assigned', label: 'Driver Assigned' },
  { id: 'picked_up', label: 'Picked Up' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'delivered', label: 'Delivered & Signed' },
  { id: 'failed', label: 'Failed' },
];

const TONE: Record<Status, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'neutral',
  assigned: 'warning',
  picked_up: 'warning',
  in_transit: 'warning',
  delivered: 'success',
  failed: 'danger',
};

const POLL_MS = 30_000;

function statusLabel(s: string) {
  return s.replace(/_/g, ' ');
}

export function SupplierDeliveriesPage() {
  const { supplierId, supplierName } = useSupplierId();
  const toast = useToast();
  const [status, setStatus] = useState<(typeof STATUSES)[number]['id']>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const deliveries = useQuery({
    queryKey: ['supplier', supplierId, 'deliveries', status],
    queryFn: () =>
      api.get<{ items: Delivery[] }>(
        `/deliveries?supplierId=${supplierId}${status === 'all' ? '' : `&status=${status}`}`,
      ),
    retry: false,
    refetchInterval: POLL_MS,
  });

  const ordersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?supplierId=${supplierId}`),
    enabled: !!supplierId,
  });

  const settingsQuery = useQuery({
    queryKey: ['supplier-settings', supplierId],
    queryFn: () => api.get<{ settings: Settings }>(`/suppliers/${supplierId}/settings`),
    enabled: !!supplierId,
  });

  const list = deliveries.data?.items ?? [];
  const orders = ordersQuery.data?.orders ?? [];
  const settings = settingsQuery.data?.settings;

  const handleRefresh = async () => {
    toast.info('Checking fleet tracking status…');
    await deliveries.refetch();
    toast.success('Logistics records synchronized');
  };

  const filteredList = useMemo(() => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (d) =>
        d.id.toLowerCase().includes(q) ||
        d.purchaseOrderId.toLowerCase().includes(q) ||
        d.driverName?.toLowerCase().includes(q) ||
        d.driverPhone?.toLowerCase().includes(q),
    );
  }, [list, searchQuery]);

  const pendingCount = list.filter((d) => d.status === 'pending').length;
  const inTransitCount = list.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status)).length;
  const deliveredCount = list.filter((d) => d.status === 'delivered').length;

  const readyForDispatchOrders = orders.filter((o) =>
    ['accepted', 'preparing', 'ready_for_pickup'].includes(o.status),
  );

  if (deliveries.isLoading) return <SupplierLoadingState label="Connecting to outbound logistics desk" />;
  if (deliveries.isError) {
    return (
      <SupplierErrorState
        message="Could not load deliveries."
        onRetry={() => void deliveries.refetch()}
      />
    );
  }

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            {supplierName} / Fleet Logistics & Freight
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">
            Outbound Deliveries
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Real-time fleet tracking, driver assignment, and electronic proof-of-delivery (eGRN) sync.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-800/20 text-xs font-mono">
            <span className="size-2 rounded-full bg-emerald-600 animate-pulse" />
            Live Fleet Sync
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={deliveries.isFetching}
            className="text-xs gap-1.5"
            title="Refresh fleet statuses"
          >
            <RefreshCwIcon size={14} className={deliveries.isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link to="/supplier/orders">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs font-semibold">
              <PackageIcon size={14} />
              Orders Console →
            </Button>
          </Link>
        </div>
      </header>

      {/* Harmonious Executive KPI Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10 overflow-hidden rounded-lg shadow-soft-sm">
        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <UserIcon size={13} className="text-copper" />
              Pending Dispatch
            </span>
            {pendingCount > 0 ? (
              <Badge variant="warning" className="text-[10px] font-mono">
                {pendingCount} Awaiting Driver
              </Badge>
            ) : (
              <span className="text-[10px] text-emerald-700 font-mono">Dock Clear</span>
            )}
          </div>
          <MetricNumber size="md" className="text-ink">
            {pendingCount}
          </MetricNumber>
          <div className="text-xs text-ink-4">Awaiting fleet assignment</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <TruckIcon size={13} className="text-copper" />
              Active in Transit
            </span>
            <span className="text-[10px] text-ink-4 font-mono">On Route</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {inTransitCount}
          </MetricNumber>
          <div className="text-xs text-ink-4">Freight en route to buyers</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <CheckCircle2Icon size={13} className="text-emerald-700" />
              Delivered & Signed
            </span>
            <span className="text-[10px] text-emerald-800 font-mono font-semibold">eGRN Cleared</span>
          </div>
          <MetricNumber size="md" className="text-emerald-800">
            {deliveredCount}
          </MetricNumber>
          <div className="text-xs text-ink-4">Digital proof of receipt</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <ClockIcon size={13} className="text-copper" />
              Depot Turnaround
            </span>
            <span className="text-[10px] text-ink-4 font-mono">Target SLA</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {settings?.defaultLeadTimeDays ?? 1}d
          </MetricNumber>
          <div className="text-xs text-ink-4">Same-day / 24h dispatch target</div>
        </div>
      </div>

      {/* Active Orders Ready for Freight Banner (if any orders need dispatching) */}
      {readyForDispatchOrders.length > 0 && (
        <Surface kind="elevated" className="p-4 sm:p-5 border-l-4 border-l-amber border border-ink/10 rounded-lg shadow-soft-sm bg-amber-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-2">
              <PackageIcon size={14} className="text-amber" />
              {readyForDispatchOrders.length} Order{readyForDispatchOrders.length === 1 ? '' : 's'} Staged for Logistics Dispatch
            </div>
            <p className="text-xs text-ink-3">
              Purchase orders currently in preparation can be assigned to drivers and scheduled for depot pickup.
            </p>
          </div>
          <Link to="/supplier/orders" className="shrink-0">
            <Button variant="primary" size="sm" className="bg-ink text-paper hover:bg-ink-2 text-xs">
              Go to Fulfillment Queue →
            </Button>
          </Link>
        </Surface>
      )}

      {/* Status Filter Tabs & Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {STATUSES.map((s) => {
              const isActive = s.id === status;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatus(s.id)}
                  className={`px-3.5 py-1.5 text-xs font-mono tracking-wider transition-colors border rounded whitespace-nowrap ${
                    isActive
                      ? 'bg-ink text-paper border-ink font-semibold shadow-xs'
                      : 'bg-paper text-ink-3 border-ink/10 hover:bg-mist/60'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-80">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Delivery ID, PO#, or driver…"
              className="pl-9 text-xs"
            />
          </div>
        </div>

        {/* Deliveries Table or Logistics Fleet Readiness Center */}
        {filteredList.length === 0 ? (
          <Surface kind="elevated" className="overflow-hidden border border-ink/10 p-8 sm:p-12 text-center rounded-lg shadow-soft-sm">
            {searchQuery ? (
              <div className="space-y-2 py-4">
                <SearchIcon size={32} className="mx-auto text-ink-4 opacity-50" />
                <p className="text-sm font-semibold text-ink">No shipments match your search</p>
                <p className="text-xs text-ink-4">Try clearing the search query or selecting a different status tab.</p>
                <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="mt-2 text-xs">
                  Clear Search
                </Button>
              </div>
            ) : (
              <div className="max-w-xl mx-auto space-y-6 py-2">
                <div className="size-14 rounded-full bg-volt-soft border border-volt-deep/30 text-volt-deep mx-auto flex items-center justify-center shadow-xs">
                  <TruckIcon size={24} />
                </div>

                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100/60 text-emerald-900 font-mono text-[11px] font-semibold">
                    <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    Fleet Dispatch Hub Online
                  </div>
                  <h3 className="font-display text-lg font-bold text-ink">
                    No Outbound Shipments In Flight
                  </h3>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Outbound delivery records are generated automatically when incoming purchase orders are accepted and scheduled for dispatch.
                  </p>
                </div>

                {/* Depot Dispatch Capability Card */}
                <div className="p-4 bg-mist/20 border border-line rounded-lg text-left space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                      <WarehouseIcon size={14} className="text-copper" />
                      Depot Dispatch Hub Parameters
                    </span>
                    <Link to="/supplier/settings" className="text-xs text-copper hover:underline font-medium">
                      Edit Depot →
                    </Link>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs text-ink-3 pt-1">
                    <div>
                      <span className="text-ink-4">Location: </span>
                      <strong className="text-ink">
                        {settings?.warehouseCity
                          ? `${settings.warehouseCity}, ${settings.warehouseDistrict || 'Western Province'}`
                          : 'Depot address not set'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-ink-4">Dispatch Turnaround: </span>
                      <strong className="text-ink font-mono">{settings?.defaultLeadTimeDays ?? 1} Business Day(s)</strong>
                    </div>
                  </div>
                </div>

                {/* 4-Step Freight Lifecycle Flow */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left pt-1">
                  <div className="p-3 bg-paper border border-line rounded space-y-1">
                    <div className="text-[10px] font-mono text-copper font-bold uppercase">Stage 1</div>
                    <div className="text-xs font-semibold text-ink">Order Accepted</div>
                    <p className="text-[10px] text-ink-4">PO staged at depot dock.</p>
                  </div>
                  <div className="p-3 bg-paper border border-line rounded space-y-1">
                    <div className="text-[10px] font-mono text-copper font-bold uppercase">Stage 2</div>
                    <div className="text-xs font-semibold text-ink">Driver Assigned</div>
                    <p className="text-[10px] text-ink-4">Record driver name & phone.</p>
                  </div>
                  <div className="p-3 bg-paper border border-line rounded space-y-1">
                    <div className="text-[10px] font-mono text-copper font-bold uppercase">Stage 3</div>
                    <div className="text-xs font-semibold text-ink">Dispatched</div>
                    <p className="text-[10px] text-ink-4">Fleet vehicle departs hub.</p>
                  </div>
                  <div className="p-3 bg-paper border border-line rounded space-y-1">
                    <div className="text-[10px] font-mono text-copper font-bold uppercase">Stage 4</div>
                    <div className="text-xs font-semibold text-ink">eGRN Sign-off</div>
                    <p className="text-[10px] text-ink-4">Buyer verifies & signs.</p>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap justify-center gap-3">
                  <Link to="/supplier/orders">
                    <Button variant="primary" size="sm" className="bg-ink text-paper hover:bg-ink-2">
                      Open Orders Console →
                    </Button>
                  </Link>
                  <Link to="/supplier/settings">
                    <Button variant="ghost" size="sm" className="text-xs">
                      Configure Depot Fleet Settings
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </Surface>
        ) : (
          <Surface kind="elevated" className="overflow-hidden border border-ink/10 rounded-lg shadow-soft-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-medium">Consignment Ref</th>
                    <th className="text-left px-4 py-3.5 font-medium">Purchase Order</th>
                    <th className="text-left px-4 py-3.5 font-medium">Dispatch Status</th>
                    <th className="text-left px-4 py-3.5 font-medium">Assigned Driver</th>
                    <th className="text-right px-4 py-3.5 font-medium">ETA / Delivered</th>
                    <th className="text-right px-5 py-3.5 font-medium">Fleet Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredList.map((d) => (
                    <tr key={d.id} className="hover:bg-mist/30 transition-colors">
                      <td className="px-5 py-4 font-mono text-xs font-semibold text-ink">
                        {d.id.slice(0, 10)}…
                      </td>
                      <td className="px-4 py-4 font-mono text-xs">
                        <Link
                          to={`/orders/${d.purchaseOrderId}`}
                          className="text-ink hover:text-copper underline decoration-ink/20 font-medium"
                        >
                          {d.purchaseOrderId.slice(0, 12)}…
                        </Link>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={TONE[d.status as Status] ?? 'neutral'}>
                          {statusLabel(d.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {d.driverName ? (
                          <div className="flex items-center gap-1.5 text-xs text-ink font-medium">
                            <UserIcon size={12} className="text-copper" />
                            <span>{d.driverName}</span>
                            {d.driverPhone && <span className="text-ink-4 font-mono">({d.driverPhone})</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-4 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right text-xs text-ink-3">
                        {d.deliveredAt ? (
                          <div className="flex items-center justify-end gap-1 text-emerald-800 font-medium">
                            <CheckCircle2Icon size={12} />
                            {new Date(d.deliveredAt).toLocaleDateString()}
                          </div>
                        ) : d.estimatedAt ? (
                          <div className="flex items-center justify-end gap-1">
                            <ClockIcon size={12} />
                            {new Date(d.estimatedAt).toLocaleString()}
                          </div>
                        ) : (
                          <span className="text-ink-4">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <DeliveryTransitionButtons poId={d.purchaseOrderId} status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        )}
      </div>
    </div>
  );
}
