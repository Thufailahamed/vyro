import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { StoreIcon, Building2Icon, SearchIcon, MapPinIcon, MailIcon } from './icons';

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
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-lg bg-cyan/15 text-cyan-deep inline-flex items-center justify-center">
            <StoreIcon size={18} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Registered suppliers</h1>
            <p className="text-sm text-slate-500">Verified wholesale vendors and distributors</p>
          </div>
        </div>
        <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-paper border border-slate-200 text-slate-700 self-start sm:self-auto num-tabular">
          {data?.suppliers?.length ?? 0} total
        </span>
      </header>

      <Table rows={data?.suppliers ?? []} isLoading={isLoading} />
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
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-lg bg-violet/15 text-violet inline-flex items-center justify-center">
            <Building2Icon size={18} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Registered businesses</h1>
            <p className="text-sm text-slate-500">Verified procurement buyers and commercial accounts</p>
          </div>
        </div>
        <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-paper border border-slate-200 text-slate-700 self-start sm:self-auto num-tabular">
          {data?.businesses?.length ?? 0} total
        </span>
      </header>

      <Table rows={data?.businesses ?? []} isLoading={isLoading} />
    </div>
  );
}

function Table({ rows, isLoading }: { rows: any[]; isLoading?: boolean }) {
  const [query, setQuery] = useState('');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-paper rounded-md border border-slate-200 animate-pulse" />
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
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Filter by name, location, email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-9 pl-9 pr-3 text-sm rounded-md border border-slate-200 bg-paper placeholder:text-slate-400 focus:outline-none focus:border-cyan-deep focus:ring-2 focus:ring-cyan/30 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center bg-paper rounded-lg border border-dashed border-slate-200">
          <p className="text-base font-semibold text-slate-950">No records found</p>
          <p className="text-sm text-slate-500 mt-1">There are no entries matching your filter.</p>
        </div>
      ) : (
        <div className="bg-paper border border-slate-200 rounded-lg overflow-hidden shadow-soft-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-pearl border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-pearl transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-950">{r.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ID: {r.id.slice(0, 8)}…</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPinIcon size={12} className="text-slate-400" />
                        {r.city}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                        {r.district}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-cyan-deep hover:underline">
                        <MailIcon size={12} />
                        <span className="font-mono text-xs">{r.email}</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

void ApiError;
