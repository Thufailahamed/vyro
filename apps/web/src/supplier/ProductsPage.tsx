import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Badge, Input } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import {
  PackageIcon,
  SearchIcon,
  Trash2Icon,
  Edit3Icon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  TrendingUpIcon,
  RefreshCwIcon,
  PlusIcon,
  ExternalLinkIcon,
  LayersIcon,
  TruckIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { SupplierHero, HeroStatusPill, heroActionClass } from './SupplierHero';

type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
  deliveryAvailable?: boolean;
  deliveryRadiusKm?: number | null;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  active: boolean;
  tier1MinQty?: number;
  tier1DiscountPct?: number;
  tier2MinQty?: number;
  tier2DiscountPct?: number;
  tier3MinQty?: number;
  tier3DiscountPct?: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  brand?: string | null;
  unit?: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
  category?: string | null;
};

const AVAIL_TONE: Record<Offer['availabilityStatus'], 'success' | 'warning' | 'danger'> = {
  in_stock: 'success',
  low: 'warning',
  out_of_stock: 'danger',
};

const AVAIL_LABEL: Record<Offer['availabilityStatus'], string> = {
  in_stock: 'In stock',
  low: 'Low stock',
  out_of_stock: 'Out of stock',
};

export function SupplierProductsPage() {
  const { supplierId } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState<Offer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Offer['availabilityStatus']>('all');

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

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/supplier-products/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      toast.success('Listing delisted successfully');
      setPendingDelete(null);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to delete offer'),
  });

  const nameMap = useMemo(
    () => new Map((catalog.data?.products ?? []).map((p) => [p.id, p])),
    [catalog.data],
  );

  const list = offers.data?.offers ?? [];
  const catalogProducts = catalog.data?.products ?? [];

  const handleRefresh = async () => {
    toast.info('Refreshing catalog listings…');
    await Promise.all([offers.refetch(), catalog.refetch()]);
    toast.success('Catalog updated');
  };

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

  const inStockCount = list.filter((o) => o.availabilityStatus === 'in_stock').length;
  const lowStockCount = list.filter((o) => o.availabilityStatus === 'low').length;
  const outOfStockCount = list.filter((o) => o.availabilityStatus === 'out_of_stock').length;
  const avgPrice = list.length > 0 ? Math.round(list.reduce((acc, o) => acc + o.priceCents, 0) / list.length) : 0;

  // Curated quick-starters from master catalog: commodities not yet listed by this supplier
  const unlistedProducts = useMemo(() => {
    const listedProductIds = new Set(list.map((o) => o.productId));
    return catalogProducts.filter((p) => !listedProductIds.has(p.id)).slice(0, 6);
  }, [catalogProducts, list]);

  if (offers.isLoading) return <SupplierLoadingState label="Loading wholesale catalog listings" />;
  if (offers.isError) {
    return (
      <SupplierErrorState message="Could not load product listings." onRetry={() => void offers.refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Catalog Header */}
      <SupplierHero
        icon={PackageIcon}
        kicker="Wholesale Supply Network · Depot Catalog"
        title="Product Listings & Mill-Gate Rates"
        description={
          list.length === 0
            ? 'Publish standard commodities or custom depot items to accept verified buyer purchase orders.'
            : `${list.length} wholesale commodit${list.length === 1 ? 'y' : 'ies'} published to enterprise buyers.`
        }
        status={
          list.length > 0 ? (
            <HeroStatusPill label="Catalog Active" tone="mint" />
          ) : (
            <HeroStatusPill label="Awaiting Listings" tone="amber" />
          )
        }
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={offers.isFetching}
              className={heroActionClass}
              title="Refresh product listings"
            >
              <RefreshCwIcon size={13} className={offers.isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link to="/search" target="_blank" rel="noreferrer" className={heroActionClass}>
              <ExternalLinkIcon size={13} />
              Marketplace
            </Link>
            <Link
              to="/supplier/products/new"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-volt px-3 text-xs font-bold text-ink transition-colors hover:bg-volt-glow"
            >
              <PlusIcon size={13} />
              Add Product
            </Link>
          </>
        }
        footer={
          <>
            <span>Listings sync to the buyer marketplace instantly</span>
            <span className="text-paper/40">
              {inStockCount} in stock · {lowStockCount} low · {outOfStockCount} out
            </span>
          </>
        }
      />

      {/* Harmonious Executive KPI Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="vyro-surface p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Total Published</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink/[0.06] text-ink-3">
              <PackageIcon size={15} />
            </span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {list.length}
          </MetricNumber>
          <div className="text-xs text-ink-4">
            {list.length > 0 ? 'Catalog Active · wholesale offers' : 'Depot empty · no offers yet'}
          </div>
        </div>

        <div className="vyro-surface p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">In Stock & Ready</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-mint/15 text-mint">
              <CheckCircle2Icon size={15} />
            </span>
          </div>
          <MetricNumber size="md" className="text-mint">
            {inStockCount}
          </MetricNumber>
          <div className="text-xs text-ink-4">
            {list.length > 0 ? `${Math.round((inStockCount / list.length) * 100)}% available · ready for PO booking` : 'Ready for immediate PO booking'}
          </div>
        </div>

        <div className="vyro-surface p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Low / Depleted</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber/15 text-amber">
              <AlertTriangleIcon size={15} />
            </span>
          </div>
          <MetricNumber size="md" className={lowStockCount + outOfStockCount > 0 ? 'text-amber' : 'text-ink-4'}>
            {lowStockCount + outOfStockCount}
          </MetricNumber>
          <div className="text-xs text-ink-4">{lowStockCount} low · {outOfStockCount} out — needs replenishment</div>
        </div>

        <div className="vyro-surface p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Avg Mill-Gate Rate</span>
            <span className="flex size-8 items-center justify-center rounded-lg bg-copper/10 text-copper">
              <TrendingUpIcon size={15} />
            </span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {formatLKR(avgPrice)}
          </MetricNumber>
          <div className="text-xs text-ink-4">Unit rate · across all published SKUs</div>
        </div>
      </div>

      {/* When NO products are listed yet: Executive Onboarding & Catalog Launchpad */}
      {list.length === 0 ? (
        <div className="space-y-6">
          {/* Main Launchpad Hero Card */}
          <Surface kind="elevated" className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-line">
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-xl bg-copper/10 border border-copper/20 flex items-center justify-center text-copper shrink-0">
                  <PackageIcon size={24} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold font-display text-ink">
                    No wholesale listings yet — Launch your depot catalog
                  </h2>
                  <p className="text-sm text-ink-3 mt-1 max-w-2xl">
                    Publish staple commodities, raw grains, edible oils, packaging, or bulk goods to accept
                    commercial purchase orders from verified retail, hospitality, and distribution buyers.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                <Link to="/supplier/products/new" className="w-full sm:w-auto">
                  <Button variant="primary" size="md" className="w-full sm:w-auto gap-2 shadow-soft-sm font-semibold">
                    <PlusIcon size={16} />
                    + Add First Wholesale Product
                  </Button>
                </Link>
              </div>
            </div>

            {/* 3-Step Publishing Workflow Infographic */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-4 font-semibold mb-3">
                How Depot Publishing Works on VYRO
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
                    Pick verified national commodity standards (Samba, Nadu, White Sugar, Tea BOPF, Oils) or add your
                    custom proprietary brand and packaging.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-ink/[0.03] space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      2
                    </div>
                    <span className="text-xs font-bold text-ink">Set Mill-Gate Rates & MOQ</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Define your base price per unit, minimum order quantity (e.g. 50 kg / 10 cases), lead time, and
                    tiered volume discounts for bulk buyers.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-ink/[0.03] space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-md bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      3
                    </div>
                    <span className="text-xs font-bold text-ink">Receive Escrow POs</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Enterprise buyers place orders against your rates. Funds are locked in escrow and paid out directly
                    to your verified bank account upon delivery.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick-Start Master Commodities Directory */}
            {unlistedProducts.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">Quick-Start: Fast-Track Standard Commodities</h3>
                    <p className="text-xs text-ink-4">Click any commodity to open the listing form with pre-filled SKU specifications.</p>
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
                        List This Commodity
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Surface>
        </div>
      ) : (
        /* When products exist: Filters & Enhanced Table */
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search commodities, SKU, brand…"
                className="pl-9 text-xs"
              />
            </div>
            <div className="inline-flex items-center gap-1 p-1 bg-ink/[0.05] rounded-full overflow-x-auto scrollbar-none">
              {(
                [
                  { id: 'all', label: `All (${list.length})` },
                  { id: 'in_stock', label: `In stock (${inStockCount})` },
                  { id: 'low', label: `Low stock (${lowStockCount})` },
                  { id: 'out_of_stock', label: `Out of stock (${outOfStockCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as 'all' | Offer['availabilityStatus'])}
                  className={`h-8 px-3.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-ink text-paper shadow-sm'
                      : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Listings Table Surface */}
          <Surface kind="elevated" className="overflow-hidden">
            {filteredList.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-ink/[0.06] text-ink-4">
                  <PackageIcon size={22} />
                </div>
                <p className="text-sm font-medium text-ink-3">No products match your search or filter.</p>
                <p className="text-xs text-ink-4">Try clearing the search query or adjusting your availability filter.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                >
                  Reset all filters
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-bone/60 text-ink-4 border-b border-ink/10">
                    <tr className="text-[10px] font-mono uppercase tracking-[0.14em]">
                      <th className="text-left px-5 py-3.5 font-bold">Commodity / Master SKU</th>
                      <th className="text-left px-4 py-3.5 font-bold">Depot SKU</th>
                      <th className="text-right px-4 py-3.5 font-bold">Mill-Gate Rate</th>
                      <th className="text-right px-4 py-3.5 font-bold">MOQ</th>
                      <th className="text-right px-4 py-3.5 font-bold">Lead Time</th>
                      <th className="text-left px-4 py-3.5 font-bold">Coverage & Tiers</th>
                      <th className="text-left px-4 py-3.5 font-bold">Availability</th>
                      <th className="text-right px-5 py-3.5 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {filteredList.map((o) => {
                      const p = nameMap.get(o.productId);
                      const hasTiers =
                        (o.tier1DiscountPct ?? 0) > 0 ||
                        (o.tier2DiscountPct ?? 0) > 0 ||
                        (o.tier3DiscountPct ?? 0) > 0;

                      return (
                        <tr key={o.id} className="hover:bg-bone/40 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {p?.imageUrl ? (
                                <img
                                  src={p.imageUrl}
                                  alt={p.name}
                                  className="size-10 rounded-lg border border-ink/10 object-cover shrink-0 bg-bone"
                                />
                              ) : (
                                <div className="size-10 rounded-lg bg-ink/[0.06] flex items-center justify-center text-ink-4 shrink-0">
                                  <PackageIcon size={16} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-ink truncate hover:text-copper transition-colors">
                                  {p?.name ?? 'Standard Commodity'}
                                </div>
                                <div className="text-xs text-ink-4 flex items-center gap-2 mt-0.5">
                                  {p?.brand && <span className="font-medium text-ink-3">{p.brand}</span>}
                                  {p?.packSize && <span>· {p.packSize}</span>}
                                  {p?.unit && (
                                    <span className="uppercase text-[10px] bg-ink/5 px-1.5 py-0.5 rounded font-mono">
                                      {p.unit}
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
                          <td className="px-4 py-4 text-right">
                            <span className="vyro-metric text-sm font-semibold text-ink">
                              {formatLKR(o.priceCents)}
                            </span>
                            <span className="text-[10px] text-ink-4 block font-mono">
                              per {p?.unit ?? 'unit'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right font-medium text-ink-2">
                            {o.minOrderQty}{' '}
                            <span className="text-[11px] text-ink-4 lowercase">{p?.unit ?? 'units'}</span>
                          </td>
                          <td className="px-4 py-4 text-right text-ink-2">
                            <span className="font-mono text-xs bg-mist/60 px-1.5 py-0.5 rounded border border-ink/10">
                              {o.leadTimeDays}d dispatch
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1 text-xs">
                              <span className="inline-flex items-center gap-1 text-ink-3">
                                <TruckIcon size={12} className="text-copper shrink-0" />
                                {o.deliveryAvailable !== false
                                  ? o.deliveryRadiusKm
                                    ? `${o.deliveryRadiusKm} km depot radius`
                                    : 'Depot delivery'
                                  : 'Depot pickup only'}
                              </span>
                              {hasTiers ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-mint">
                                  <LayersIcon size={11} className="shrink-0" />
                                  Volume Tiers Active
                                </span>
                              ) : (
                                <span className="text-[11px] text-ink-4">Flat rate</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={AVAIL_TONE[o.availabilityStatus]}>
                              {AVAIL_LABEL[o.availabilityStatus]}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex items-center gap-2 justify-end">
                              <Link
                                to={`/supplier/products/${o.id}/edit`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-ink/20 bg-paper text-ink hover:bg-ink hover:text-paper transition-colors rounded-full shadow-xs"
                              >
                                <Edit3Icon size={12} />
                                Edit
                              </Link>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(o)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-rose hover:bg-rose/10 transition-colors rounded-full"
                                title="Delist listing"
                              >
                                <Trash2Icon size={13} />
                              </button>
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

          {/* Wholesale Conversion Tip Banner */}
          <Surface kind="ink" className="p-5 relative overflow-hidden grain">
            <div className="flex items-start gap-3">
              <TrendingUpIcon size={20} className="text-volt shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-volt font-semibold">
                  Depot Procurement Intelligence
                </div>
                <p className="text-xs text-paper/75 leading-relaxed max-w-3xl">
                  Buyers and procurement officers filter by dispatch readiness and minimum order quantities. Keeping lead
                  times under 48 hours and configuring volume discount tiers yields a 44% higher repeat order velocity.
                </p>
              </div>
            </div>
          </Surface>
        </div>
      )}

      {/* Delete / Delist Confirmation Modal */}
      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-offer-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs"
          onClick={() => !del.isPending && setPendingDelete(null)}
        >
          <div
            className="bg-paper border border-ink/20 rounded-xl shadow-soft-xl max-w-md w-full p-6 space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-lg bg-rose/10 flex items-center justify-center text-rose shrink-0">
                <AlertTriangleIcon size={20} />
              </div>
              <div>
                <h2 id="del-offer-title" className="font-display text-lg font-bold text-ink">
                  Remove product listing?
                </h2>
                <p className="mt-1 text-sm text-ink-3">
                  <strong className="text-ink">
                    {nameMap.get(pendingDelete.productId)?.name ?? 'This listing'}
                  </strong>{' '}
                  at {formatLKR(pendingDelete.priceCents)} will be delisted from buyer order forms.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-line">
              <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={del.isPending}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => del.mutate(pendingDelete.id)} loading={del.isPending}>
                Delist product
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
