import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { SearchIcon } from '@/components/icons';
import { ProductImage } from '@/components/brand/Surface';
import { Button } from '@/components/ui';

interface TypeaheadHit {
  product: {
    id: string;
    name: string;
    unit: string;
    brand: string | null;
    imageUrl?: string | null;
  };
  bestOffer: {
    priceCents: number;
    supplier: { name: string };
  } | null;
}

export function CatalogSearch({
  variant,
  value,
  onChange,
  onSubmit,
  inputId,
  placeholder = 'Search rice, sugar, tea, oil, packaging, cement…',
  autoFocus = false,
}: {
  variant: 'hero' | 'bar' | 'header';
  value: string;
  onChange: (next: string) => void;
  onSubmit: (query: string) => void;
  inputId?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const navigate = useNavigate();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [armed, setArmed] = useState(false);
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value.trim()), 220);
    return () => window.clearTimeout(t);
  }, [value]);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ['catalog-typeahead', debounced],
    queryFn: () => api.get<{ hits: TypeaheadHit[] }>(`/search/products?q=${encodeURIComponent(debounced)}&limit=8`),
    enabled,
    staleTime: 30_000,
  });

  const hits = enabled ? (data?.hits ?? []) : [];
  const showPanel = open && enabled;

  useEffect(() => {
    setActiveIndex(0);
    setArmed(false);
  }, [debounced]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function goProduct(id: string) {
    setOpen(false);
    navigate(`/products/${id}`);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (showPanel && armed && hits[activeIndex]) {
      goProduct(hits[activeIndex].product.id);
      return;
    }
    setOpen(false);
    onSubmit(value.trim());
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!showPanel || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setArmed(true);
      setActiveIndex((i) => (i + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setArmed(true);
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length);
    }
  }

  const input = (
    <input
      id={inputId}
      role="combobox"
      aria-expanded={showPanel}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={showPanel && hits[activeIndex] ? `${listId}-${hits[activeIndex].product.id}` : undefined}
      name="q"
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        setOpen(true);
      }}
      onFocus={() => setOpen(true)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoComplete="off"
      autoFocus={autoFocus}
      aria-label="Search wholesale catalog"
      className={
        variant === 'hero'
          ? 'w-full h-14 bg-transparent pl-12 pr-4 text-ink placeholder:text-ink-4 text-sm sm:text-base focus:outline-none font-medium'
          : variant === 'header'
            ? 'w-full min-w-0 bg-transparent py-2 text-sm text-ink placeholder:text-ink-4 outline-none'
            : 'w-full min-w-0 bg-transparent py-2 text-sm sm:text-base font-sans text-ink placeholder:text-ink-4 outline-none'
      }
    />
  );

  const panel = showPanel ? (
    <div
      id={listId}
      role="listbox"
      className={cn(
        'absolute z-[60] mt-1.5 w-full overflow-hidden border border-ink/15 bg-paper shadow-lg rounded-xl',
        variant === 'hero' && 'left-0 right-0',
      )}
    >
      {isFetching && hits.length === 0 ? (
        <p className="px-4 py-3 text-xs font-mono text-ink-4">Searching lots…</p>
      ) : hits.length === 0 ? (
        <p className="px-4 py-3 text-xs text-ink-3">
          No lots match “{debounced}”. Press Enter to search the catalog.
        </p>
      ) : (
        <ul className="py-1 max-h-80 overflow-y-auto">
          {hits.map((hit, i) => {
            const active = i === activeIndex;
            return (
              <li key={hit.product.id} role="presentation">
                <button
                  id={`${listId}-${hit.product.id}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => {
                    setArmed(true);
                    setActiveIndex(i);
                  }}
                  onClick={() => goProduct(hit.product.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                    (armed && active) ? 'bg-volt/20' : 'hover:bg-mist',
                  )}
                >
                  <ProductImage
                    src={hit.product.imageUrl}
                    alt=""
                    seed={hit.product.id}
                    className="size-10 shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink truncate">{hit.product.name}</div>
                    <div className="text-[11px] font-mono text-ink-4 truncate">
                      {hit.product.brand ? `${hit.product.brand} · ` : ''}
                      {hit.bestOffer?.supplier.name ?? hit.product.unit}
                    </div>
                  </div>
                  {hit.bestOffer ? (
                    <span className="text-xs font-bold text-ink shrink-0">{formatLKR(hit.bestOffer.priceCents)}</span>
                  ) : (
                    <span className="text-[11px] text-ink-4 shrink-0">Quote</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  ) : null;

  if (variant === 'hero') {
    return (
      <div ref={rootRef} className="relative max-w-xl">
        <form onSubmit={handleSubmit}>
          <label htmlFor={inputId} className="sr-only">
            Search the wholesale catalog
          </label>
          <div className="flex flex-col sm:flex-row bg-paper rounded-xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] focus-within:shadow-[0_0_0_2px_#C6DC4A,0_20px_50px_-20px_rgba(0,0,0,0.6)] transition-all">
            <div className="relative flex-1">
              <SearchIcon size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
              {input}
            </div>
            <Button type="submit" size="lg" className="m-1.5 sm:min-w-40 bg-ink text-paper hover:bg-ink-2">
              Search Catalog →
            </Button>
          </div>
        </form>
        {panel}
      </div>
    );
  }

  if (variant === 'header') {
    return (
      <div ref={rootRef} className="relative w-full min-w-0">
        <form onSubmit={handleSubmit} className="w-full">
          <label htmlFor={inputId} className="sr-only">
            Search the wholesale catalog
          </label>
          <div className="flex items-center gap-2 h-10 px-3 bg-paper border border-ink/15 rounded-lg focus-within:border-ink focus-within:ring-2 focus-within:ring-volt/40 transition-shadow duration-200">
            <SearchIcon size={16} className="text-ink-4 shrink-0 pointer-events-none" />
            {input}
          </div>
        </form>
        {panel}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex-1 min-w-0">
      <form onSubmit={handleSubmit} className="w-full">
        {input}
      </form>
      {panel}
    </div>
  );
}

export function HeaderCatalogSearch({
  className,
  placeholder = 'Search rice, sugar, tea, packaging…',
}: {
  className?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  return (
    <div className={cn('w-full min-w-0', className)}>
      <CatalogSearch
        variant="header"
        value={value}
        onChange={setValue}
        onSubmit={(query) => {
          navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
        }}
        placeholder={placeholder}
      />
    </div>
  );
}
