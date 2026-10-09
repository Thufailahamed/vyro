import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
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
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { cn, useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { SupplierHero, HeroStatusPill, heroActionClass } from './SupplierHero';
import { PriceLadder, ProductTile, tierWarnings, type LadderTier } from './pricing/pricingUi';

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
  const [sort, setSort] = useState<'name' | 'price' | 'discount'>('name');
  const [guideOpen, setGuideOpen] = useState(true);

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

  const sortedList = useMemo(() => {
    const top = (o: Offer) => Math.max(o.tier1DiscountPct ?? 0, o.tier2DiscountPct ?? 0, o.tier3DiscountPct ?? 0);
    return [...filteredList].sort((a, b) =>
      sort === 'price'
        ? b.priceCents - a.priceCents
        : sort === 'discount'
          ? top(b) - top(a)
          : (nameMap.get(a.productId)?.name ?? '').localeCompare(nameMap.get(b.productId)?.name ?? ''),
    );
  }, [filteredList, sort, nameMap]);

  const topRebates = list
    .map((o) => Math.max(o.tier1DiscountPct ?? 0, o.tier2DiscountPct ?? 0, o.tier3DiscountPct ?? 0))
    .filter((n) => n > 0);
  const avgTopRebate = topRebates.length ? topRebates.reduce((a, b) => a + b, 0) / topRebates.length : null;

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
      <SupplierHero
        icon={PercentIcon}
        kicker="Commercial Policy · Rate Cards & Tiers"
        title="Mill-Gate Rates & Volume Tiers"
        description="Maintain wholesale rate cards, minimum order quantities, and bulk volume discounts for enterprise buyers."
        status={
          list.length > 0 ? (
            <HeroStatusPill label="Tier Engine Active" tone="mint" />
          ) : (
            <HeroStatusPill label="Rate Cards Pending" tone="amber" />
          )
        }
        actions={
          <>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={offers.isFetching}
              className={heroActionClass}
              title="Refresh pricing matrix"
            >
              <RefreshCwIcon size={13} className={offers.isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link to="/search" target="_blank" rel="noreferrer" className={heroActionClass}>
              <ExternalLinkIcon size={13} />
              Market Rates
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
            <span>Volume brackets apply automatically at checkout</span>
            <span className="text-paper/40">{list.length} rate card{list.length === 1 ? '' : 's'} configured</span>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Listed SKUs" value={list.length} sub={list.length > 0 ? 'Active rate cards' : 'No rate cards yet'} icon={<PackageIcon size={15} />} tile="bg-ink/[0.06] text-ink-3" />
        <Kpi
          label="Tiered cards"
          value={activeTiersCount}
          sub={list.length > 0 ? `${Math.round((activeTiersCount / list.length) * 100)}% have bulk discounts` : 'Add a tier to reward bulk'}
          icon={<PercentIcon size={15} />}
          tile="bg-mint/12 text-mint-deep"
          accent="text-mint-deep"
        />
        <Kpi
          label="Avg. top-tier rebate"
          value={avgTopRebate != null ? `${avgTopRebate.toFixed(avgTopRebate % 1 ? 1 : 0)}%` : '—'}
          sub={avgTopRebate != null ? 'Across your tiered cards' : 'No discounts configured'}
          icon={<TrendingUpIcon size={15} />}
          tile="bg-volt/25 text-volt-deep"
        />
        <Kpi label="Settlement" value="LKR" sub="Mill-gate wholesale · SLIPS/CEFT" icon={<BanknoteIcon size={15} />} tile="bg-copper/10 text-copper" mono />
      </div>

      {/* Tiering guide */}
      <Surface kind="ink" className="relative overflow-hidden p-5 grain sm:p-6">
        <button
          type="button"
          onClick={() => setGuideOpen((v) => !v)}
          aria-expanded={guideOpen}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <span className="flex items-center gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-volt shadow-[inset_0_0_0_1px_rgba(198,220,74,0.3)]">
              <PercentIcon size={18} />
            </span>
            <span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-volt">Volume tiering engine</span>
              <span className="mt-0.5 block text-[13px] text-paper/70">Tier breaks apply automatically in the buyer's cart.</span>
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-paper/10 px-3 py-1 text-[11px] font-semibold text-paper/80">{guideOpen ? 'Hide guide' : 'Show guide'}</span>
        </button>
        {guideOpen && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { n: 1, name: 'Starter restock', range: '10 – 49 units', rebate: '3% – 5%', note: 'Weekly grocery & café buyers.' },
              { n: 2, name: 'Commercial bulk', range: '50 – 99 units', rebate: '5% – 8%', note: 'Hotels, resorts & caterers.' },
              { n: 3, name: 'Enterprise pallet', range: '100+ units', rebate: '8% – 12%', note: 'Regional distributors.' },
            ].map((t) => (
              <div key={t.n} className="rounded-xl bg-paper/[0.05] p-4 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.09)]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-volt">Tier {t.n}</span>
                  <span className="font-display text-lg font-bold tracking-[-0.02em] text-paper">{t.rebate}</span>
                </div>
                <div className="mt-1 text-[13px] font-semibold text-paper">{t.name}</div>
                <div className="text-xs text-paper/60">{t.range} · {t.note}</div>
                <div className="mt-3 flex gap-1">
                  {[1, 2, 3].map((i) => (
                    <span key={i} className={cn('h-1 flex-1 rounded-full', i <= t.n ? 'bg-volt' : 'bg-paper/15')} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>

      {list.length === 0 ? (
        <Surface kind="elevated" className="space-y-7 p-6 sm:p-8">
          <div className="flex flex-col items-start justify-between gap-4 border-b border-ink/[0.07] pb-6 sm:flex-row sm:items-center">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-copper/10 text-copper shadow-[inset_0_0_0_1px_rgba(184,122,78,0.25)]">
                <PercentIcon size={22} />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-ink sm:text-xl">No rate cards yet — set your mill-gate pricing</h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-3">
                  List a wholesale commodity first, then set its base rate, minimum order quantity, lead time and volume discounts.
                </p>
              </div>
            </div>
            <Link to="/supplier/products/new" className="w-full shrink-0 sm:w-auto">
              <Button variant="primary" size="md" className="w-full gap-2 font-semibold sm:w-auto">
                <PlusIcon size={16} />
                Configure first rate card
              </Button>
            </Link>
          </div>

          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              ['Pick a commodity', 'Choose a verified staple — rice, sugar, flour, tea, spices, oils — or add your own depot stock.'],
              ['Set base rate & MOQ', 'Enter your mill-gate unit rate in LKR and the minimum order quantity for dispatch.'],
              ['Define volume brackets', 'Set three thresholds. Bigger carts unlock lower rates automatically.'],
            ].map(([title, body], i) => (
              <li key={title} className="space-y-2 rounded-2xl bg-bone/50 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-ink font-mono text-xs font-bold text-volt">{i + 1}</span>
                  <span className="text-sm font-bold text-ink">{title}</span>
                </div>
                <p className="text-xs leading-relaxed text-ink-3">{body}</p>
              </li>
            ))}
          </ol>

          {unlistedProducts.length > 0 && (
            <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-ink">Quick start — price a master commodity</h3>
                  <p className="text-xs text-ink-4">Launches the editor with the SKU prefilled.</p>
                </div>
                <Link to="/supplier/products/new" className="text-xs font-semibold text-copper hover:underline">
                  Full catalog →
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {unlistedProducts.map((p) => (
                  <div key={p.id} className="flex flex-col justify-between gap-3 rounded-2xl bg-paper p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.09),0_1px_2px_rgba(12,14,11,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.2),0_12px_24px_-14px_rgba(12,14,11,0.25)]">
                    <div className="flex items-start gap-3">
                      <ProductTile name={p.name} imageUrl={p.imageUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-bold text-ink" title={p.name}>{p.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-4">
                          {p.brand && <span className="font-medium text-ink-3">{p.brand}</span>}
                          {p.packSize && <span>· {p.packSize}</span>}
                          {p.unit && <span className="rounded bg-ink/5 px-1 text-[10px] uppercase">{p.unit}</span>}
                        </div>
                      </div>
                    </div>
                    <Link
                      to={`/supplier/products/new?productId=${p.id}`}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-bone px-3 py-2 text-xs font-semibold shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] transition-colors hover:bg-ink hover:text-paper"
                    >
                      <PlusIcon size={13} />
                      Set pricing
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Surface>
      ) : (
        <div className="space-y-4">
          {/* Search, filter & sort */}
          <div className="vyro-surface flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="relative w-full sm:max-w-sm">
              <SearchIcon size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by commodity, brand or SKU…"
                aria-label="Search rate cards"
                className="h-10 w-full rounded-xl bg-paper pl-9 pr-3 text-[13px] text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] transition-shadow placeholder:text-ink-5 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.22)] focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)] focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div role="group" aria-label="Filter by tier" className="inline-flex items-center gap-0.5 overflow-x-auto rounded-full bg-ink/[0.05] p-[3px] scrollbar-none">
                {(
                  [
                    { id: 'all', label: `All ${list.length}` },
                    { id: 'tiered', label: `With tiers ${activeTiersCount}` },
                    { id: 'flat', label: `Flat rate ${list.length - activeTiersCount}` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    aria-pressed={tierFilter === tab.id}
                    onClick={() => setTierFilter(tab.id)}
                    className={cn(
                      'h-8 cursor-pointer whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-all duration-200',
                      tierFilter === tab.id ? 'bg-ink text-paper shadow-[0_2px_8px_-2px_rgba(12,14,11,0.5)]' : 'text-ink-3 hover:bg-paper/70 hover:text-ink',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                aria-label="Sort rate cards"
                className="h-10 cursor-pointer rounded-xl bg-paper px-3 text-xs font-semibold text-ink-2 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)]"
              >
                <option value="name">Sort: Name</option>
                <option value="price">Sort: Price, high to low</option>
                <option value="discount">Sort: Biggest discount</option>
              </select>
            </div>
          </div>

          {filteredList.length === 0 ? (
            <Surface kind="elevated" className="space-y-3 p-12 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-ink/[0.06] text-ink-4">
                <PercentIcon size={22} />
              </div>
              <p className="text-sm font-semibold text-ink-2">No rate cards match your search or filter.</p>
              <p className="text-xs text-ink-4">Try clearing the search or adjusting the tier filter.</p>
              <Button variant="secondary" size="sm" onClick={() => { setSearchQuery(''); setTierFilter('all'); }}>
                Reset filters
              </Button>
            </Surface>
          ) : (
            <div className="space-y-4">
              {sortedList.map((o) => {
                const product = nameMap.get(o.productId);
                const isEditing = editing === o.id;
                const unit = product?.unit ?? 'units';
                const name = product?.name ?? 'Standard commodity';
                const tiers: LadderTier[] = [
                  { label: 'Tier 1', qty: o.tier1MinQty ?? 10, pct: o.tier1DiscountPct ?? 0 },
                  { label: 'Tier 2', qty: o.tier2MinQty ?? 50, pct: o.tier2DiscountPct ?? 0 },
                  { label: 'Tier 3', qty: o.tier3MinQty ?? 100, pct: o.tier3DiscountPct ?? 0 },
                ];
                const draftTiers: LadderTier[] = (['1', '2', '3'] as const).map((n) => ({
                  label: `Tier ${n}`,
                  qty: Number(draft[`tier${n}MinQty` as const]) || 0,
                  pct: Number(draft[`tier${n}DiscountPct` as const]) || 0,
                }));
                const warnings = isEditing ? tierWarnings(draftTiers) : [];

                return (
                  <article
                    key={o.id}
                    className={cn(
                      'vyro-surface overflow-hidden transition-all duration-300 ease-vyro',
                      isEditing ? 'ring-2 ring-ink' : 'hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1),0_14px_30px_-16px_rgba(12,14,11,0.2)]',
                    )}
                  >
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        <ProductTile name={name} imageUrl={product?.imageUrl} size="lg" />
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-base font-bold tracking-[-0.02em] text-ink">{name}</h3>
                            {product?.unit && <span className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-ink-3">{product.unit}</span>}
                            {product?.brand && <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-medium text-ink-3">{product.brand}</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            {[
                              ['SKU', o.supplierSku ?? 'Standard'],
                              ['MOQ', `${o.minOrderQty} ${unit}`],
                              ['Lead', `${o.leadTimeDays}d dispatch`],
                            ].map(([k, v]) => (
                              <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-bone/70 px-2.5 py-1 text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
                                <span className="font-semibold text-ink-4">{k}</span>
                                <span className="font-mono text-ink-2">{v}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {!isEditing && (
                        <div className="flex shrink-0 items-center justify-between gap-5 sm:justify-end">
                          <div className="sm:text-right">
                            <div className="font-display text-2xl font-bold tracking-[-0.03em] text-ink">{formatLKR(o.priceCents)}</div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">Base / {unit}</div>
                          </div>
                          <Button variant="secondary" size="sm" onClick={() => startEdit(o)} className="text-xs font-semibold">
                            Edit rate card
                          </Button>
                        </div>
                      )}
                    </div>

                    {!isEditing ? (
                      <div className="border-t border-ink/[0.07] bg-bone/30 p-5">
                        <PriceLadder baseCents={o.priceCents} unit={unit} moq={o.minOrderQty} tiers={tiers} />
                      </div>
                    ) : (
                      <div className="space-y-6 border-t border-ink/[0.07] bg-bone/40 p-5 sm:p-6">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">Editing rate card</span>
                          <span className="font-mono text-xs text-ink-4">Rates in LKR</span>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                          <Field label="Base mill-gate price (LKR)">
                            <Input value={draft.priceLkr} onChange={(e) => setDraft({ ...draft, priceLkr: e.target.value })} inputMode="decimal" className="font-mono font-bold" />
                          </Field>
                          <Field label="Minimum order qty">
                            <Input value={draft.minOrderQty} onChange={(e) => setDraft({ ...draft, minOrderQty: e.target.value })} type="number" min="1" className="font-mono" />
                          </Field>
                          <Field label="Lead time (days)">
                            <Input value={draft.leadTimeDays} onChange={(e) => setDraft({ ...draft, leadTimeDays: e.target.value })} type="number" min="0" className="font-mono" />
                          </Field>
                        </div>

                        <div className="space-y-3">
                          <div className="text-xs font-bold text-ink">Volume discount brackets</div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            {(
                              [
                                ['tier1MinQty', 'tier1DiscountPct', 'Tier 1'],
                                ['tier2MinQty', 'tier2DiscountPct', 'Tier 2'],
                                ['tier3MinQty', 'tier3DiscountPct', 'Tier 3'],
                              ] as const
                            ).map(([qtyKey, pctKey, label]) => (
                              <div key={label} className="space-y-3 rounded-xl bg-paper p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1),0_1px_2px_rgba(12,14,11,0.04)]">
                                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">{label}</div>
                                <Field label="Min quantity" small>
                                  <Input value={draft[qtyKey]} onChange={(e) => setDraft({ ...draft, [qtyKey]: e.target.value })} type="number" min="1" className="h-9 font-mono text-xs" />
                                </Field>
                                <Field label="Discount %" small>
                                  <Input value={draft[pctKey]} onChange={(e) => setDraft({ ...draft, [pctKey]: e.target.value })} type="number" min="0" max="50" className="h-9 font-mono text-xs" />
                                </Field>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">Live preview</div>
                          <PriceLadder baseCents={draftBaseCents} unit={unit} moq={Number(draft.minOrderQty) || 1} tiers={draftTiers} compact />
                        </div>

                        {warnings.length > 0 && (
                          <ul className="space-y-1 rounded-xl bg-amber/10 p-3.5 text-xs text-[#8a5a1f] shadow-[inset_0_0_0_1px_rgba(196,132,58,0.3)]">
                            {warnings.map((w) => (
                              <li key={w}>• {w}</li>
                            ))}
                          </ul>
                        )}
                        {err && <div className="rounded-xl bg-rose/10 p-3.5 text-xs text-rose shadow-[inset_0_0_0_1px_rgba(196,90,74,0.3)]">{err}</div>}

                        <div className="flex flex-wrap justify-end gap-2 border-t border-ink/[0.07] pt-4">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                            Cancel
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => save.mutate()} disabled={save.isPending} loading={save.isPending} className="gap-1.5">
                            <CheckIcon size={14} />
                            Save rate card
                          </Button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  tile,
  accent,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ReactNode;
  tile: string;
  accent?: string;
  mono?: boolean;
}) {
  return (
    <div className="vyro-surface space-y-2 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-4">{label}</span>
        <span className={cn('flex size-8 items-center justify-center rounded-[10px]', tile)}>{icon}</span>
      </div>
      <MetricNumber size="md" className={cn(accent ?? 'text-ink', mono && 'font-mono')}>
        {value}
      </MetricNumber>
      <div className="text-xs text-ink-4">{sub}</div>
    </div>
  );
}

function Field({ label, small, children }: { label: string; small?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className={cn('block font-semibold text-ink-3', small ? 'text-[10px] uppercase tracking-[0.12em]' : 'text-[11px]')}>{label}</span>
      {children}
    </label>
  );
}
