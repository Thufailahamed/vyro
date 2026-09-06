import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Input, Badge } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { PackageIcon, SearchIcon, PercentIcon, CheckIcon, XIcon, ArrowRightIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { SupplierEmptyState, SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

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
type Product = { id: string; name: string; unit?: string; packSize?: string };

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
  const [searchQuery, setSearchQuery] = useState('');

  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
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
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [err, setErr] = useState<string | null>(null);

  const filteredList = useMemo(() => {
    return list.filter((o) => {
      const p = nameMap.get(o.productId);
      return (
        !searchQuery ||
        p?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.supplierSku?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [list, nameMap, searchQuery]);

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

  if (offers.isLoading) return <SupplierLoadingState label="Loading pricing matrix" />;
  if (offers.isError) {
    return (
      <SupplierErrorState message="Could not load pricing." onRetry={() => void offers.refetch()} />
    );
  }

  const activeTiersCount = list.filter(
    (o) => (o.tier1DiscountPct ?? 0) > 0 || (o.tier2DiscountPct ?? 0) > 0 || (o.tier3DiscountPct ?? 0) > 0,
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <PageHeader
          kicker="Commercial Policy"
          title="Mill-Gate Rates & Volume Tiers"
          sub="Maintain wholesale rate cards and volume discount thresholds for enterprise buyers."
        />
        <Link to="/supplier/products/new">
          <Button variant="primary">+ Add Product</Button>
        </Link>
      </header>

      {/* KPI Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink/10 border border-ink/10 overflow-hidden">
        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Total Listed SKUs</div>
          <MetricNumber size="sm" className="mt-1">
            {list.length}
          </MetricNumber>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">With Volume Tiers</div>
          <MetricNumber size="sm" className="mt-1 text-copper">
            {activeTiersCount}
          </MetricNumber>
        </div>
        <div className="bg-paper p-5 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Discount Currency</div>
          <div className="mt-1.5 font-mono text-sm font-bold text-ink">Sri Lankan Rupee (LKR)</div>
        </div>
      </div>

      {/* Guidance Banner */}
      <Surface kind="ink" className="p-5 relative overflow-hidden grain">
        <div className="flex items-start gap-3">
          <PercentIcon size={20} className="text-volt shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-volt font-semibold">
              Wholesale Volume Tiering System
            </div>
            <p className="text-xs text-paper/75 leading-relaxed max-w-3xl">
              Tier breaks are applied dynamically when buyers construct purchase orders in the cart.
              Setting a discount rate will encourage bulk procurement. Setting 0% keeps the base mill-gate unit price.
            </p>
          </div>
        </div>
      </Surface>

      {/* Search Input */}
      {list.length > 0 && (
        <div className="relative max-w-md">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search price cards by commodity or SKU…"
            className="pl-9 text-xs"
          />
        </div>
      )}

      <Surface kind="elevated" className="overflow-hidden border border-ink/10 shadow-soft-sm">
        {list.length === 0 ? (
          <SupplierEmptyState
            icon={<PackageIcon size={24} className="text-copper" />}
            title="No products to price"
            description="Add a wholesale listing first, then configure mill-gate rates and volume tiers."
            action={
              <Link to="/supplier/products/new">
                <Button size="sm">+ Add product</Button>
              </Link>
            }
          />
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-ink-4 space-y-1">
            <p className="text-sm font-medium text-ink-3">No products matched "{searchQuery}"</p>
            <p className="text-xs">Try clearing the search query.</p>
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
                        {product?.name ?? '—'}
                        {product?.unit && (
                          <Badge variant="neutral" className="font-mono text-[10px] uppercase">
                            {product.unit}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs font-mono text-ink-4 flex items-center gap-2">
                        <span>SKU: {o.supplierSku ?? 'Unassigned'}</span>
                        <span>·</span>
                        <span>MOQ: {o.minOrderQty}</span>
                        <span>·</span>
                        <span>Lead: {o.leadTimeDays}d</span>
                      </div>
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="vyro-metric text-xl font-bold text-ink">
                            {formatLKR(o.priceCents)}
                          </div>
                          <div className="text-[10px] uppercase tracking-wider text-ink-4">
                            Base / {product?.unit ?? 'unit'}
                          </div>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => startEdit(o)}>
                          Edit Rates
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
                            className={`border px-4 py-3 space-y-1.5 rounded transition-colors ${
                              t.pct > 0
                                ? 'border-emerald-800/20 bg-emerald-50/40'
                                : 'border-ink/10 bg-paper'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">
                                {t.label} (≥ {t.qty} {product?.unit ?? 'units'})
                              </span>
                              {t.pct > 0 ? (
                                <Badge variant="success" className="font-mono text-[10px]">
                                  −{t.pct}%
                                </Badge>
                              ) : (
                                <span className="text-[10px] text-ink-4">No discount</span>
                              )}
                            </div>
                            <div className="flex items-baseline justify-between pt-0.5">
                              <span className="text-sm font-semibold text-ink">
                                {formatLKR(discountedUnitCents)}
                              </span>
                              {savingsCents > 0 && (
                                <span className="text-[11px] text-emerald-800 font-mono">
                                  Save {formatLKR(savingsCents)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-4 border border-ink/20 bg-mist/30 p-5 rounded">
                      <div className="flex items-center justify-between border-b border-line pb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-ink">
                          Editing Rate Card: {product?.name}
                        </span>
                        <span className="text-xs text-ink-4">Enter rates in LKR</span>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-ink">Base Price (LKR)</label>
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
                              <div key={label} className="border border-ink/15 bg-paper p-3.5 space-y-2 rounded">
                                <div className="text-[11px] font-mono uppercase tracking-wider font-bold text-ink">
                                  {label}
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] text-ink-4 uppercase">Min Quantity</label>
                                  <Input
                                    value={draft[qtyKey]}
                                    onChange={(e) => setDraft({ ...draft, [qtyKey]: e.target.value })}
                                    type="number"
                                    min="1"
                                    className="h-8 text-xs font-mono"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] text-ink-4 uppercase">Discount %</label>
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
  );
}
