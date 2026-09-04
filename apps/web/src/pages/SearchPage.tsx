import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, EmptyState, Input } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { SearchIcon, PackageIcon, StoreIcon, XIcon } from '@/components/icons';
import { ProductImage, ProductPlaceholder } from '@/components/brand/Surface';

interface Hit {
  product: { id: string; name: string; unit: string; brand: string | null; imageUrl?: string | null };
  bestOffer: { priceCents: number; supplier: { id: string; name: string }; leadTimeDays?: number } | null;
  offerCount: number;
}

const QUICK_FILTERS = ['Rice', 'Sugar', 'Cement', 'Tea', 'Packaging', 'Flour'];

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
    queryFn: () => api.get<{ hits: Hit[] }>(`/search/products?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 1,
  });

  function handleFilterClick(term: string) {
    setQ(term);
    setSearchParams({ q: term });
  }

  function handleInputChange(val: string) {
    setQ(val);
    setSearchParams(val.trim() ? { q: val.trim() } : {});
  }

  return (
    <div className="space-y-8">
      <header className="max-w-3xl">
        <div className="vyro-kicker">Catalog</div>
        <h1 className="mt-2 vyro-display text-4xl sm:text-5xl text-balance">Find what your business needs.</h1>
        <div className="relative mt-6">
          <SearchIcon size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <Input
            placeholder="Search product, brand, or category"
            value={q}
            onChange={(e) => handleInputChange(e.target.value)}
            className="pl-11"
            autoFocus
          />
          {q && (
            <button onClick={() => handleInputChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 p-1">
              <XIcon size={16} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {QUICK_FILTERS.map((term) => {
            const active = q.toLowerCase() === term.toLowerCase();
            return (
              <button
                key={term}
                onClick={() => handleFilterClick(term)}
                className={`h-8 px-3 text-xs font-medium tracking-wide ${
                  active ? 'bg-ink text-volt' : 'bg-paper text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] hover:text-ink'
                }`}
              >
                {term}
              </button>
            );
          })}
        </div>
      </header>

      {q && data && (
        <div className="flex items-baseline justify-between border-b border-ink/10 pb-3">
          <span className="text-sm text-ink-3">
            <span className="vyro-metric text-ink">{data.hits.length}</span> matches
          </span>
        </div>
      )}

      {isLoading && q && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-80 bg-mist animate-pulse" />
          ))}
        </div>
      )}

      {data && data.hits.length > 0 && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {data.hits.map((h) => (
            <Link
              key={h.product.id}
              to={`/products/${h.product.id}`}
              className="group bg-paper flex flex-col shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)] hover:-translate-y-0.5 transition-transform duration-240 overflow-hidden"
            >
              <ProductImage
                src={h.product.imageUrl}
                alt={h.product.name}
                seed={h.product.id}
                className="h-48 w-full border-b border-ink/5"
              />
              <div className="p-5 flex-1 flex flex-col">
                <div className="text-[11px] uppercase tracking-[0.12em] text-ink-4">{h.product.unit}</div>
                <h3 className="mt-1 font-display text-xl leading-tight group-hover:text-copper">{h.product.name}</h3>
                {h.bestOffer ? (
                  <>
                    <div className="mt-4 vyro-metric text-3xl">{formatLKR(h.bestOffer.priceCents)}</div>
                    <div className="mt-1 text-xs text-ink-4 flex items-center gap-1.5">
                      <StoreIcon size={12} /> {h.bestOffer.supplier.name}
                    </div>
                    <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-ink-3">
                      {h.offerCount} offer{h.offerCount === 1 ? '' : 's'} · available now
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-xs text-amber">No live offer</p>
                )}
                <div className="mt-auto pt-4 text-xs font-semibold tracking-wide">Compare →</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && data.hits.length === 0 && q && (
        <EmptyState
          icon={<SearchIcon size={20} />}
          title="Nothing in the flow yet."
          description="Try a broader term — rice, sugar, cement."
        />
      )}

      {!q && (
        <EmptyState
          icon={<PackageIcon size={20} />}
          title="Your procurement starts here."
          description="Search the catalog or pick a sector tag."
          action={
            <Button variant="secondary" onClick={() => handleFilterClick('Rice')}>
              Browse rice
            </Button>
          }
        />
      )}
    </div>
  );
}
