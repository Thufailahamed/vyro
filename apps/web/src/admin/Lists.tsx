import { useState, useMemo, useEffect, type Dispatch, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { Button } from '@/components/ui';
import {
  StoreIcon,
  Building2Icon,
  ShieldCheckIcon,
  AlertCircleIcon,
  MapPinIcon,
} from './icons';
import { SearchIcon, ClockIcon, ArrowRightIcon, RefreshCwIcon, XIcon } from '@/components/icons';
import { useAdminTable } from '@/lib/useAdminTable';
import { useQueryClient } from '@tanstack/react-query';
import { usePermission } from './lib/permissions';
import {
  useBulkBusinessesSuspend,
  useBulkBusinessesUnsuspend,
  type BulkResult,
} from './useBulkAction';
import { BulkActionBar } from './BulkActionBar';
import { BulkConfirmDialog } from './BulkConfirmDialog';
import { BulkResultDialog } from './BulkResultDialog';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  CellStack,
  EmptyBlock,
  Pill,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Toolbar,
  controlClass,
} from './ui';

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

interface RegistryTableHandle {
  rows: (Supplier | Business)[];
  loading: boolean;
  fetchingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: boolean;
  isFetching: boolean;
  refetch: () => void;
  filter: Record<string, string>;
  setFilter: Dispatch<SetStateAction<Record<string, string>>>;
  searchInput: string;
  setSearchInput: (v: string) => void;
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
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Registry</span>
            <span className="text-ink-5">/</span>
            <span>Wholesale Facilities</span>
          </>
        }
        title="Registered Suppliers"
        description="Audit, verify, and moderate primary agricultural millers, tea estates, certified food importers, and authorized wholesale distribution hubs across Sri Lanka."
        actions={
          <>
            <Pill tone="brand" dot>
              Verified mill ledger
            </Pill>
            <Button
              variant="secondary"
              size="sm"
              onClick={table.refetch}
              loading={table.isFetching && !table.loading}
              icon={table.isFetching ? undefined : <RefreshCwIcon size={14} />}
            >
              Refresh
            </Button>
          </>
        }
      />

      <StatGrid cols={5}>
        <StatCard label="Wholesale hubs" value={stats.total} sub="Registered facilities" icon={<StoreIcon size={16} />} loading={table.loading} />
        <StatCard
          label="Verified & active"
          value={stats.verified}
          sub="Passed compliance audits"
          icon={<ShieldCheckIcon size={16} />}
          tone={stats.verified > 0 ? 'success' : 'neutral'}
          loading={table.loading}
        />
        <StatCard
          label="Pending review"
          value={stats.pending}
          sub="Awaiting certificate checks"
          icon={<ClockIcon size={16} />}
          tone={stats.pending > 0 ? 'warning' : 'neutral'}
          loading={table.loading}
        />
        <StatCard
          label="Suspended"
          value={stats.suspended}
          sub="Access held"
          icon={<AlertCircleIcon size={16} />}
          tone={stats.suspended > 0 ? 'danger' : 'neutral'}
          loading={table.loading}
        />
        <StatCard
          label="Regional coverage"
          value={stats.districts}
          sub="Districts served"
          icon={<MapPinIcon size={16} />}
          loading={table.loading}
        />
      </StatGrid>

      <RegistryTable
        kind="suppliers"
        table={table}
        placeholder="Filter by supplier name, contact, city…"
      />
    </AdminPage>
  );
}

