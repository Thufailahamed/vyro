import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, EmptyState, Input } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { SearchIcon, PackageIcon, StoreIcon, XIcon, ClockIcon } from '@/components/icons';
import { ProductImage } from '@/components/brand/Surface';

interface Hit {
  product: { id: string; name: string; unit: string; brand: string | null; packSize?: string | null; imageUrl?: string | null };
  bestOffer: { priceCents: number; supplier: { id: string; name: string }; leadTimeDays?: number } | null;
  offerCount: number;
}

const QUICK_FILTERS = ['All', 'Rice', 'Sugar', 'Tea', 'Milk', 'Oil', 'Flour', 'Cement', 'Packaging', 'Spices'];

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [q, setQ] = useState(initialQ);

  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) setQ(urlQ);
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<{ hits: Hit[] }>(`/search/products?q=${encodeURIComponent(q.trim())}`),
    enabled: true,
  });

  function handleFilterClick(term: string) {
    if (term === 'All') {
      setQ('');
      setSearchParams({});
    } else {
      setQ(term);
      setSearchParams({ q: term });
    }
  }

  function handleInputChange(val: string) {
    setQ(val);
    setSearchParams(val.trim() ? { q: val.trim() } : {});
  }

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <div className="vyro-kicker text-copper">Wholesale Catalog</div>
        <h1 className="mt-2 vyro-display text-4xl sm:text-5xl text-balance">Direct From Primary Mills & Depots</h1>
        <p className="mt-2 text-sm text-ink-3">
          Compare live prices, minimum order quantities, and delivery lead times across verified Sri Lankan suppliers.
        </p>
        <div className="relative mt-6">
          <SearchIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input
            placeholder="Search rice, sugar, tea, milk, cement, packaging…"
            value={q}
            onChange={(e) => handleInputChange(e.target.value)}
            className="pl-11 h-12"
            autoFocus
          />
          {q && (
            <button
              onClick={() => handleInputChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink p-1 cursor-pointer"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {QUICK_FILTERS.map((term) => {
            const active = term === 'All' ? !q : q.toLowerCase() === term.toLowerCase();
            return (
              <button
                key={term}
                onClick={() => handleFilterClick(term)}
                className={`h-8 px-3.5 text-xs font-mono tracking-wide cursor-pointer transition-colors ${
                  active
                    ? 'bg-ink text-volt font-bold'
                    : 'bg-paper text-ink-3 border border-ink/15 hover:border-ink hover:text-ink'
                }`}
              >
                {term}
              </button>
            );
          })}
        </div>
      </header>

      {data && (
        <div className="flex items-baseline justify-between border-b border-ink/10 pb-3">
          <span className="text-sm text-ink-3">
            <span className="vyro-metric text-ink font-bold">{data.hits.length}</span>{' '}
            {q ? (
              <>
                wholesale lots matching &ldquo;<strong>{q}</strong>&rdquo;
              </>
            ) : (
              'wholesale lots active in the network'
            )}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-96 bg-paper border border-ink/10 animate-pulse" />
          ))}
        </div>
      )}

      {data && data.hits.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {data.hits.map((h) => (
            <Link
              key={h.product.id}
              to={`/products/${h.product.id}`}
              className="group bg-paper flex flex-col border border-ink/15 hover:border-ink hover:shadow-md transition-all duration-240 overflow-hidden"
            >
              <div className="relative h-52 w-full overflow-hidden bg-bone border-b border-ink/10">
                <ProductImage
                  src={h.product.imageUrl}
                  alt={h.product.name}
                  seed={h.product.id}
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {h.product.brand && (
                  <span className="absolute top-3 left-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-ink text-paper">
                    {h.product.brand}
                  </span>
                )}
                {h.bestOffer?.leadTimeDays !== undefined && (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 text-[10px] font-mono bg-paper/90 text-ink backdrop-blur-sm border border-ink/10 flex items-center gap-1">
                    <ClockIcon size={11} /> {h.bestOffer.leadTimeDays === 0 ? 'Same day' : `${h.bestOffer.leadTimeDays}d dispatch`}
                  </span>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-copper font-medium">
                    {h.product.unit} {h.product.packSize ? `· ${h.product.packSize}` : ''}
                  </div>
                  <h3 className="mt-1 font-display text-xl leading-snug text-ink group-hover:text-copper transition-colors">
                    {h.product.name}
                  </h3>

                  {h.bestOffer ? (
                    <div className="mt-4 pt-3 border-t border-ink/10 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider text-ink-4 block">Best Wholesale Rate</span>
                          <div className="vyro-metric text-2xl text-ink font-bold mt-0.5">
                            {formatLKR(h.bestOffer.priceCents)}
                          </div>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 bg-volt/20 text-ink font-semibold">
                          {h.offerCount} live offer{h.offerCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="text-xs text-ink-3 flex items-center gap-1.5 pt-1">
                        <StoreIcon size={12} className="text-copper shrink-0" />
                        <span className="truncate">{h.bestOffer.supplier.name}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 pt-3 border-t border-ink/10">
                      <p className="text-xs text-amber font-medium">Awaiting next lot update</p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-ink/10 flex items-center justify-between text-xs font-semibold text-ink group-hover:text-copper transition-colors">
                  <span>Compare All Offers</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && data.hits.length === 0 && (
        <EmptyState
          icon={<SearchIcon size={24} />}
          title="No wholesale lots match this term."
          description={`We couldn't find any products matching "${q}". Try browsing popular categories.`}
          action={
            <Button variant="secondary" onClick={() => handleFilterClick('All')}>
              Show all products
            </Button>
          }
        />
      )}
    </div>
  );
}
