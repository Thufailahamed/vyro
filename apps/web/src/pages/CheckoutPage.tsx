import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePageTitle } from '@/lib/usePageTitle';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Label, Badge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  ArrowLeftIcon,
  TruckIcon,
  PackageIcon,
  ShieldCheckIcon,
  Building2Icon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  FileTextIcon,
  AlertCircleIcon,
} from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { Surface, ProductImage } from '@/components/brand/Surface';
import { formatLKR } from '@/lib/format';

interface CartItem {
  id: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
  discountCents: number;
  bestTier: { minQty: number; discountPct: number } | null;
  nextTier: { minQty: number; discountPct: number } | null;
  product: {
    id?: string;
    name: string;
    brand?: string | null;
    unit?: string | null;
    packSize?: string | null;
    imageUrl?: string | null;
  };
  supplier: { id: string; name: string };
  offer?: {
    id: string;
    minOrderQty: number;
    leadTimeDays: number;
  };
}

const QUICK_INSTRUCTION_TAGS = [
  'Forklift required at receiving dock',
  'Call 30 mins prior to delivery',
  'Morning delivery window (8 AM – 12 PM)',
  'Commercial gate pass required',
  'Lift-gate truck required',
];

export function CheckoutPage() {
  usePageTitle('Procurement Checkout');
  const { user } = useAuth();
  const memberships = user?.memberships ?? [];
  const [businessId, setBusinessId] = useState<string | undefined>(memberships[0]?.businessId);
  const activeBusinessId = businessId ?? memberships[0]?.businessId;
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const cart = useQuery({
    queryKey: ['cart', activeBusinessId],
    queryFn: () =>
      api.get<{
        cart: { id: string };
        items: CartItem[];
        subtotalCents: number;
        discountTotalCents: number;
        totalCents: number;
        supplierCount: number;
      }>(`/cart?businessId=${activeBusinessId}`),
    enabled: !!activeBusinessId,
  });

  // Group items by supplier for multi-PO preview
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        items: CartItem[];
        subtotalCents: number;
        discountCents: number;
        totalCents: number;
        leadTimeDays: number;
      }
    >();

    for (const it of cart.data?.items ?? []) {
      const supName = it.supplier.name || 'Supplier Depot';
      const supId = it.supplier.id;
      const entry = map.get(supName) ?? {
        supplierId: supId,
        supplierName: supName,
        items: [],
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
        leadTimeDays: 1,
      };

      entry.items.push(it);
      entry.subtotalCents += it.priceCents * it.quantity;
      entry.discountCents += it.discountCents;
      entry.totalCents += it.lineTotalCents;
      if (it.offer?.leadTimeDays && it.offer.leadTimeDays > entry.leadTimeDays) {
        entry.leadTimeDays = it.offer.leadTimeDays;
      }
      map.set(supName, entry);
    }
    return Array.from(map.values());
  }, [cart.data?.items]);

  const activeMembership = memberships.find((m) => m.businessId === activeBusinessId);

  if (!activeBusinessId) {
    return (
      <div className="py-16 max-w-lg mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-paper-subtle flex items-center justify-center mx-auto text-ink-3">
          <Building2Icon className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-ink-1">No business profile found</h2>
        <p className="text-xs text-ink-3">
          You need an active business profile to issue wholesale purchase orders.
        </p>
        <Link to="/onboarding/business" className="inline-block pt-2">
          <Button variant="primary">Set Up Business Profile</Button>
        </Link>
      </div>
    );
  }

  if (cart.isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 py-8 animate-pulse">
        <div className="h-6 w-48 bg-paper-subtle rounded" />
        <div className="h-12 w-96 bg-paper-subtle rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div className="h-64 bg-paper-subtle rounded-2xl" />
            <div className="h-48 bg-paper-subtle rounded-2xl" />
          </div>
          <div className="lg:col-span-4 h-96 bg-paper-subtle rounded-2xl" />
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await api.post<{ poIds: string[]; count: number }>('/purchase-orders/checkout', {
        businessId: activeBusinessId,
        notes: notes.trim() || undefined,
      });
      if (res.poIds && res.poIds.length === 1) {
        navigate(`/orders/${res.poIds[0]}`);
      } else {
        navigate('/orders');
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to place purchase orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const subtotalCents = cart.data?.subtotalCents ?? 0;
  const discountTotalCents = cart.data?.discountTotalCents ?? 0;
  const totalCents = cart.data?.totalCents ?? subtotalCents;
  const supplierCount = cart.data?.supplierCount ?? grouped.length;
  const lineCount = cart.data?.items?.length ?? 0;
  const empty = !cart.data?.items?.length;

  const appendInstructionTag = (tag: string) => {
    if (notes.includes(tag)) return;
    setNotes((prev) => (prev ? `${prev.trim()}\n• ${tag}` : `• ${tag}`));
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-24">
      {/* Top Stepper & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-paper-subtle pb-4">
        <Link
          to="/cart"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink-1 transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" /> Back to Cart
        </Link>

        {/* Stepper */}
        <div className="w-full sm:w-80">
          <FlowLine
            nodes={[
              { label: 'Cart Review', state: 'done' },
              { label: 'PO Checkout', state: 'active' },
              { label: 'Settlement', state: 'idle' },
            ]}
          />
        </div>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono font-bold tracking-widest text-emerald-800 uppercase px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 inline-block mb-2">
            Enterprise Procurement Checkout
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink-1 tracking-tight">
            Review & Issue Purchase Orders
          </h1>
          <p className="text-xs sm:text-sm text-ink-3 mt-1 max-w-2xl">
            Orders are automatically split into official supplier POs. Funds are protected in commercial escrow until delivery sign-off.
          </p>
        </div>

        {/* Ordering Entity Badge */}
        {memberships.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-paper-subtle bg-paper shadow-xs self-start md:self-auto">
            <div className="w-8 h-8 rounded-lg bg-ink-1 text-paper flex items-center justify-center">
              <Building2Icon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink-1">
                  {(activeMembership as any)?.businessName || 'Business Profile'}
                </span>
                <Badge variant="neutral" className="text-[10px] uppercase font-mono">
                  {activeMembership?.role || 'Member'}
                </Badge>
              </div>
              {memberships.length > 1 ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-ink-4">Switch:</span>
                  <select
                    className="text-[11px] font-semibold text-emerald-700 bg-transparent border-none outline-none cursor-pointer p-0"
                    value={activeBusinessId}
                    onChange={(e) => setBusinessId(e.target.value)}
                  >
                    {memberships.map((m) => (
                      <option key={m.businessId} value={m.businessId}>
                        {(m as any).businessName || m.businessId}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-[10px] text-ink-4 font-mono">Authorized Enterprise Account</p>
              )}
            </div>
          </div>
        )}
      </div>

      {err && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-3">
          <AlertCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Unable to issue purchase orders</p>
            <p className="text-xs mt-0.5 text-danger/90">{err}</p>
          </div>
          <button
            type="button"
            onClick={() => setErr('')}
            className="text-danger/60 hover:text-danger text-xs font-bold uppercase"
          >
            Dismiss
          </button>
        </div>
      )}

      {empty ? (
        <Surface className="p-16 text-center rounded-2xl border border-paper-subtle bg-paper space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-paper-subtle flex items-center justify-center mx-auto text-ink-4">
            <PackageIcon className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-ink-1">Your procurement cart is empty</h3>
          <p className="text-xs text-ink-3 max-w-sm mx-auto">
            Add wholesale commodities and commercial products from verified suppliers before proceeding to checkout.
          </p>
          <Link to="/marketplace" className="inline-block pt-2">
            <Button variant="primary">Browse Marketplace Catalog</Button>
          </Link>
        </Surface>
      ) : (
        /* 2-Column Responsive Checkout Architecture */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (8 Cols): Order Breakdown, Delivery, Settlement */}
          <div className="lg:col-span-8 space-y-6">
            {/* Purchase Order Split Banner */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-emerald-950">
              <div className="flex items-center gap-3">
                <FileTextIcon className="w-5 h-5 text-emerald-700 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold">
                    Multi-Supplier PO Generation ({grouped.length} {grouped.length === 1 ? 'Purchase Order' : 'Purchase Orders'})
                  </p>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Each supplier receives a separate electronic PO with dedicated tracking, invoice, and dispatch workflow.
                  </p>
                </div>
              </div>
              <Badge variant="neutral" className="font-mono text-xs font-bold bg-white text-emerald-900 border-emerald-300">
                {lineCount} {lineCount === 1 ? 'Line Item' : 'Line Items'}
              </Badge>
            </div>

            {/* SECTION 1: Supplier PO Draft Cards */}
            <div className="space-y-4">
              {grouped.map((group, idx) => (
                <Surface
                  key={group.supplierName}
                  className="rounded-2xl border border-paper-subtle bg-paper overflow-hidden shadow-xs"
                >
                  {/* Supplier Draft Header */}
                  <div className="p-4 bg-paper-subtle/40 border-b border-paper-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-ink-1 text-paper font-bold text-xs flex items-center justify-center">
                        {group.supplierName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-ink-1">{group.supplierName}</h3>
                          <Badge variant="neutral" className="text-[10px] font-mono">
                            Draft PO #{idx + 1}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-ink-4">
                          Verified Depot Partner • {group.items.length} {group.items.length === 1 ? 'Item' : 'Items'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-ink-4 block">PO Subtotal</span>
                        <span className="font-mono font-bold text-sm text-ink-1">
                          {formatLKR(group.totalCents)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* PO Line Items */}
                  <div className="divide-y divide-paper-subtle">
                    {group.items.map((item) => (
                      <div key={item.id} className="p-4 flex items-start gap-4 hover:bg-paper-subtle/20 transition-colors">
                        {/* Product Photo */}
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-paper-subtle border border-paper-subtle flex-shrink-0 relative">
                          <ProductImage
                            src={item.product.imageUrl}
                            alt={item.product.name}
                            seed={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        {/* Product Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                            <h4 className="text-xs font-bold text-ink-1 leading-snug">
                              {item.product.name}
                            </h4>
                            <span className="font-mono font-bold text-xs text-ink-1 shrink-0">
                              {formatLKR(item.lineTotalCents)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-3 mt-1">
                            {item.product.brand && (
                              <span className="px-1.5 py-0.2 rounded bg-paper-subtle text-ink-3 font-medium text-[10px]">
                                {item.product.brand}
                              </span>
                            )}
                            <span>
                              Qty: <strong>{item.quantity}</strong> {item.product.unit || 'units'}
                            </span>
                            <span>•</span>
                            <span className="font-mono">
                              {formatLKR(item.priceCents)} / {item.product.unit || 'unit'}
                            </span>
                          </div>

                          {/* Volume discount notice */}
                          {item.discountCents > 0 && item.bestTier && (
                            <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                              <span className="font-bold">✓ {item.bestTier.discountPct}% Volume Tier Applied</span>
                              <span>(Saved {formatLKR(item.discountCents)})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Supplier Dispatch Footer */}
                  <div className="p-3 bg-paper-subtle/20 border-t border-paper-subtle flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
                    <span className="flex items-center gap-1.5">
                      <TruckIcon className="w-3.5 h-3.5 text-emerald-700" />
                      Depot Dock Pickup & Freight Dispatch
                    </span>
                    <span className="flex items-center gap-1.5 font-mono">
                      <ClockIcon className="w-3.5 h-3.5 text-ink-4" />
                      Est. Dispatch: {group.leadTimeDays} {group.leadTimeDays === 1 ? 'Business Day' : 'Business Days'}
                    </span>
                  </div>
                </Surface>
              ))}
            </div>

            {/* SECTION 2: Receiving Facility & Delivery Instructions */}
            <Surface className="p-6 rounded-2xl border border-paper-subtle bg-paper space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink-1">Delivery & Receiving Facility Notes</h3>
                  <p className="text-xs text-ink-3">
                    Instructions appended to every purchase order issued to suppliers
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                {/* Quick Instruction Chips */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-ink-4 block">Quick Instruction Presets:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_INSTRUCTION_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => appendInstructionTag(tag)}
                        className="px-2.5 py-1 text-[11px] rounded-lg border border-paper-subtle bg-paper-subtle/40 hover:bg-paper-subtle text-ink-2 transition-all hover:border-ink-4"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Textarea */}
                <div>
                  <Label htmlFor="checkout-notes" className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                    Special Dock & Unloading Instructions
                  </Label>
                  <textarea
                    id="checkout-notes"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter dock hours, receiving contact number, gate instructions, warehouse bay numbers, forklift requirements..."
                    className="w-full mt-1 p-3 text-xs rounded-xl bg-paper-subtle/30 border border-paper-subtle focus:border-emerald-600 focus:bg-paper outline-none transition-all resize-y"
                  />
                  <p className="text-[11px] text-ink-4 mt-1">
                    Suppliers and transport drivers will view these instructions upon PO acceptance.
                  </p>
                </div>
              </div>
            </Surface>

            {/* SECTION 3: Payment & Commercial Escrow Guarantee */}
            <Surface className="p-6 rounded-2xl border border-paper-subtle bg-paper space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
                  3
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink-1">Commercial Escrow & Payment Settlement</h3>
                  <p className="text-xs text-ink-3">
                    Protected by Vyro Institutional Escrow and Central Bank licensed gateways
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {/* Step 1 */}
                <div className="p-3.5 rounded-xl border border-paper-subtle bg-paper-subtle/30 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold mb-1">
                    1
                  </div>
                  <p className="text-xs font-bold text-ink-1">PO Issuance</p>
                  <p className="text-[11px] text-ink-3">
                    Suppliers receive verified electronic purchase orders and lock warehouse stock.
                  </p>
                </div>

                {/* Step 2 */}
                <div className="p-3.5 rounded-xl border border-paper-subtle bg-paper-subtle/30 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold mb-1">
                    2
                  </div>
                  <p className="text-xs font-bold text-ink-1">Flexible Settlement</p>
                  <p className="text-[11px] text-ink-3">
                    Pay online via PayHere (Cards / FriMi / Genie) or upload Bank Transfer Wire slips.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="p-3.5 rounded-xl border border-paper-subtle bg-paper-subtle/30 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold mb-1">
                    3
                  </div>
                  <p className="text-xs font-bold text-ink-1">Escrow Release</p>
                  <p className="text-[11px] text-ink-3">
                    Funds remain securely in escrow until goods are received and inspected at your facility.
                  </p>
                </div>
              </div>

              {/* Supported Gateways */}
              <div className="p-3 rounded-xl bg-paper-subtle/40 border border-paper-subtle flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
                <span className="flex items-center gap-2 font-medium">
                  <CreditCardIcon className="w-4 h-4 text-emerald-700" />
                  Supported Gateways: PayHere Online (Visa, MasterCard, Amex), Corporate Bank Wire Transfer
                </span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-800 font-semibold">
                  <ShieldCheckIcon className="w-3.5 h-3.5" /> 256-bit TLS Encrypted
                </span>
              </div>
            </Surface>
          </div>

          {/* Right Column (4 Cols Sticky): Financial Summary & Final PO Confirmation */}
          <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
            <Surface className="p-6 rounded-2xl border border-paper-subtle bg-paper space-y-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-paper-subtle">
                <h3 className="text-sm font-bold text-ink-1">Procurement Summary</h3>
                <Badge variant="neutral" className="font-mono text-xs">
                  {supplierCount} {supplierCount === 1 ? 'Supplier PO' : 'Supplier POs'}
                </Badge>
              </div>

              {/* Breakdown Rows */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-baseline justify-between text-ink-3">
                  <span>Gross Catalog Subtotal</span>
                  <span className="font-mono font-medium text-ink-2">{formatLKR(subtotalCents)}</span>
                </div>

                {discountTotalCents > 0 && (
                  <div className="flex items-baseline justify-between text-emerald-700 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20">
                    <span className="font-semibold">Volume Bulk Savings</span>
                    <span className="font-mono font-bold">−{formatLKR(discountTotalCents)}</span>
                  </div>
                )}

                <div className="flex items-baseline justify-between text-ink-3">
                  <span>Vyro Escrow & Processing</span>
                  <span className="font-mono text-emerald-700 font-semibold">Free (Included)</span>
                </div>

                <div className="flex items-baseline justify-between text-ink-3">
                  <span>Freight & Logistics</span>
                  <span className="text-[11px] text-ink-4">Per depot dispatch</span>
                </div>

                {/* Total Line */}
                <div className="pt-3 border-t border-paper-subtle flex items-baseline justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-ink-1 block">
                      Total PO Value
                    </span>
                    <span className="text-[10px] text-ink-4">Net payable across all POs</span>
                  </div>
                  <span className="font-mono text-xl sm:text-2xl font-bold text-ink-1">
                    {formatLKR(totalCents)}
                  </span>
                </div>
              </div>

              {/* Confirm Button */}
              <div className="pt-2 space-y-2.5">
                <Button
                  type="button"
                  onClick={submit}
                  loading={loading}
                  size="lg"
                  className="w-full py-3.5 text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2"
                >
                  {loading ? 'Issuing Purchase Orders...' : 'Confirm & Issue Purchase Orders'}
                </Button>

                <p className="text-[10px] text-center text-ink-4 leading-relaxed px-2">
                  By confirming, you authorize Vyro to transmit official electronic purchase orders to each supplier under standard commercial terms.
                </p>
              </div>

              {/* Trust Indicators */}
              <div className="pt-4 border-t border-paper-subtle space-y-2 text-[11px] text-ink-3">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                  <span>Central Bank compliant escrow settlement</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileTextIcon className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                  <span>Automated VAT & SVAT tax invoicing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                  <span>Dispute resolution & refund protection</span>
                </div>
              </div>
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}
