import { forwardRef, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch, type SearchResults } from './useGlobalSearch';
import { SearchIcon } from '@/components/icons';

export const GlobalSearchBar = forwardRef<HTMLInputElement>(function GlobalSearchBar(_props, ref) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { data } = useGlobalSearch(q);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function go(path: string) {
    setOpen(false);
    setQ('');
    navigate(path);
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-paper/35">
          <SearchIcon size={14} />
        </span>
        <input
          ref={ref}
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search controls..."
          aria-label="Global admin search"
          className="h-9 w-full rounded-[10px] bg-paper/[0.04] pl-8 pr-10 text-[13px] text-paper shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)] placeholder:text-paper/35 transition-all duration-200 hover:bg-paper/[0.06] focus:bg-paper/[0.07] focus:outline-none focus:shadow-[inset_0_0_0_1px_rgba(198,220,74,0.6),0_0_0_3px_rgba(198,220,74,0.12)]"
        />
        <kbd className="pointer-events-none absolute right-2 rounded-md bg-paper/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-paper/45 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.1)]">
          ⌘K
        </kbd>
      </div>

      {open && q.length >= 2 ? (
        <div className="absolute left-0 z-50 mt-2 max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl bg-[#121410]/95 shadow-[0_0_0_1px_rgba(250,247,240,0.1),0_24px_48px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl scrollbar-dark animate-fade-in">
          <SearchResultsView data={data ?? {}} onGo={go} />
        </div>
      ) : null}
    </div>
  );
});

function SearchResultsView({ data, onGo }: { data: SearchResults; onGo: (path: string) => void }) {
  const hasAny = Object.values(data).some((arr) => Array.isArray(arr) && arr.length > 0);
  if (!hasAny) {
    return <div className="p-3 text-xs text-paper/40">No results</div>;
  }
  return (
    <div className="text-sm">
      {data.users && data.users.length ? (
        <Group label="Users">
          {data.users.map((u) => (
            <Row key={u.id} onClick={() => onGo(`/admin/users`)}>
              <span className="font-mono text-xs">{u.email}</span>
              <span className="text-xs text-paper/40">{u.role}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.suppliers && data.suppliers.length ? (
        <Group label="Suppliers">
          {data.suppliers.map((s) => (
            <Row key={s.id} onClick={() => onGo(`/admin/suppliers/${s.id}`)}>
              <span>{s.name}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.businesses && data.businesses.length ? (
        <Group label="Businesses">
          {data.businesses.map((b) => (
            <Row key={b.id} onClick={() => onGo(`/admin/businesses/${b.id}`)}>
              <span>{b.name}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.products && data.products.length ? (
        <Group label="Products">
          {data.products.map((p) => (
            <Row key={p.id} onClick={() => onGo(`/admin/catalog/products/${p.id}`)}>
              <span>{p.name}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.orders && data.orders.length ? (
        <Group label="Orders">
          {data.orders.map((o) => (
            <Row key={o.id} onClick={() => onGo(`/admin/orders/${o.id}`)}>
              <span className="font-mono text-xs">{o.poNumber}</span>
              <span className="text-xs text-paper/40">{o.status}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.invoices && data.invoices.length ? (
        <Group label="Invoices">
          {data.invoices.map((i) => (
            <Row key={i.id} onClick={() => onGo(`/admin/finance`)}>
              <span className="font-mono text-xs">{i.number}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.deliveries && data.deliveries.length ? (
        <Group label="Deliveries">
          {data.deliveries.map((d) => (
            <Row key={d.id} onClick={() => onGo(`/admin/deliveries`)}>
              <span className="font-mono text-xs">{d.id}</span>
              <span className="text-xs text-paper/40">{d.status}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.abuseReports && data.abuseReports.length ? (
        <Group label="Abuse reports">
          {data.abuseReports.map((r) => (
            <Row key={r.id} onClick={() => onGo(`/admin/trust-safety`)}>
              <span>{r.reason}</span>
              <span className="text-xs text-paper/40">{r.status}</span>
            </Row>
          ))}
        </Group>
      ) : null}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-paper/10 last:border-0">
      <div className="px-3 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-paper/35">{label}</div>
      {children}
    </div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-paper transition-colors hover:bg-volt/[0.08] hover:text-volt"
    >
      {children}
    </button>
  );
}
