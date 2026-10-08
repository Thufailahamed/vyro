import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import {
  PackageIcon,
  SearchIcon,
  RefreshCwIcon,
  PlusIcon,
  ExternalLinkIcon,
  WarehouseIcon,
  ClockIcon,
  XIcon,
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

const LABEL = { in_stock: 'In stock', low: 'Low stock', out_of_stock: 'Out of stock' };

const ORDER: Offer['availabilityStatus'][] = ['in_stock', 'low', 'out_of_stock'];

const STATUS_STYLE: Record<Offer['availabilityStatus'], { dot: string; bar: string; text: string }> = {
  in_stock: { dot: 'bg-mint', bar: 'bg-mint', text: 'text-mint' },
  low: { dot: 'bg-amber', bar: 'bg-amber', text: 'text-amber' },
  out_of_stock: { dot: 'bg-rose', bar: 'bg-rose', text: 'text-rose' },
};

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

  const total = list.length;
  const statusMeta: { id: Offer['availabilityStatus']; count: number; blurb: string }[] = [
    { id: 'in_stock', count: counts.in_stock ?? 0, blurb: 'Visible in search · instant PO checkout' },
    { id: 'low', count: counts.low ?? 0, blurb: 'Urgency badge shown to bulk buyers' },
    { id: 'out_of_stock', count: counts.out_of_stock ?? 0, blurb: 'Checkout suppressed · no penalties' },
  ];

  return (
    <div className="space-y-6">
      {/* Hero: identity, actions & availability composition */}
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
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-6">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-volt">
                  <WarehouseIcon size={14} />
                  Depot warehousing
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-paper/15 bg-paper/5 px-2.5 py-1 text-[11px] text-paper/70">
                  <span className={`size-1.5 rounded-full ${total > 0 ? 'bg-mint animate-pulse' : 'bg-amber'}`} />
                  {total > 0 ? 'Depot synchronized' : 'Zero depot inventory'}
                </span>
              </div>
              <h1 className="font-display font-extrabold text-3xl sm:text-5xl leading-[0.95] tracking-tight">
                Stock &amp; Inventory
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-paper/55">
                Availability states publish to buyers instantly. Keep them accurate to prevent backorders and protect
                your fulfillment score.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={offers.isFetching}
                className="inline-flex size-11 items-center justify-center rounded-full border border-paper/15 bg-paper/5 text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper disabled:opacity-50 cursor-pointer"
                title="Refresh warehouse inventory"
                aria-label="Refresh warehouse inventory"
              >
                <RefreshCwIcon size={16} className={offers.isFetching ? 'animate-spin' : ''} />
              </button>
              <Link
                to="/search"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-5 text-sm font-medium text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
              >
                <ExternalLinkIcon size={15} />
                Catalog view
              </Link>
              <Link
                to="/supplier/products/new"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-volt px-5 text-sm font-semibold text-ink transition-colors hover:bg-volt-glow"
              >
                <PlusIcon size={16} />
                Add product
              </Link>
            </div>
          </div>

          {/* Availability composition */}
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,15rem)_1fr] gap-6 lg:gap-10 border-t border-paper/10 pt-7">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-paper/45">Depot fill health</div>
              <div className="mt-2 flex items-baseline gap-1 font-display font-extrabold tracking-tight">
                <span className="text-5xl sm:text-6xl leading-none">{fillRatePct}</span>
                <span className="text-2xl text-volt">%</span>
              </div>
              <div className="mt-2 text-xs text-paper/50">
                {counts.in_stock ?? 0} of {total} line {total === 1 ? 'item' : 'items'} fulfillable
              </div>
            </div>

            <div className="space-y-4 min-w-0">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-paper/10" aria-hidden="true">
                {total > 0 &&
                  statusMeta.map((s) =>
                    s.count > 0 ? (
                      <div
                        key={s.id}
                        className={`${STATUS_STYLE[s.id].bar} h-full first:rounded-l-full last:rounded-r-full`}
                        style={{ width: `${(s.count / total) * 100}%` }}
                      />
                    ) : null,
                  )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {statusMeta.map((s) => {
                  const active = statusFilter === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStatusFilter(active ? 'all' : s.id)}
                      aria-pressed={active}
                      className={`group text-left rounded-xl border px-4 py-3 transition-colors cursor-pointer ${
                        active ? 'border-paper/30 bg-paper/10' : 'border-paper/10 bg-paper/[0.03] hover:bg-paper/[0.07]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-xs font-medium text-paper/80">
                          <span className={`size-2 rounded-full ${STATUS_STYLE[s.id].dot}`} />
                          {LABEL[s.id]}
                        </span>
                        <span className={`font-display text-xl font-bold leading-none ${s.count ? 'text-paper' : 'text-paper/35'}`}>
                          {s.count}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[11px] leading-snug text-paper/45">{s.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* When NO inventory exists: Onboarding Launchpad */}
      {list.length === 0 ? (
        <div className="space-y-6">
          <Surface kind="elevated" className="p-6 sm:p-8 space-y-6">
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
                    Add First Depot Commodity
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
                <div className="p-4 rounded-xl bg-ink/[0.03] space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      1
                    </div>
                    <span className="text-xs font-bold text-ink">Select Standard SKU</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Pick verified national commodity standards (Rice, Sugar, Flour, Tea, Spices) or register custom depot inventory.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-ink/[0.03] space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      2
                    </div>
                    <span className="text-xs font-bold text-ink">Assign SKU & Lead Time</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Tag internal bay/bin codes (e.g. `DEP-RICE-01`) and specify your standard dispatch turnaround (e.g. 24h, 48h).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-ink/[0.03] space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
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
                      className="p-3.5 rounded-xl border border-ink/10 bg-paper hover:border-ink/30 transition-all flex flex-col justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-start gap-3">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="size-11 rounded-lg border border-ink/10 object-cover shrink-0 bg-bone"
                          />
                        ) : (
                          <div className="size-11 rounded-lg bg-ink/[0.06] flex items-center justify-center text-ink-4 shrink-0">
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
                        className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-3 text-xs font-semibold bg-bone hover:bg-ink hover:text-paper border border-ink/15 rounded-lg transition-colors"
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
        /* When inventory items exist: Inventory table card */
        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-soft-md">
          {/* Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 py-4 sm:px-6 border-b border-ink/10">
            <div className="flex items-center gap-3 min-w-0">
              <div>
                <h2 className="font-display text-lg font-bold text-ink leading-tight">Inventory lines</h2>
                <p className="text-xs text-ink-4">
                  {filteredList.length === list.length
                    ? `${list.length} ${list.length === 1 ? 'SKU' : 'SKUs'} in your depot`
                    : `Showing ${filteredList.length} of ${list.length}`}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative sm:w-72">
                <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, SKU or brand…"
                  aria-label="Search inventory"
                  className="h-10 w-full rounded-full border border-ink/10 bg-bone/60 pl-10 pr-4 text-sm text-ink placeholder:text-ink-4 outline-none transition focus:border-ink/30 focus:bg-paper focus:ring-4 focus:ring-volt/25"
                />
              </div>
              <div className="inline-flex items-center gap-0.5 rounded-full bg-bone p-1 overflow-x-auto scrollbar-none">
                {(
                  [
                    { id: 'all', label: 'All', count: list.length },
                    { id: 'in_stock', label: 'In stock', count: counts.in_stock ?? 0 },
                    { id: 'low', label: 'Low', count: counts.low ?? 0 },
                    { id: 'out_of_stock', label: 'Out', count: counts.out_of_stock ?? 0 },
                  ] as const
                ).map((tab) => {
                  const active = statusFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                        active ? 'bg-paper text-ink shadow-soft-sm ring-1 ring-ink/10' : 'text-ink-3 hover:text-ink'
                      }`}
                    >
                      {tab.id !== 'all' && <span className={`size-1.5 rounded-full ${STATUS_STYLE[tab.id].dot}`} />}
                      {tab.label}
                      <span className={`font-mono text-[11px] ${active ? 'text-ink-3' : 'text-ink-4'}`}>{tab.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {filteredList.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-ink/10 bg-bone text-ink-4">
                <WarehouseIcon size={24} />
              </div>
              <p className="font-display text-lg font-bold text-ink">No inventory lines match</p>
              <p className="mt-1 text-sm text-ink-4">Try clearing the search or switching the status filter.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="mt-5 inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-xs font-semibold text-ink hover:bg-bone transition-colors cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">
                    <th className="text-left px-6 py-3 font-medium">Commodity</th>
                    <th className="text-left px-4 py-3 font-medium">Depot SKU</th>
                    <th className="text-left px-4 py-3 font-medium">Stock level</th>
                    <th className="text-left px-4 py-3 font-medium">MOQ · Lead</th>
                    <th className="text-right px-6 py-3 font-medium">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((o) => {
                    const product = nameMap.get(o.productId);
                    const onHand = o.stockQty ?? 0;
                    const reserved = o.reservedQty ?? 0;
                    const free = o.availableQty ?? Math.max(onHand - reserved, 0);
                    const tracked = !!o.trackInventory;
                    const threshold = o.lowStockThreshold ?? 0;
                    const freePct = onHand > 0 ? Math.min(100, (free / onHand) * 100) : 0;
                    const belowThreshold = tracked && threshold > 0 && free <= threshold;
                    return (
                      <tr key={o.id} className="group border-t border-ink/[0.06] transition-colors hover:bg-bone/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3.5">
                            {product?.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="size-12 rounded-xl border border-ink/10 object-cover shrink-0 bg-bone"
                              />
                            ) : (
                              <div className="size-12 rounded-xl border border-ink/10 bg-gradient-to-br from-bone to-mist/70 flex items-center justify-center text-ink-4 shrink-0">
                                <PackageIcon size={18} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold text-ink truncate max-w-[16rem]">
                                {product?.name ?? 'Standard Commodity'}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-4">
                                {product?.brand && <span className="font-medium text-ink-3">{product.brand}</span>}
                                {product?.brand && product?.packSize && <span>·</span>}
                                {product?.packSize && <span>{product.packSize}</span>}
                                {product?.unit && (
                                  <span className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-[10px] uppercase">
                                    {product.unit}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {o.supplierSku ? (
                            <span className="rounded-md border border-ink/10 bg-bone px-2 py-1 font-mono text-[11px] text-ink-2">
                              {o.supplierSku}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-4">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          {tracked ? (
                            <div className="w-44 space-y-1.5">
                              <div className="flex items-baseline justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => setStockOfferId(o.id)}
                                  className="font-mono text-sm font-semibold text-ink hover:text-copper transition-colors cursor-pointer"
                                  title="Edit stock"
                                >
                                  {onHand.toLocaleString()}
                                  <span className="ml-1 font-sans text-[11px] font-normal text-ink-4">on-hand</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMovementsOfferId(o.id)}
                                  className="text-[11px] font-medium text-copper hover:text-copper-deep cursor-pointer"
                                >
                                  Ledger
                                </button>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]">
                                <div
                                  className={`h-full rounded-full ${belowThreshold ? 'bg-amber' : 'bg-mint'}`}
                                  style={{ width: `${freePct}%` }}
                                />
                              </div>
                              <div className="font-mono text-[11px] text-ink-4">
                                {free.toLocaleString()} free · {reserved.toLocaleString()} reserved
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setStockOfferId(o.id)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-ink/20 px-3 text-xs font-medium text-ink-3 transition-colors hover:border-copper/50 hover:text-copper cursor-pointer"
                            >
                              <PlusIcon size={12} />
                              Track stock
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-xs font-medium text-ink">
                            {o.minOrderQty} {product?.unit ?? 'units'} min
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-4">
                            <ClockIcon size={11} />
                            {o.leadTimeDays}d dispatch
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div
                            role="radiogroup"
                            aria-label="Availability state"
                            className="inline-flex items-center gap-0.5 rounded-full bg-bone p-1"
                          >
                            {ORDER.map((s) => {
                              const isCurrent = s === o.availabilityStatus;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  role="radio"
                                  aria-checked={isCurrent}
                                  disabled={isCurrent || setStatus.isPending}
                                  onClick={() => setStatus.mutate({ id: o.id, status: s })}
                                  className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs whitespace-nowrap transition-all ${
                                    isCurrent
                                      ? `bg-paper font-semibold shadow-soft-sm ring-1 ring-ink/10 cursor-default ${STATUS_STYLE[s].text}`
                                      : 'font-medium text-ink-4 hover:text-ink cursor-pointer disabled:cursor-wait'
                                  }`}
                                >
                                  <span
                                    className={`size-1.5 rounded-full ${isCurrent ? STATUS_STYLE[s].dot : 'bg-ink/20'}`}
                                  />
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
        </section>
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

  const fieldClass =
    'mt-1.5 h-11 w-full rounded-xl border border-ink/10 bg-bone/60 px-3.5 text-sm text-ink outline-none transition focus:border-ink/30 focus:bg-paper focus:ring-4 focus:ring-volt/25';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stock-editor-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-soft-lg">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-ink text-volt">
              <WarehouseIcon size={18} />
            </div>
            <div>
              <h2 id="stock-editor-title" className="font-display text-lg font-bold leading-tight text-ink">
                Stock control
              </h2>
              <p className="text-xs text-ink-4">Quantities in {unit}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-bone hover:text-ink cursor-pointer"
          >
            <XIcon size={16} />
          </button>
        </header>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-3 divide-x divide-ink/10 rounded-xl border border-ink/10 bg-bone/50 text-center">
            {[
              { k: 'On-hand', v: offer.stockQty ?? 0 },
              { k: 'Reserved', v: offer.reservedQty ?? 0 },
              { k: 'Free', v: offer.availableQty ?? '—' },
            ].map((x) => (
              <div key={x.k} className="px-2 py-3">
                <div className="font-mono text-lg font-semibold text-ink">{x.v}</div>
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">{x.k}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-0.5 rounded-full bg-bone p-1">
              {(['set', 'adjust'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`h-8 rounded-full px-4 text-xs font-medium transition-all cursor-pointer ${
                    mode === m ? 'bg-paper text-ink shadow-soft-sm ring-1 ring-ink/10' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {m === 'set' ? 'Set absolute' : 'Adjust ±'}
                </button>
              ))}
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-ink-2">
              <input
                type="checkbox"
                checked={tracked}
                onChange={(e) => setTracked(e.target.checked)}
                className="size-4 accent-ink"
              />
              Track inventory
            </label>
          </div>

          <label className="block text-xs font-medium text-ink-3">
            Quantity {mode === 'adjust' ? '(delta, e.g. -5 or 20)' : '(absolute on-hand)'}
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={`${fieldClass} font-mono`}
              min={mode === 'set' ? 0 : -1000000}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-ink-3">
              Low-stock threshold
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className={`${fieldClass} font-mono`}
                min={0}
              />
            </label>
            <label className="block text-xs font-medium text-ink-3">
              Note <span className="font-normal text-ink-4">(optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for change"
                className={fieldClass}
              />
            </label>
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-ink/10 bg-bone/40 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-full border border-ink/15 px-5 text-sm font-medium text-ink transition-colors hover:bg-paper cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
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
            className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-paper transition-colors hover:bg-ink-2 disabled:opacity-60 cursor-pointer"
          >
            {submitting ? 'Saving…' : 'Save stock'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
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
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stock-ledger-title"
    >
      <div className="flex h-full w-full max-w-lg flex-col border-l border-ink/10 bg-paper shadow-soft-lg">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-copper">Stock ledger</div>
            <h2 id="stock-ledger-title" className="mt-1 truncate font-display text-xl font-bold text-ink">
              {product?.name ?? '—'}
            </h2>
            <p className="mt-1 font-mono text-xs text-ink-4">
              {offer.stockQty ?? 0} on-hand · {offer.reservedQty ?? 0} reserved
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-bone hover:text-ink cursor-pointer"
          >
            <XIcon size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-bone animate-pulse" />
              ))}
            </div>
          ) : movements.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl border border-ink/10 bg-bone text-ink-4">
                <ClockIcon size={20} />
              </div>
              <p className="text-sm font-medium text-ink">No movements yet</p>
              <p className="mt-1 text-xs text-ink-4">Stock adjustments and order reservations will appear here.</p>
            </div>
          ) : (
            <ol className="relative space-y-2 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-ink/10">
              {movements.map((m) => (
                <li key={m.id} className="relative flex gap-4">
                  <span
                    className={`relative z-10 mt-4 size-[23px] shrink-0 rounded-full border-4 border-paper ${
                      m.qtyDelta > 0 ? 'bg-mint' : m.qtyDelta < 0 ? 'bg-rose' : 'bg-amber'
                    }`}
                  />
                  <div className="flex-1 rounded-xl border border-ink/[0.08] bg-paper px-4 py-3 transition-colors hover:bg-bone/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium capitalize text-ink">{m.reason.replace(/_/g, ' ')}</div>
                        <div className="mt-0.5 text-[11px] text-ink-4">
                          {new Date(m.createdAt).toLocaleString('en-GB')}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div
                          className={`text-sm font-semibold ${m.qtyDelta > 0 ? 'text-mint' : m.qtyDelta < 0 ? 'text-rose' : 'text-ink-4'}`}
                        >
                          {m.qtyDelta > 0 ? '+' : ''}
                          {m.qtyDelta}
                        </div>
                        {m.reservedDelta !== 0 && (
                          <div className="text-[11px] text-amber">
                            {m.reservedDelta > 0 ? '+' : ''}
                            {m.reservedDelta} reserved
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 border-t border-ink/[0.06] pt-2 font-mono text-[11px] text-ink-4">
                      After: {m.stockQtyAfter} on-hand · {m.reservedQtyAfter} reserved
                      {m.note ? <span className="font-sans"> — {m.note}</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
