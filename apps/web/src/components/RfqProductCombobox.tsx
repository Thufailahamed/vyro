import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { OrderItemThumb } from '@/components/orders/OrderItemThumb';
import { CheckIcon, PlusIcon, SearchIcon, XIcon } from '@/components/icons';

export type PickedProduct = {
  id: string;
  name: string;
  unit: string;
  brand: string | null;
  packSize?: string | null;
  imageUrl?: string | null;
};

type Hit = {
  product: PickedProduct;
  bestOffer: { priceCents: number } | null;
  offerCount: number;
};

/**
 * Catalog-backed product field for RFQ lines: search, see image / brand / best
 * price, click to add. Free text is only a fallback ("request as custom item")
 * for things the catalog doesn't carry yet.
 */
export function RfqProductCombobox({
  value,
  productId,
  imageUrl,
  onPick,
  onCustom,
  onClear,
  autoFocus = false,
}: {
  /** Line description (the product name once picked). */
  value: string;
  productId?: string | undefined;
  imageUrl?: string | null | undefined;
  onPick: (p: PickedProduct, bestPriceCents: number | null) => void;
  onCustom: (text: string) => void;
  onClear: () => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(autoFocus);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const search = useQuery({
    queryKey: ['rfq-product-search', debounced],
    queryFn: () =>
      api.get<{ hits: Hit[] }>(
        debounced
          ? `/search/products?q=${encodeURIComponent(debounced)}&limit=8`
          : '/search/products?limit=8',
      ),
    enabled: open,
    staleTime: 30_000,
  });
  const hits = search.data?.hits ?? [];
  const customText = query.trim();
  const optionCount = hits.length + (customText ? 1 : 0);

  useEffect(() => setActive(0), [debounced]);

  function pick(h: Hit) {
    onPick(h.product, h.bestOffer?.priceCents ?? null);
    setQuery('');
    setOpen(false);
  }
  function custom() {
    if (!customText) return;
    onCustom(customText);
    setQuery('');
    setOpen(false);
  }

  // Selected state: product card with a "Change" affordance.
  if (value.trim() && !open) {
    return (
      <div className="flex h-11 items-center gap-2.5 rounded-lg bg-paper px-2 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)]">
        <OrderItemThumb
          productId={productId}
          imageUrl={imageUrl}
          name={value}
          className="size-8 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink-1">{value}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
            {productId ? (
              <span className="inline-flex items-center gap-1 text-mint">
                <CheckIcon size={10} /> Catalog product
              </span>
            ) : (
              'Custom item'
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setOpen(true);
          }}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-copper transition-colors hover:bg-copper/10"
        >
          Change
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear product"
          className="shrink-0 rounded-md p-1 text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <XIcon size={13} />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <SearchIcon
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
        />
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search the catalog for a product"
          autoFocus={autoFocus}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, Math.max(0, optionCount - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (active < hits.length && hits[active]) pick(hits[active]);
              else custom();
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder="Search products — rice, sugar, cement…"
          className="h-11 w-full rounded-lg bg-paper pl-9 pr-3 text-sm text-ink placeholder:text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-shadow focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)]"
        />
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-ink/10 bg-paper p-1.5 shadow-[0_24px_48px_-20px_rgba(12,14,11,0.35)] sm:min-w-[26rem]"
        >
          <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
            {debounced ? `Results for “${debounced}”` : 'Popular products'}
          </div>
          {search.isLoading ? (
            <div className="space-y-1.5 p-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-ink/[0.05]" />
              ))}
            </div>
          ) : hits.length === 0 ? (
            <p className="px-2.5 py-3 text-sm text-ink-4">No catalog products match.</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.product.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
                  i === active ? 'bg-bone' : 'hover:bg-bone/60',
                )}
              >
                <OrderItemThumb
                  productId={h.product.id}
                  imageUrl={h.product.imageUrl}
                  name={h.product.name}
                  className="size-10 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink-1">{h.product.name}</div>
                  <div className="truncate text-[11px] text-ink-4">
                    {[h.product.brand, h.product.packSize, `per ${h.product.unit}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {h.bestOffer ? (
                    <>
                      <div className="font-mono text-xs font-bold text-ink-1">
                        {formatLKR(h.bestOffer.priceCents)}
                      </div>
                      <div className="text-[10px] text-ink-4">
                        {h.offerCount} supplier{h.offerCount === 1 ? '' : 's'}
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-ink-4">No offers yet</div>
                  )}
                </div>
              </button>
            ))
          )}
          {customText && (
            <button
              type="button"
              role="option"
              aria-selected={active === hits.length}
              onMouseEnter={() => setActive(hits.length)}
              onClick={custom}
              className={cn(
                'mt-1 flex w-full items-center gap-2.5 rounded-lg border-t border-ink/[0.06] p-2.5 text-left text-xs transition-colors',
                active === hits.length ? 'bg-bone' : 'hover:bg-bone/60',
              )}
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-ink/[0.06] text-ink-3">
                <PlusIcon size={13} />
              </span>
              <span className="text-ink-3">
                Not in the catalog? Request{' '}
                <span className="font-semibold text-ink-1">“{customText}”</span> as a custom item
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
