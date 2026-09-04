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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
            <StoreIcon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Registered Suppliers</h1>
            <p className="text-xs text-slate-500">Verified wholesale vendors and distributors</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 self-start sm:self-auto">
          {data?.suppliers?.length ?? 0} Total Suppliers
        </span>
      </div>

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
            <Building2Icon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Registered Businesses</h1>
            <p className="text-xs text-slate-500">Verified procurement buyers and commercial accounts</p>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 self-start sm:self-auto">
          {data?.businesses?.length ?? 0} Total Businesses
        </span>
      </div>

      <Table rows={data?.businesses ?? []} isLoading={isLoading} />
    </div>
  );
}

function Table({ rows, isLoading }: { rows: any[]; isLoading?: boolean }) {
  const [query, setQuery] = useState('');

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-white rounded-xl border border-slate-200 animate-pulse" />
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
      {/* Search filter bar */}
      <div className="relative max-w-sm">
        <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Filter by name, location, email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-soft-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/90 shadow-soft-sm text-slate-500">
          <p className="text-sm font-semibold text-slate-800">No records found</p>
          <p className="text-xs text-slate-500 mt-0.5">There are no entries matching your filter or database query.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-soft-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="py-3 px-4">Entity Name</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-4">Direct Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {r.name}
                      <div className="text-[10px] text-slate-600 font-mono font-normal">ID: {r.id.slice(0, 8)}...</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon size={12} className="text-slate-400" />
                        {r.city}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {r.district}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
                        <MailIcon size={12} />
                        <span>{r.email}</span>
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
