import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { Button, EmptyState } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { cn, useToast } from '@vyro/ui';
import {
  ShoppingCartIcon,
  Trash2Icon,
  TruckIcon,
  ShieldCheckIcon,
  MapPinIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  PlusIcon,
  MinusIcon,
  SparklesIcon,
  FileTextIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  LayersIcon,
} from '@/components/icons';
import { PageHero, HeroStatusPill, heroActionClass } from '@/components/brand/PageHero';
import { ProductImage, Surface } from '@/components/brand/Surface';
import { CartHintsBanner } from '@/ai/CartHintsBanner';
import { useRfqQualify } from '@/components/BulkQuoteCta';
import { useQuery as useRQ } from '@tanstack/react-query';
import { useRepeatOffersPreview } from '@/hooks/useRepeatOffersPreview';
import { RepeatOfferBadge } from '@/components/RepeatOfferBadge';

interface LineHint {
  cartItemId: string;
  productName: string;
  cheaperSupplierName: string;
  currentPriceCents: number;
  altPriceCents: number;
  savingCents: number;
}

interface TierRef {
  minQty: number;
  discountPct: number;
}

interface CartItem {
  id: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
  discountCents: number;
  bestTier: TierRef | null;
  nextTier: TierRef | null;
  product: {
    id: string;
    name: string;
    unit?: string;
    brand?: string | null;
    packSize?: string | null;
    imageUrl?: string | null;
  };
  supplier: {
    id: string;
    name: string;
    city?: string;
    district?: string;
    verificationStatus?: string;
    address?: string;
  };
  offer: {
    id: string;
    minOrderQty: number;
    leadTimeDays: number;
    availabilityStatus: string;
    trackInventory?: boolean;
    availableQty?: number | null;
    lowStockThreshold?: number;
  };
  issues?: Array<{
    code: 'OUT_OF_STOCK' | 'BELOW_MOQ' | 'INSUFFICIENT_STOCK';
    message: string;
    minOrderQty?: number;
    available?: number;
  }>;
}

