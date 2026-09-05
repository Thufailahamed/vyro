import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Input, PageSection } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { ArrowLeftIcon, ShoppingCartIcon } from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, ProductImage, Surface } from '@/components/brand/Surface';

function availabilityLabel(status: string | undefined): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  switch (status) {
    case 'in_stock':
      return { label: 'In stock', tone: 'good' };
    case 'low_stock':
      return { label: 'Low stock', tone: 'warn' };
    case 'out_of_stock':
      return { label: 'Out of stock', tone: 'bad' };
    case 'pre_order':
      return { label: 'Pre-order', tone: 'neutral' };
    default:
      return { label: status ?? 'Unknown', tone: 'neutral' };
  }
}

const toneClass: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good: 'text-mint border-mint/40 bg-mint/5',
  warn: 'text-amber border-amber/40 bg-amber/5',
  bad: 'text-rose border-rose/40 bg-rose/5',
  neutral: 'text-ink-3 border-line bg-paper',
};

interface Offer {
  offer: {
    id: string;
    priceCents: number;
    minOrderQty: number;
    leadTimeDays: number;
    availabilityStatus: string;
  };
  supplier: { id: string; name: string };
}

export function ProductDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [qty, setQty] = useState<{ [k: string]: number }>({});
  const [err, setErr] = useState('');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () =>
      api.get<{
        product: {
          id: string;
          name: string;
          unit: string;
          brand?: string | null;
          description?: string | null;
          imageUrl?: string | null;
          images?: Array<{ id: string; url: string; altText?: string | null }>;
        };
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

  if (isLoading) return <div className="h-64 bg-mist animate-pulse" />;
  if (!data) {
    return (
      <div className="py-16">
        <h2 className="vyro-display text-3xl">Product not found</h2>
        <Link to="/search" className="mt-4 inline-block text-copper">
          ← Catalog
        </Link>
      </div>
    );
  }

  const businessId = user?.memberships?.[0]?.businessId;
  const fastestId = data.offers.reduce(
    (best, row) => (!best || row.offer.leadTimeDays < best.offer.leadTimeDays ? row : best),
    data.offers[0],
  )?.offer.id;
  const valueId = data.offers.reduce((best, row) => {
    const score = row.offer.priceCents * Math.max(1, row.offer.leadTimeDays);
    const bestScore = best ? best.offer.priceCents * Math.max(1, best.offer.leadTimeDays) : Infinity;
    return score < bestScore ? row : best;
  }, data.offers[0])?.offer.id;

  return (
    <div className="space-y-8">
      <Link to="/search" className="inline-flex items-center gap-1.5 text-xs text-ink-4 hover:text-ink">
        <ArrowLeftIcon size={14} /> Catalog
      </Link>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
        <div className="space-y-3">
          <ProductImage
            src={activeImage || data.product.imageUrl || data.product.images?.[0]?.url}
            alt={data.product.name}
            seed={data.product.id}
            className="h-80 sm:h-96 w-full shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)] bg-bone"
          />
          {data.product.images && data.product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.product.images.map((img) => {
                const isSelected = (activeImage || data.product.imageUrl || data.product.images?.[0]?.url) === img.url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveImage(img.url)}
                    className={`relative shrink-0 w-16 h-16 overflow-hidden border-2 transition-all ${
                      isSelected ? 'border-ink shadow-sm scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img.url} alt={img.altText || data.product.name} className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <div className="vyro-kicker">{data.product.unit}</div>
          <h1 className="mt-2 vyro-display text-4xl sm:text-5xl text-balance">{data.product.name}</h1>
          {data.product.brand && (
            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-copper font-medium">
              Brand: {data.product.brand}
            </div>
          )}
          {data.product.description && (
            <p className="mt-3 text-sm text-ink-3 leading-relaxed">
              {data.product.description}
            </p>
          )}
          {data.priceStats.count > 0 && (
            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">From</div>
              <MetricNumber className="text-ink">{formatLKR(data.priceStats.min)}</MetricNumber>
              <p className="mt-1 text-xs text-ink-4">{data.priceStats.count} live supplier quotes</p>
            </div>
          )}
          <div className="mt-8">
            <FlowLine
              nodes={[
                { label: 'Product', state: 'active' },
                { label: 'Supplier', state: 'idle' },
                { label: 'Cart', state: 'idle' },
              ]}
            />
          </div>
        </div>
      </div>

      <ErrorBanner message={err} />

      {!user && (
        <Surface className="p-5 flex items-center justify-between gap-4">
          <p className="text-sm">Sign in to place wholesale orders.</p>
          <Link to="/login">
            <Button size="sm">Sign in</Button>
          </Link>
        </Surface>
      )}
      {user && !businessId && (
        <Surface className="p-5 flex items-center justify-between gap-4">
          <p className="text-sm">Register your business to order.</p>
          <Link to="/onboarding/business">
            <Button size="sm">Complete profile</Button>
          </Link>
        </Surface>
      )}

      <PageSection eyebrow="Offers" title="Supplier comparison" actions={<span className="text-sm text-ink-4">Best price, best value, fastest delivery — at a glance.</span>}>
        <div className="space-y-3">
          {data.offers.length === 0 ? (
            <Surface className="p-10 text-center text-ink-4">No active offers.</Surface>
          ) : (
            data.offers.map((row) => {
              const selectedQty = qty[row.offer.id] ?? row.offer.minOrderQty;
              const isBestPrice = row.rank === 1;
              const isFastest = row.offer.id === fastestId;
              const isValue = row.offer.id === valueId;
              return (
                <Surface
                  key={row.offer.id}
                  kind={isBestPrice ? 'elevated' : 'flat'}
                  className={`p-5 sm:p-6 ${isBestPrice ? 'shadow-[inset_3px_0_0_0_#C6DC4A]' : ''}`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {isBestPrice && <Award>Best price</Award>}
                        {isValue && <Award copper>Best value</Award>}
                        {isFastest && <Award>Fastest delivery</Award>}
                      </div>
                      <h3 className="font-display text-xl">{row.supplier.name}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-4">
                        <span>MOQ {row.offer.minOrderQty} {data.product.unit}</span>
                        <span>{row.offer.leadTimeDays} day lead</span>
                        {(() => {
                          const a = availabilityLabel(row.offer.availabilityStatus);
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 border text-[10px] uppercase tracking-wider font-medium ${toneClass[a.tone]}`}>
                              {a.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="text-left lg:text-right">
                      <MetricNumber size="md">{formatLKR(row.offer.priceCents)}</MetricNumber>
                      <div className="text-[11px] text-ink-4">per {data.product.unit}</div>
                    </div>
                    {businessId && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={row.offer.minOrderQty}
                          value={selectedQty}
                          onChange={(e) => setQty({ ...qty, [row.offer.id]: Math.max(1, Number(e.target.value)) })}
                          className="w-20 text-center vyro-metric"
                        />
                        <Button
                          onClick={() => add(businessId, row.offer.id, selectedQty)}
                          loading={submittingId === row.offer.id}
                          icon={<ShoppingCartIcon size={14} />}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                </Surface>
              );
            })
          )}
        </div>
      </PageSection>
    </div>
  );
}

function Award({ children, copper }: { children: string; copper?: boolean }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] px-2 py-0.5 ${copper ? 'bg-copper text-paper' : 'bg-ink text-volt'}`}>
      {children}
    </span>
  );
}
