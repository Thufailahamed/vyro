import { useEffect, useState, useMemo, type FormEvent } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Input, Label, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { PackageIcon, ArrowLeftIcon, CheckCircleIcon, TruckIcon, PercentIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';

type Product = {
  id: string;
  name: string;
  description: string | null;
  brand?: string | null;
  unit?: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
  categoryId?: string | null;
};

type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
  deliveryAvailable: boolean;
  deliveryRadiusKm: number | null;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  active: boolean;
  tier1MinQty?: number;
  tier1DiscountPct?: number;
  tier2MinQty?: number;
  tier2DiscountPct?: number;
  tier3MinQty?: number;
  tier3DiscountPct?: number;
};

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs font-medium text-ink">{label}</Label>
        {hint && <span className="text-[11px] text-ink-4">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function SupplierProductFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { supplierId } = useSupplierId();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = mode === 'edit';

  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    enabled: isEdit,
  });
  const catalog = useQuery({
    queryKey: ['products', 'catalog'],
    queryFn: () => api.get<{ products: Product[] }>('/products?limit=500'),
  });

  const existing = isEdit ? offers.data?.offers.find((o) => o.id === id) ?? null : null;

  const [productId, setProductId] = useState(() => searchParams.get('productId') || '');
  const [supplierSku, setSupplierSku] = useState('');
  const [priceLkr, setPriceLkr] = useState('0');
  const [minQty, setMinQty] = useState('1');
  const [lead, setLead] = useState('1');
  const [avail, setAvail] = useState<'in_stock' | 'low' | 'out_of_stock'>('in_stock');
  const [deliveryAvailable, setDeliveryAvailable] = useState(true);
  const [radius, setRadius] = useState('');
  const [active, setActive] = useState(true);

  // Volume tiers
  const [tier1MinQty, setTier1MinQty] = useState('10');
  const [tier1DiscountPct, setTier1DiscountPct] = useState('0');
  const [tier2MinQty, setTier2MinQty] = useState('50');
  const [tier2DiscountPct, setTier2DiscountPct] = useState('0');
  const [tier3MinQty, setTier3MinQty] = useState('100');
  const [tier3DiscountPct, setTier3DiscountPct] = useState('0');

  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) {
      const pId = searchParams.get('productId');
      if (pId && !productId) {
        setProductId(pId);
      }
      return;
    }
    if (!existing) return;
    setProductId(existing.productId);
    setSupplierSku(existing.supplierSku ?? '');
    setPriceLkr((existing.priceCents / 100).toFixed(2));
    setMinQty(String(existing.minOrderQty));
    setLead(String(existing.leadTimeDays));
    setAvail(existing.availabilityStatus);
    setDeliveryAvailable(existing.deliveryAvailable);
    setRadius(existing.deliveryRadiusKm == null ? '' : String(existing.deliveryRadiusKm));
    setActive(existing.active);

    if (existing.tier1MinQty != null) setTier1MinQty(String(existing.tier1MinQty));
    if (existing.tier1DiscountPct != null) setTier1DiscountPct(String(existing.tier1DiscountPct));
    if (existing.tier2MinQty != null) setTier2MinQty(String(existing.tier2MinQty));
    if (existing.tier2DiscountPct != null) setTier2DiscountPct(String(existing.tier2DiscountPct));
    if (existing.tier3MinQty != null) setTier3MinQty(String(existing.tier3MinQty));
    if (existing.tier3DiscountPct != null) setTier3DiscountPct(String(existing.tier3DiscountPct));
  }, [existing]);

  const priceCents = () => Math.round(Number(priceLkr) * 100);

  const selectedProduct = useMemo(
    () => catalog.data?.products.find((p) => p.id === productId),
    [catalog.data, productId],
  );

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/supplier-products', {
        supplierId,
        productId,
        supplierSku: supplierSku || undefined,
        priceCents: priceCents(),
        minOrderQty: Number(minQty) || 1,
        leadTimeDays: Number(lead) || 1,
        availabilityStatus: avail,
        deliveryAvailable,
        deliveryRadiusKm: radius === '' ? null : Number(radius),
        tier1MinQty: Number(tier1MinQty) || undefined,
        tier1DiscountPct: Number(tier1DiscountPct) || 0,
        tier2MinQty: Number(tier2MinQty) || undefined,
        tier2DiscountPct: Number(tier2DiscountPct) || 0,
        tier3MinQty: Number(tier3MinQty) || undefined,
        tier3DiscountPct: Number(tier3DiscountPct) || 0,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      navigate('/supplier/products');
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed to publish listing'),
  });

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/supplier-products/${id}`, {
        supplierSku: supplierSku || null,
        priceCents: priceCents(),
        minOrderQty: Number(minQty) || 1,
        leadTimeDays: Number(lead) || 1,
        availabilityStatus: avail,
        deliveryAvailable,
        deliveryRadiusKm: radius === '' ? null : Number(radius),
        active,
        tier1MinQty: Number(tier1MinQty) || undefined,
        tier1DiscountPct: Number(tier1DiscountPct) || 0,
        tier2MinQty: Number(tier2MinQty) || undefined,
        tier2DiscountPct: Number(tier2DiscountPct) || 0,
        tier3MinQty: Number(tier3MinQty) || undefined,
        tier3DiscountPct: Number(tier3DiscountPct) || 0,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      navigate('/supplier/products');
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed to update listing'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!productId && !isEdit) {
      setErr('Please select a catalog product');
      return;
    }
    const cents = priceCents();
    if (!Number.isFinite(cents) || cents <= 0) {
      setErr('Enter a valid wholesale unit price in LKR');
      return;
    }
    if (isEdit) update.mutate();
    else create.mutate();
  };

  const pending = create.isPending || update.isPending;

  if (isEdit && offers.isLoading) return <SupplierLoadingState label="Loading product offer" />;
  if (isEdit && offers.isError) {
    return (
      <SupplierErrorState message="Could not load offer." onRetry={() => void offers.refetch()} />
    );
  }
  if (isEdit && !offers.isLoading && !existing) {
    return (
      <SupplierErrorState
        message="Listing not found."
        onRetry={() => navigate('/supplier/products')}
      />
    );
  }

  const moqValCents = priceCents() * (Number(minQty) || 1);

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="flex items-center justify-between gap-4">
        <PageHeader
          kicker={isEdit ? 'Catalog Management' : 'New Listing'}
          title={isEdit ? `Edit ${selectedProduct?.name ?? 'Product'}` : 'Publish Wholesale Offer'}
          sub="Set base mill-gate pricing, quantity thresholds, and warehouse dispatch parameters."
        />
        <Link to="/supplier/products">
          <Button variant="ghost" size="sm" className="gap-1 text-ink-3 hover:text-ink">
            <ArrowLeftIcon size={14} /> Back to Catalog
          </Button>
        </Link>
      </header>

      <form onSubmit={submit} className="space-y-6">
        {/* Step 1: Product Selection & Identity */}
        <Surface kind="elevated" className="p-6 space-y-5 border border-ink/10">
          <div className="border-b border-line pb-3 flex items-center justify-between">
            <div>
              <h2 className="vyro-display text-base font-semibold text-ink">1. Catalog Item</h2>
              <p className="text-xs text-ink-4">Select the standard SKU from the global commodity directory.</p>
            </div>
            {selectedProduct && (
              <Badge variant="neutral" className="uppercase font-mono text-[10px]">
                {selectedProduct.unit ?? 'Unit'}
              </Badge>
            )}
          </div>

          {!isEdit ? (
            <FormField label="Standard Product" hint="Must match standardized master catalog">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
                className="flex h-11 w-full border border-line bg-paper text-ink px-3 text-sm focus:border-ink focus:ring-1 focus:ring-ink"
              >
                <option value="">Select a catalog commodity / product…</option>
                {(catalog.data?.products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.brand ? `(${p.brand})` : ''} {p.packSize ? `· ${p.packSize}` : ''}
                  </option>
                ))}
              </select>
            </FormField>
          ) : (
            <div className="flex items-center gap-4 p-3 bg-bone border border-line rounded">
              {selectedProduct?.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="size-12 object-cover rounded border border-ink/10"
                />
              ) : (
                <div className="size-12 rounded bg-mist flex items-center justify-center text-ink-4">
                  <PackageIcon size={20} />
                </div>
              )}
              <div className="flex-1">
                <div className="font-semibold text-ink">{selectedProduct?.name ?? '—'}</div>
                <div className="text-xs text-ink-4">
                  {selectedProduct?.brand && <span>{selectedProduct.brand} · </span>}
                  {selectedProduct?.packSize && <span>{selectedProduct.packSize} · </span>}
                  <span className="font-mono">{selectedProduct?.unit}</span>
                </div>
              </div>
            </div>
          )}

          {selectedProduct && !isEdit && (
            <div className="flex items-start gap-4 p-4 bg-mist/30 border border-line rounded">
              {selectedProduct.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="size-14 object-cover rounded border border-ink/10 shrink-0"
                />
              ) : (
                <div className="size-14 rounded bg-mist flex items-center justify-center text-ink-4 shrink-0">
                  <PackageIcon size={24} />
                </div>
              )}
              <div className="text-xs space-y-1">
                <div className="font-bold text-ink text-sm">{selectedProduct.name}</div>
                {selectedProduct.description && (
                  <p className="text-ink-3 line-clamp-2">{selectedProduct.description}</p>
                )}
                <div className="flex items-center gap-3 text-ink-4 pt-1">
                  <span>Unit: <strong className="text-ink font-mono">{selectedProduct.unit ?? 'N/A'}</strong></span>
                  {selectedProduct.packSize && (
                    <span>Pack: <strong className="text-ink">{selectedProduct.packSize}</strong></span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4 pt-1">
            <FormField label="Internal Supplier SKU (Optional)" hint="Your warehouse code">
              <Input
                value={supplierSku}
                onChange={(e) => setSupplierSku(e.target.value)}
                placeholder="e.g. WH-RICE-50KG-A"
                className="font-mono text-xs"
              />
            </FormField>
            <FormField label="Stock Availability Status">
              <select
                value={avail}
                onChange={(e) => setAvail(e.target.value as typeof avail)}
                className="flex h-10 w-full border border-line bg-paper text-ink px-3 text-sm"
              >
                <option value="in_stock">In stock (Ready for orders)</option>
                <option value="low">Low stock (Limited reserves)</option>
                <option value="out_of_stock">Out of stock (Delisted)</option>
              </select>
            </FormField>
          </div>
        </Surface>

        {/* Step 2: Pricing & Quantity */}
        <Surface kind="elevated" className="p-6 space-y-5 border border-ink/10">
          <div className="border-b border-line pb-3">
            <h2 className="vyro-display text-base font-semibold text-ink">2. Commercial Rates & MOQ</h2>
            <p className="text-xs text-ink-4">Base price per unit at mill-gate and minimum order quantity.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <FormField label="Base Rate per Unit (LKR)" hint="Net before tier discounts">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-ink-4">Rs.</span>
                <Input
                  value={priceLkr}
                  onChange={(e) => setPriceLkr(e.target.value)}
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-9 font-mono font-semibold"
                />
              </div>
            </FormField>

            <FormField label="Minimum Order Quantity (MOQ)" hint={`In ${selectedProduct?.unit ?? 'units'}`}>
              <Input
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                required
                type="number"
                min="1"
                className="font-mono"
              />
            </FormField>

            <FormField label="Lead Time (Days)" hint="Prep turnaround">
              <Input
                value={lead}
                onChange={(e) => setLead(e.target.value)}
                required
                type="number"
                min="0"
                className="font-mono"
              />
            </FormField>
          </div>

          {/* Real-time Order Summary Preview */}
          <div className="p-4 bg-ink text-paper rounded flex items-center justify-between">
            <div className="text-xs space-y-0.5">
              <div className="text-volt font-mono uppercase tracking-wider text-[10px]">Min. Order Baseline</div>
              <div className="text-paper/70">
                {minQty} × {selectedProduct?.unit ?? 'unit'} @ {formatLKR(priceCents())}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-paper/50">Minimum PO Total</div>
              <div className="text-base font-mono font-bold text-volt">
                {formatLKR(Number.isFinite(moqValCents) ? moqValCents : 0)}
              </div>
            </div>
          </div>
        </Surface>

        {/* Step 3: Volume Discounts */}
        <Surface kind="elevated" className="p-6 space-y-4 border border-ink/10">
          <div className="border-b border-line pb-3 flex items-center justify-between">
            <div>
              <h2 className="vyro-display text-base font-semibold text-ink flex items-center gap-1.5">
                <PercentIcon size={16} className="text-copper" />
                3. Volume Discount Brackets
              </h2>
              <p className="text-xs text-ink-4">Automatic unit price reductions when order size exceeds brackets.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { label: 'Tier 1', qty: tier1MinQty, setQty: setTier1MinQty, pct: tier1DiscountPct, setPct: setTier1DiscountPct },
              { label: 'Tier 2', qty: tier2MinQty, setQty: setTier2MinQty, pct: tier2DiscountPct, setPct: setTier2DiscountPct },
              { label: 'Tier 3', qty: tier3MinQty, setQty: setTier3MinQty, pct: tier3DiscountPct, setPct: setTier3DiscountPct },
            ].map((t) => {
              const discPrice = priceCents() * (1 - (Number(t.pct) || 0) / 100);
              return (
                <div key={t.label} className="p-3.5 border border-ink/15 bg-bone rounded space-y-2">
                  <div className="font-mono text-xs uppercase tracking-wider font-bold text-ink">{t.label}</div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-ink-4 uppercase">Min Quantity</label>
                    <Input
                      value={t.qty}
                      onChange={(e) => t.setQty(e.target.value)}
                      type="number"
                      min="1"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-ink-4 uppercase">Discount %</label>
                    <Input
                      value={t.pct}
                      onChange={(e) => t.setPct(e.target.value)}
                      type="number"
                      min="0"
                      max="50"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  {Number(t.pct) > 0 && (
                    <div className="text-[11px] pt-1 text-emerald-800 font-mono">
                      Rate: {formatLKR(Math.round(discPrice))} / unit
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Surface>

        {/* Step 4: Dispatch & Fulfillment */}
        <Surface kind="elevated" className="p-6 space-y-4 border border-ink/10">
          <div className="border-b border-line pb-3">
            <h2 className="vyro-display text-base font-semibold text-ink flex items-center gap-1.5">
              <TruckIcon size={16} className="text-ink-3" />
              4. Logistics & Delivery Radius
            </h2>
            <p className="text-xs text-ink-4">Configure delivery capabilities from your depot.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 items-center">
            <label className="flex items-center gap-3 p-3.5 border border-line rounded bg-paper cursor-pointer hover:border-ink transition-colors">
              <input
                type="checkbox"
                checked={deliveryAvailable}
                onChange={(e) => setDeliveryAvailable(e.target.checked)}
                className="size-4 accent-ink"
              />
              <div className="text-xs">
                <div className="font-semibold text-ink">Depot Delivery Available</div>
                <div className="text-ink-4">You can dispatch shipments with your own or platform fleet</div>
              </div>
            </label>

            <FormField label="Delivery Radius (Kilometers)" hint="Leave blank for Island-wide">
              <Input
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                placeholder="e.g. 50 (blank = unlimited)"
                type="number"
                min="1"
                max="500"
                disabled={!deliveryAvailable}
                className="font-mono text-xs"
              />
            </FormField>
          </div>

          {isEdit && (
            <div className="pt-2 border-t border-line">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="size-4 accent-ink"
                />
                <span className="text-xs font-medium text-ink">
                  Listing is active and discoverable on wholesale catalog
                </span>
              </label>
            </div>
          )}
        </Surface>

        {err && (
          <div className="p-4 bg-rose/10 border border-rose text-rose text-sm rounded flex items-center gap-2">
            <span className="font-bold">Error:</span> {err}
          </div>
        )}

        <div className="flex items-center gap-4 pt-2">
          <Button type="submit" variant="primary" size="lg" disabled={pending} loading={pending} className="gap-2">
            <CheckCircleIcon size={16} />
            {pending ? 'Saving Offer…' : isEdit ? 'Update Product Listing' : 'Publish Product Listing'}
          </Button>
          <Link to="/supplier/products">
            <Button type="button" variant="ghost" size="lg">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
