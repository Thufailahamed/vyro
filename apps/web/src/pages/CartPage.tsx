import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { Button, EmptyState } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { useToast } from '@vyro/ui';
import {
  ShoppingCartIcon,
  Trash2Icon,
  PackageIcon,
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
} from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { CartHintsBanner } from '@/ai/CartHintsBanner';
import { BulkQuoteCta } from '@/components/BulkQuoteCta';
import { useQuery as useRQ } from '@tanstack/react-query';

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

  if (isLoading) return <div className="h-64 bg-mist animate-pulse" />;

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
        {items.length > 0 && (
          <div className="flex items-center gap-3">
            <Link to="/search">
              <Button size="sm" variant="secondary">
                Add More Lines
              </Button>
            </Link>
            <button
              type="button"
              onClick={clearAll}
              disabled={clearing}
              className="text-xs text-ink-4 hover:text-rose transition-colors px-2 py-1"
            >
              {clearing ? 'Clearing...' : 'Clear Cart'}
            </button>
          </div>
        )}
      </div>

      {/* Main Page Title & Flow Stepper */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="vyro-kicker">Wholesale Procurement</span>
          <span className="text-xs text-ink-4">•</span>
          <span className="text-xs uppercase tracking-wider text-ink-3 font-mono">
            {supplierCount} Supplier{supplierCount === 1 ? '' : 's'} • {itemCount} Line{itemCount === 1 ? '' : 's'}
          </span>
        </div>
        <h1 className="vyro-display text-4xl sm:text-5xl text-balance">Review the flow.</h1>
        <p className="text-sm text-ink-3 max-w-2xl leading-relaxed">
          Order lines are automatically segmented into individual vendor Purchase Orders. Checkout initiates cryptographic PO numbering and triggers supplier dispatch lead times.
        </p>
      </div>

      <div className="max-w-xl">
        <FlowLine
          nodes={[
            { label: `Cart (${itemCount} lines)`, state: 'active' },
            { label: `Split into ${supplierCount} PO${supplierCount === 1 ? '' : 's'}`, state: 'idle' },
            { label: 'Issue & Track', state: 'idle' },
          ]}
        />
      </div>

      {/* Empty State */}
      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCartIcon size={24} />}
          title="Your procurement cart is empty."
          description="Browse verified wholesale mills, compare quotes by price and lead time, and add commercial supply lines."
          action={
            <Link to="/search">
              <Button size="lg" icon={<ArrowRightIcon size={16} />}>
                Browse Wholesale Catalog
              </Button>
            </Link>
          }
        />
      ) : (
        /* Two Column Layout: PO Groups + Summary */
        <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
          {/* Left Column: Supplier PO Draft Cards */}
          <div className="space-y-6">
            <CartHintsBanner businessId={businessId} />
            {Array.from(grouped.entries()).map(([supplierName, { supplier, lines }], idx) => {
              const poNumber = `PO-${String(idx + 1).padStart(2, '0')}`;
              const sub = lines.reduce((a, b) => a + b.lineTotalCents, 0);
              const maxLead = Math.max(...lines.map((l) => l.offer.leadTimeDays || 1));
              const supplierDiscount = lines.reduce((a, b) => a + (b.discountCents || 0), 0);

              return (
                <Surface key={supplierName} kind="flat" className="p-0 border border-line vyro-surface overflow-hidden">
                  {/* Supplier PO Header */}
                  <div className="px-5 py-4 bg-bone border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 bg-ink text-volt">
                          Draft {poNumber}
                        </span>
                        {supplier.verificationStatus === 'verified' && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-mint border border-mint/30 bg-mint/5 px-1.5 py-0.5">
                            <ShieldCheckIcon size={11} /> Verified Mill
                          </span>
                        )}
                        <span className="text-xs text-ink-4">•</span>
                        <span className="inline-flex items-center gap-1 text-xs text-ink-3 font-medium">
                          <MapPinIcon size={12} className="text-copper" />
                          {supplier.city || 'Western Province'}, {supplier.district || 'LK'}
                        </span>
                      </div>
                      <h2 className="font-display text-xl text-ink font-semibold tracking-tight">
                        {supplierName}
                      </h2>
                    </div>

                    <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-center gap-1 text-right">
                      <div className="inline-flex items-center gap-1 text-xs text-ink-3">
                        <TruckIcon size={13} className="text-ink-4" />
                        <span>{maxLead} day dispatch lead</span>
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] text-ink-4 font-mono">PO Value:</span>
                        <span className="vyro-metric text-lg text-ink font-semibold">{formatLKR(sub)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Line Items List */}
                  <ul className="divide-y divide-line bg-paper">
                    {lines.map((it) => {
                      const draft = pendingQty[it.id] ?? String(it.quantity);
                      const isBelowMoq = it.quantity < it.offer.minOrderQty;
                      const isLineUpdating = updatingId === it.id;
                      const grossLineTotal = it.priceCents * it.quantity;

                      return (
                        <li key={it.id} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 transition-colors hover:bg-bone/30">
                          {/* Item Thumbnail & Information */}
                          <div className="flex items-start gap-4 flex-1 min-w-0">
                            <Link to={`/products/${it.product.id}`} className="shrink-0 group">
                              {it.product.imageUrl ? (
                                <img
                                  src={it.product.imageUrl}
                                  alt={it.product.name}
                                  className="w-16 h-16 object-cover border border-line group-hover:scale-105 transition-transform bg-bone"
                                />
                              ) : (
                                <div className="w-16 h-16 border border-line bg-bone flex items-center justify-center text-ink-4">
                                  <PackageIcon size={20} />
                                </div>
                              )}
                            </Link>

                            <div className="space-y-1 flex-1 min-w-0">
                              <Link
                                to={`/products/${it.product.id}`}
                                className="font-display text-base font-semibold text-ink hover:text-copper transition-colors truncate block"
                              >
                                {it.product.name}
                              </Link>

                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-4">
                                {it.product.brand && (
                                  <span className="font-medium text-ink-3">Brand: {it.product.brand}</span>
                                )}
                                <span>•</span>
                                <span className="font-mono text-ink-3">
                                  {formatLKR(it.priceCents)} / {it.product.unit || 'unit'}
                                </span>
                                <span>•</span>
                                <span>MOQ {it.offer.minOrderQty}</span>
                              </div>

                              {/* Volume Discount Badges */}
                              {it.bestTier && (
                                <div className="inline-flex items-center gap-1 px-2 py-0.5 border text-[10px] font-semibold uppercase tracking-wider text-volt bg-ink mt-1">
                                  <SparklesIcon size={10} /> −{it.bestTier.discountPct}% Volume Discount Active
                                </div>
                              )}
                              {it.nextTier && (
                                <div className="inline-flex items-center gap-1 text-[11px] text-ink-3 bg-bone border border-line px-2 py-0.5 mt-1">
                                  <span>Add {it.nextTier.minQty - it.quantity} more units for </span>
                                  <span className="font-semibold text-copper">−{it.nextTier.discountPct}% off</span>
                                </div>
                              )}

                              {/* Warning: Below MOQ Alert */}
                              {isBelowMoq && (
                                <div className="flex items-center gap-2 text-xs text-rose bg-rose/5 border border-rose/30 px-2.5 py-1 mt-1.5">
                                  <AlertCircleIcon size={13} />
                                  <span>Below supplier minimum order quantity ({it.offer.minOrderQty} units).</span>
                                  <button
                                    type="button"
                                    onClick={() => handleSetExact(it.id, it.offer.minOrderQty)}
                                    className="font-semibold underline ml-1 hover:text-ink"
                                  >
                                    Set to MOQ ({it.offer.minOrderQty})
                                  </button>
                                </div>
                              )}

                              {/* Per-line cheaper-alt hint */}
                              {lineHintsByItem.get(it.id) && (
                                <div className="flex items-center gap-2 text-xs text-mint bg-mint/5 border border-mint/30 px-2.5 py-1 mt-1.5">
                                  <SparklesIcon size={13} />
                                  <span>
                                    Cheaper at {lineHintsByItem.get(it.id)!.cheaperSupplierName} — save{' '}
                                    <span className="font-mono font-semibold">{formatLKR(lineHintsByItem.get(it.id)!.savingCents)}</span>{' '}
                                    on this line.
                                  </span>
                                  <Link
                                    to={`/search?q=${encodeURIComponent(it.product.name)}`}
                                    className="font-semibold underline ml-1 hover:text-ink"
                                  >
                                    Compare
                                  </Link>
                                </div>
                              )}

                              {/* Stock warnings (server-validated) */}
                              {it.issues?.map((issue, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 text-xs text-rose bg-rose/5 border border-rose/30 px-2.5 py-1 mt-1.5"
                                >
                                  <AlertCircleIcon size={13} />
                                  <span>{issue.message}</span>
                                  {issue.code === 'BELOW_MOQ' && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetExact(it.id, it.offer.minOrderQty)}
                                      className="font-semibold underline ml-1 hover:text-ink"
                                    >
                                      Set to MOQ ({it.offer.minOrderQty})
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Controls & Financials */}
                          <div className="flex items-center justify-between sm:justify-end gap-5 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-line">
                            {/* Industrial Stepper */}
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center border border-line bg-paper shadow-inner">
                                <button
                                  type="button"
                                  onClick={() => handleStep(it.id, it.quantity, -1, it.offer.minOrderQty)}
                                  disabled={it.quantity <= it.offer.minOrderQty || isLineUpdating}
                                  className="w-8 h-8 flex items-center justify-center text-ink hover:bg-bone disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                  title="Decrease quantity"
                                >
                                  <MinusIcon size={13} />
                                </button>
                                <input
                                  type="number"
                                  min={it.offer.minOrderQty}
                                  value={draft}
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
                                  className="w-14 h-8 text-center font-mono font-semibold text-xs border-x border-line bg-transparent focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleStep(it.id, it.quantity, 1, it.offer.minOrderQty)}
                                  disabled={isLineUpdating}
                                  className="w-8 h-8 flex items-center justify-center text-ink hover:bg-bone transition-colors"
                                  title="Increase quantity"
                                >
                                  <PlusIcon size={13} />
                                </button>
                              </div>

                              {/* Presets */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSetExact(it.id, it.offer.minOrderQty)}
                                  className="text-[10px] text-ink-4 hover:text-ink font-mono px-1 border border-line bg-bone"
                                >
                                  MOQ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStep(it.id, it.quantity, 10, it.offer.minOrderQty)}
                                  className="text-[10px] text-ink-4 hover:text-ink font-mono px-1 border border-line bg-bone"
                                >
                                  +10
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStep(it.id, it.quantity, 25, it.offer.minOrderQty)}
                                  className="text-[10px] text-ink-4 hover:text-ink font-mono px-1 border border-line bg-bone"
                                >
                                  +25
                                </button>
                              </div>
                            </div>

                            {/* Line Total */}
                            <div className="text-right min-w-[100px]">
                              {it.discountCents > 0 ? (
                                <div>
                                  <div className="vyro-metric text-base text-ink font-semibold">
                                    {formatLKR(it.lineTotalCents)}
                                  </div>
                                  <div className="text-[11px] text-mint font-medium">
                                    You save {formatLKR(it.discountCents)}
                                    {it.bestTier ? ` (${it.bestTier.discountPct}%)` : ''}
                                  </div>
                                  <div className="text-[11px] text-ink-4 line-through">
                                    {formatLKR(grossLineTotal)}
                                  </div>
                                </div>
                              ) : (
                                <div className="vyro-metric text-base text-ink font-semibold">
                                  {formatLKR(it.lineTotalCents)}
                                </div>
                              )}
                              <div className="text-[10px] text-ink-4 font-mono">
                                {it.quantity} {it.product.unit || 'units'}
                              </div>
                            </div>

                            {/* Remove Line Item */}
                            <button
                              type="button"
                              onClick={() => remove(it.id)}
                              disabled={deletingId === it.id}
                              className="text-ink-4 hover:text-rose p-2 transition-colors disabled:opacity-40"
                              title="Remove item"
                            >
                              <Trash2Icon size={15} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Supplier Footer Notice */}
                  {supplierDiscount > 0 && (
                    <div className="px-5 py-2.5 bg-mint/5 border-t border-mint/20 flex items-center justify-between text-xs text-mint">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <CheckCircleIcon size={13} /> Direct wholesale volume discount applied
                      </span>
                      <span className="font-mono font-semibold">−{formatLKR(supplierDiscount)}</span>
                    </div>
                  )}
                </Surface>
              );
            })}
          </div>

          {/* Right Column: Order Totals & Checkout Summary */}
          <div className="space-y-4 lg:sticky lg:top-8">
            <Surface kind="floating" className="p-6 border border-line space-y-5 bg-paper">
              <div>
                <div className="vyro-kicker">Order Summary</div>
                <h2 className="font-display text-2xl text-ink font-semibold tracking-tight mt-1">
                  Procurement Totals
                </h2>
              </div>

              {/* Multi-Supplier Splitting Notice */}
              <div className="p-3 bg-bone border border-line text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-ink">
                  <FileTextIcon size={13} className="text-copper" />
                  <span>Automated PO Splitting</span>
                </div>
                <p className="text-ink-4 leading-normal text-[11px]">
                  Checkout splits this cart into <strong className="text-ink">{supplierCount} binding Purchase Order{supplierCount === 1 ? '' : 's'}</strong> with direct vendor dispatch.
                </p>
              </div>

              {/* Order Scope Metrics */}
              <div className="grid grid-cols-3 gap-2 py-3 border-y border-line text-center">
                <div className="border-r border-line last:border-0 pr-1">
                  <div className="text-[10px] uppercase tracking-wider text-ink-4 font-mono">Vendors</div>
                  <div className="font-mono text-xl font-bold text-ink mt-0.5">{supplierCount}</div>
                </div>
                <div className="border-r border-line last:border-0 px-1">
                  <div className="text-[10px] uppercase tracking-wider text-ink-4 font-mono">Lines</div>
                  <div className="font-mono text-xl font-bold text-ink mt-0.5">{itemCount}</div>
                </div>
                <div className="pl-1">
                  <div className="text-[10px] uppercase tracking-wider text-ink-4 font-mono">Units</div>
                  <div className="font-mono text-xl font-bold text-ink mt-0.5">{totalUnits}</div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="space-y-2.5 text-xs text-ink-3">
                <div className="flex items-center justify-between">
                  <span>Gross Subtotal</span>
                  <span className="font-mono text-sm text-ink">{formatLKR(subtotal)}</span>
                </div>

                {discountTotal > 0 && (
                  <div className="flex items-center justify-between text-mint font-medium">
                    <span className="inline-flex items-center gap-1">
                      <SparklesIcon size={11} /> Volume Discounts
                    </span>
                    <span className="font-mono text-sm font-semibold">−{formatLKR(discountTotal)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1">
                    <TruckIcon size={12} className="text-ink-4" /> Island-Wide Delivery
                  </span>
                  <span className="font-mono text-[11px] text-ink-4">Included / Mill Dock</span>
                </div>

                <div className="pt-3 border-t border-line flex items-baseline justify-between">
                  <div>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-ink font-semibold block">Total PO Commitment</span>
                    <span className="text-[10px] text-ink-4">LKR wholesale rates lock</span>
                  </div>
                  <div className="text-right">
                    <MetricNumber size="md" className="text-ink font-bold">
                      {formatLKR(total)}
                    </MetricNumber>
                  </div>
                </div>
              </div>

              {/* Error / Warning if below MOQ */}
              {belowMoq.length > 0 && (
                <div className="p-3 bg-rose/5 border border-rose/30 text-xs text-rose space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <AlertCircleIcon size={13} /> Minimum Order Constraint
                  </div>
                  <p className="text-[11px] leading-normal">
                    {belowMoq.length} line item{belowMoq.length === 1 ? '' : 's'} does not meet the supplier minimum order threshold. Please adjust before issuing POs.
                  </p>
                </div>
              )}

              {/* Checkout CTA */}
              <div className="pt-2">
                <Button
                  size="lg"
                  className="w-full justify-center"
                  disabled={belowMoq.length > 0 || items.some((it) => (it.issues?.length ?? 0) > 0)}
                  onClick={() => navigate('/checkout')}
                  icon={<ArrowRightIcon size={16} />}
                >
                  Generate {supplierCount} PO{supplierCount === 1 ? '' : 's'} & Checkout
                </Button>
                <div className="mt-3">
                  <BulkQuoteCta totalCents={total} quantity={totalUnits} />
                </div>
              </div>

              {/* Procurement Guarantees */}
              <div className="pt-3 border-t border-line space-y-2 text-[11px] text-ink-4">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon size={13} className="text-mint shrink-0" />
                  <span>Direct Mill Gate Price-Lock Guarantee</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileTextIcon size={13} className="text-copper shrink-0" />
                  <span>Automated Tax-Compliant PO Documentation</span>
                </div>
                <div className="flex items-center gap-2">
                  <TruckIcon size={13} className="text-ink-3 shrink-0" />
                  <span>Consolidated Island-Wide Dispatch Tracking</span>
                </div>
              </div>
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}
