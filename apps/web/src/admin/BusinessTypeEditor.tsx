import { useState, useMemo } from 'react';
import { cn } from '@vyro/ui';
import { Button, Input, Label } from '@/components/ui';
import {
  useAdminBusinessTypes,
  useCreateBusinessType,
  useUpdateBusinessType,
  useDeleteBusinessType,
  type BusinessTypeRow,
} from './useAdminCatalog';
import { usePermission } from './lib/permissions';
import {
  SparklesIcon,
  PlusIcon,
  SearchIcon,
  Edit3Icon,
  Trash2Icon,
  CheckCircleIcon,
  XIcon,
  CopyIcon,
  CheckCheckIcon,
  AlertTriangleIcon,
} from '@/components/icons';
import {
  Callout,
  Card,
  EmptyBlock,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
} from './ui';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function BusinessTypeEditor() {
  const canWrite = usePermission('type:write');
  const q = useAdminBusinessTypes();
  const create = useCreateBusinessType();

  const [isCreateOpen, setIsCreateOpen] = useState(true);
  const [draftName, setDraftName] = useState('');
  const [draftSlug, setDraftSlug] = useState('');
  const [isSlugTouched, setIsSlugTouched] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [editTarget, setEditTarget] = useState<BusinessTypeRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BusinessTypeRow | null>(null);

  const rows = q.data ?? [];

  const handleNameChange = (val: string) => {
    setDraftName(val);
    if (!isSlugTouched) {
      setDraftSlug(slugify(val));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftName.trim() || !draftSlug.trim()) return;

    try {
      await create.mutateAsync({
        name: draftName.trim(),
        slug: draftSlug.trim(),
      });
      setDraftName('');
      setDraftSlug('');
      setIsSlugTouched(false);
    } catch {
      // Handled by query mutation
    }
  };

  const handleCopySlug = (slug: string) => {
    navigator.clipboard.writeText(slug);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1800);
  };

  const metrics = useMemo(() => {
    const total = rows.length;
    const activeCount = rows.filter((r) => r.active).length;
    return { total, activeCount };
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (search.trim()) {
        const s = search.toLowerCase();
        const matches = r.name.toLowerCase().includes(s) || r.slug.toLowerCase().includes(s);
        if (!matches) return false;
      }
      if (statusFilter === 'active' && !r.active) return false;
      if (statusFilter === 'inactive' && r.active) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const err =
    q.error instanceof Error
      ? q.error.message
      : create.error instanceof Error
        ? create.error.message
        : null;

  const filtered = search.trim() !== '' || statusFilter !== 'all';
  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-6">
      <StatGrid cols={2} className="max-w-lg">
        <StatCard label="Business types" value={metrics.total} sub="Total commerce classifications" icon={<SparklesIcon size={16} />} loading={q.isLoading} />
        <StatCard
          label="Active types"
          value={metrics.activeCount}
          sub="Available during onboarding"
          icon={<CheckCircleIcon size={16} />}
          tone={metrics.activeCount > 0 ? 'success' : 'neutral'}
          loading={q.isLoading}
        />
      </StatGrid>

      {err ? (
        <Callout
          tone="danger"
          title="Business type operation failed"
          action={
            q.isError ? (
              <Button variant="secondary" size="sm" onClick={() => void q.refetch()}>
                Retry
              </Button>
            ) : undefined
          }
        >
          {err}
        </Callout>
      ) : null}

      {canWrite ? (
        isCreateOpen ? (
          <Panel
            title="Add business type"
            description="Define business classification personas used for buyer and supplier profile registration."
            icon={<PlusIcon size={16} />}
            actions={
              <Button variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
                Hide form
              </Button>
            }
          >
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="bt-name">
                    Type name <span className="text-rose">*</span>
                  </Label>
                  <Input
                    id="bt-name"
                    type="text"
                    required
                    value={draftName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Restaurant, Supermarket, Construction…"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bt-slug" className="mb-0">
                      Slug identifier <span className="text-rose">*</span>
                    </Label>
                    <span className="font-mono text-[10px] text-ink-4">auto-synced</span>
                  </div>
                  <div className="mt-1.5">
                    <Input
                      id="bt-slug"
                      type="text"
                      required
                      value={draftSlug}
                      onChange={(e) => {
                        setDraftSlug(slugify(e.target.value));
                        setIsSlugTouched(true);
                      }}
                      placeholder="e.g. restaurant"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] pt-4">
                <span className="text-xs text-ink-4">
                  New business types are enabled for selection immediately.
                </span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!draftName.trim() || !draftSlug.trim()}
                  loading={create.isPending}
                  icon={<PlusIcon size={14} />}
                >
                  Create business type
                </Button>
              </div>
            </form>
          </Panel>
        ) : (
          <Card className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-bone text-ink-3">
                <PlusIcon size={16} />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">Add business type</div>
                <div className="text-xs text-ink-4">
                  Classifications used for buyer and supplier profile registration.
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(true)} icon={<PlusIcon size={14} />}>
              New type
            </Button>
          </Card>
        )
      ) : null}

      <TableCard
        title="Business type registry"
        toolbar={
          <Toolbar
            actions={
              <Tabs
                items={[
                  { key: 'all', label: 'All' },
                  { key: 'active', label: 'Active' },
                  { key: 'inactive', label: 'Inactive' },
                ]}
                value={statusFilter}
                onChange={setStatusFilter}
                ariaLabel="Filter by status"
              />
            }
          >
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search business types…"
                className={cn(controlClass, 'w-full pl-9 pr-8')}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
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
              Showing <strong className="text-ink">{filteredRows.length}</strong> of {rows.length}{' '}
              {rows.length === 1 ? 'type' : 'types'}
              {filtered ? ' · filters applied' : ''}
            </span>
            {filtered ? (
              <button type="button" onClick={resetFilters} className="font-semibold text-copper transition-colors hover:text-ink">
                Reset filters
              </button>
            ) : null}
          </>
        }
      >
        {q.isLoading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : filteredRows.length === 0 ? (
          <EmptyBlock
            icon={<SparklesIcon size={22} />}
            title="No business types found"
            description={
              filtered
                ? 'No business types match the current search and filter settings.'
                : 'There are no business types configured in the catalog yet.'
            }
            action={
              filtered ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Business type</th>
                <th>Slug identifier</th>
                <th>Status</th>
                {canWrite ? (
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <BusinessTypeTableRow
                  key={row.id}
                  row={row}
                  canWrite={canWrite}
                  copiedSlug={copiedSlug}
                  onCopySlug={handleCopySlug}
                  onEdit={() => setEditTarget(row)}
                  onDelete={() => setDeleteTarget(row)}
                />
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      {editTarget ? (
        <EditBusinessTypeModal typeRow={editTarget} onClose={() => setEditTarget(null)} />
      ) : null}

      {deleteTarget ? (
        <DeleteBusinessTypeModal typeRow={deleteTarget} onClose={() => setDeleteTarget(null)} />
      ) : null}
    </div>
  );
}

function BusinessTypeTableRow({
  row,
  canWrite,
  copiedSlug,
  onCopySlug,
  onEdit,
  onDelete,
}: {
  row: BusinessTypeRow;
  canWrite: boolean;
  copiedSlug: string | null;
  onCopySlug: (slug: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateBusinessType(row.id);
  const isCopied = copiedSlug === row.slug;

  const handleToggleActive = () => {
    update.mutate({ active: !row.active });
  };

  return (
    <tr className="group">
      <td>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bone text-ink-3 transition-colors group-hover:bg-ink/10">
            <SparklesIcon size={15} />
          </span>
          <span className={cn('font-semibold', row.active ? 'text-ink' : 'text-ink-4 line-through')}>
            {row.name}
          </span>
        </div>
      </td>

      <td>
        <button
          type="button"
          onClick={() => onCopySlug(row.slug)}
          className="group/copy inline-flex items-center gap-1.5 rounded-md bg-ink/[0.05] px-2 py-1 font-mono text-[11px] text-ink-3 transition-colors hover:bg-ink/10"
          title="Click to copy slug"
        >
          <span>{row.slug}</span>
          {isCopied ? (
            <CheckCheckIcon size={12} className="text-mint" />
          ) : (
            <CopyIcon size={11} className="text-ink-4 opacity-60 transition-opacity group-hover/copy:opacity-100" />
          )}
        </button>
      </td>

      <td>
        {canWrite ? (
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={update.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors disabled:opacity-50',
              row.active ? 'bg-mint/10 text-mint hover:bg-mint/20' : 'bg-ink/[0.06] text-ink-3 hover:bg-ink/10',
            )}
          >
            <span className={cn('size-1.5 rounded-full', row.active ? 'bg-mint' : 'bg-ink-4')} />
            {row.active ? 'Active' : 'Inactive'}
          </button>
        ) : (
          <Pill tone={row.active ? 'success' : 'neutral'} dot>
            {row.active ? 'Active' : 'Inactive'}
          </Pill>
        )}
      </td>

      {canWrite ? (
        <td className="text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-bone hover:text-ink"
              title="Edit business type"
              aria-label={`Edit ${row.name}`}
            >
              <Edit3Icon size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-rose/10 hover:text-rose"
              title="Delete business type"
              aria-label={`Delete ${row.name}`}
            >
              <Trash2Icon size={14} />
            </button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function EditBusinessTypeModal({
  typeRow,
  onClose,
}: {
  typeRow: BusinessTypeRow;
  onClose: () => void;
}) {
  const update = useUpdateBusinessType(typeRow.id);
  const [name, setName] = useState(typeRow.name);
  const [active, setActive] = useState(typeRow.active);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({
        name: name.trim(),
        active,
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to update business type');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="vyro-surface w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-bone/40 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink/10 text-ink-2">
              <Edit3Icon size={15} />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">Edit business type</h3>
              <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{typeRow.slug}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <XIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
          {err ? <Callout tone="danger">{err}</Callout> : null}
          <div>
            <Label htmlFor="edit-bt-name">Type name</Label>
            <Input
              id="edit-bt-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label>Status</Label>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={cn(
                'flex h-11 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold transition-colors shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)]',
                active ? 'bg-mint/10 text-mint' : 'bg-ink/[0.05] text-ink-4',
              )}
            >
              <span className={cn('size-1.5 rounded-full', active ? 'bg-mint' : 'bg-ink-4')} />
              {active ? 'Active in onboarding' : 'Inactive (disabled)'}
            </button>
          </div>

          <div className="flex justify-end gap-2 border-t border-ink/[0.07] pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={update.isPending} disabled={!name.trim()}>
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteBusinessTypeModal({
  typeRow,
  onClose,
}: {
  typeRow: BusinessTypeRow;
  onClose: () => void;
}) {
  const del = useDeleteBusinessType(typeRow.id);
  const [err, setErr] = useState('');

  const handleDelete = async () => {
    setErr('');
    try {
      await del.mutateAsync();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to delete business type');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="vyro-surface w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-rose/[0.07] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose/15 text-rose">
              <AlertTriangleIcon size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">Delete business type</h3>
              <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{typeRow.slug}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          {err ? <Callout tone="danger">{err}</Callout> : null}
          <p className="text-sm leading-relaxed text-ink-3">
            Permanently delete the <strong className="text-ink">{typeRow.name}</strong> business classification? Buyers
            and suppliers will no longer be able to select it during registration.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={del.isPending} onClick={() => void handleDelete()}>
              Delete type
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
