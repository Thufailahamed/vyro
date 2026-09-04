import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Card, ErrorBanner, Input, Badge } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import {
  ArrowLeftIcon,
  StoreIcon,
  TruckIcon,
  PackageIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  CheckCircleIcon,
  Building2Icon,
} from '@/components/icons';

interface Offer {
  offer: {
    id: string;
    priceCents: number;
    minOrderQty: number;
    leadTimeDays: number;
    availabilityStatus: string;
  };
  supplier: {
    id: string;
    name: string;
  };
}

export function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [qty, setQty] = useState<{ [k: string]: number }>({});
  const [err, setErr] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () =>
      api.get<{
        product: { id: string; name: string; unit: string };
        offers: Array<{ rank: number; offer: Offer['offer']; supplier: Offer['supplier'] }>;
        priceStats: { count: number; min: number; max: number };
      }>(`/search/products/${id}/offers`),
  });

  async function add(businessId: string, offerId: string, q: number) {
    setErr('');
    setSubmittingId(offerId);
    try {
      await api.post('/cart/items', { businessId, supplierProductId: offerId, quantity: q });
      navigate('/cart');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to add item to cart');
    } finally {
      setSubmittingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-4">
        <div className="h-6 w-32 bg-slate-200 rounded animate-pulse" />
        <div className="h-12 w-96 bg-slate-200 rounded animate-pulse" />
        <div className="h-48 bg-slate-100 rounded-2xl animate-pulse border border-slate-200" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <h2 className="text-xl font-bold text-slate-800">Product not found</h2>
        <p className="text-sm text-slate-500 mt-1">This product may have been unlisted or removed.</p>
        <Link to="/search" className="mt-4 inline-block">
          <Button variant="outline">← Back to search</Button>
        </Link>
      </div>
    );
  }

  const businessId = user?.memberships?.[0]?.businessId;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Breadcrumb Back */}
      <div>
        <Link
          to="/search"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-soft-sm"
        >
          <ArrowLeftIcon size={14} /> Back to Catalog
        </Link>
      </div>

      {/* Product Hero Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-soft-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
              <PackageIcon size={14} /> Wholesale Standard: {data.product.unit}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              {data.product.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Compare verified wholesale distributors and place direct purchase orders.
            </p>
          </div>

          {/* Pricing Spread Summary */}
          {data.priceStats && data.priceStats.count > 0 && (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/70 shrink-0 text-left md:text-right space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Market Price Range
              </span>
              <div className="text-2xl font-black text-brand-700">
                {formatLKR(data.priceStats.min)}
                {data.priceStats.min !== data.priceStats.max && (
                  <span className="text-slate-400 font-normal text-lg"> - {formatLKR(data.priceStats.max)}</span>
                )}
              </div>
              <div className="text-xs text-slate-600 font-medium">
                Across {data.priceStats.count} verified supplier quote{data.priceStats.count === 1 ? '' : 's'}
              </div>
            </div>
          )}
        </div>
      </div>

      <ErrorBanner message={err} />

      {/* Unauthenticated / Un-onboarded banners */}
      {!user && (
        <Card className="bg-amber-50/80 border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Building2Icon size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">Sign in to place wholesale orders</h4>
              <p className="text-xs text-amber-700 mt-0.5">You need a registered business profile to generate official purchase orders.</p>
            </div>
          </div>
          <Link to="/login" className="shrink-0 w-full sm:w-auto">
            <Button size="sm" className="w-full">Sign In / Register</Button>
          </Link>
        </Card>
      )}

      {user && !businessId && (
        <Card className="bg-brand-50/80 border-brand-200 flex flex-col sm:flex-row items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
              <Building2Icon size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-brand-900">Business Profile Required</h4>
              <p className="text-xs text-brand-700 mt-0.5">Register your business entity (retailer, restaurant, hotel, builder) to begin ordering.</p>
            </div>
          </div>
          <Link to="/onboarding/business" className="shrink-0 w-full sm:w-auto">
            <Button size="sm" className="w-full">Complete Business Profile</Button>
          </Link>
        </Card>
      )}

      {/* Offers Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Available Supplier Offers ({data.offers.length})
          </h2>
          <span className="text-xs text-slate-600 font-medium">Ranked by unit price</span>
        </div>

        {data.offers.length === 0 ? (
          <Card className="text-center py-12">
            <StoreIcon size={28} className="mx-auto text-slate-400 mb-2" />
            <h3 className="font-semibold text-slate-800">No active offers available</h3>
            <p className="text-xs text-slate-500 mt-1">Please check back later as suppliers update their catalogs daily.</p>
          </Card>
        ) : (
          <div className="space-y-3.5">
            {data.offers.map((row) => {
              const selectedQty = qty[row.offer.id] ?? row.offer.minOrderQty;
              const lineTotal = selectedQty * row.offer.priceCents;
              const isBest = row.rank === 1;

              return (
                <Card
                  key={row.offer.id}
                  hoverEffect
                  className={`relative p-5 sm:p-6 border-slate-200 transition-all ${
                    isBest ? 'ring-2 ring-brand-500/30 border-brand-300 bg-gradient-to-r from-brand-50/30 via-white to-white' : ''
                  }`}
                >
                  {isBest && (
                    <div className="absolute -top-3 left-6 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-600 text-white shadow-soft-sm">
                      <CheckCircleIcon size={12} /> Best Unit Price
                    </div>
                  )}

                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pt-1">
                    {/* Rank & Supplier Info */}
                    <div className="flex items-start gap-4">
                      <div className={`h-11 w-11 rounded-2xl flex items-center justify-center font-black text-base shrink-0 ${
                        isBest ? 'bg-brand-600 text-white shadow-soft-sm' : 'bg-slate-100 text-slate-700'
                      }`}>
                        #{row.rank}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-slate-900">{row.supplier.name}</h3>
                          <span className="inline-flex items-center gap-1 text-[11px] text-brand-700 bg-brand-50 border border-brand-200 px-1.5 py-0.2 rounded font-medium">
                            <ShieldCheckIcon size={12} /> Verified Supplier
                          </span>
                        </div>

                        {/* Specs Pills */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
                          <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200 font-medium">
                            <PackageIcon size={13} className="text-slate-400" />
                            Min Order (MOQ): <strong className="text-slate-700 font-bold">{row.offer.minOrderQty} {data.product.unit}</strong>
                          </span>

                          <span className="inline-flex items-center gap-1 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200 font-medium">
                            <TruckIcon size={13} className="text-slate-400" />
                            Lead Time: <strong className="text-slate-700 font-bold">{row.offer.leadTimeDays} day{row.offer.leadTimeDays === 1 ? '' : 's'}</strong>
                          </span>

                          <Badge variant="success" className="capitalize">
                            {row.offer.availabilityStatus.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Price & Order Control */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 border-t lg:border-t-0 pt-4 lg:pt-0">
                      {/* Price display */}
                      <div className="text-left lg:text-right">
                        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Unit Price
                        </div>
                        <div className="text-2xl font-black text-brand-700">
                          {formatLKR(row.offer.priceCents)}
                        </div>
                        <div className="text-[11px] text-slate-600 font-medium">
                          per {data.product.unit}
                        </div>
                      </div>

                      {/* Quantity selector & Add to cart */}
                      {businessId ? (
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <div className="flex items-center gap-2">
                            <div className="w-28">
                              <Input
                                type="number"
                                min={row.offer.minOrderQty}
                                value={selectedQty}
                                onChange={(e) => {
                                  const val = Math.max(1, Number(e.target.value));
                                  setQty({ ...qty, [row.offer.id]: val });
                                }}
                                className="text-center font-bold text-slate-900"
                              />
                            </div>
                            <Button
                              onClick={() => add(businessId, row.offer.id, selectedQty)}
                              loading={submittingId === row.offer.id}
                              className="font-semibold"
                            >
                              <ShoppingCartIcon size={16} /> Add to Cart
                            </Button>
                          </div>
                          
                          {/* Live estimated line total */}
                          <div className="text-[11px] text-slate-600 font-medium">
                            Est. Total: <span className="font-bold text-slate-800">{formatLKR(lineTotal)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600 italic">
                          Profile required to order
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
