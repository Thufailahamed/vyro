import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { Button } from '@/components/ui';
import { Surface, ProductImage } from '@/components/brand/Surface';
import { SearchIcon, PackageIcon, PlusIcon, CheckIcon, XIcon, ArrowRightIcon } from '@/components/icons';
import { cn } from '@vyro/ui';

export type CatalogPickProduct = {
  id: string;
  name: string;
  unit: string;
  brand: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
  categoryId?: string;
  description?: string | null;
};

type CatalogHit = {
  product: CatalogPickProduct;
  bestOffer: { priceCents: number } | null;
  offerCount: number;
};

export function CatalogProductPicker({
  listedByProductId,
  onSelect,
  onCreateNew,
}: {
  listedByProductId: Map<string, string>;
  onSelect: (productId: string) => void;
  onCreateNew: () => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(t);
  }, [query]);

  const search = useQuery({
    queryKey: ['supplier-catalog-pick', debounced],
    queryFn: () =>
      api.get<{ hits: CatalogHit[] }>(
        debounced
          ? `/search/products?q=${encodeURIComponent(debounced)}&limit=24`
          : '/search/products?limit=24',
      ),
    staleTime: 30_000,
  });

  const hits = search.data?.hits ?? [];
  const listedCount = hits.filter((h) => listedByProductId.has(h.product.id)).length;

  return (
    <section className="space-y-5">
      {/* Search console */}
      <div className="rounded-2xl border border-ink/10 bg-paper p-5 sm:p-6 shadow-[0_1px_2px_rgba(12,14,11,0.04)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-copper">
              <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[10px] text-volt">1</span>
              Catalog lookup
            </div>
            <h2 className="mt-2 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              Find an existing product
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-3">
              If buyers already shop this SKU, attach your mill-gate rate to it. Only create a new
              product when nothing matches.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl border border-ink/15 bg-paper px-4 text-[13px] font-semibold text-ink transition-colors hover:border-ink sm:self-auto"
          >
            <PlusIcon size={14} /> New SKU
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-ink/15 bg-bone/50 p-1.5 pl-1.5 transition-all focus-within:border-ink/40 focus-within:bg-paper focus-within:ring-4 focus-within:ring-volt/25">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink text-volt">
            <SearchIcon size={17} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search white sugar, rice, tea, cement…"
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden"
            aria-label="Search wholesale catalog"
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-bone hover:text-ink"
              aria-label="Clear search"
            >
              <XIcon size={14} />
            </button>
          )}
          <span className="hidden shrink-0 pr-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4 sm:block">
            {search.isFetching ? 'Searching…' : `${hits.length} SKUs`}
          </span>
        </div>

        {hits.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-ink" /> Not listed — add your rate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-mint" /> Already listed by you ({listedCount})
            </span>
          </div>
        )}
      </div>

      {/* Loading */}
      {search.isFetching && hits.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex gap-3.5 rounded-2xl border border-ink/10 bg-paper p-3">
              <div className="size-[4.5rem] animate-pulse rounded-xl bg-mist" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-3/4 animate-pulse rounded bg-mist" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-bone" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-bone" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!search.isFetching && hits.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink/15 bg-paper/60 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-bone text-ink-3">
            <PackageIcon size={22} />
          </span>
          <p className="mt-4 font-display text-lg font-bold text-ink">
            {debounced ? `No catalog match for “${debounced}”` : 'No catalog products yet'}
          </p>
          <p className="mt-1 max-w-sm text-[13px] text-ink-3">
            Create a new SKU so buyers can discover this item across the marketplace.
          </p>
          <Button type="button" size="sm" className="mt-5" onClick={onCreateNew}>
            <PlusIcon size={13} /> Create new product
          </Button>
        </div>
      )}

      {/* Results */}
      {hits.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {hits.map((hit) => {
            const listed = listedByProductId.has(hit.product.id);
            const p = hit.product;
            const meta = [p.brand, p.packSize, p.unit].filter(Boolean).join(' · ');
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn(
                  'group relative flex flex-col rounded-2xl border bg-paper p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(12,14,11,0.45)]',
                  listed ? 'border-mint/30 hover:border-mint/60' : 'border-ink/10 hover:border-ink/30',
                )}
              >
                <div className="flex gap-3.5">
                  <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-xl bg-bone ring-1 ring-ink/[0.06]">
                    <ProductImage
                      src={p.imageUrl}
                      seed={p.id}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="min-w-0 flex-1 py-0.5">
                    <p className="font-display text-[15px] font-bold leading-snug text-ink line-clamp-2">
                      {p.name}
                    </p>
                    {meta && <p className="mt-1 truncate text-[12px] text-ink-4">{meta}</p>}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-ink/10 pt-3">
                  <div className="min-w-0 text-[12px]">
                    {hit.offerCount > 0 ? (
                      <span className="text-ink-3">
                        <span className="font-semibold text-ink">{hit.offerCount}</span> live quote
                        {hit.offerCount === 1 ? '' : 's'}
                        {hit.bestOffer && (
                          <>
                            {' · from '}
                            <span className="font-semibold text-ink">{formatLKR(hit.bestOffer.priceCents)}</span>
                          </>
                        )}
                      </span>
                    ) : (
                      <span className="text-volt-deep font-medium">No quotes yet — be first</span>
                    )}
                  </div>
                  {listed ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint/10 px-2.5 py-1 text-[11px] font-semibold text-mint ring-1 ring-inset ring-mint/25">
                      <CheckIcon size={11} /> Edit rate
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-paper transition-colors group-hover:bg-volt group-hover:text-ink">
                      Add rate <ArrowRightIcon size={11} />
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {/* Create-new tile */}
          <button
            type="button"
            onClick={onCreateNew}
            className="group flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/20 bg-transparent p-4 text-center transition-colors hover:border-ink hover:bg-paper"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-ink/[0.06] text-ink transition-colors group-hover:bg-volt">
              <PlusIcon size={16} />
            </span>
            <span className="text-[13px] font-semibold text-ink">Can’t find this SKU?</span>
            <span className="text-[12px] text-ink-4">Create a new catalog product</span>
          </button>
        </div>
      )}
    </section>
  );
}

export function SelectedCatalogProduct({
  name,
  brand,
  packSize,
  unit,
  imageUrl,
  seed,
  offerCount,
  onChange,
}: {
  name: string;
  brand?: string | null;
  packSize?: string | null;
  unit: string;
  imageUrl?: string | null;
  seed: string;
  offerCount?: number;
  onChange: () => void;
}) {
  return (
    <Surface className="p-5 rounded-2xl">
      <div className="flex items-start gap-3">
        <ProductImage
          src={imageUrl}
          seed={seed}
          alt={name}
          className="size-16 rounded-xl shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="vyro-kicker text-copper">Catalog product</div>
          <h2 className="mt-1 text-lg font-bold text-ink-1 leading-snug">{name}</h2>
          <p className="text-xs text-ink-3 mt-1">
            {[brand, packSize, unit].filter(Boolean).join(' · ')}
            {offerCount != null && offerCount > 0
              ? ` · ${offerCount} other quote${offerCount === 1 ? '' : 's'}`
              : ''}
          </p>
          <p className="text-[11px] text-ink-4 mt-1">
            Name, photos, and category stay locked. Set only your wholesale terms below.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChange}>
          Change
        </Button>
      </div>
    </Surface>
  );
}
