import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Badge, Button, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import {
  PackageIcon,
  SearchIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  RefreshCwIcon,
  PlusIcon,
  ExternalLinkIcon,
  TrendingUpIcon,
  WarehouseIcon,
  ClockIcon,
} from '@/components/icons';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  minOrderQty: number;
  leadTimeDays: number;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  active: boolean;
  stockQty?: number;
  reservedQty?: number;
  lowStockThreshold?: number;
  trackInventory?: boolean;
  availableQty?: number | null;
};

type StockMovement = {
  id: string;
  reason: string;
  qtyDelta: number;
  reservedDelta: number;
  stockQtyAfter: number;
  reservedQtyAfter: number;
  note: string | null;
  createdAt: number;
  purchaseOrderId: string | null;
};

type Product = {
  id: string;
  name: string;
  brand?: string | null;
  unit?: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
};

const TONE = {
  in_stock: 'success' as const,
  low: 'warning' as const,
  out_of_stock: 'danger' as const,
};

const LABEL = { in_stock: 'In stock', low: 'Low stock', out_of_stock: 'Out of stock' };

const ORDER: Offer['availabilityStatus'][] = ['in_stock', 'low', 'out_of_stock'];

export function SupplierInventoryPage() {
  const { supplierId } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Offer['availabilityStatus']>('all');
  const [stockOfferId, setStockOfferId] = useState<string | null>(null);
  const [movementsOfferId, setMovementsOfferId] = useState<string | null>(null);

  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    retry: false,
    refetchInterval: 30_000,
  });

  const catalog = useQuery({
    queryKey: ['products', 'catalog'],
    queryFn: () => api.get<{ products: Product[] }>('/products?limit=500'),
  });

  const nameMap = useMemo(
    () => new Map((catalog.data?.products ?? []).map((p) => [p.id, p])),
    [catalog.data],
  );

  const list = offers.data?.offers ?? [];
  const catalogProducts = catalog.data?.products ?? [];

  const handleRefresh = async () => {
    toast.info('Refreshing warehouse inventory…');
    await Promise.all([offers.refetch(), catalog.refetch()]);
    toast.success('Inventory records updated');
  };

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Offer['availabilityStatus'] }) =>
      api.patch(`/supplier-products/${id}`, { availabilityStatus: status }),
    onSuccess: (_, variables) => {
      toast.success(`Updated stock to ${LABEL[variables.status]}`);
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
    },
    onError: () => {
      toast.error('Failed to update stock status');
    },
  });

  const adjustStock = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { mode: 'set' | 'adjust'; quantity: number; lowStockThreshold?: number; trackInventory?: boolean; note?: string } }) =>
      api.post<{ offer: Offer }>(`/supplier-products/${id}/stock`, body),
    onSuccess: () => {
      toast.success('Stock updated');
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements', stockOfferId] });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Stock update failed'),
  });

  const movementsQuery = useQuery({
    queryKey: ['stock-movements', movementsOfferId],
    queryFn: () =>
      api.get<{ movements: StockMovement[] }>(
        `/supplier-products/${movementsOfferId}/movements?limit=50`,
      ),
    enabled: !!movementsOfferId,
  });

  const filteredList = useMemo(() => {
    return list.filter((o) => {
      const p = nameMap.get(o.productId);
      const matchesSearch =
        !searchQuery ||
        p?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.supplierSku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p?.brand?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || o.availabilityStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [list, nameMap, searchQuery, statusFilter]);

  const counts = list.reduce(
    (acc, o) => ({ ...acc, [o.availabilityStatus]: (acc[o.availabilityStatus] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  // Unlisted master commodities for quick-start inventory setup
  const unlistedProducts = useMemo(() => {
    const listedProductIds = new Set(list.map((o) => o.productId));
    return catalogProducts.filter((p) => !listedProductIds.has(p.id)).slice(0, 6);
  }, [catalogProducts, list]);

  const fillRatePct = list.length > 0 ? Math.round(((counts.in_stock ?? 0) / list.length) * 100) : 0;

  if (offers.isLoading) return <SupplierLoadingState label="Loading warehouse inventory" />;
  if (offers.isError) {
    return (
      <SupplierErrorState
        message="Could not load inventory."
        onRetry={() => void offers.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            Depot Warehousing · Stock Control
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">
            Stock & Inventory Control
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Maintain real-time availability states across SKUs to prevent backorders and ensure fast fulfillment.
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
                <span className="font-semibold text-ink">Depot Synchronized</span>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-amber" />
                <span className="font-semibold text-ink">Zero Depot Inventory</span>
              </>
            )}
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={offers.isFetching}
            className="text-xs gap-1.5"
            title="Refresh warehouse inventory"
          >
            <RefreshCwIcon size={14} className={offers.isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link to="/search" target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs font-semibold">
              <ExternalLinkIcon size={13} />
              <span className="hidden sm:inline">Catalog View</span>
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

      {/* Executive 4-Card Warehouse Inventory KPI Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10 overflow-hidden rounded-lg shadow-soft-sm">
        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <CheckCircle2Icon size={13} className="text-emerald-700" />
              In Stock (Fulfillable)
            </span>
            <span className="text-[10px] font-mono text-emerald-800 font-semibold">Ready for Orders</span>
          </div>
          <MetricNumber size="md" className="text-emerald-800">
            {counts.in_stock ?? 0}
          </MetricNumber>
          <div className="text-xs text-ink-4">Open for instant buyer checkout</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <AlertTriangleIcon size={13} className="text-amber" />
              Low Stock (Threshold)
            </span>
            <span className="text-[10px] font-mono text-amber font-semibold">Re-order Warning</span>
          </div>
          <MetricNumber size="md" className={counts.low ? 'text-amber' : 'text-ink-4'}>
            {counts.low ?? 0}
          </MetricNumber>
          <div className="text-xs text-ink-4">Prompt depot replenishment</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <XCircleIcon size={13} className="text-rose" />
              Depleted / Out
            </span>
            <span className="text-[10px] font-mono text-rose font-semibold">Hidden from Cart</span>
          </div>
          <MetricNumber size="md" className={counts.out_of_stock ? 'text-rose' : 'text-ink-4'}>
            {counts.out_of_stock ?? 0}
          </MetricNumber>
          <div className="text-xs text-ink-4">Prevent checkout stockouts</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <TrendingUpIcon size={13} className="text-copper" />
              Depot Fill Health
            </span>
            <span className="text-[10px] font-mono text-ink-4">Availability</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {fillRatePct}%
          </MetricNumber>
          <div className="text-xs text-ink-4">Across {list.length} managed line items</div>
        </div>
      </div>

      {/* Depot Inventory Protocol & SLAs Surface */}
      <Surface kind="ink" className="p-6 rounded-lg relative overflow-hidden grain shadow-soft-sm">
        <div className="flex items-start gap-4">
          <div className="size-10 rounded-lg bg-volt/15 border border-volt/30 flex items-center justify-center text-volt shrink-0 mt-0.5">
            <WarehouseIcon size={20} />
          </div>
          <div className="space-y-3 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div className="text-xs font-mono uppercase tracking-[0.16em] text-volt font-bold">
                Depot Inventory Protocol & Availability SLAs
              </div>
              <span className="text-[11px] font-mono text-paper/60">Live B2B Order Desk Sync</span>
            </div>
            <p className="text-xs text-paper/80 leading-relaxed max-w-4xl">
              Availability states directly control purchase order checkout. When inventory changes in your facility,
              toggle the status below to ensure order accuracy and maintain 99%+ fulfillment scores:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2Icon size={12} />
                  In Stock (Fulfillable)
                </div>
                <div className="text-[11px] text-paper/70 mt-1">
                  Visible in search, instant PO generation, dispatched within promised lead time.
                </div>
              </div>

              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber font-bold flex items-center gap-1">
                  <AlertTriangleIcon size={12} />
                  Low Stock (Threshold)
                </div>
                <div className="text-[11px] text-paper/70 mt-1">
                  Alert badge shows on product page to signal urgency for bulk buyers to reserve.
                </div>
              </div>

              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-rose font-bold flex items-center gap-1">
                  <XCircleIcon size={12} />
                  Out of Stock
                </div>
                <div className="text-[11px] text-paper/70 mt-1">
                  Checkout suppressed instantly. Prevents unfulfillable orders and cancellation penalties.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {/* When NO inventory exists: Onboarding Launchpad */}
      {list.length === 0 ? (
        <div className="space-y-6">
          <Surface kind="elevated" className="p-6 sm:p-8 border border-ink/10 rounded-lg shadow-soft-sm space-y-6 bg-paper">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-line">
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-xl bg-copper/10 border border-copper/20 flex items-center justify-center text-copper shrink-0">
                  <WarehouseIcon size={24} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold font-display text-ink">
                    No depot inventory tracked yet — Launch your commodity stock
                  </h2>
                  <p className="text-sm text-ink-3 mt-1 max-w-2xl">
                    Add standard wholesale commodities or custom goods to your depot catalog. You will be able to
                    toggle real-time stock status, set warehouse SKU references, and configure dispatch lead times.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                <Link to="/supplier/products/new" className="w-full sm:w-auto">
                  <Button variant="primary" size="md" className="w-full sm:w-auto gap-2 shadow-soft-sm font-semibold">
                    <PlusIcon size={16} />
                    + Add First Depot Commodity
                  </Button>
                </Link>
              </div>
            </div>

            {/* 3-Step Depot Warehousing Roadmap */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-4 font-semibold mb-3">
                How Depot Inventory Control Works
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      1
                    </div>
                    <span className="text-xs font-bold text-ink">Select Standard SKU</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Pick verified national commodity standards (Rice, Sugar, Flour, Tea, Spices) or register custom depot inventory.
                  </p>
                </div>

                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      2
                    </div>
                    <span className="text-xs font-bold text-ink">Assign SKU & Lead Time</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Tag internal bay/bin codes (e.g. `DEP-RICE-01`) and specify your standard dispatch turnaround (e.g. 24h, 48h).
                  </p>
                </div>

                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      3
                    </div>
                    <span className="text-xs font-bold text-ink">1-Click Live Toggles</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Switch stock between `In stock`, `Low stock`, and `Out of stock` with a single click as stock shifts.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick-Start Commodities Stock Grid */}
            {unlistedProducts.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">Quick-Start: Add Standard Commodities to Inventory</h3>
                    <p className="text-xs text-ink-4">Select any commodity to configure depot stock tracking and availability.</p>
                  </div>
                  <Link to="/supplier/products/new" className="text-xs font-medium text-copper hover:underline">
                    View full catalog →
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {unlistedProducts.map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 rounded-lg border border-ink/10 bg-paper hover:border-ink/30 transition-all flex flex-col justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-start gap-3">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="size-11 rounded border border-ink/10 object-cover shrink-0 bg-bone"
                          />
                        ) : (
                          <div className="size-11 rounded border border-ink/10 bg-mist/60 flex items-center justify-center text-ink-4 shrink-0">
                            <PackageIcon size={18} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-ink truncate" title={p.name}>
                            {p.name}
                          </div>
                          <div className="text-[11px] text-ink-4 flex items-center gap-1.5 mt-0.5">
                            {p.brand && <span className="text-ink-3 font-medium">{p.brand}</span>}
                            {p.packSize && <span>· {p.packSize}</span>}
                            {p.unit && <span className="uppercase text-[10px] bg-ink/5 px-1 rounded">{p.unit}</span>}
                          </div>
                        </div>
                      </div>

                      <Link
                        to={`/supplier/products/new?productId=${p.id}`}
                        className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-3 text-xs font-semibold bg-bone hover:bg-ink hover:text-paper border border-ink/15 rounded transition-colors"
                      >
                        <PlusIcon size={13} />
                        Add to Depot Inventory
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Surface>
        </div>
      ) : (
        /* When inventory items exist: Filters & Enhanced Stock Table */
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search inventory by commodity name, SKU…"
                className="pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { id: 'all', label: `All (${list.length})` },
                  { id: 'in_stock', label: `In stock (${counts.in_stock ?? 0})` },
                  { id: 'low', label: `Low stock (${counts.low ?? 0})` },
                  { id: 'out_of_stock', label: `Out of stock (${counts.out_of_stock ?? 0})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as 'all' | Offer['availabilityStatus'])}
                  className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors border rounded ${
                    statusFilter === tab.id
                      ? 'bg-ink text-paper border-ink font-semibold'
                      : 'bg-paper text-ink-3 border-ink/10 hover:bg-mist/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Inventory Table Surface */}
          <Surface kind="elevated" className="overflow-hidden border border-ink/10 rounded-lg shadow-soft-sm">
            {filteredList.length === 0 ? (
              <div className="p-12 text-center text-ink-4 space-y-2">
                <WarehouseIcon size={28} className="mx-auto text-ink-4 opacity-50 mb-2" />
                <p className="text-sm font-medium text-ink-3">No inventory items match your search.</p>
                <p className="text-xs">Try clearing the search query or adjusting your filters.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="text-xs font-semibold text-copper hover:underline mt-2 inline-block"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
                    <tr>
                      <th className="text-left px-5 py-3.5 font-medium">Depot Commodity</th>
                      <th className="text-left px-4 py-3.5 font-medium">Depot SKU</th>
                      <th className="text-left px-4 py-3.5 font-medium">Live Status</th>
                      <th className="text-right px-4 py-3.5 font-medium">On-hand / Free</th>
                      <th className="text-right px-4 py-3.5 font-medium">MOQ & Dispatch Lead</th>
                      <th className="text-right px-5 py-3.5 font-medium">1-Click Availability State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredList.map((o) => {
                      const product = nameMap.get(o.productId);
                      const free = o.availableQty ?? null;
                      const onHand = o.stockQty ?? 0;
                      const reserved = o.reservedQty ?? 0;
                      const tracked = !!o.trackInventory;
                      return (
                        <tr key={o.id} className="hover:bg-mist/30 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {product?.imageUrl ? (
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="size-10 rounded border border-ink/10 object-cover shrink-0 bg-bone"
                                />
                              ) : (
                                <div className="size-10 rounded border border-ink/10 bg-mist/60 flex items-center justify-center text-ink-4 shrink-0">
                                  <PackageIcon size={16} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-ink truncate hover:text-copper transition-colors">
                                  {product?.name ?? 'Standard Commodity'}
                                </div>
                                <div className="text-xs text-ink-4 flex items-center gap-2 mt-0.5">
                                  {product?.brand && <span className="font-medium text-ink-3">{product.brand}</span>}
                                  {product?.packSize && <span>· {product.packSize}</span>}
                                  {product?.unit && (
                                    <span className="uppercase text-[10px] bg-ink/5 px-1.5 py-0.5 rounded font-mono">
                                      {product.unit}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-mono text-xs text-ink-3">
                            {o.supplierSku ? (
                              <span className="bg-bone px-1.5 py-0.5 border border-ink/10 rounded font-mono">
                                {o.supplierSku}
                              </span>
                            ) : (
                              <span className="text-ink-4 italic">Standard SKU</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={TONE[o.availabilityStatus]}>{LABEL[o.availabilityStatus]}</Badge>
                          </td>
                          <td className="px-4 py-4 text-right text-xs text-ink-3">
                            {tracked ? (
                              <div className="flex flex-col items-end gap-0.5 font-mono">
                                <button
                                  type="button"
                                  onClick={() => setStockOfferId(o.id)}
                                  className="font-semibold text-ink hover:text-copper transition-colors"
                                  title="Edit stock"
                                >
                                  {onHand.toLocaleString()} on-hand
                                </button>
                                <span className="text-[11px] text-ink-4">
                                  {free?.toLocaleString() ?? 0} free · {reserved.toLocaleString()} reserved
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setMovementsOfferId(o.id)}
                                  className="text-[10px] text-copper hover:underline uppercase tracking-wider mt-0.5"
                                >
                                  Ledger →
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setStockOfferId(o.id)}
                                className="text-[11px] text-ink-4 hover:text-copper transition-colors uppercase tracking-wider"
                              >
                                Track stock →
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right text-xs text-ink-3">
                            <div className="flex items-center justify-end gap-1.5 font-mono">
                              <span className="font-semibold text-ink">MOQ {o.minOrderQty} {product?.unit ?? 'units'}</span>
                              <span className="text-ink-4">·</span>
                              <span className="bg-mist/60 px-1.5 py-0.5 rounded border border-ink/10 flex items-center gap-1">
                                <ClockIcon size={11} className="text-ink-4" />
                                {o.leadTimeDays}d lead
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex rounded-md border border-line overflow-hidden shadow-xs">
                              {ORDER.map((s) => {
                                const isCurrent = s === o.availabilityStatus;
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    disabled={isCurrent || setStatus.isPending}
                                    onClick={() => setStatus.mutate({ id: o.id, status: s })}
                                    className={
                                      'px-3 py-1.5 text-xs font-mono transition-colors ' +
                                      (isCurrent
                                        ? s === 'in_stock'
                                          ? 'bg-emerald-800 text-paper font-semibold cursor-default'
                                          : s === 'low'
                                            ? 'bg-amber text-paper font-semibold cursor-default'
                                            : 'bg-rose text-paper font-semibold cursor-default'
                                        : 'bg-paper text-ink-3 hover:bg-mist/70')
                                    }
                                  >
                                    {LABEL[s]}
                                  </button>
                                );
                              })}
                            </div>
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
      )}

      {/* Stock editor modal */}
      {stockOfferId && (
        <StockEditorModal
          offer={list.find((o) => o.id === stockOfferId)!}
          unit={nameMap.get(list.find((o) => o.id === stockOfferId)?.productId ?? '')?.unit ?? 'units'}
          submitting={adjustStock.isPending}
          onClose={() => setStockOfferId(null)}
          onSubmit={(body) => adjustStock.mutate({ id: stockOfferId, body })}
        />
      )}

      {/* Movements drawer */}
      {movementsOfferId && (
        <MovementsDrawer
          offer={list.find((o) => o.id === movementsOfferId)!}
          product={nameMap.get(list.find((o) => o.id === movementsOfferId)?.productId ?? '') ?? undefined}
          movements={movementsQuery.data?.movements ?? []}
          loading={movementsQuery.isLoading}
          onClose={() => setMovementsOfferId(null)}
        />
      )}
    </div>
  );
}

function StockEditorModal({
  offer,
  unit,
  submitting,
  onClose,
  onSubmit,
}: {
  offer: Offer;
  unit: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (body: { mode: 'set' | 'adjust'; quantity: number; lowStockThreshold?: number; trackInventory?: boolean; note?: string }) => void;
}) {
  const [mode, setMode] = useState<'set' | 'adjust'>('set');
  const [quantity, setQuantity] = useState<string>(String(offer.stockQty ?? 0));
  const [threshold, setThreshold] = useState<string>(String(offer.lowStockThreshold ?? 0));
  const [tracked, setTracked] = useState<boolean>(!!offer.trackInventory);
  const [note, setNote] = useState<string>('');

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-4" role="dialog">
      <div className="bg-paper border border-ink/10 rounded-lg shadow-soft w-full max-w-md p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Stock control</h2>
            <p className="text-xs text-ink-4 mt-0.5">{unit}</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink text-sm">Close</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['set', 'adjust'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`py-1.5 text-xs font-mono border rounded transition-colors ${
                mode === m ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/10 text-ink-3 hover:bg-mist/60'
              }`}
            >
              {m === 'set' ? 'Set absolute' : 'Adjust ±'}
            </button>
          ))}
          <label className="flex items-center gap-2 text-xs px-2 col-span-1">
            <input
              type="checkbox"
              checked={tracked}
              onChange={(e) => setTracked(e.target.checked)}
              className="accent-copper"
            />
            Track
          </label>
        </div>
        <label className="block text-xs">
          <span className="text-ink-3">Quantity ({mode === 'adjust' ? 'delta' : 'absolute'})</span>
          <Input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 font-mono"
            min={mode === 'set' ? 0 : -1000000}
          />
          <span className="text-[10px] text-ink-4 mt-1 block">
            On-hand {offer.stockQty ?? 0} · Reserved {offer.reservedQty ?? 0} · Free {offer.availableQty ?? '—'}
          </span>
        </label>
        <label className="block text-xs">
          <span className="text-ink-3">Low-stock threshold</span>
          <Input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="mt-1 font-mono"
            min={0}
          />
        </label>
        <label className="block text-xs">
          <span className="text-ink-3">Note (optional)</span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why?"
            className="mt-1"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            disabled={submitting}
            onClick={() => {
              const qty = Number(quantity);
              const thr = Number(threshold);
              const body: { mode: 'set' | 'adjust'; quantity: number; lowStockThreshold?: number; trackInventory?: boolean; note?: string } = {
                mode,
                quantity: Number.isFinite(qty) ? qty : 0,
                trackInventory: tracked,
              };
              // Empty input parses to NaN, which the API rejects with a 400.
              if (threshold.trim() !== '' && Number.isFinite(thr)) body.lowStockThreshold = thr;
              if (note) body.note = note;
              onSubmit(body);
            }}
          >
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MovementsDrawer({
  offer,
  product,
  movements,
  loading,
  onClose,
}: {
  offer: Offer;
  product: Product | undefined;
  movements: StockMovement[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-stretch justify-end" role="dialog">
      <div className="bg-paper border-l border-ink/10 w-full max-w-lg h-full flex flex-col">
        <header className="px-5 py-4 border-b border-ink/10 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Stock ledger</h2>
            <p className="text-xs text-ink-4 mt-0.5">{product?.name ?? '—'}</p>
          </div>
          <button onClick={onClose} className="text-ink-4 hover:text-ink text-sm">Close</button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="h-20 bg-mist animate-pulse" />
          ) : movements.length === 0 ? (
            <p className="text-sm text-ink-4">No movements yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-ink-4 font-mono">
                  <th className="text-left py-2">When</th>
                  <th className="text-left py-2">Reason</th>
                  <th className="text-right py-2">Δ qty</th>
                  <th className="text-right py-2">Δ reserved</th>
                  <th className="text-right py-2">After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2 text-[11px] text-ink-4">{new Date(m.createdAt).toLocaleString('en-GB')}</td>
                    <td className="py-2 text-xs">{m.reason}</td>
                    <td className={`py-2 text-right font-mono ${m.qtyDelta > 0 ? 'text-emerald-700' : m.qtyDelta < 0 ? 'text-rose' : 'text-ink-4'}`}>
                      {m.qtyDelta > 0 ? '+' : ''}{m.qtyDelta}
                    </td>
                    <td className={`py-2 text-right font-mono ${m.reservedDelta > 0 ? 'text-amber' : m.reservedDelta < 0 ? 'text-ink-4' : 'text-ink-4'}`}>
                      {m.reservedDelta > 0 ? '+' : ''}{m.reservedDelta}
                    </td>
                    <td className="py-2 text-right font-mono text-[11px]">
                      {m.stockQtyAfter} on-hand · {m.reservedQtyAfter} reserved
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
