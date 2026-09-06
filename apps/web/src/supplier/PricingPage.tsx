import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Input, Badge } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import {
  PackageIcon,
  SearchIcon,
  PercentIcon,
  CheckIcon,
  RefreshCwIcon,
  PlusIcon,
  ExternalLinkIcon,
  TrendingUpIcon,
  BanknoteIcon,
  LayersIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
  tier1MinQty: number;
  tier1DiscountPct: number;
  tier2MinQty: number;
  tier2DiscountPct: number;
  tier3MinQty: number;
  tier3DiscountPct: number;
};

type Product = {
  id: string;
  name: string;
  brand?: string | null;
  unit?: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
};

type Draft = {
  priceLkr: string;
  minOrderQty: string;
  leadTimeDays: string;
  tier1MinQty: string;
  tier1DiscountPct: string;
  tier2MinQty: string;
  tier2DiscountPct: string;
  tier3MinQty: string;
  tier3DiscountPct: string;
};

function emptyDraft(): Draft {
  return {
    priceLkr: '',
    minOrderQty: '',
    leadTimeDays: '',
    tier1MinQty: '10',
    tier1DiscountPct: '0',
    tier2MinQty: '50',
    tier2DiscountPct: '0',
    tier3MinQty: '100',
    tier3DiscountPct: '0',
  };
}

