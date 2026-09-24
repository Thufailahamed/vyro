import { useState, useMemo, useEffect } from 'react';
import { cn } from '@vyro/ui';
import { Button, Input, Label, Select } from '@/components/ui';
import {
  useAdminCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  type CategoryRow,
} from './useAdminCatalog';
import { usePermission } from './lib/permissions';
import {
  StoreIcon,
  PlusIcon,
  SearchIcon,
  Edit3Icon,
  Trash2Icon,
  CheckCircleIcon,
  XIcon,
  CopyIcon,
  CheckCheckIcon,
  LayersIcon,
  AlertTriangleIcon,
  SparklesIcon,
} from '@/components/icons';
import {
  Callout,
  Card,
  CellStack,
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

type TreeNode = CategoryRow & { depth: number; children: TreeNode[] };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildTree(rows: CategoryRow[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, depth: 0, children: [] }));
  const roots: TreeNode[] = [];
  rows.forEach((r) => {
    const node = byId.get(r.id)!;
    if (r.parentId && byId.has(r.parentId)) {
      byId.get(r.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  function setDepth(nodes: TreeNode[], d: number) {
    nodes.forEach((n) => {
      n.depth = d;
      setDepth(n.children, d + 1);
    });
  }
  setDepth(roots, 0);
  return roots;
}

function flat(tree: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  function walk(nodes: TreeNode[]) {
    nodes.forEach((n) => {
      out.push(n);
      walk(n.children);
    });
  }
  walk(tree);
  return out;
}

function getDescendantIds(catId: string, rows: CategoryRow[]): Set<string> {
  const descendants = new Set<string>([catId]);
  let added = true;
  while (added) {
    added = false;
    for (const r of rows) {
      if (r.parentId && descendants.has(r.parentId) && !descendants.has(r.id)) {
        descendants.add(r.id);
        added = true;
      }
    }
  }
  return descendants;
}

const compactControl =
  'h-8 w-auto rounded-lg bg-paper px-2 text-xs text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-shadow focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)] disabled:opacity-50';

export function CategoryTreeEditor() {
  const canWrite = usePermission('category:write');
  const q = useAdminCategories();
  const create = useCreateCategory();

  // Create form states
  const [isCreateOpen, setIsCreateOpen] = useState(true);
  const [draftName, setDraftName] = useState('');
  const [draftSlug, setDraftSlug] = useState('');
  const [draftParentId, setDraftParentId] = useState('');
  const [draftSortOrder, setDraftSortOrder] = useState<number>(0);
  const [isSlugTouched, setIsSlugTouched] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [hierarchyFilter, setHierarchyFilter] = useState<'all' | 'root' | 'sub'>('all');

  // Modals
  const [editTarget, setEditTarget] = useState<CategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);

  const rows = q.data ?? [];
  const tree = useMemo(() => buildTree(rows), [rows]);
  const flatTree = useMemo(() => flat(tree), [tree]);

  // Set default sort order to next highest when rows change
  useEffect(() => {
    if (!isSlugTouched && rows.length > 0) {
      const maxOrder = Math.max(0, ...rows.map((r) => r.sortOrder || 0));
      setDraftSortOrder(maxOrder + 1);
    }
  }, [rows, isSlugTouched]);

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
        parentId: draftParentId ? draftParentId : null,
        sortOrder: draftSortOrder,
      });
      setDraftName('');
      setDraftSlug('');
      setDraftParentId('');
      setIsSlugTouched(false);
      const maxOrder = Math.max(0, ...rows.map((r) => r.sortOrder || 0));
      setDraftSortOrder(maxOrder + 1);
    } catch {
      // Error handled by mutation
    }
  };

  const handleCopySlug = (slug: string) => {
    navigator.clipboard.writeText(slug);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1800);
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = rows.length;
    const activeCount = rows.filter((r) => r.active).length;
    const rootCount = rows.filter((r) => !r.parentId).length;
    const subCount = rows.filter((r) => !!r.parentId).length;
    return { total, activeCount, rootCount, subCount };
  }, [rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return flatTree.filter((r) => {
      if (search.trim()) {
        const s = search.toLowerCase();
        const matches = r.name.toLowerCase().includes(s) || r.slug.toLowerCase().includes(s);
        if (!matches) return false;
      }
      if (statusFilter === 'active' && !r.active) return false;
      if (statusFilter === 'inactive' && r.active) return false;
      if (hierarchyFilter === 'root' && r.parentId) return false;
      if (hierarchyFilter === 'sub' && !r.parentId) return false;
      return true;
    });
  }, [flatTree, search, statusFilter, hierarchyFilter]);

  const err =
    q.error instanceof Error
      ? q.error.message
      : create.error instanceof Error
        ? create.error.message
        : null;

  const filtered = search.trim() !== '' || statusFilter !== 'all' || hierarchyFilter !== 'all';
  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setHierarchyFilter('all');
  };

  return (
    <div className="space-y-6">
      <StatGrid cols={4}>
        <StatCard label="Total categories" value={metrics.total} sub="Defined wholesale taxonomy" icon={<StoreIcon size={16} />} loading={q.isLoading} />
        <StatCard
          label="Active in store"
          value={metrics.activeCount}
          sub="Visible to sellers & buyers"
          icon={<CheckCircleIcon size={16} />}
          tone={metrics.activeCount > 0 ? 'success' : 'neutral'}
          loading={q.isLoading}
        />
        <StatCard label="Root departments" value={metrics.rootCount} sub="Top-level categories" icon={<LayersIcon size={16} />} loading={q.isLoading} />
        <StatCard label="Sub-categories" value={metrics.subCount} sub="Nested under departments" icon={<SparklesIcon size={16} />} loading={q.isLoading} />
      </StatGrid>

      {err ? (
        <Callout
          tone="danger"
          title="Category operation failed"
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
            title="Add wholesale category"
            description="Categories created here are selected by sellers when publishing products and wholesale offers."
            icon={<PlusIcon size={16} />}
            actions={
              <Button variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
                Hide form
              </Button>
            }
          >
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-4">
                  <Label htmlFor="cat-name">
                    Category name <span className="text-rose">*</span>
                  </Label>
                  <Input
                    id="cat-name"
                    type="text"
                    required
                    value={draftName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Building Materials, Spices…"
                  />
                </div>
                <div className="md:col-span-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="cat-slug" className="mb-0">
                      Slug identifier <span className="text-rose">*</span>
                    </Label>
                    <span className="font-mono text-[10px] text-ink-4">auto-synced</span>
                  </div>
                  <div className="mt-1.5">
                    <Input
                      id="cat-slug"
                      type="text"
                      required
                      value={draftSlug}
                      onChange={(e) => {
                        setDraftSlug(slugify(e.target.value));
                        setIsSlugTouched(true);
                      }}
                      placeholder="e.g. building-materials"
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="md:col-span-3">
                  <Label htmlFor="cat-parent">Parent department</Label>
                  <Select
                    id="cat-parent"
                    value={draftParentId}
                    onChange={(e) => setDraftParentId(e.target.value)}
                  >
                    <option value="">— Top level (root category) —</option>
                    {rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.parentId ? `↳ ${r.name}` : r.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="cat-sort">Sort order</Label>
                  <Input
                    id="cat-sort"
                    type="number"
                    min={0}
                    max={999}
                    value={draftSortOrder}
                    onChange={(e) => setDraftSortOrder(Number(e.target.value))}
                    className="text-center font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.07] pt-4">
                <span className="text-xs text-ink-4">
                  New categories are set to <strong className="text-mint">Active</strong> upon creation.
                </span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!draftName.trim() || !draftSlug.trim()}
                  loading={create.isPending}
                  icon={<PlusIcon size={14} />}
                >
                  Create category
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
                <div className="text-sm font-semibold text-ink">Add wholesale category</div>
                <div className="text-xs text-ink-4">
                  Categories are selected by sellers when publishing products and offers.
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(true)} icon={<PlusIcon size={14} />}>
              New category
            </Button>
          </Card>
        )
      ) : null}

      <TableCard
        title="Category registry"
        toolbar={
          <Toolbar
            actions={
              <>
                <Tabs
                  items={[
                    { key: 'all', label: 'All status' },
                    { key: 'active', label: 'Active' },
                    { key: 'inactive', label: 'Inactive' },
                  ]}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  ariaLabel="Filter by status"
                />
                <Tabs
                  items={[
                    { key: 'all', label: 'All tiers' },
                    { key: 'root', label: 'Root only' },
                    { key: 'sub', label: 'Subcategories' },
                  ]}
                  value={hierarchyFilter}
                  onChange={setHierarchyFilter}
                  ariaLabel="Filter by hierarchy"
                />
              </>
            }
          >
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search categories by name or slug…"
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
              {rows.length === 1 ? 'category' : 'categories'}
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
          <TableSkeleton rows={6} cols={5} />
        ) : filteredRows.length === 0 ? (
          <EmptyBlock
            icon={<StoreIcon size={22} />}
            title="No categories found"
            description={
              filtered
                ? 'No taxonomy categories match the current search and filter settings.'
                : 'There are no categories configured in the catalog yet.'
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
                <th>Category &amp; hierarchy</th>
                <th>Slug identifier</th>
                <th>Parent department</th>
                <th className="text-center">Sort</th>
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
                <CategoryTableRow
                  key={row.id}
                  row={row}
                  canWrite={canWrite}
                  all={rows}
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
        <EditCategoryModal category={editTarget} all={rows} onClose={() => setEditTarget(null)} />
      ) : null}

      {deleteTarget ? (
        <DeleteCategoryModal category={deleteTarget} all={rows} onClose={() => setDeleteTarget(null)} />
      ) : null}
    </div>
  );
}

