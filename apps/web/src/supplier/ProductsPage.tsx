import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface, ProductImage } from '@/components/brand/Surface';
import {
  PackageIcon,
  SearchIcon,
  Trash2Icon,
  Edit3Icon,
  AlertTriangleIcon,
  ClockIcon,
  ChevronRightIcon,
  TrendingUpIcon,
  RefreshCwIcon,
  PlusIcon,
  ExternalLinkIcon,
  LayersIcon,
  TruckIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { cn, useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { HeroStatusPill } from './SupplierHero';

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

  const total = list.length;
  const healthSegments = [
    { key: 'in_stock' as const, count: inStockCount, bar: 'bg-mint', label: 'In stock' },
    { key: 'low' as const, count: lowStockCount, bar: 'bg-amber', label: 'Low' },
    { key: 'out_of_stock' as const, count: outOfStockCount, bar: 'bg-rose', label: 'Out' },
  ];
  const tieredCount = list.filter(
    (o) => (o.tier1DiscountPct ?? 0) > 0 || (o.tier2DiscountPct ?? 0) > 0 || (o.tier3DiscountPct ?? 0) > 0,
  ).length;

  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────── */}
      <Surface kind="ink" className="grain rounded-2xl shadow-soft-lg">
        <div className="pointer-events-none absolute -top-32 -right-16 size-96 rounded-full bg-volt/[0.12] blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-36 -left-20 size-80 rounded-full bg-copper/25 blur-3xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#FAF7F0_1px,transparent_1px),linear-gradient(to_bottom,#FAF7F0_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
          aria-hidden
        />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
                <PackageIcon size={12} />
                Depot catalog
              </span>
              {total > 0 ? (
                <HeroStatusPill label="Catalog active" tone="mint" />
              ) : (
                <HeroStatusPill label="Awaiting listings" tone="amber" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={offers.isFetching}
                className="flex size-9 items-center justify-center rounded-xl border border-paper/15 bg-paper/5 text-paper/70 transition-colors hover:bg-paper/10 hover:text-paper disabled:opacity-50"
                title="Refresh product listings"
                aria-label="Refresh product listings"
              >
                <RefreshCwIcon size={14} className={offers.isFetching ? 'animate-spin' : ''} />
              </button>
              <Link
                to="/search"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-paper/15 bg-paper/5 px-3.5 text-[13px] font-semibold text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper"
              >
                <ExternalLinkIcon size={13} />
                <span className="hidden sm:inline">Marketplace</span>
              </Link>
              <Link
                to="/supplier/products/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-volt px-4 text-[13px] font-bold text-ink shadow-[0_8px_24px_-10px_rgba(198,220,74,0.7)] transition-colors hover:bg-volt-glow"
              >
                <PlusIcon size={14} />
                Add product
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-end">
            <div className="min-w-0">
              <h1 className="vyro-display text-3xl font-bold leading-[1.04] tracking-tight text-paper sm:text-[2.6rem] text-balance">
                Product listings &amp; <span className="text-volt">mill-gate</span> rates
              </h1>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-paper/60">
                {total === 0
                  ? 'Publish staple commodities or custom depot items to start accepting verified buyer orders.'
                  : 'Every listing syncs to the buyer marketplace instantly — keep rates and stock sharp.'}
              </p>
            </div>

            {/* Catalog snapshot */}
            <div className="rounded-xl border border-paper/10 bg-paper/[0.04] p-5 backdrop-blur-sm">
              <div className="grid grid-cols-3 gap-4">
                <HeroFigure label="Published" value={String(total)} />
                <HeroFigure label="Avg rate" value={total ? formatLKR(avgPrice) : '—'} accent />
                <HeroFigure label="Volume tiers" value={`${tieredCount}/${total}`} />
              </div>
              <div className="mt-5">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">
                  <span>Stock health</span>
                  <span>{total ? `${Math.round((inStockCount / total) * 100)}% ready` : 'No listings'}</span>
                </div>
                <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-paper/10">
                  {total > 0 &&
                    healthSegments
                      .filter((s) => s.count > 0)
                      .map((s) => (
                        <div key={s.key} className={cn('h-full', s.bar)} style={{ width: `${(s.count / total) * 100}%` }} />
                      ))}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-paper/55">
                  {healthSegments.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1.5">
                      <span className={cn('size-1.5 rounded-full', s.bar)} />
                      {s.label} <span className="font-mono text-paper/80">{s.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {total === 0 ? (
        /* ── Empty: launchpad ─────────────────────────── */
        <div className="space-y-5">
          <section className="rounded-2xl border border-ink/[0.08] bg-paper p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-volt">
                  <PackageIcon size={22} />
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold tracking-tight text-ink">Launch your depot catalog</h2>
                  <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-3">
                    Publish grains, edible oils, packaging or bulk goods to accept purchase orders from verified retail,
                    hospitality and distribution buyers.
                  </p>
                </div>
              </div>
              <Link
                to="/supplier/products/new"
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-5 text-[13px] font-semibold text-paper transition-colors hover:bg-charcoal"
              >
                <PlusIcon size={15} className="text-volt" />
                Add your first product
              </Link>
            </div>

            <ol className="mt-7 grid gap-3 md:grid-cols-3">
              {[
                {
                  title: 'Pick a standard SKU',
                  body: 'Match national commodity standards (Samba, Nadu, sugar, tea, oils) or add your own brand and packaging.',
                },
                {
                  title: 'Set rate & MOQ',
                  body: 'Base price per unit, minimum order, lead time and optional volume tiers for bulk buyers.',
                },
                {
                  title: 'Receive escrow POs',
                  body: 'Buyers order against your rates. Funds are held in escrow and paid out on delivery.',
                },
              ].map((step, i) => (
                <li key={step.title} className="rounded-xl border border-ink/[0.06] bg-bone/50 p-4">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-copper">
                    Step 0{i + 1}
                  </span>
                  <p className="mt-1.5 text-[14px] font-semibold text-ink">{step.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <SuggestedProducts products={unlistedProducts} title="Quick-start commodities" />
        </div>
      ) : (
        /* ── Listings ─────────────────────────────────── */
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-2 rounded-2xl border border-ink/[0.08] bg-paper p-1.5 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-sm">
              <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search commodities, SKU, brand…"
                className="h-10 w-full rounded-xl bg-bone/60 pl-10 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-4 focus:bg-bone"
                aria-label="Search listings"
              />
            </div>
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:ml-auto">
              {(
                [
                  { id: 'all', label: 'All', count: total, dot: 'bg-ink' },
                  { id: 'in_stock', label: 'In stock', count: inStockCount, dot: 'bg-mint' },
                  { id: 'low', label: 'Low', count: lowStockCount, dot: 'bg-amber' },
                  { id: 'out_of_stock', label: 'Out', count: outOfStockCount, dot: 'bg-rose' },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id as 'all' | Offer['availabilityStatus'])}
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium transition-all',
                      active ? 'bg-ink text-paper shadow-sm' : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink',
                    )}
                  >
                    {tab.id !== 'all' && <span className={cn('size-1.5 rounded-full', tab.dot)} />}
                    {tab.label}
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 font-mono text-[10px]',
                        active ? 'bg-paper/15 text-paper' : 'bg-ink/[0.06] text-ink-3',
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <section className="overflow-hidden rounded-2xl border border-ink/[0.08] bg-paper shadow-[0_1px_2px_rgba(12,14,11,0.04)]">
            {filteredList.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-bone text-ink-4">
                  <SearchIcon size={20} />
                </span>
                <p className="mt-4 text-[14px] font-semibold text-ink">No listings match</p>
                <p className="mt-1 text-[12px] text-ink-4">Try clearing the search or switching the stock filter.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                >
                  Reset filters
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-ink/[0.08] bg-bone/50 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                      <th className="px-5 py-3.5 text-left font-medium">Product</th>
                      <th className="px-4 py-3.5 text-right font-medium">Mill-gate rate</th>
                      <th className="px-4 py-3.5 text-right font-medium">MOQ</th>
                      <th className="px-4 py-3.5 text-left font-medium">Dispatch</th>
                      <th className="px-4 py-3.5 text-left font-medium">Coverage</th>
                      <th className="px-4 py-3.5 text-left font-medium">Status</th>
                      <th className="px-5 py-3.5 text-right font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/[0.05]">
                    {filteredList.map((o) => {
                      const p = nameMap.get(o.productId);
                      const hasTiers =
                        (o.tier1DiscountPct ?? 0) > 0 ||
                        (o.tier2DiscountPct ?? 0) > 0 ||
                        (o.tier3DiscountPct ?? 0) > 0;
                      const unitLabel = p?.unit ?? 'unit';
                      const meta = [p?.brand, p?.packSize].filter(Boolean).join(' · ');
                      const status = STATUS_STYLE[o.availabilityStatus];

                      return (
                        <tr key={o.id} className="group transition-colors hover:bg-bone/40">
                          <td className="px-5 py-4">
                            <Link to={`/supplier/products/${o.id}/edit`} className="flex items-center gap-3.5">
                              <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-bone ring-1 ring-ink/[0.08]">
                                <ProductImage
                                  src={p?.imageUrl}
                                  alt={p?.name ?? 'Product'}
                                  seed={o.productId}
                                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-display text-[15px] font-bold text-ink transition-colors group-hover:text-copper-deep">
                                  {p?.name ?? 'Standard commodity'}
                                </span>
                                <span className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-4">
                                  {meta && <span className="truncate">{meta}</span>}
                                  {o.supplierSku && (
                                    <span className="shrink-0 rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                                      {o.supplierSku}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-display text-[17px] font-bold tracking-tight text-ink tabular-nums">
                              {formatLKR(o.priceCents)}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-ink-4">per {unitLabel}</span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-semibold text-ink tabular-nums">{o.minOrderQty}</span>{' '}
                            <span className="text-[12px] text-ink-4">{unitLabel}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium',
                                o.leadTimeDays <= 2 ? 'bg-mint/10 text-mint' : 'bg-ink/[0.05] text-ink-3',
                              )}
                            >
                              <ClockIcon size={12} />
                              {o.leadTimeDays === 0 ? 'Same day' : `${o.leadTimeDays}d`}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1 text-[12px]">
                              <span className="flex items-center gap-1.5 text-ink-2">
                                <TruckIcon size={13} className="shrink-0 text-copper" />
                                {o.deliveryAvailable !== false
                                  ? o.deliveryRadiusKm
                                    ? `${o.deliveryRadiusKm} km radius`
                                    : 'Island-wide delivery'
                                  : 'Dock pickup only'}
                              </span>
                              <span
                                className={cn(
                                  'flex items-center gap-1.5',
                                  hasTiers ? 'text-volt-deep font-medium' : 'text-ink-4',
                                )}
                              >
                                <LayersIcon size={12} className="shrink-0" />
                                {hasTiers ? 'Volume tiers on' : 'Flat rate'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset',
                                status.pill,
                              )}
                            >
                              <span className={cn('size-1.5 rounded-full', status.dot)} />
                              {AVAIL_LABEL[o.availabilityStatus]}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                to={`/products/${o.productId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex size-9 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/[0.05] hover:text-ink"
                                title="View on marketplace"
                                aria-label="View on marketplace"
                              >
                                <ExternalLinkIcon size={14} />
                              </Link>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(o)}
                                className="flex size-9 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-rose/10 hover:text-rose"
                                title="Delist listing"
                                aria-label="Delist listing"
                              >
                                <Trash2Icon size={14} />
                              </button>
                              <Link
                                to={`/supplier/products/${o.id}/edit`}
                                className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink/15 bg-paper px-3 text-[12px] font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-paper"
                              >
                                <Edit3Icon size={12} />
                                Edit
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-ink/[0.06] bg-bone/30 px-5 py-3 text-[12px] text-ink-4">
              <span>
                Showing <span className="font-semibold text-ink">{filteredList.length}</span> of {total} listing
                {total === 1 ? '' : 's'}
              </span>
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] sm:inline">
                Synced to marketplace
              </span>
            </div>
          </section>

          <SuggestedProducts products={unlistedProducts} title="Suggested to list next" />

          {/* Tip banner */}
          <Surface kind="ink" className="grain rounded-2xl">
            <div className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full bg-volt/10 blur-3xl" aria-hidden />
            <div className="relative flex items-start gap-4 p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-volt text-ink">
                <TrendingUpIcon size={18} />
              </span>
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
                  Procurement insight
                </div>
                <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-paper/75">
                  Buyers filter by dispatch readiness and minimum order quantity. Keeping lead times under 48 hours and
                  adding volume discount tiers helps your listings win more repeat orders.
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
            className="w-full max-w-md space-y-4 rounded-2xl border border-ink/10 bg-paper p-6 shadow-soft-xl animate-scale-in"
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

const STATUS_STYLE: Record<Offer['availabilityStatus'], { pill: string; dot: string }> = {
  in_stock: { pill: 'bg-mint/10 text-mint ring-mint/25', dot: 'bg-mint' },
  low: { pill: 'bg-amber/10 text-amber ring-amber/25', dot: 'bg-amber' },
  out_of_stock: { pill: 'bg-rose/10 text-rose ring-rose/25', dot: 'bg-rose' },
};

function HeroFigure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">{label}</div>
      <div
        className={cn(
          'mt-1.5 truncate font-display text-xl font-bold tracking-tight sm:text-2xl',
          accent ? 'text-volt' : 'text-paper',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SuggestedProducts({ products, title }: { products: Product[]; title: string }) {
  if (products.length === 0) return null;
  return (
    <section className="rounded-2xl border border-ink/[0.08] bg-paper p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight text-ink">{title}</h3>
          <p className="mt-0.5 text-[12px] text-ink-4">Catalog SKUs buyers already shop that you don’t list yet.</p>
        </div>
        <Link
          to="/supplier/products/new"
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ink-3 transition-colors hover:text-ink"
        >
          Browse catalog <ChevronRightIcon size={13} />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Link
            key={p.id}
            to={`/supplier/products/new?productId=${p.id}`}
            className="group flex items-center gap-3 rounded-xl border border-ink/[0.08] bg-paper p-2.5 pr-3 transition-all hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-[0_16px_32px_-22px_rgba(12,14,11,0.5)]"
          >
            <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-bone ring-1 ring-ink/[0.06]">
              <ProductImage src={p.imageUrl} alt={p.name} seed={p.id} className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{p.name}</span>
              <span className="block truncate text-[11px] text-ink-4">
                {[p.brand, p.packSize, p.unit].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink/[0.05] text-ink transition-colors group-hover:bg-volt">
              <PlusIcon size={14} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