export function SupplierPricingPage() {
  const { supplierId } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | 'tiered' | 'flat'>('all');

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
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [err, setErr] = useState<string | null>(null);

  const handleRefresh = async () => {
    toast.info('Refreshing pricing matrix…');
    await Promise.all([offers.refetch(), catalog.refetch()]);
    toast.success('Rate cards synchronized');
  };

  const activeTiersCount = list.filter(
    (o) => (o.tier1DiscountPct ?? 0) > 0 || (o.tier2DiscountPct ?? 0) > 0 || (o.tier3DiscountPct ?? 0) > 0,
  ).length;

  const filteredList = useMemo(() => {
    return list.filter((o) => {
      const p = nameMap.get(o.productId);
      const matchesSearch =
        !searchQuery ||
        p?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.supplierSku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p?.brand?.toLowerCase().includes(searchQuery.toLowerCase());

      const hasTiers =
        (o.tier1DiscountPct ?? 0) > 0 || (o.tier2DiscountPct ?? 0) > 0 || (o.tier3DiscountPct ?? 0) > 0;

      const matchesTier =
        tierFilter === 'all' ||
        (tierFilter === 'tiered' && hasTiers) ||
        (tierFilter === 'flat' && !hasTiers);

      return matchesSearch && matchesTier;
    });
  }, [list, nameMap, searchQuery, tierFilter]);

  // Curated master commodities for quick-start pricing
  const unlistedProducts = useMemo(() => {
    const listedProductIds = new Set(list.map((o) => o.productId));
    return catalogProducts.filter((p) => !listedProductIds.has(p.id)).slice(0, 6);
  }, [catalogProducts, list]);

  const save = useMutation({
    mutationFn: () => {
      const priceCents = Math.round(Number(draft.priceLkr) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 0) {
        throw new Error('Enter a valid price in LKR');
      }
      return api.patch(`/supplier-products/${editing}`, {
        priceCents,
        minOrderQty: Number(draft.minOrderQty),
        leadTimeDays: Number(draft.leadTimeDays),
        tier1MinQty: Number(draft.tier1MinQty),
        tier1DiscountPct: Number(draft.tier1DiscountPct),
        tier2MinQty: Number(draft.tier2MinQty),
        tier2DiscountPct: Number(draft.tier2DiscountPct),
        tier3MinQty: Number(draft.tier3MinQty),
        tier3DiscountPct: Number(draft.tier3DiscountPct),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      toast.success('Rate card updated successfully');
      setEditing(null);
      setErr(null);
    },
    onError: (e) =>
      setErr(e instanceof ApiError || e instanceof Error ? e.message : 'Save failed'),
  });

  const startEdit = (o: Offer) => {
    setEditing(o.id);
    setDraft({
      priceLkr: (o.priceCents / 100).toFixed(2),
      minOrderQty: String(o.minOrderQty),
      leadTimeDays: String(o.leadTimeDays),
      tier1MinQty: String(o.tier1MinQty ?? 10),
      tier1DiscountPct: String(o.tier1DiscountPct ?? 0),
      tier2MinQty: String(o.tier2MinQty ?? 50),
      tier2DiscountPct: String(o.tier2DiscountPct ?? 0),
      tier3MinQty: String(o.tier3MinQty ?? 100),
      tier3DiscountPct: String(o.tier3DiscountPct ?? 0),
    });
    setErr(null);
  };

  const draftBaseCents = Math.round(Number(draft.priceLkr) * 100) || 0;

  if (offers.isLoading) return <SupplierLoadingState label="Loading commercial pricing matrix" />;
  if (offers.isError) {
    return (
      <SupplierErrorState message="Could not load pricing." onRetry={() => void offers.refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            Commercial Policy · Rate Cards & Tiers
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">
            Mill-Gate Rates & Volume Tiers
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Maintain wholesale rate cards, minimum order quantities, and bulk volume discounts for enterprise buyers.
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
                <span className="font-semibold text-ink">Tier Engine Active</span>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-amber" />
                <span className="font-semibold text-ink">Rate Cards Pending</span>
              </>
            )}
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={offers.isFetching}
            className="text-xs gap-1.5"
            title="Refresh pricing matrix"
          >
            <RefreshCwIcon size={14} className={offers.isFetching ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Link to="/search" target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs font-semibold">
              <ExternalLinkIcon size={13} />
              <span className="hidden sm:inline">Market Rates</span>
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

      {/* Executive 4-Card Pricing & Tier KPI Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10 border border-ink/10 overflow-hidden rounded-lg shadow-soft-sm">
        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <PackageIcon size={13} className="text-copper" />
              Listed SKUs
            </span>
            <span className="text-[10px] font-mono text-ink-3">
              {list.length > 0 ? 'Catalog Active' : 'Depot Empty'}
            </span>
          </div>
          <MetricNumber size="md" className="text-ink">
            {list.length}
          </MetricNumber>
          <div className="text-xs text-ink-4">Active commodity rate cards</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <PercentIcon size={13} className="text-copper" />
              Volume Tiers
            </span>
            <span className="text-[10px] text-emerald-800 font-mono font-semibold">
              {list.length > 0 ? `${Math.round((activeTiersCount / list.length) * 100)}% Discounted` : 'Flat Rates'}
            </span>
          </div>
          <MetricNumber size="md" className="text-emerald-800">
            {activeTiersCount}
          </MetricNumber>
          <div className="text-xs text-ink-4">With automated bulk discounts</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <TrendingUpIcon size={13} className="text-copper" />
              Target Tier 3 Rebate
            </span>
            <span className="text-[10px] text-ink-4 font-mono">100+ units</span>
          </div>
          <MetricNumber size="md" className="text-ink">
            8% – 12%
          </MetricNumber>
          <div className="text-xs text-ink-4">Enterprise distributor bracket</div>
        </div>

        <div className="bg-paper p-5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
              <BanknoteIcon size={13} className="text-copper" />
              Settlement Currency
            </span>
            <span className="text-[10px] text-emerald-800 font-mono font-semibold">SLIPS/CEFT</span>
          </div>
          <MetricNumber size="md" className="text-ink font-mono">
            LKR
          </MetricNumber>
          <div className="text-xs text-ink-4">Mill-gate wholesale currency</div>
        </div>
      </div>

      {/* Wholesale Volume Tiering Strategy & Policy Radar */}
      <Surface kind="ink" className="p-6 rounded-lg relative overflow-hidden grain shadow-soft-sm">
        <div className="flex items-start gap-4">
          <div className="size-10 rounded-lg bg-volt/15 border border-volt/30 flex items-center justify-center text-volt shrink-0 mt-0.5">
            <PercentIcon size={20} />
          </div>
          <div className="space-y-3 flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div className="text-xs font-mono uppercase tracking-[0.16em] text-volt font-bold">
                Wholesale Volume Tiering Engine
              </div>
              <span className="text-[11px] font-mono text-paper/60">Dynamic Cart Settlement</span>
            </div>
            <p className="text-xs text-paper/80 leading-relaxed max-w-4xl">
              Tier breaks are applied dynamically when buyers construct purchase orders in the cart. Configuring
              progressive discounts encourages larger cart volumes while maintaining your gross mill-gate margins:
            </p>

            {/* 3-Tier Architecture Quick-Reference Chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  Tier 1: Starter Restock
                </div>
                <div className="text-xs font-semibold text-paper mt-0.5">≥ 10 – 49 units (3% – 5%)</div>
                <div className="text-[11px] text-paper/60 mt-0.5">Appeals to weekly grocery & cafe buyers.</div>
              </div>

              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  Tier 2: Commercial Bulk
                </div>
                <div className="text-xs font-semibold text-paper mt-0.5">≥ 50 – 99 units (5% – 8%)</div>
                <div className="text-[11px] text-paper/60 mt-0.5">Optimal for hotels, resorts & caterers.</div>
              </div>

              <div className="bg-paper/10 border border-paper/15 p-3 rounded-md">
                <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  Tier 3: Enterprise Pallet
                </div>
                <div className="text-xs font-semibold text-paper mt-0.5">≥ 100+ units (8% – 12%)</div>
                <div className="text-[11px] text-paper/60 mt-0.5">Max cart size for regional distributors.</div>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {/* When NO products are listed yet: Executive Onboarding & Rate Card Launchpad */}
      {list.length === 0 ? (
        <div className="space-y-6">
          <Surface kind="elevated" className="p-6 sm:p-8 border border-ink/10 rounded-lg shadow-soft-sm space-y-6 bg-paper">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-line">
              <div className="flex items-start gap-4">
                <div className="size-12 rounded-xl bg-copper/10 border border-copper/20 flex items-center justify-center text-copper shrink-0">
                  <PercentIcon size={24} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold font-display text-ink">
                    No rate cards configured yet — Establish mill-gate pricing
                  </h2>
                  <p className="text-sm text-ink-3 mt-1 max-w-2xl">
                    Add a wholesale commodity listing first. You will be able to set base mill-gate unit rates,
                    minimum order quantities (MOQ), lead times, and progressive volume discount brackets.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                <Link to="/supplier/products/new" className="w-full sm:w-auto">
                  <Button variant="primary" size="md" className="w-full sm:w-auto gap-2 shadow-soft-sm font-semibold">
                    <PlusIcon size={16} />
                    + Configure First Rate Card
                  </Button>
                </Link>
              </div>
            </div>

            {/* 3-Step Pricing Lifecycle Workflow */}
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-4 font-semibold mb-3">
                How Rate Cards & Volume Tiers Work
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      1
                    </div>
                    <span className="text-xs font-bold text-ink">Pick Central Commodity</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Select a verified staple commodity (Rice, Sugar, Flour, Tea, Spices, Oils) or add custom depot inventory.
                  </p>
                </div>

                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      2
                    </div>
                    <span className="text-xs font-bold text-ink">Set Base Rate & MOQ</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Input your mill-gate unit rate in LKR and minimum order quantity (e.g. 50 kg or 10 cases) for depot dispatch.
                  </p>
                </div>

                <div className="p-4 rounded-md border border-ink/10 bg-mist/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-ink text-paper text-xs font-mono font-bold flex items-center justify-center">
                      3
                    </div>
                    <span className="text-xs font-bold text-ink">Define Volume Brackets</span>
                  </div>
                  <p className="text-xs text-ink-3 leading-relaxed">
                    Set Tier 1, 2, and 3 volume thresholds. Enterprise buyers unlock lower rates automatically when ordering bulk.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick-Start Commodities Pricing Grid */}
            {unlistedProducts.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">Quick-Start: Set Rates for Master Commodities</h3>
                    <p className="text-xs text-ink-4">Select any commodity to launch the rate card editor with prefilled SKU specifications.</p>
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
                        Set Pricing for This SKU
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Surface>
        </div>
      ) : (
        /* When products exist: Search, Filters & Interactive Rate Cards */
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search price cards by commodity or SKU…"
                className="pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { id: 'all', label: `All (${list.length})` },
                  { id: 'tiered', label: `With Tiers (${activeTiersCount})` },
                  { id: 'flat', label: `Flat Rate (${list.length - activeTiersCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTierFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-mono tracking-wider transition-colors border rounded ${
                    tierFilter === tab.id
                      ? 'bg-ink text-paper border-ink font-semibold'
                      : 'bg-paper text-ink-3 border-ink/10 hover:bg-mist/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rate Cards Container */}
          <Surface kind="elevated" className="overflow-hidden border border-ink/10 rounded-lg shadow-soft-sm">
            {filteredList.length === 0 ? (
              <div className="p-12 text-center text-ink-4 space-y-2">
                <PercentIcon size={28} className="mx-auto text-ink-4 opacity-50 mb-2" />
                <p className="text-sm font-medium text-ink-3">No rate cards match your search or filter.</p>
                <p className="text-xs">Try clearing the search query or adjusting your tier filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setTierFilter('all');
                  }}
                  className="text-xs font-semibold text-copper hover:underline mt-2 inline-block"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {filteredList.map((o) => {
                  const product = nameMap.get(o.productId);
                  const isEditing = editing === o.id;

                  return (
                    <div key={o.id} className="p-5 space-y-4 hover:bg-mist/10 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="space-y-1">
                          <div className="font-display text-base font-bold text-ink flex items-center gap-2">
                            {product?.name ?? 'Standard Commodity'}
                            {product?.unit && (
                              <Badge variant="neutral" className="font-mono text-[10px] uppercase">
                                {product.unit}
                              </Badge>
                            )}
                            {product?.brand && (
                              <span className="text-xs text-ink-3 font-medium bg-mist/60 px-2 py-0.5 rounded border border-ink/10">
                                {product.brand}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-mono text-ink-4 flex items-center gap-2">
                            <span>SKU: {o.supplierSku ?? 'Standard SKU'}</span>
                            <span>·</span>
                            <span>MOQ: {o.minOrderQty} {product?.unit ?? 'units'}</span>
                            <span>·</span>
                            <span>Lead: {o.leadTimeDays}d dispatch</span>
                          </div>
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <div className="vyro-metric text-xl font-bold text-ink">
                                {formatLKR(o.priceCents)}
                              </div>
                              <div className="text-[10px] uppercase tracking-wider text-ink-4 font-mono">
                                Base / {product?.unit ?? 'unit'}
                              </div>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => startEdit(o)} className="font-semibold text-xs">
                              Edit Rate Card
                            </Button>
                          </div>
                        )}
                      </div>

                      {!isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {[
                            { qty: o.tier1MinQty ?? 10, pct: o.tier1DiscountPct ?? 0, label: 'Tier 1' },
                            { qty: o.tier2MinQty ?? 50, pct: o.tier2DiscountPct ?? 0, label: 'Tier 2' },
                            { qty: o.tier3MinQty ?? 100, pct: o.tier3DiscountPct ?? 0, label: 'Tier 3' },
                          ].map((t) => {
                            const discountedUnitCents = Math.round(o.priceCents * (1 - t.pct / 100));
                            const savingsCents = o.priceCents - discountedUnitCents;

                            return (
                              <div
                                key={t.label}
                                className={`border px-4 py-3 space-y-1.5 rounded-lg transition-colors ${
                                  t.pct > 0
                                    ? 'border-emerald-800/20 bg-emerald-50/40'
                                    : 'border-ink/10 bg-paper'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3 flex items-center gap-1">
                                    <LayersIcon size={11} className={t.pct > 0 ? 'text-emerald-700' : 'text-ink-4'} />
                                    {t.label} (≥ {t.qty} {product?.unit ?? 'units'})
                                  </span>
                                  {t.pct > 0 ? (
                                    <Badge variant="success" className="font-mono text-[10px]">
                                      −{t.pct}%
                                    </Badge>
                                  ) : (
                                    <span className="text-[10px] text-ink-4 font-mono">No discount</span>
                                  )}
                                </div>
                                <div className="flex items-baseline justify-between pt-0.5">
                                  <span className="text-sm font-semibold text-ink">
                                    {formatLKR(discountedUnitCents)}
                                  </span>
                                  {savingsCents > 0 && (
                                    <span className="text-[11px] text-emerald-800 font-mono font-semibold">
                                      Save {formatLKR(savingsCents)}/unit
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-4 border border-ink/20 bg-mist/30 p-5 rounded-lg">
                          <div className="flex items-center justify-between border-b border-line pb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-ink font-display">
                              Editing Rate Card: {product?.name}
                            </span>
                            <span className="text-xs text-ink-4 font-mono">Rates entered in LKR</span>
                          </div>

                          <div className="grid sm:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-ink">Base Mill-Gate Price (LKR)</label>
                              <Input
                                value={draft.priceLkr}
                                onChange={(e) => setDraft({ ...draft, priceLkr: e.target.value })}
                                inputMode="decimal"
                                className="font-mono font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-ink">Minimum Order Qty</label>
                              <Input
                                value={draft.minOrderQty}
                                onChange={(e) => setDraft({ ...draft, minOrderQty: e.target.value })}
                                type="number"
                                min="1"
                                className="font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-ink">Lead Time (Days)</label>
                              <Input
                                value={draft.leadTimeDays}
                                onChange={(e) => setDraft({ ...draft, leadTimeDays: e.target.value })}
                                type="number"
                                min="0"
                                className="font-mono"
                              />
                            </div>
                          </div>

                          <div className="space-y-2 pt-2">
                            <div className="text-xs font-semibold text-ink">Volume Discount Brackets</div>
                            <div className="grid sm:grid-cols-3 gap-3">
                              {(
                                [
                                  ['tier1MinQty', 'tier1DiscountPct', 'Tier 1'],
                                  ['tier2MinQty', 'tier2DiscountPct', 'Tier 2'],
                                  ['tier3MinQty', 'tier3DiscountPct', 'Tier 3'],
                                ] as const
                              ).map(([qtyKey, pctKey, label]) => {
                                const pct = Number(draft[pctKey]) || 0;
                                const netPrice = Math.round(draftBaseCents * (1 - pct / 100));

                                return (
                                  <div key={label} className="border border-ink/15 bg-paper p-3.5 space-y-2 rounded-md shadow-xs">
                                    <div className="text-[11px] font-mono uppercase tracking-wider font-bold text-ink">
                                      {label}
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-ink-4 uppercase font-mono">Min Quantity</label>
                                      <Input
                                        value={draft[qtyKey]}
                                        onChange={(e) => setDraft({ ...draft, [qtyKey]: e.target.value })}
                                        type="number"
                                        min="1"
                                        className="h-8 text-xs font-mono"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] text-ink-4 uppercase font-mono">Discount %</label>
                                      <Input
                                        value={draft[pctKey]}
                                        onChange={(e) => setDraft({ ...draft, [pctKey]: e.target.value })}
                                        type="number"
                                        min="0"
                                        max="50"
                                        className="h-8 text-xs font-mono"
                                      />
                                    </div>
                                    <div className="text-[11px] font-mono pt-1 text-ink-3">
                                      Net: <strong className="text-ink">{formatLKR(netPrice)}</strong>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {err && (
                            <div className="p-3 bg-rose/10 border border-rose text-rose text-xs rounded">
                              {err}
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-line">
                            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => save.mutate()}
                              disabled={save.isPending}
                              loading={save.isPending}
                              className="gap-1.5"
                            >
                              <CheckIcon size={14} />
                              Save Rate Card
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Surface>
        </div>
      )}
    </div>
  );
}
