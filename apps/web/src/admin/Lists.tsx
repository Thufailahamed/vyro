import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { SearchIcon, MapPinIcon, MailIcon } from './icons';

interface Supplier {
  id: string;
  name: string;
  city: string;
  district: string;
  email: string;
}

interface Business {
  id: string;
  name: string;
  city: string;
  district: string;
  email: string;
}

export function SuppliersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn: () => api.get<{ suppliers: Supplier[] }>('/admin/suppliers'),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Registry"
        title="Registered suppliers"
        actions={
          <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-paper border border-ink/15 text-ink-3 self-start sm:self-auto num-tabular">
            {data?.suppliers?.length ?? 0} total
          </span>
        }
      />

      <Table rows={data?.suppliers ?? []} isLoading={isLoading} kind="suppliers" />
    </div>
  );
}

export function BusinessesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-businesses'],
    queryFn: () => api.get<{ businesses: Business[] }>('/admin/businesses'),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Registry"
        title="Registered businesses"
        actions={
          <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-paper border border-ink/15 text-ink-3 self-start sm:self-auto num-tabular">
            {data?.businesses?.length ?? 0} total
          </span>
        }
      />

      <Table rows={data?.businesses ?? []} isLoading={isLoading} kind="businesses" />
    </div>
  );
}

function Table({ rows, isLoading, kind }: { rows: any[]; isLoading?: boolean; kind: 'suppliers' | 'businesses' }) {
  const [query, setQuery] = useState('');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-paper rounded-md border border-ink/15 animate-pulse" />
        ))}
      </div>
    );
  }

  const filtered = rows.filter((r) => {
    const s = `${r.name} ${r.city} ${r.district} ${r.email}`.toLowerCase();
    return s.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
        <input
          type="text"
          placeholder="Filter by name, location, email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-9 pl-9 pr-3 text-sm bg-paper placeholder:text-ink-4 focus:outline-none shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center bg-paper">
          <p className="vyro-display text-2xl">No records found</p>
        </div>
      ) : (
        <div className="bg-paper overflow-hidden shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                <tr>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {filtered.map((r) => {
                  const detailPath =
                    kind === 'suppliers' ? `/admin/suppliers/${r.id}` : `/admin/businesses/${r.id}`;
                  return (
                  <tr key={r.id} className="hover:bg-mist/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <Link to={detailPath} className="block">
                        <div className="font-medium text-ink hover:text-copper">{r.name}</div>
                        <div className="text-[10px] text-ink-4 vyro-metric">ID: {r.id.slice(0, 8)}…</div>
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-ink-3">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPinIcon size={12} className="text-ink-4" />
                        {r.city}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-mist text-ink-3">
                        {r.district}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-ink-3">
                      <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-copper hover:text-ink">
                        <MailIcon size={12} />
                        <span className="font-mono text-xs">{r.email}</span>
                      </a>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

void ApiError;
