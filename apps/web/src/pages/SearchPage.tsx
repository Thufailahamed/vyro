import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, EmptyState, Input } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import {
  SearchIcon,
  PackageIcon,
  StoreIcon,
  ArrowRightIcon,
  SparklesIcon,
  CheckCircleIcon,
  XIcon,
} from '@/components/icons';

interface Hit {
  product: { id: string; name: string; unit: string; brand: string | null };
  bestOffer: { priceCents: number; supplier: { id: string; name: string } } | null;
  offerCount: number;
}

const QUICK_FILTERS = ['Rice', 'Sugar', 'Cement', 'Tea', 'Packaging', 'Flour'];

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [q, setQ] = useState(initialQ);

  // Sync state if URL search param changes
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) {
      setQ(urlQ);
    }
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
    if (val.trim()) {
      setSearchParams({ q: val.trim() });
    } else {
      setSearchParams({});
    }
  }

  return (
    <div className="space-y-8">
      {/* Header & Search Bar */}
      <div className="space-y-4 max-w-3xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Wholesale Product Catalog
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Compare live supplier offers, minimum order quantities, and unit prices in Sri Lankan Rupees.
          </p>
        </div>

        {/* Enhanced Search Input */}
        <div className="relative">
          <SearchIcon size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by product name, category, or brand (e.g. rice, cement, sugar)..."
            value={q}
            onChange={(e) => handleInputChange(e.target.value)}
            className="pl-11 pr-10 py-3 text-base rounded-xl border-slate-300 shadow-soft-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            autoFocus
          />
          {q && (
            <button
              onClick={() => handleInputChange('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Quick tags:
          </span>
          {QUICK_FILTERS.map((term) => (
            <button
              key={term}
              onClick={() => handleFilterClick(term)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                q.toLowerCase() === term.toLowerCase()
                  ? 'bg-brand-600 text-white border-brand-600 shadow-soft-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      {/* Results Header */}
      {q && data && (
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <span className="text-sm font-semibold text-slate-700">
            {data.hits.length} product{data.hits.length === 1 ? '' : 's'} matching "{q}"
          </span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && q && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 rounded-2xl bg-slate-100 animate-pulse border border-slate-200" />
          ))}
        </div>
      )}

      {/* Products Grid */}
      {data && data.hits.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.hits.map((h) => (
            <Card
              key={h.product.id}
              hoverEffect
              className="flex flex-col justify-between border-slate-200/90 rounded-2xl p-5 group"
            >
              <div>
                {/* Category / Unit tags */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200/80">
                    <PackageIcon size={13} className="text-slate-500" />
                    <span>Unit: {h.product.unit}</span>
                  </div>
                  {h.product.brand && (
                    <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-100">
                      {h.product.brand}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="font-bold text-base text-slate-900 group-hover:text-brand-600 transition-colors leading-snug">
                  <Link to={`/products/${h.product.id}`} className="hover:underline">
                    {h.product.name}
                  </Link>
                </h3>

                {/* Offer Details */}
                {h.bestOffer ? (
                  <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Best Direct Price
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        <CheckCircleIcon size={12} /> Verified
                      </span>
                    </div>

                    <div className="text-xl font-black text-brand-700 tracking-tight">
                      {formatLKR(h.bestOffer.priceCents)}
                      <span className="text-xs font-normal text-slate-500 ml-1">
                        / {h.product.unit}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-600 pt-0.5">
                      <StoreIcon size={14} className="text-slate-400 shrink-0" />
                      <span className="font-medium truncate">{h.bestOffer.supplier.name}</span>
                    </div>

                    {h.offerCount > 1 && (
                      <div className="text-[11px] font-medium text-brand-600 pt-1 flex items-center gap-1">
                        <SparklesIcon size={12} />
                        +{h.offerCount - 1} other supplier offer{h.offerCount > 2 ? 's' : ''} available
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-800">
                    No active supplier offers currently listed for this product.
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="mt-5 pt-3 border-t border-slate-100">
                <Link to={`/products/${h.product.id}`} className="block">
                  <Button variant="outline" className="w-full justify-between text-xs group-hover:border-brand-300 group-hover:text-brand-700">
                    <span>Compare All Offers</span>
                    <ArrowRightIcon size={15} />
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Empty State: No results */}
      {data && data.hits.length === 0 && q && (
        <EmptyState
          icon={<SearchIcon size={24} />}
          title={`No products found for "${q}"`}
          description="Try checking for spelling mistakes or try a broader search term like 'rice', 'sugar', or 'cement'."
          action={
            <Button variant="outline" onClick={() => handleFilterClick('Rice')}>
              View Rice Offers
            </Button>
          }
        />
      )}

      {/* Initial state: Prompt to search */}
      {!q && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center max-w-xl mx-auto space-y-4 shadow-soft-sm">
          <div className="h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
            <SearchIcon size={24} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">Search the Wholesale Catalog</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Type a product name above or click any of the popular tags to explore live wholesale quotes across Sri Lanka.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {QUICK_FILTERS.slice(0, 4).map((f) => (
              <Button key={f} size="sm" variant="secondary" onClick={() => handleFilterClick(f)}>
                {f}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