export function CartPage() {
  usePageTitle('Cart');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingQty, setPendingQty] = useState<Record<string, string>>({});
  const [clearing, setClearing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () =>
      api.get<{
        cart: { id: string };
        items: CartItem[];
        subtotalCents: number;
        discountTotalCents: number;
        totalCents: number;
        supplierCount: number;
      }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { supplier: CartItem['supplier']; lines: CartItem[] }>();
    for (const it of data?.items ?? []) {
      const key = it.supplier.name;
      const entry = map.get(key) ?? { supplier: it.supplier, lines: [] };
      entry.lines.push(it);
      map.set(key, entry);
    }
    return map;
  }, [data?.items]);

  // Per-line cheaper-alt hints. Failures are non-fatal — UI just omits chips.
  const lineHintsQ = useRQ({
    queryKey: ['cart-line-hints', businessId],
    queryFn: () => api.get<{ hints: LineHint[] }>(`/ai/cart-line-hints?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 60_000,
    retry: 0,
  });
  const lineHintsByItem = useMemo(() => {
    const map = new Map<string, LineHint>();
    for (const h of lineHintsQ.data?.hints ?? []) map.set(h.cartItemId, h);
    return map;
  }, [lineHintsQ.data]);

  const repeatOffersQ = useRepeatOffersPreview(businessId);
  const repeatOfferBySupplier = useMemo(() => {
    const m = new Map<string, import('@vyro/validation').RepeatOffer>();
    for (const o of repeatOffersQ.data?.offers ?? []) m.set(o.supplierId, o);
    return m;
  }, [repeatOffersQ.data]);

  if (!user || !businessId) {
    return (
      <div className="max-w-lg py-12">
        <h2 className="vyro-display text-3xl">Business profile required</h2>
        <p className="mt-2 text-sm text-ink-4">Sign in and set up your business to access the procurement cart.</p>
        <div className="mt-6 flex gap-3">
          <Link to="/onboarding/business">
            <Button>Set up business</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="h-64 vyro-surface animate-pulse" />;

  async function remove(id: string) {
    setDeletingId(id);
    try {
      await api.del(`/cart/items/${id}`);
      await qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Item removed from cart');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to remove item');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStep(id: string, currentQty: number, delta: number, minOrderQty: number) {
    const nextQty = Math.max(minOrderQty, currentQty + delta);
    setUpdatingId(id);
    try {
      await api.patch(`/cart/items/${id}`, { quantity: nextQty });
      await qc.invalidateQueries({ queryKey: ['cart'] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update quantity');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSetExact(id: string, targetQty: number) {
    const qty = Math.max(1, Math.round(targetQty));
    setUpdatingId(id);
    try {
      await api.patch(`/cart/items/${id}`, { quantity: qty });
      await qc.invalidateQueries({ queryKey: ['cart'] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to update quantity');
    } finally {
      setUpdatingId(null);
    }
  }

  async function clearAll() {
    if (!data?.items?.length) return;
    if (!window.confirm('Are you sure you want to remove all items from your cart?')) return;
    setClearing(true);
    try {
      for (const item of data.items) {
        await api.del(`/cart/items/${item.id}`);
      }
      await qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Cart cleared');
    } catch (e) {
      toast.error('Failed to clear cart');
    } finally {
      setClearing(false);
    }
  }

  const items = data?.items ?? [];
  const subtotal = data?.subtotalCents ?? 0;
  const discountTotal = data?.discountTotalCents ?? 0;
  const total = data?.totalCents ?? subtotal;
  const supplierCount = data?.supplierCount ?? 0;
  const itemCount = data?.items?.length ?? 0;
  const totalUnits = items.reduce((acc, it) => acc + it.quantity, 0);
  const belowMoq = items.filter((i) => i.quantity < i.offer.minOrderQty);
  const hasBlockingIssues = belowMoq.length > 0 || items.some((it) => (it.issues?.length ?? 0) > 0);
  const poLabel = `${supplierCount} PO${supplierCount === 1 ? '' : 's'}`;

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb / Action Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Link
          to="/search"
          className="inline-flex items-center gap-1.5 text-xs text-ink-4 hover:text-ink transition-colors"
        >
          <ArrowLeftIcon size={14} /> Back to Wholesale Catalog
        </Link>
      </div>

      <PageHero
        icon={ShoppingCartIcon}
        kicker="Wholesale Procurement"
        title="Review the flow."
        description="Lines are grouped by supplier and issued as separate Purchase Orders at checkout, each with its own dispatch lead time."
        status={
          items.length > 0 ? (
            <HeroStatusPill label="Draft POs Ready" tone="volt" />
          ) : (
            <HeroStatusPill label="Cart Empty" tone="paper" />
          )
        }
        actions={
          items.length > 0 ? (
            <>
              <Link to="/search" className={heroActionClass}>
                <PlusIcon size={13} />
                Add More Lines
              </Link>
              <button
                type="button"
                onClick={clearAll}
                disabled={clearing}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose/30 bg-rose/10 px-3 text-xs font-semibold text-rose transition-colors hover:bg-rose/20 disabled:opacity-50 cursor-pointer"
              >
                <Trash2Icon size={13} />
                {clearing ? 'Clearing…' : 'Clear Cart'}
              </button>
            </>
          ) : undefined
        }
        footer={
          <>
            <span>Checkout splits lines into per-supplier POs</span>
            <span className="text-paper/40">
              {supplierCount} supplier{supplierCount === 1 ? '' : 's'} · {itemCount} line{itemCount === 1 ? '' : 's'}
            </span>
          </>
        }
      />

      {/* Empty State */}
      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCartIcon size={24} />}
          title="Your procurement cart is empty."
          description="Browse verified wholesale mills, compare quotes by price and lead time, and add commercial supply lines."
          action={
            <Link to="/search">
              <Button size="lg">Browse Wholesale Catalog</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">
          {/* Left Column: Steps + Supplier PO Draft Cards */}
          <div className="space-y-5 min-w-0">
            <CheckoutSteps
              steps={[
                { label: 'Review cart', sub: `${itemCount} line${itemCount === 1 ? '' : 's'} · ${totalUnits} units` },
                { label: `Split into ${poLabel}`, sub: 'One per supplier' },
                { label: 'Issue & track', sub: 'Dispatch + GRN' },
              ]}
            />

            <CartHintsBanner businessId={businessId} />

            {Array.from(grouped.entries()).map(([supplierName, { supplier, lines }], idx) => {
              const poNumber = `PO-${String(idx + 1).padStart(2, '0')}`;
              const sub = lines.reduce((a, b) => a + b.lineTotalCents, 0);
              const maxLead = Math.max(...lines.map((l) => l.offer.leadTimeDays || 1));
              const supplierDiscount = lines.reduce((a, b) => a + (b.discountCents || 0), 0);
              const supplierUnits = lines.reduce((a, b) => a + b.quantity, 0);
              const repeatOffer = repeatOfferBySupplier.get(supplier.id);

              return (
                <div key={supplierName} className="space-y-2">
                  {repeatOffer && <RepeatOfferBadge offer={repeatOffer} />}
                  <Surface kind="flat" className="p-0 overflow-hidden">
                    {/* Supplier PO Header */}
                    <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="size-12 shrink-0 rounded-xl bg-ink text-volt font-display text-lg font-bold flex items-center justify-center">
                          {supplierName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <h2 className="font-display text-lg text-ink font-semibold tracking-tight truncate">
                              {supplierName}
                            </h2>
                            {supplier.verificationStatus === 'verified' && (
                              <span title="Verified mill" className="text-mint shrink-0">
                                <ShieldCheckIcon size={15} />
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-4">
                            <span className="font-mono font-semibold uppercase tracking-wider text-ink-3">
                              Draft {poNumber}
                            </span>
                            <span className="size-1 rounded-full bg-ink/20" />
                            <span className="inline-flex items-center gap-1">
                              <MapPinIcon size={11} />
                              {supplier.city || 'Western Province'}, {supplier.district || 'LK'}
                            </span>
                            <span className="size-1 rounded-full bg-ink/20" />
                            <span className="inline-flex items-center gap-1">
                              <TruckIcon size={11} />
                              Dispatches in {maxLead} day{maxLead === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="sm:text-right shrink-0 flex sm:block items-baseline justify-between">
                        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">PO value</div>
                        <div className="vyro-metric text-xl text-ink font-semibold whitespace-nowrap">{formatLKR(sub)}</div>
                      </div>
                    </div>

                    {/* Line Items List */}
                    <ul className="divide-y divide-line">
                      {lines.map((it) => {
                        const draft = pendingQty[it.id] ?? String(it.quantity);
                        const isBelowMoq = it.quantity < it.offer.minOrderQty;
                        const isLineUpdating = updatingId === it.id;
                        const grossLineTotal = it.priceCents * it.quantity;
                        const hint = lineHintsByItem.get(it.id);
                        const unit = it.product.unit || 'unit';

                        return (
                          <li
                            key={it.id}
                            className={cn(
                              'px-6 py-5 grid grid-cols-[72px_minmax(0,1fr)] md:grid-cols-[88px_minmax(0,1fr)_auto] gap-x-5 gap-y-4 transition-opacity',
                              isLineUpdating && 'opacity-60',
                            )}
                          >
                            {/* Thumbnail */}
                            <Link to={`/products/${it.product.id}`} className="group block">
                              <ProductImage
                                src={it.product.imageUrl}
                                alt={it.product.name}
                                seed={it.product.id}
                                className="size-[72px] md:size-[88px] rounded-xl border border-line bg-bone group-hover:shadow-md transition-shadow"
                              />
                            </Link>

                            {/* Product info */}
                            <div className="min-w-0 space-y-2">
                              <div>
                                {it.product.brand && (
                                  <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">
                                    {it.product.brand}
                                  </div>
                                )}
                                <Link
                                  to={`/products/${it.product.id}`}
                                  className="font-display text-base font-semibold text-ink hover:text-copper transition-colors truncate block"
                                >
                                  {it.product.name}
                                </Link>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center rounded-md bg-bone px-2 py-0.5 font-mono text-[11px] text-ink-2">
                                  {formatLKR(it.priceCents)}
                                  <span className="text-ink-4">&nbsp;/ {unit}</span>
                                </span>
                                <span className="inline-flex items-center rounded-md bg-bone px-2 py-0.5 font-mono text-[11px] text-ink-3">
                                  MOQ {it.offer.minOrderQty}
                                </span>
                                {it.product.packSize && (
                                  <span className="inline-flex items-center rounded-md bg-bone px-2 py-0.5 font-mono text-[11px] text-ink-3">
                                    {it.product.packSize}
                                  </span>
                                )}
                                {it.bestTier && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-volt">
                                    <SparklesIcon size={10} /> −{it.bestTier.discountPct}% volume
                                  </span>
                                )}
                              </div>

                              {it.nextTier && (
                                <div className="text-[11px] text-ink-3">
                                  Add <span className="font-semibold text-ink">{it.nextTier.minQty - it.quantity}</span> more for{' '}
                                  <button
                                    type="button"
                                    onClick={() => handleSetExact(it.id, it.nextTier!.minQty)}
                                    className="font-semibold text-copper hover:underline cursor-pointer"
                                  >
                                    −{it.nextTier.discountPct}% off
                                  </button>
                                </div>
                              )}

                              {/* Warning: Below MOQ Alert */}
                              {isBelowMoq && (
                                <LineNotice tone="rose">
                                  Below the {it.offer.minOrderQty}-unit supplier minimum.
                                  <button
                                    type="button"
                                    onClick={() => handleSetExact(it.id, it.offer.minOrderQty)}
                                    className="font-semibold underline ml-1 hover:text-ink"
                                  >
                                    Set to MOQ
                                  </button>
                                </LineNotice>
                              )}

                              {/* Per-line cheaper-alt hint */}
                              {hint && (
                                <LineNotice tone="mint" icon={<SparklesIcon size={12} />}>
                                  Cheaper at {hint.cheaperSupplierName} — save{' '}
                                  <span className="font-mono font-semibold">{formatLKR(hint.savingCents)}</span>.
                                  <Link
                                    to={`/search?q=${encodeURIComponent(it.product.name)}`}
                                    className="font-semibold underline ml-1 hover:text-ink"
                                  >
                                    Compare
                                  </Link>
                                </LineNotice>
                              )}

                              {/* Stock warnings (server-validated) */}
                              {it.issues?.map((issue, i) => (
                                <LineNotice key={i} tone="rose">
                                  {issue.message}
                                  {issue.code === 'BELOW_MOQ' && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetExact(it.id, it.offer.minOrderQty)}
                                      className="font-semibold underline ml-1 hover:text-ink"
                                    >
                                      Set to MOQ
                                    </button>
                                  )}
                                </LineNotice>
                              ))}
                            </div>

                            {/* Controls & Financials */}
                            <div className="col-span-2 md:col-span-1 flex items-start justify-between md:justify-end gap-6 pt-4 md:pt-0 border-t md:border-t-0 border-line">
                              <div className="flex flex-col items-start md:items-end gap-1.5">
                                <div className="flex items-center h-10 rounded-xl border border-line bg-paper overflow-hidden focus-within:border-ink transition-colors">
                                  <button
                                    type="button"
                                    onClick={() => handleStep(it.id, it.quantity, -1, it.offer.minOrderQty)}
                                    disabled={it.quantity <= it.offer.minOrderQty || isLineUpdating}
                                    className="size-10 flex items-center justify-center text-ink hover:bg-bone disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                                    aria-label="Decrease quantity"
                                  >
                                    <MinusIcon size={14} />
                                  </button>
                                  <input
                                    type="number"
                                    min={it.offer.minOrderQty}
                                    value={draft}
                                    aria-label={`Quantity of ${it.product.name}`}
                                    onChange={(e) => setPendingQty((p) => ({ ...p, [it.id]: e.target.value }))}
                                    onBlur={(e) => {
                                      const val = Number(e.target.value);
                                      if (Number.isFinite(val) && val !== it.quantity) {
                                        handleSetExact(it.id, Math.max(1, val));
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const val = Number((e.target as HTMLInputElement).value);
                                        if (Number.isFinite(val)) handleSetExact(it.id, Math.max(1, val));
                                      }
                                    }}
                                    className="w-14 h-full text-center font-mono font-semibold text-sm bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleStep(it.id, it.quantity, 1, it.offer.minOrderQty)}
                                    disabled={isLineUpdating}
                                    className="size-10 flex items-center justify-center text-ink hover:bg-bone disabled:opacity-30 transition-colors cursor-pointer"
                                    aria-label="Increase quantity"
                                  >
                                    <PlusIcon size={14} />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1">
                                  {[
                                    { label: 'MOQ', onClick: () => handleSetExact(it.id, it.offer.minOrderQty) },
                                    { label: '+10', onClick: () => handleStep(it.id, it.quantity, 10, it.offer.minOrderQty) },
                                    { label: '+25', onClick: () => handleStep(it.id, it.quantity, 25, it.offer.minOrderQty) },
                                  ].map((p) => (
                                    <button
                                      key={p.label}
                                      type="button"
                                      onClick={p.onClick}
                                      disabled={isLineUpdating}
                                      className="h-6 px-2 rounded-md font-mono text-[10px] text-ink-4 hover:text-ink hover:bg-bone transition-colors cursor-pointer disabled:opacity-40"
                                    >
                                      {p.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div className="flex items-start gap-2">
                                <div className="text-right min-w-[112px]">
                                  <div className="vyro-metric text-lg text-ink font-semibold whitespace-nowrap leading-10">
                                    {formatLKR(it.lineTotalCents)}
                                  </div>
                                  {it.discountCents > 0 ? (
                                    <div className="text-[11px] leading-tight">
                                      <span className="text-ink-4 line-through mr-1.5">{formatLKR(grossLineTotal)}</span>
                                      <span className="text-mint font-medium">−{formatLKR(it.discountCents)}</span>
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-ink-4 font-mono">
                                      {it.quantity} × {unit}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => remove(it.id)}
                                  disabled={deletingId === it.id}
                                  className="size-10 rounded-xl flex items-center justify-center text-ink-4 hover:text-rose hover:bg-rose/10 transition-colors disabled:opacity-40 cursor-pointer"
                                  aria-label={`Remove ${it.product.name}`}
                                >
                                  <Trash2Icon size={15} />
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Supplier footer */}
                    <div className="px-6 py-3 bg-bone/50 border-t border-line flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-4">
                      <span className="font-mono">
                        {lines.length} line{lines.length === 1 ? '' : 's'} · {supplierUnits} units
                      </span>
                      {supplierDiscount > 0 ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-mint">
                          <CheckCircleIcon size={12} /> Volume discount applied
                          <span className="font-mono font-semibold">−{formatLKR(supplierDiscount)}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <FileTextIcon size={12} /> Issued as a separate PO
                        </span>
                      )}
                    </div>
                  </Surface>
                </div>
              );
            })}
          </div>

          {/* Right Column: Order Summary */}
          <div className="space-y-4 lg:sticky lg:top-24">
            <Surface kind="floating" className="p-0 overflow-hidden">
              {/* Total hero */}
              <div className="relative bg-ink text-paper p-6 overflow-hidden">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-volt/10 blur-2xl"
                />
                <div className="relative">
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-volt font-semibold">
                    Order summary
                  </div>
                  <div className="mt-4 text-xs text-paper/60">Total PO commitment</div>
                  <div className="mt-1 vyro-metric text-[2rem] leading-none font-bold whitespace-nowrap">
                    {formatLKR(total)}
                  </div>
                  <div className="mt-2 text-[11px] text-paper/50">
                    Across {poLabel} · LKR wholesale rates locked
                  </div>

                  <dl className="mt-6 grid grid-cols-3 rounded-xl bg-paper/[0.06] border border-paper/10 divide-x divide-paper/10">
                    {[
                      { k: 'Vendors', v: supplierCount },
                      { k: 'Lines', v: itemCount },
                      { k: 'Units', v: totalUnits },
                    ].map((s) => (
                      <div key={s.k} className="px-3 py-2.5 text-center">
                        <dt className="text-[9px] font-mono uppercase tracking-[0.14em] text-paper/50">{s.k}</dt>
                        <dd className="mt-0.5 font-mono text-base font-bold">{s.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Financial Breakdown */}
                <dl className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-3">Subtotal</dt>
                    <dd className="font-mono text-sm text-ink">{formatLKR(subtotal)}</dd>
                  </div>
                  {discountTotal > 0 && (
                    <div className="flex items-center justify-between text-mint">
                      <dt className="inline-flex items-center gap-1 font-medium">
                        <SparklesIcon size={11} /> Volume discounts
                      </dt>
                      <dd className="font-mono text-sm font-semibold">−{formatLKR(discountTotal)}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-3">Delivery</dt>
                    <dd className="text-[11px] font-semibold text-mint uppercase tracking-wider">Included</dd>
                  </div>
                  <div className="pt-3 border-t border-dashed border-line flex items-center justify-between">
                    <dt className="font-semibold text-ink">Total</dt>
                    <dd className="font-mono text-base font-bold text-ink whitespace-nowrap">{formatLKR(total)}</dd>
                  </div>
                </dl>

                {/* Error / Warning if blocked */}
                {hasBlockingIssues && (
                  <div className="flex gap-2.5 p-3 rounded-xl bg-rose/5 border border-rose/25 text-rose">
                    <AlertCircleIcon size={14} className="shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <div className="font-semibold">Fix {belowMoq.length > 0 ? 'minimum order' : 'stock'} issues to continue</div>
                      {belowMoq.length > 0 && (
                        <p className="text-rose/80">
                          {belowMoq.length} line{belowMoq.length === 1 ? ' is' : 's are'} below the supplier minimum.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Checkout CTA */}
                <div className="space-y-2.5">
                  <Button
                    size="lg"
                    className="w-full justify-center"
                    disabled={hasBlockingIssues}
                    onClick={() => navigate('/checkout')}
                  >
                    Generate {poLabel} & checkout
                  </Button>
                  <p className="text-center text-[11px] text-ink-4">
                    Payment is held in escrow until you confirm delivery.
                  </p>
                </div>

                <BulkQuoteRow totalCents={total} quantity={totalUnits} />

                {/* Procurement Guarantees */}
                <ul className="pt-4 border-t border-line space-y-2.5 text-[11px] text-ink-3">
                  {[
                    { icon: <ShieldCheckIcon size={12} />, text: 'Mill-gate price lock on every line' },
                    { icon: <FileTextIcon size={12} />, text: 'Tax-compliant PO documentation' },
                    { icon: <TruckIcon size={12} />, text: 'Island-wide dispatch tracking' },
                  ].map((g) => (
                    <li key={g.text} className="flex items-center gap-2.5">
                      <span className="size-6 rounded-lg bg-mint/10 text-mint flex items-center justify-center shrink-0">
                        {g.icon}
                      </span>
                      {g.text}
                    </li>
                  ))}
                </ul>
              </div>
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckoutSteps({ steps }: { steps: Array<{ label: string; sub: string }> }) {
  return (
    <ol className="vyro-surface rounded-xl px-5 py-4 grid grid-cols-3 gap-3">
      {steps.map((s, i) => {
        const active = i === 0;
        return (
          <li key={s.label} className="flex items-center gap-3 min-w-0">
            <span
              className={cn(
                'size-8 shrink-0 rounded-full flex items-center justify-center font-mono text-xs font-bold',
                active ? 'bg-ink text-volt shadow-sm' : 'border border-line text-ink-4',
              )}
            >
              {active ? <CheckIcon size={13} /> : i + 1}
            </span>
            <div className="min-w-0">
              <div className={cn('text-xs font-semibold truncate', active ? 'text-ink' : 'text-ink-3')}>{s.label}</div>
              <div className="text-[10px] text-ink-4 truncate hidden sm:block">{s.sub}</div>
            </div>
            {i < steps.length - 1 && <span className="hidden md:block h-px flex-1 min-w-4 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}

function LineNotice({
  tone,
  icon,
  children,
}: {
  tone: 'rose' | 'mint';
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
        tone === 'rose' ? 'text-rose bg-rose/5' : 'text-mint bg-mint/5',
      )}
    >
      <span className="shrink-0 mt-px">{icon ?? <AlertCircleIcon size={12} />}</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

function BulkQuoteRow({ totalCents, quantity }: { totalCents: number; quantity: number }) {
  const { data } = useRfqQualify(totalCents, quantity);
  return (
    <a
      href="/rfqs/new?fromCart=1"
      className={cn(
        'group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
        data?.qualifies ? 'border-copper/30 bg-copper/5 hover:border-copper/60' : 'border-line hover:border-ink/30',
      )}
    >
      <span className="size-9 shrink-0 rounded-lg bg-copper/10 text-copper flex items-center justify-center">
        <LayersIcon size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-ink">
          {data?.qualifies ? 'Eligible for a bulk quote' : 'Request a bulk quote'}
        </span>
        <span className="block text-[11px] text-ink-4 leading-snug">
          {data?.qualifies ? 'Negotiate below catalog price with suppliers.' : 'Get custom pricing for large quantities.'}
        </span>
      </span>
      <ChevronRightIcon size={14} className="text-ink-4 group-hover:text-ink group-hover:translate-x-0.5 transition-all" />
    </a>
  );
}
