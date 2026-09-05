import { forwardRef, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch, type SearchResults } from './useGlobalSearch';

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
    <div ref={wrapperRef} className="relative w-full max-w-xs">
      <input
        ref={ref}
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search… (⌘K)"
        aria-label="Global admin search"
        className="w-full text-sm bg-paper/5 border border-paper/10 rounded px-2 py-1 text-paper placeholder:text-paper/40 focus:outline-none focus:border-volt"
      />
      {open && q.length >= 2 ? (
        <div className="absolute z-50 right-0 mt-1 w-96 max-h-96 overflow-y-auto bg-void border border-paper/10 rounded shadow-lg">
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
            <Row key={s.id} onClick={() => onGo(`/admin/suppliers`)}>
              <span>{s.name}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.businesses && data.businesses.length ? (
        <Group label="Businesses">
          {data.businesses.map((b) => (
            <Row key={b.id} onClick={() => onGo(`/admin/businesses`)}>
              <span>{b.name}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.products && data.products.length ? (
        <Group label="Products">
          {data.products.map((p) => (
            <Row key={p.id} onClick={() => onGo(`/admin/catalog`)}>
              <span>{p.name}</span>
            </Row>
          ))}
        </Group>
      ) : null}
      {data.orders && data.orders.length ? (
        <Group label="Orders">
          {data.orders.map((o) => (
            <Row key={o.id} onClick={() => onGo(`/admin/disputed`)}>
              <span className="font-mono text-xs">{o.poNumber}</span>
              <span className="text-xs text-paper/40">{o.status}</span>
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
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-paper/40">{label}</div>
      {children}
    </div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-paper/5 text-left text-paper"
    >
      {children}
    </button>
  );
}
