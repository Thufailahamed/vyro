import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { MapPinIcon, MailIcon, ChevronDownIcon } from './icons';
import { useAdminTable } from '@/lib/useAdminTable';

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
  const table = useAdminTable<Supplier>({
    endpoint: '/admin/suppliers',
    queryKey: ['admin-suppliers'],
    rowKey: 'suppliers',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Registry"
        title="Registered suppliers"
        actions={
          <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-paper border border-ink/15 text-ink-3 self-start sm:self-auto num-tabular">
            {table.rows.length} loaded{table.hasMore ? '+' : ''}
          </span>
        }
      />
      <TableControls
        search={table.searchInput}
        onSearch={table.setSearchInput}
        status={table.filter.status ?? ''}
        onStatus={(v) => table.setFilter((f) => ({ ...f, status: v }))}
      />
      <Table
        rows={table.rows}
        isLoading={table.loading}
        kind="suppliers"
        loadMore={table.loadMore}
        hasMore={table.hasMore}
        fetchingMore={table.fetchingMore}
      />
    </div>
  );
}

export function BusinessesPage() {
  const table = useAdminTable<Business>({
    endpoint: '/admin/businesses',
    queryKey: ['admin-businesses'],
    rowKey: 'businesses',
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Registry"
        title="Registered businesses"
        actions={
          <span className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-paper border border-ink/15 text-ink-3 self-start sm:self-auto num-tabular">
            {table.rows.length} loaded{table.hasMore ? '+' : ''}
          </span>
        }
      />
      <TableControls
        search={table.searchInput}
        onSearch={table.setSearchInput}
        status={table.filter.status ?? ''}
        onStatus={(v) => table.setFilter((f) => ({ ...f, status: v }))}
      />
      <Table
        rows={table.rows}
        isLoading={table.loading}
        kind="businesses"
        loadMore={table.loadMore}
        hasMore={table.hasMore}
        fetchingMore={table.fetchingMore}
      />
    </div>
  );
}

function TableControls({
  search,
  onSearch,
  status,
  onStatus,
}: {
  search: string;
  onSearch: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1 max-w-md">
        <input
          type="text"
          placeholder="Filter by name…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full h-9 px-3 text-sm bg-paper placeholder:text-ink-4 focus:outline-none shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]"
        />
      </div>
      <div className="relative">
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          className="appearance-none h-9 pl-3 pr-8 text-sm bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <ChevronDownIcon size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-ink-4" />
      </div>
    </div>
  );
}

function Table({
  rows,
  isLoading,
  kind,
  loadMore,
  hasMore,
  fetchingMore,
}: {
  rows: (Supplier | Business)[];
  isLoading?: boolean;
  kind: 'suppliers' | 'businesses';
  loadMore: () => void;
  hasMore: boolean;
  fetchingMore: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-paper rounded-md border border-ink/15 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
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
                {rows.map((r) => {
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
          {hasMore && (
            <div className="border-t border-ink/10 p-3 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={fetchingMore}
                className="text-xs font-medium text-copper hover:text-ink disabled:opacity-50"
              >
                {fetchingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