export function BusinessesPage() {
  const qc = useQueryClient();
  const table = useAdminTable<Business>({
    endpoint: '/admin/businesses',
    queryKey: ['admin-businesses'],
    rowKey: 'businesses',
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [table.searchInput]);

  const canSuspend = usePermission('user:suspend');
  const bulkSuspend = useBulkBusinessesSuspend(qc);
  const bulkUnsuspend = useBulkBusinessesUnsuspend(qc);

  type ConfirmKind = 'suspend' | 'unsuspend';
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  const rows = table.rows;
  const exceedsCap = rows.length > 100;

  const stats = useMemo(() => {
    const active = rows.filter((b) => b.status !== 'suspended').length;
    const suspended = rows.filter((b) => b.status === 'suspended').length;
    const districts = new Set(rows.map((b) => b.district).filter(Boolean)).size;
    return { total: rows.length, active, suspended, districts };
  }, [rows]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const ids = [...selected];
  const runBulk = () => {
    if (!confirmKind || ids.length === 0) { setConfirmKind(null); return; }
    const onDone = (r: BulkResult) => { setResult(r); setSelected(new Set()); setConfirmKind(null); };
    if (confirmKind === 'suspend') bulkSuspend.mutate({ ids }, { onSuccess: onDone });
    else bulkUnsuspend.mutate({ ids }, { onSuccess: onDone });
  };

  const bulkActions = canSuspend ? [
    { label: 'Suspend', run: () => setConfirmKind('suspend'), destructive: true, disabled: bulkSuspend.isPending },
    { label: 'Unsuspend', run: () => setConfirmKind('unsuspend'), disabled: bulkUnsuspend.isPending },
  ] : [];

  return (
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Registry</span>
            <span className="text-ink-5">/</span>
            <span>Purchasing Entities</span>
          </>
        }
        title="Registered Businesses"
        description="Manage commercial purchasing accounts across hotel groups, restaurant chains, regional supermarket retailers, and institutional buyers."
        actions={
          <>
            <Pill tone="brand" dot>
              SVAT invoicing ledger
            </Pill>
            <Button
              variant="secondary"
              size="sm"
              onClick={table.refetch}
              loading={table.isFetching && !table.loading}
              icon={table.isFetching ? undefined : <RefreshCwIcon size={14} />}
            >
              Refresh
            </Button>
          </>
        }
      />

      <StatGrid cols={4}>
        <StatCard label="Commercial buyers" value={stats.total} sub="Registered purchasing entities" icon={<Building2Icon size={16} />} loading={table.loading} />
        <StatCard
          label="Active accounts"
          value={stats.active}
          sub="Eligible to issue POs"
          icon={<ShieldCheckIcon size={16} />}
          tone={stats.active > 0 ? 'success' : 'neutral'}
          loading={table.loading}
        />
        <StatCard
          label="Suspended"
          value={stats.suspended}
          sub="Access temporarily held"
          icon={<AlertCircleIcon size={16} />}
          tone={stats.suspended > 0 ? 'danger' : 'neutral'}
          loading={table.loading}
        />
        <StatCard
          label="Regional operations"
          value={stats.districts}
          sub="Distribution destinations"
          icon={<MapPinIcon size={16} />}
          loading={table.loading}
        />
      </StatGrid>

      <RegistryTable
        kind="businesses"
        table={table}
        placeholder="Filter by business name, contact, city…"
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
        exceedsCap={exceedsCap}
      />

      {bulkActions.length > 0 ? (
        <BulkActionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          actions={bulkActions}
        />
      ) : null}

      <BulkConfirmDialog
        open={confirmKind !== null}
        count={selected.size}
        action={confirmKind === 'suspend' ? 'Suspend' : 'Unsuspend'}
        onCancel={() => setConfirmKind(null)}
        onConfirm={() => runBulk()}
      />

      <BulkResultDialog
        open={result !== null}
        result={result}
        onClose={() => setResult(null)}
      />
    </AdminPage>
  );
}

function RegistryTable({
  kind,
  table,
  placeholder = 'Filter by name…',
  selected,
  onToggle,
  onToggleAll,
  exceedsCap,
}: {
  kind: 'suppliers' | 'businesses';
  table: RegistryTableHandle;
  placeholder?: string;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  exceedsCap?: boolean;
}) {
  const rows = table.rows;
  const noun = kind === 'suppliers' ? 'supplier' : 'business';
  const filtered = table.searchInput.trim() !== '' || !!table.filter.status;
  const resetFilters = () => {
    table.setSearchInput('');
    table.setFilter((f) => ({ ...f, status: '' }));
  };

  return (
    <TableCard
      title={kind === 'suppliers' ? 'Supplier ledger' : 'Buyer ledger'}
      toolbar={
        <Toolbar
          actions={
            <select
              value={table.filter.status ?? ''}
              onChange={(e) => table.setFilter((f) => ({ ...f, status: e.target.value }))}
              className={cn(controlClass, 'w-auto')}
              aria-label="Filter by operating status"
            >
              <option value="">All operating statuses</option>
              <option value="active">Active accounts</option>
              <option value="suspended">Suspended accounts</option>
            </select>
          }
        >
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="text"
              placeholder={placeholder}
              value={table.searchInput}
              onChange={(e) => table.setSearchInput(e.target.value)}
              className={cn(controlClass, 'w-full pl-9 pr-8')}
            />
            {table.searchInput ? (
              <button
                type="button"
                onClick={() => table.setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
                title="Clear search"
                aria-label="Clear search"
              >
                <XIcon size={14} />
              </button>
            ) : null}
          </div>
        </Toolbar>
      }
      footer={
        <>
          <span>
            Showing <strong className="text-ink">{rows.length}</strong> {noun}
            {rows.length === 1 ? '' : 's'}
            {filtered ? ' · filters applied' : ''}
            {table.hasMore ? ' · more available' : ''}
          </span>
          <span className="flex items-center gap-3">
            {filtered ? (
              <button type="button" onClick={resetFilters} className="font-semibold text-copper transition-colors hover:text-ink">
                Reset filters
              </button>
            ) : null}
            {table.hasMore ? (
              <Button variant="secondary" size="sm" onClick={table.loadMore} loading={table.fetchingMore}>
                Load next page
              </Button>
            ) : null}
          </span>
        </>
      }
    >
      {table.error ? (
        <Callout
          tone="danger"
          className="m-4 sm:m-6"
          title={`Couldn't load ${noun}s`}
          action={
            <Button variant="secondary" size="sm" onClick={table.refetch}>
              Retry
            </Button>
          }
        >
          The registry API didn't respond. Check the service and try again.
        </Callout>
      ) : null}
      {table.loading ? (
        <TableSkeleton rows={6} cols={selected ? 6 : 5} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          icon={kind === 'suppliers' ? <StoreIcon size={22} /> : <Building2Icon size={22} />}
          title="No records found"
          description={
            filtered
              ? 'No registered entities match the current search or status filter.'
              : `There are no ${noun}s in the registry yet.`
          }
          action={
            filtered ? (
              <Button variant="secondary" size="sm" onClick={resetFilters}>
                Reset all filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              {selected && onToggle && onToggleAll ? (
                <th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selected.size > 0 && selected.size === rows.length}
                    disabled={!!exceedsCap}
                    title={exceedsCap ? 'Bulk actions cap at 100 — refine filter' : undefined}
                    onChange={onToggleAll}
                    className="accent-ink"
                  />
                </th>
              ) : null}
              <th>Entity &amp; ID</th>
              <th>Location &amp; district</th>
              <th>Direct contact</th>
              <th>Compliance status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSup = kind === 'suppliers';
              const sup = isSup ? (r as Supplier) : null;
              const detailPath = isSup ? `/admin/suppliers/${r.id}` : `/admin/businesses/${r.id}`;
              const isSuspended = r.status === 'suspended';
              const isVerified = sup?.verificationStatus === 'verified';
              const isPending = sup?.verificationStatus === 'pending';

              return (
                <tr key={r.id}>
                  {selected && onToggle ? (
                    <td className="w-10">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        checked={selected.has(r.id)}
                        onChange={() => onToggle(r.id)}
                        className="accent-ink"
                      />
                    </td>
                  ) : null}
                  <td>
                    <Link to={detailPath} className="group/entity block">
                      <span className="flex items-center gap-1.5 font-medium text-ink transition-colors group-hover/entity:text-copper">
                        <span className="truncate">{r.name}</span>
                        {isVerified ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-mint" title="Verified facility" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block max-w-[220px] truncate font-mono text-[11px] text-ink-4">
                        ID: {r.id}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <CellStack primary={r.city} secondary={r.district || undefined} />
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      {r.contactPerson ? <div className="text-xs font-medium text-ink">{r.contactPerson}</div> : null}
                      <a
                        href={`mailto:${r.email}`}
                        className="block max-w-[200px] truncate font-mono text-[11px] text-copper transition-colors hover:text-ink"
                      >
                        {r.email}
                      </a>
                      {r.phone ? (
                        <a
                          href={`tel:${r.phone}`}
                          className="block font-mono text-[11px] text-ink-4 transition-colors hover:text-ink"
                        >
                          {r.phone}
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1.5">
                      {isSup ? (
                        isVerified ? (
                          <Pill tone="success" dot>
                            Verified
                          </Pill>
                        ) : isPending ? (
                          <Pill tone="warning" dot>
                            Pending KYC
                          </Pill>
                        ) : (
                          <Pill tone="neutral">Standard</Pill>
                        )
                      ) : null}
                      <Pill tone={isSuspended ? 'danger' : 'success'} dot>
                        {isSuspended ? 'Suspended' : 'Active'}
                      </Pill>
                    </div>
                  </td>
                  <td className="text-right">
                    <Link
                      to={detailPath}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-colors hover:bg-ink hover:text-paper"
                    >
                      Manage
                      <ArrowRightIcon size={12} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </TableCard>
  );
}
