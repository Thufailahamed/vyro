import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { Button, Input } from '@/components/ui';
import { Surface, ProductImage } from '@/components/brand/Surface';
import { SearchIcon, PackageIcon, PlusIcon, CheckIcon } from '@/components/icons';
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

  return (
    <Surface className="p-6 rounded-2xl space-y-5">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-ink text-volt font-mono font-bold text-xs flex items-center justify-center shrink-0">
            1
          </div>
          <div className="min-w-0">
            <div className="vyro-kicker text-copper">Catalog</div>
            <h2 className="mt-1 text-lg font-bold text-ink-1">Find an existing product</h2>
            <p className="text-xs text-ink-3 mt-0.5 max-w-xl">
              If buyers already shop this SKU, add your mill-gate rate to it. Create a new product
              only when nothing matches.
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search white sugar, rice, tea, cement…"
          className="pl-9 bg-paper"
          aria-label="Search wholesale catalog"
          autoFocus
        />
      </div>

      <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
        {search.isFetching && hits.length === 0 && (
          <p className="text-xs text-ink-4 px-1 py-6 text-center">Searching catalog…</p>
        )}

        {!search.isFetching && hits.length === 0 && (
          <div className="rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center space-y-3">
            <PackageIcon size={28} className="mx-auto text-ink-4" />
            <p className="text-sm font-semibold text-ink-1">
              {debounced ? `No catalog match for “${debounced}”` : 'No catalog products yet'}
            </p>
            <p className="text-xs text-ink-3">Create a new SKU so buyers can find this item.</p>
            <Button type="button" variant="secondary" size="sm" onClick={onCreateNew}>
              <PlusIcon size={13} /> Create new product
            </Button>
          </div>
        )}

        {hits.map((hit) => {
          const listed = listedByProductId.has(hit.product.id);
          const p = hit.product;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                listed
                  ? 'border-ink/10 bg-bone/60 hover:border-ink/25'
                  : 'border-ink/10 bg-paper hover:border-ink/30 hover:bg-ink/[0.03]',
              )}
            >
              <ProductImage
                src={p.imageUrl}
                seed={p.id}
                alt={p.name}
                className="size-14 rounded-lg shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-ink truncate">{p.name}</p>
                <p className="text-[11px] text-ink-4 mt-0.5 truncate">
                  {[p.brand, p.packSize, p.unit].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  {hit.offerCount > 0
                    ? `${hit.offerCount} live quote${hit.offerCount === 1 ? '' : 's'}${
                        hit.bestOffer ? ` · from ${formatLKR(hit.bestOffer.priceCents)}` : ''
                      }`
                    : 'No live quotes yet'}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-md',
                  listed ? 'bg-mint/15 text-mint' : 'bg-ink text-volt',
                )}
              >
                {listed ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckIcon size={12} /> Edit your rate
                  </span>
                ) : (
                  'Add your rate'
                )}
              </span>
            </button>
          );
        })}
      </div>

      {hits.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-ink/10">
          <p className="text-xs text-ink-3">Can’t find this SKU in the catalog?</p>
          <Button type="button" variant="secondary" size="sm" onClick={onCreateNew}>
            <PlusIcon size={13} /> Create new product
          </Button>
        </div>
      )}
    </Surface>
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
