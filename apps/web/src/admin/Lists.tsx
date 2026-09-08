import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import {
  MapPinIcon,
  MailIcon,
  ChevronDownIcon,
  StoreIcon,
  Building2Icon,
  ShieldCheckIcon,
  AlertCircleIcon,
} from './icons';
import { PhoneIcon, SearchIcon, CheckCircleIcon, ClockIcon, ArrowRightIcon } from '@/components/icons';
import { useAdminTable } from '@/lib/useAdminTable';

interface Supplier {
  id: string;
  name: string;
  city: string;
  district: string;
  email: string;
  phone?: string;
  contactPerson?: string;
  verificationStatus?: 'pending' | 'verified' | 'rejected' | 'suspended';
  status?: 'active' | 'suspended';
  createdAt?: number;
}

interface Business {
  id: string;
  name: string;
  city: string;
  district: string;
  email: string;
  phone?: string;
  contactPerson?: string;
  status?: 'active' | 'suspended';
  createdAt?: number;
}

export function SuppliersPage() {
  const table = useAdminTable<Supplier>({
    endpoint: '/admin/suppliers',
    queryKey: ['admin-suppliers'],
    rowKey: 'suppliers',
  });

  const rows = table.rows;

  const stats = useMemo(() => {
    const verified = rows.filter((s) => s.verificationStatus === 'verified' || (!s.verificationStatus && s.status !== 'suspended')).length;
    const pending = rows.filter((s) => s.verificationStatus === 'pending').length;
    const suspended = rows.filter((s) => s.status === 'suspended' || s.verificationStatus === 'suspended').length;
    const districts = new Set(rows.map((s) => s.district).filter(Boolean)).size;
    return { total: rows.length, verified, pending, suspended, districts };
  }, [rows]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Executive Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Registry</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">Wholesale Facilities</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Verified Mill Ledger
            </span>
          </div>
        }
        title="Registered Suppliers"
        sub="Audit, verify, and moderate primary agricultural millers, tea estates, certified food importers, and authorized wholesale distribution hubs across Sri Lanka."
        actions={
          <span className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-mono font-bold bg-paper border border-ink/15 text-ink shadow-sm">
            <StoreIcon size={14} className="text-volt-deep" />
            <span>{table.rows.length} Facilities Loaded{table.hasMore ? '+' : ''}</span>
          </span>
        }
      />

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Total Wholesale Hubs
          </div>
          <div className="vyro-metric text-3xl font-bold text-ink">{stats.total}</div>
          <div className="text-[10px] text-ink-4">Registered facilities</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Verified & Active
          </div>
          <div className="vyro-metric text-3xl font-bold text-mint flex items-center gap-2">
            <span>{stats.verified}</span>
            <span className="size-2 rounded-full bg-mint" />
          </div>
          <div className="text-[10px] text-ink-4">Passed compliance audits</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Pending Review
          </div>
          <div className="vyro-metric text-3xl font-bold text-amber">{stats.pending}</div>
          <div className="text-[10px] text-ink-4">Awaiting certificate checks</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Regional Coverage
          </div>
          <div className="vyro-metric text-3xl font-bold text-ink">{stats.districts} Districts</div>
          <div className="text-[10px] text-ink-4">Milling & logistics depots</div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <TableControls
        search={table.searchInput}
        onSearch={table.setSearchInput}
        status={table.filter.status ?? ''}
        onStatus={(v) => table.setFilter((f) => ({ ...f, status: v }))}
        placeholder="Filter by supplier name, contact, city…"
      />

      {/* Main Table Ledger */}
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

  const rows = table.rows;

  const stats = useMemo(() => {
    const active = rows.filter((b) => b.status !== 'suspended').length;
    const suspended = rows.filter((b) => b.status === 'suspended').length;
    const districts = new Set(rows.map((b) => b.district).filter(Boolean)).size;
    return { total: rows.length, active, suspended, districts };
  }, [rows]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Executive Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Registry</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">Purchasing Entities</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              SVAT Invoicing Ledger
            </span>
          </div>
        }
        title="Registered Businesses"
        sub="Manage commercial purchasing accounts across hotel groups, restaurant chains, regional supermarket retailers, and institutional buyers."
        actions={
          <span className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-mono font-bold bg-paper border border-ink/15 text-ink shadow-sm">
            <Building2Icon size={14} className="text-copper" />
            <span>{table.rows.length} Buyers Loaded{table.hasMore ? '+' : ''}</span>
          </span>
        }
      />

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Total Commercial Buyers
          </div>
          <div className="vyro-metric text-3xl font-bold text-ink">{stats.total}</div>
          <div className="text-[10px] text-ink-4">Registered purchasing entities</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Active Purchasing Accounts
          </div>
          <div className="vyro-metric text-3xl font-bold text-mint">{stats.active}</div>
          <div className="text-[10px] text-ink-4">Eligible to issue POs</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Suspended Accounts
          </div>
          <div className="vyro-metric text-3xl font-bold text-rose">{stats.suspended}</div>
          <div className="text-[10px] text-ink-4">Access temporarily held</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Regional Operations
          </div>
          <div className="vyro-metric text-3xl font-bold text-ink">{stats.districts} Districts</div>
          <div className="text-[10px] text-ink-4">Distribution destinations</div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <TableControls
        search={table.searchInput}
        onSearch={table.setSearchInput}
        status={table.filter.status ?? ''}
        onStatus={(v) => table.setFilter((f) => ({ ...f, status: v }))}
        placeholder="Filter by business name, contact, city…"
      />

      {/* Main Table Ledger */}
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
  placeholder = 'Filter by name…',
}: {
  search: string;
  onSearch: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full h-10 pl-10 pr-3 text-sm bg-paper placeholder:text-ink-4 focus:outline-none border border-ink/15 focus:border-ink shadow-sm"
        />
      </div>
      <div className="relative shrink-0">
        <select
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          className="appearance-none h-10 pl-3.5 pr-9 text-xs font-mono font-medium bg-paper border border-ink/15 focus:border-ink focus:outline-none cursor-pointer shadow-sm"
        >
          <option value="">All Operating Statuses</option>
          <option value="active">Active Accounts</option>
          <option value="suspended">Suspended Accounts</option>
        </select>
        <ChevronDownIcon size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink-4" />
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
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-paper border border-ink/10 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <div className="p-12 text-center bg-paper border border-ink/15 shadow-sm space-y-3">
          <div className="size-12 bg-bone text-ink-3 mx-auto flex items-center justify-center">
            {kind === 'suppliers' ? <StoreIcon size={22} /> : <Building2Icon size={22} />}
          </div>
          <h3 className="vyro-display text-xl text-ink font-bold">No records found</h3>
          <p className="text-xs text-ink-4">No matching registered entities in this view filter.</p>
        </div>
      ) : (
        <div className="bg-paper border border-ink/15 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink/15 bg-bone/70 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                  <th className="py-3 px-4">Entity & ID</th>
                  <th className="py-3 px-4">Location & District</th>
                  <th className="py-3 px-4">Direct Contact</th>
                  <th className="py-3 px-4">Compliance Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {rows.map((r) => {
                  const isSup = kind === 'suppliers';
                  const sup = isSup ? (r as Supplier) : null;
                  const detailPath = isSup ? `/admin/suppliers/${r.id}` : `/admin/businesses/${r.id}`;
                  const isSuspended = r.status === 'suspended';
                  const isVerified = sup?.verificationStatus === 'verified';
                  const isPending = sup?.verificationStatus === 'pending';

                  return (
                    <tr key={r.id} className="hover:bg-bone/40 transition-colors group">
                      <td className="py-3.5 px-4">
                        <Link to={detailPath} className="block group-hover:text-copper transition-colors">
                          <div className="font-display font-semibold text-ink text-base flex items-center gap-2">
                            <span>{r.name}</span>
                            {isVerified && (
                              <span className="size-2 rounded-full bg-emerald-500 shrink-0" title="Verified Facility" />
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-ink-4 mt-0.5">
                            ID: {r.id}
                          </div>
                        </Link>
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="flex items-center gap-1.5 font-medium text-ink">
                          <MapPinIcon size={13} className="text-copper shrink-0" />
                          <span>{r.city}</span>
                        </div>
                        <div className="mt-1">
                          <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-mist text-ink border border-line">
                            {r.district}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs space-y-1">
                        {r.contactPerson && (
                          <div className="font-medium text-ink text-[11px]">
                            {r.contactPerson}
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5">
                          <a
                            href={`mailto:${r.email}`}
                            className="inline-flex items-center gap-1.5 text-copper hover:text-ink font-mono text-xs transition-colors"
                          >
                            <MailIcon size={12} className="shrink-0" />
                            <span className="truncate max-w-[190px]">{r.email}</span>
                          </a>
                          {r.phone && (
                            <a
                              href={`tel:${r.phone}`}
                              className="inline-flex items-center gap-1.5 text-ink-4 hover:text-ink font-mono text-[11px] transition-colors"
                            >
                              <PhoneIcon size={11} className="shrink-0" />
                              <span>{r.phone}</span>
                            </a>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          {isSup ? (
                            isVerified ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-mint/15 text-mint border border-mint/25">
                                <CheckCircleIcon size={11} /> Verified
                              </span>
                            ) : isPending ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-amber/15 text-amber border border-amber/25">
                                <ClockIcon size={11} /> Pending KYC
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-mist text-ink-4 border border-line">
                                Standard
                              </span>
                            )
                          ) : null}

                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider ${
                              isSuspended
                                ? 'bg-rose/15 text-rose border border-rose/30'
                                : 'bg-bone text-ink-3 border border-ink/10'
                            }`}
                          >
                            <span className={`size-1.5 rounded-full ${isSuspended ? 'bg-rose' : 'bg-emerald-500'}`} />
                            {isSuspended ? 'Suspended' : 'Active Account'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Link
                          to={detailPath}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-bone hover:bg-ink hover:text-paper border border-ink/15 transition-all group-hover:border-ink"
                        >
                          <span>Manage</span>
                          <ArrowRightIcon size={12} className="opacity-60 group-hover:opacity-100" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="border-t border-ink/10 p-4 text-center bg-bone/30">
              <button
                type="button"
                onClick={loadMore}
                disabled={fetchingMore}
                className="text-xs font-mono font-bold uppercase tracking-wider text-ink hover:text-copper disabled:opacity-50 px-4 py-2 border border-ink/15 hover:border-ink bg-paper transition-all"
              >
                {fetchingMore ? 'Loading More Records…' : 'Load Next Page ↓'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