/* ── Category Table Row ─────────────────────────────────── */

function CategoryTableRow({
  row,
  canWrite,
  all,
  copiedSlug,
  onCopySlug,
  onEdit,
  onDelete,
}: {
  row: TreeNode;
  canWrite: boolean;
  all: CategoryRow[];
  copiedSlug: string | null;
  onCopySlug: (slug: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateCategory(row.id);
  const isCopied = copiedSlug === row.slug;

  const parent = useMemo(() => {
    return all.find((a) => a.id === row.parentId);
  }, [all, row.parentId]);

  // Prevent selecting self or any of self's descendants as parent
  const invalidParentIds = useMemo(() => {
    return getDescendantIds(row.id, all);
  }, [row.id, all]);

  const handleParentChange = (newParentId: string) => {
    update.mutate({ parentId: newParentId === '' ? null : newParentId });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 0) {
      update.mutate({ sortOrder: val });
    }
  };

  const handleToggleActive = () => {
    update.mutate({ active: !row.active });
  };

  return (
    <tr className="group">
      {/* Category Name & Hierarchy Indentation */}
      <td>
        <div className="flex items-center gap-2.5" style={{ paddingLeft: row.depth * 24 }}>
          {row.depth > 0 ? <span className="select-none font-mono text-sm text-ink-4/60">↳</span> : null}
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bone text-ink-3 transition-colors group-hover:bg-ink/10">
            {row.depth === 0 ? <StoreIcon size={15} /> : <LayersIcon size={14} />}
          </span>
          <CellStack
            primary={
              <span className="flex items-center gap-2">
                <span className={cn('font-semibold', row.active ? 'text-ink' : 'text-ink-4 line-through')}>
                  {row.name}
                </span>
                <Pill tone={row.depth > 0 ? 'info' : 'neutral'}>{row.depth > 0 ? 'Subcategory' : 'Root'}</Pill>
              </span>
            }
            secondary={parent ? `Under ${parent.name}` : undefined}
          />
        </div>
      </td>

      {/* Slug Identifier with Copy Button */}
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

      {/* Parent Department */}
      <td>
        {canWrite ? (
          <select
            value={row.parentId ?? ''}
            onChange={(e) => handleParentChange(e.target.value)}
            disabled={update.isPending}
            className={cn(compactControl, 'max-w-[180px]')}
            aria-label="Parent department"
          >
            <option value="">— Top level —</option>
            {all
              .filter((a) => !invalidParentIds.has(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-xs text-ink-3">{parent?.name ?? '— Top level —'}</span>
        )}
      </td>

      {/* Sort Order */}
      <td className="text-center">
        {canWrite ? (
          <input
            type="number"
            min={0}
            max={999}
            defaultValue={row.sortOrder}
            onBlur={handleSortChange}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={cn(compactControl, 'w-14 px-1 text-center font-mono')}
            aria-label="Sort order"
          />
        ) : (
          <span className="font-mono text-xs text-ink-3">{row.sortOrder}</span>
        )}
      </td>

      {/* Active Toggle Status */}
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

      {/* Actions */}
      {canWrite ? (
        <td className="text-right">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-bone hover:text-ink"
              title="Edit category"
              aria-label={`Edit ${row.name}`}
            >
              <Edit3Icon size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-rose/10 hover:text-rose"
              title="Delete category"
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

/* ── Edit Category Modal ────────────────────────────────── */

function EditCategoryModal({
  category,
  all,
  onClose,
}: {
  category: CategoryRow;
  all: CategoryRow[];
  onClose: () => void;
}) {
  const update = useUpdateCategory(category.id);
  const [name, setName] = useState(category.name);
  const [parentId, setParentId] = useState(category.parentId ?? '');
  const [sortOrder, setSortOrder] = useState(category.sortOrder);
  const [active, setActive] = useState(category.active);
  const [err, setErr] = useState('');

  const invalidParentIds = useMemo(() => {
    return getDescendantIds(category.id, all);
  }, [category.id, all]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({
        name: name.trim(),
        parentId: parentId === '' ? null : parentId,
        sortOrder,
        active,
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to update category');
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
        className="vyro-surface w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-bone/40 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink/10 text-ink-2">
              <Edit3Icon size={15} />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">Edit category</h3>
              <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">
                {category.id.slice(0, 8)} · {category.slug}
              </p>
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
            <Label htmlFor="edit-cat-name">Category name</Label>
            <Input
              id="edit-cat-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="edit-cat-parent">Parent department</Label>
            <Select id="edit-cat-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— Top level (root category) —</option>
              {all
                .filter((a) => !invalidParentIds.has(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-cat-sort">Sort order</Label>
              <Input
                id="edit-cat-sort"
                type="number"
                min={0}
                max={999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="font-mono"
              />
            </div>
            <div>
              <Label>Marketplace status</Label>
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={cn(
                  'flex h-11 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold transition-colors shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)]',
                  active ? 'bg-mint/10 text-mint' : 'bg-ink/[0.05] text-ink-4',
                )}
              >
                <span className={cn('size-1.5 rounded-full', active ? 'bg-mint' : 'bg-ink-4')} />
                {active ? 'Active in store' : 'Inactive (hidden)'}
              </button>
            </div>
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

/* ── Delete Category Modal ──────────────────────────────── */

function DeleteCategoryModal({
  category,
  all,
  onClose,
}: {
  category: CategoryRow;
  all: CategoryRow[];
  onClose: () => void;
}) {
  const del = useDeleteCategory(category.id);
  const [err, setErr] = useState('');

  // Check if there are active child categories
  const children = useMemo(() => {
    return all.filter((a) => a.parentId === category.id);
  }, [all, category.id]);

  const hasChildren = children.length > 0;

  const handleDelete = async () => {
    if (hasChildren) return;
    setErr('');
    try {
      await del.mutateAsync();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to delete category');
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
              <h3 className="text-base font-semibold text-ink">Delete category</h3>
              <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{category.slug}</p>
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

          {hasChildren ? (
            <Callout tone="warning" title="Can't delete a category with subcategories">
              <strong>{category.name}</strong> has {children.length}{' '}
              {children.length === 1 ? 'subcategory' : 'subcategories'} ({children.map((c) => c.name).join(', ')}).
              Reassign or remove them before deleting.
            </Callout>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-3">
                Permanently delete <strong className="text-ink">{category.name}</strong>?
              </p>
              <Callout tone="warning">
                Sellers will no longer be able to select this category when publishing new products or wholesale
                offers.
              </Callout>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={hasChildren}
              loading={del.isPending}
              onClick={() => void handleDelete()}
            >
              Delete category
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
