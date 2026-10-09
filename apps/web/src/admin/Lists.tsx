import { useState, useMemo, useEffect, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { Button } from '@/components/ui';
import {
  StoreIcon,
  Building2Icon,
  ShieldCheckIcon,
  AlertCircleIcon,
  MapPinIcon,
} from './icons';
import {
  SearchIcon,
  ClockIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  XIcon,
  CheckIcon,
  CheckCircleIcon,
  MailIcon,
  PhoneIcon,
} from '@/components/icons';
import { CopyId, Monogram, SegmentBar, formatDate, relativeTime } from './registryUi';
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
  Skeleton,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
  type TabItem,
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

type ComplianceKey = 'all' | 'verified' | 'pending' | 'rejected' | 'suspended';

function complianceOf(s: Supplier): Exclude<ComplianceKey, 'all'> | 'standard' {
  if (s.status === 'suspended' || s.verificationStatus === 'suspended') return 'suspended';
  if (s.verificationStatus === 'verified') return 'verified';
  if (s.verificationStatus === 'pending') return 'pending';
  if (s.verificationStatus === 'rejected') return 'rejected';
  return 'standard';
}

const DAY_MS = 86_400_000;

export function SuppliersPage() {
  const table = useAdminTable<Supplier>({
    endpoint: '/admin/suppliers',
    queryKey: ['admin-suppliers'],
    rowKey: 'suppliers',
  });
  const [compliance, setCompliance] = useState<ComplianceKey>('all');

  const rows = table.rows;

  const stats = useMemo(() => {
    const counts = { verified: 0, pending: 0, rejected: 0, suspended: 0, standard: 0 };
    for (const s of rows) counts[complianceOf(s)]++;
    const districts = new Set(rows.map((s) => s.district).filter(Boolean)).size;
    const since = Date.now() - 30 * DAY_MS;
    const recent = rows.filter((s) => (s.createdAt ?? 0) >= since).length;
    const queue = rows
      .filter((s) => complianceOf(s) === 'pending')
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return { total: rows.length, ...counts, districts, recent, queue };
  }, [rows]);

  const visibleRows = useMemo(
    () => (compliance === 'all' ? rows : rows.filter((s) => complianceOf(s) === compliance)),
    [rows, compliance],
  );

  const verifiedPct = stats.total ? Math.round((stats.verified / stats.total) * 100) : 0;
  const segments = [
    { key: 'verified', label: 'Verified', value: stats.verified, className: 'bg-mint', dot: 'bg-mint' },
    { key: 'pending', label: 'Pending KYC', value: stats.pending, className: 'bg-amber', dot: 'bg-amber' },
    { key: 'rejected', label: 'Rejected', value: stats.rejected, className: 'bg-rose', dot: 'bg-rose' },
    { key: 'suspended', label: 'Suspended', value: stats.suspended, className: 'bg-ink', dot: 'bg-ink' },
    { key: 'standard', label: 'Unreviewed', value: stats.standard, className: 'bg-ink-5', dot: 'bg-ink-5' },
  ] as const;

  const tabs: TabItem<ComplianceKey>[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'verified', label: 'Verified', count: stats.verified },
    { key: 'pending', label: 'Pending KYC', count: stats.pending },
    { key: 'rejected', label: 'Rejected', count: stats.rejected },
    { key: 'suspended', label: 'Suspended', count: stats.suspended },
  ];

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
          <Button
            variant="secondary"
            size="sm"
            onClick={table.refetch}
            loading={table.isFetching && !table.loading}
            icon={table.isFetching ? undefined : <RefreshCwIcon size={14} />}
          >
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Compliance overview */}
        <section className="vyro-surface relative overflow-hidden p-5 sm:p-6 lg:col-span-3">
          <div
            className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-volt/20 blur-3xl"
            aria-hidden
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-4">Compliance health</div>
              {table.loading ? (
                <Skeleton className="mt-3 h-11 w-48" />
              ) : (
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="vyro-metric text-[2.75rem] leading-none text-ink">{verifiedPct}%</span>
                  <span className="text-sm text-ink-4">
                    <strong className="font-semibold text-ink">{stats.verified}</strong> of {stats.total} hubs verified
                  </span>
                </div>
              )}
            </div>
            <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-volt shadow-[0_8px_20px_-8px_rgba(12,14,11,0.6)]">
              <ShieldCheckIcon size={18} />
            </span>
          </div>

          <SegmentBar className="relative mt-6" segments={[...segments]} />

          <div className="relative mt-4 flex flex-wrap gap-x-1 gap-y-1">
            {segments
              .filter((s) => s.key !== 'standard' || s.value > 0)
              .map((s) => {
                const key = s.key === 'standard' ? null : (s.key as ComplianceKey);
                const active = key !== null && compliance === key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={key === null}
                    onClick={() => key && setCompliance(active ? 'all' : key)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink-3 transition-colors',
                      key && 'hover:bg-ink/[0.05] hover:text-ink',
                      active && 'bg-ink/[0.06] text-ink',
                    )}
                  >
                    <span className={cn('size-2 rounded-full', s.dot)} aria-hidden />
                    {s.label}
                    <span className="font-mono font-semibold text-ink num-tabular">{s.value}</span>
                  </button>
                );
              })}
          </div>

          <dl className="relative mt-5 grid grid-cols-3 gap-4 border-t border-ink/[0.07] pt-5">
            {[
              { label: 'Wholesale hubs', value: stats.total, icon: <StoreIcon size={14} /> },
              { label: 'Districts served', value: stats.districts, icon: <MapPinIcon size={14} /> },
              { label: 'Joined · 30 days', value: stats.recent, icon: <ClockIcon size={14} /> },
            ].map((m) => (
              <div key={m.label} className="min-w-0">
                <dt className="flex items-center gap-1.5 truncate text-xs text-ink-4">
                  <span className="text-ink-5">{m.icon}</span>
                  {m.label}
                </dt>
                <dd className="mt-1.5">
                  {table.loading ? (
                    <Skeleton className="h-7 w-12" />
                  ) : (
                    <span className="vyro-metric text-2xl leading-none text-ink">{m.value}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Review queue */}
        <section className="vyro-surface flex flex-col overflow-hidden lg:col-span-2">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
            <div>
              <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">Needs review</h2>
              <p className="mt-0.5 text-xs text-ink-4">KYB submissions waiting on a decision, oldest first.</p>
            </div>
            {stats.pending > 0 ? (
              <Pill tone="warning" dot>
                {stats.pending} pending
              </Pill>
            ) : null}
          </div>
          <div className="mt-3 flex-1">
            {table.loading ? (
              <div className="space-y-3 px-5 py-2 sm:px-6">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : stats.queue.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-mint/[0.1] text-mint">
                  <CheckCircleIcon size={20} />
                </span>
                <p className="mt-3 text-sm font-semibold text-ink">Queue is clear</p>
                <p className="mt-1 text-xs text-ink-4">Every loaded supplier has a KYB decision.</p>
              </div>
            ) : (
              <ul className="divide-y divide-ink/[0.06]">
                {stats.queue.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/admin/suppliers/${s.id}`}
                      className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-bone/60 sm:px-6"
                    >
                      <Monogram name={s.name} seed={s.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{s.name}</span>
                        <span className="block truncate text-xs text-ink-4">
                          {[s.city, s.createdAt ? `submitted ${relativeTime(s.createdAt)}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3 transition-colors group-hover:text-ink">
                        Review
                        <ArrowRightIcon size={12} className="transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {stats.queue.length > 4 ? (
            <button
              type="button"
              onClick={() => setCompliance('pending')}
              className="border-t border-ink/[0.07] bg-bone/40 px-5 py-3 text-left text-xs font-semibold text-ink-3 transition-colors hover:text-ink sm:px-6"
            >
              View all {stats.queue.length} pending →
            </button>
          ) : null}
        </section>
      </div>

      <RegistryTable
        kind="suppliers"
        table={table}
        rows={visibleRows}
        placeholder="Search suppliers by name…"
        tabs={<Tabs items={tabs} value={compliance} onChange={setCompliance} ariaLabel="Compliance status" />}
        clientFiltered={compliance !== 'all'}
        onResetClientFilter={() => setCompliance('all')}
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
  rows: rowsOverride,
  placeholder = 'Search by name…',
  tabs,
  clientFiltered = false,
  onResetClientFilter,
  selected,
  onToggle,
  onToggleAll,
  exceedsCap,
}: {
  kind: 'suppliers' | 'businesses';
  table: RegistryTableHandle;
  /** Rows to render after client-side filtering; defaults to every loaded row. */
  rows?: (Supplier | Business)[];
  placeholder?: string;
  /** Optional segmented filter rendered above the search row. */
  tabs?: ReactNode;
  clientFiltered?: boolean;
  onResetClientFilter?: () => void;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onToggleAll?: () => void;
  exceedsCap?: boolean;
}) {
  const navigate = useNavigate();
  const rows = rowsOverride ?? table.rows;
  const isSup = kind === 'suppliers';
  const noun = isSup ? 'supplier' : 'business';
  const plural = isSup ? 'suppliers' : 'businesses';
  const filtered = table.searchInput.trim() !== '' || !!table.filter.status || clientFiltered;
  const resetFilters = () => {
    table.setSearchInput('');
    table.setFilter((f) => ({ ...f, status: '' }));
    onResetClientFilter?.();
  };

  // Whole-row navigation, except when the click lands on an interactive child.
  const openRow = (e: React.MouseEvent<HTMLTableRowElement>, path: string) => {
    if ((e.target as HTMLElement).closest('a,button,input,select,label')) return;
    navigate(path);
  };

  return (
    <TableCard
      title={isSup ? 'Supplier ledger' : 'Buyer ledger'}
      description={
        table.loading
          ? undefined
          : `${table.rows.length} ${table.rows.length === 1 ? noun : plural} loaded${table.hasMore ? ' · more available' : ''}`
      }
      toolbar={
        <div className="space-y-3">
          {tabs}
          <Toolbar
            actions={
              isSup ? undefined : (
                <Tabs
                  ariaLabel="Operating status"
                  value={(table.filter.status ?? '') as '' | 'active' | 'suspended'}
                  onChange={(status) => table.setFilter((f) => ({ ...f, status }))}
                  items={[
                    { key: '', label: 'All' },
                    { key: 'active', label: 'Active', icon: <span className="size-1.5 rounded-full bg-mint" aria-hidden /> },
                    { key: 'suspended', label: 'Suspended', icon: <span className="size-1.5 rounded-full bg-rose" aria-hidden /> },
                  ]}
                />
              )
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
                aria-label={`Search ${plural}`}
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
        </div>
      }
      footer={
        <>
          <span>
            Showing <strong className="text-ink">{rows.length}</strong> {rows.length === 1 ? noun : plural}
            {filtered ? ' · filters applied' : ''}
            {clientFiltered && table.hasMore ? ' · load more to widen results' : ''}
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
          title={`Couldn't load ${plural}`}
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
          icon={isSup ? <StoreIcon size={22} /> : <Building2Icon size={22} />}
          title="No records found"
          description={
            filtered
              ? `No registered ${plural} match the current search or filter.`
              : `There are no ${plural} in the registry yet.`
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
              <th>{isSup ? 'Supplier' : 'Business'}</th>
              <th>Location</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Registered</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sup = isSup ? (r as Supplier) : null;
              const detailPath = isSup ? `/admin/suppliers/${r.id}` : `/admin/businesses/${r.id}`;
              const isSuspended = r.status === 'suspended' || sup?.verificationStatus === 'suspended';
              const verification = sup?.verificationStatus;
              const isVerified = verification === 'verified';
              const showDistrict = r.district && r.district.toLowerCase() !== r.city?.toLowerCase();

              return (
                <tr
                  key={r.id}
                  data-selected={selected?.has(r.id) ? 'true' : undefined}
                  onClick={(e) => openRow(e, detailPath)}
                  className="group/row cursor-pointer"
                >
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
                    <div className="flex min-w-[220px] items-center gap-3">
                      <Monogram
                        name={r.name}
                        seed={r.id}
                        badge={
                          isVerified ? (
                            <span
                              className="flex size-4 items-center justify-center rounded-full bg-mint text-paper ring-2 ring-paper"
                              title="Verified facility"
                            >
                              <CheckIcon size={9} />
                            </span>
                          ) : undefined
                        }
                      />
                      <div className="min-w-0">
                        <Link
                          to={detailPath}
                          className="block max-w-[240px] truncate font-semibold text-ink transition-colors hover:text-copper-deep"
                        >
                          {r.name}
                        </Link>
                        <CopyId id={r.id} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex min-w-0 items-start gap-2">
                      <MapPinIcon size={13} className="mt-0.5 shrink-0 text-ink-5" />
                      <CellStack primary={r.city || '—'} secondary={showDistrict ? `${r.district} district` : undefined} />
                    </div>
                  </td>
                  <td>
                    <div className="min-w-0 space-y-1">
                      {r.contactPerson ? (
                        <div className="truncate text-[13px] font-medium text-ink">{r.contactPerson}</div>
                      ) : null}
                      <a
                        href={`mailto:${r.email}`}
                        className="flex max-w-[220px] items-center gap-1.5 text-xs text-ink-4 transition-colors hover:text-copper-deep"
                      >
                        <MailIcon size={12} className="shrink-0 text-ink-5" />
                        <span className="truncate">{r.email}</span>
                      </a>
                      {r.phone ? (
                        <a
                          href={`tel:${r.phone}`}
                          className="flex items-center gap-1.5 font-mono text-[11px] text-ink-4 transition-colors hover:text-ink"
                        >
                          <PhoneIcon size={12} className="shrink-0 text-ink-5" />
                          {r.phone}
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1.5">
                      {isSuspended ? (
                        <Pill tone="danger" dot>
                          Suspended
                        </Pill>
                      ) : isSup ? (
                        verification === 'verified' ? (
                          <Pill tone="success" dot>
                            Verified
                          </Pill>
                        ) : verification === 'pending' ? (
                          <Pill tone="warning" dot>
                            Pending KYC
                          </Pill>
                        ) : verification === 'rejected' ? (
                          <Pill tone="danger" dot>
                            Rejected
                          </Pill>
                        ) : (
                          <Pill tone="neutral">Unreviewed</Pill>
                        )
                      ) : (
                        <Pill tone="success" dot>
                          Active
                        </Pill>
                      )}
                      {isSup && !isSuspended ? (
                        <span className="inline-flex items-center gap-1.5 pl-1 text-[11px] text-ink-4">
                          <span className="size-1.5 rounded-full bg-mint" aria-hidden />
                          Trading enabled
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {r.createdAt ? (
                      <div className="whitespace-nowrap" title={new Date(r.createdAt).toLocaleString()}>
                        <div className="text-[13px] text-ink">{formatDate(r.createdAt)}</div>
                        <div className="mt-0.5 text-xs text-ink-4">{relativeTime(r.createdAt)}</div>
                      </div>
                    ) : (
                      <span className="text-ink-5">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link
                      to={detailPath}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] transition-all hover:bg-ink hover:text-paper hover:shadow-[0_6px_14px_-6px_rgba(12,14,11,0.5)] group-hover/row:text-ink group-hover/row:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]"
                    >
                      {isSup && verification === 'pending' && !isSuspended ? 'Review' : 'Manage'}
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
