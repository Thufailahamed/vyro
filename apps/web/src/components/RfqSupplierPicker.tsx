import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api } from '@/lib/api';
import { CheckIcon, MapPinIcon, SearchIcon, ShieldCheckIcon, StoreIcon, UsersIcon, XIcon } from '@/components/icons';

export type PickedSupplier = {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  verified: boolean;
  reviewAvg: number | null;
  reviewCount: number;
};

type Row = { supplier: PickedSupplier; productCount: number; coverage: number };

export type RfqAudience = 'all' | 'selected';

/**
 * Who receives the RFQ: every supplier on VYRO, or a hand-picked list (one or many).
 * Suggestions are ranked by how many of the RFQ's catalog products each supplier sells.
 */
export function RfqSupplierPicker({
  audience,
  onAudience,
  selected,
  onSelected,
  productIds,
}: {
  audience: RfqAudience;
  onAudience: (a: RfqAudience) => void;
  selected: PickedSupplier[];
  onSelected: (s: PickedSupplier[]) => void;
  /** Catalog products on the RFQ — used to rank suggested suppliers. */
  productIds: string[];
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);

  const productKey = [...new Set(productIds)].sort().join(',');
  const search = useQuery({
    queryKey: ['rfq-supplier-search', debounced, productKey],
    queryFn: () =>
      api.get<{ suppliers: Row[] }>(
        `/rfqs/supplier-search?q=${encodeURIComponent(debounced)}&productIds=${encodeURIComponent(productKey)}`,
      ),
    enabled: audience === 'selected',
    staleTime: 30_000,
  });
  const rows = search.data?.suppliers ?? [];
  const selectedIds = new Set(selected.map((s) => s.id));
  const productTotal = productKey ? productKey.split(',').length : 0;

  function toggle(s: PickedSupplier) {
    onSelected(selectedIds.has(s.id) ? selected.filter((x) => x.id !== s.id) : [...selected, s]);
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Who should receive this RFQ" className="grid gap-2.5 sm:grid-cols-2">
        <AudienceOption
          active={audience === 'all'}
          onClick={() => onAudience('all')}
          icon={<UsersIcon size={16} />}
          title="All suppliers"
          body="Every active supplier on VYRO is notified and can quote. Best for the widest price range."
        />
        <AudienceOption
          active={audience === 'selected'}
          onClick={() => onAudience('selected')}
          icon={<StoreIcon size={16} />}
          title="Specific suppliers"
          body="Send privately to one supplier or a shortlist you pick. Only they can see and quote."
        />
      </div>

      {audience === 'selected' && (
        <div className="space-y-3 rounded-xl border border-ink/10 bg-paper p-3.5">
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink py-1 pl-3 pr-1.5 text-xs font-semibold text-paper"
                >
                  {s.name}
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    aria-label={`Remove ${s.name}`}
                    className="rounded-full p-0.5 text-paper/60 transition-colors hover:bg-paper/15 hover:text-paper"
                  >
                    <XIcon size={11} />
                  </button>
                </span>
              ))}
              {selected.length > 1 && (
                <button
                  type="button"
                  onClick={() => onSelected([])}
                  className="px-1.5 text-[11px] font-semibold text-ink-4 transition-colors hover:text-rose"
                >
                  Clear all
                </button>
              )}
            </div>
          ) : (
            <p className="rounded-lg bg-amber/[0.08] px-3 py-2 text-xs text-amber ring-1 ring-amber/20">
              Pick at least one supplier to send this RFQ to.
            </p>
          )}

          <div className="relative">
            <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suppliers by name, city or district…"
              aria-label="Search suppliers"
              className="h-10 w-full rounded-lg bg-bone/40 pl-9 pr-3 text-sm text-ink placeholder:text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)]"
            />
          </div>

          <div className="flex items-center justify-between px-0.5 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
            <span>{debounced ? `Results for “${debounced}”` : productTotal ? 'Suggested — sell your items' : 'Suppliers'}</span>
            {selected.length > 0 && <span className="text-ink-2">{selected.length} selected</span>}
          </div>

          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
            {search.isLoading ? (
              [0, 1, 2].map((i) => <li key={i} className="h-14 animate-pulse rounded-lg bg-ink/[0.05]" />)
            ) : rows.length === 0 ? (
              <li className="px-1 py-4 text-center text-sm text-ink-4">No suppliers match.</li>
            ) : (
              rows.map(({ supplier: s, productCount }) => {
                const on = selectedIds.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => toggle(s)}
                      aria-pressed={on}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                        on ? 'border-ink bg-ink/[0.04]' : 'border-ink/10 hover:border-ink/25 hover:bg-bone/40',
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                          on ? 'border-ink bg-ink text-volt' : 'border-ink/25 bg-paper',
                        )}
                      >
                        {on && <CheckIcon size={12} />}
                      </span>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink font-display text-sm font-bold text-volt">
                        {s.name.trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-ink-1">{s.name}</span>
                          {s.verified && <ShieldCheckIcon size={12} className="shrink-0 text-mint" aria-label="Verified" />}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-4">
                          <span className="inline-flex items-center gap-0.5">
                            <MapPinIcon size={10} />
                            {[s.city, s.district].filter(Boolean).join(', ') || '—'}
                          </span>
                          {s.reviewAvg != null && (
                            <span>
                              ★ {s.reviewAvg.toFixed(1)} ({s.reviewCount})
                            </span>
                          )}
                        </span>
                      </span>
                      {productTotal > 0 && (
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold',
                            productCount > 0 ? 'bg-volt-soft text-volt-deep' : 'bg-ink/[0.05] text-ink-4',
                          )}
                        >
                          {productCount}/{productTotal} items
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function AudienceOption({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all',
        active ? 'border-ink bg-ink/[0.04] ring-1 ring-volt/50' : 'border-ink/10 bg-paper hover:border-ink/30',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-ink text-volt' : 'bg-copper/10 text-copper',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-1">
          {title}
          <span
            className={cn(
              'flex size-4 items-center justify-center rounded-full border',
              active ? 'border-ink bg-ink' : 'border-ink/25',
            )}
          >
            {active && <span className="size-1.5 rounded-full bg-volt" />}
          </span>
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-3">{body}</span>
      </span>
    </button>
  );
}
