import { useState, useMemo } from 'react';
import { Surface, Button, ErrorBanner, Badge } from '@/components/ui';
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
  CheckIcon,
  XIcon,
  CopyIcon,
  CheckCheckIcon,
  LayersIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  SparklesIcon,
} from '@/components/icons';

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
  useMemo(() => {
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

  return (
    <div className="space-y-6">
      {/* 1. KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Surface className="p-4 border border-ink/10 bg-white hover:border-ink/20 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Total Categories</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <StoreIcon size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.total}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Defined wholesale taxonomy</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-white hover:border-ink/20 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Active in Store</span>
            <div className="w-7 h-7 rounded-lg bg-mint/10 flex items-center justify-center text-mint">
              <CheckIcon size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-mint tracking-tight">
            {metrics.activeCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Visible to sellers & buyers</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-white hover:border-ink/20 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Root Departments</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <LayersIcon size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.rootCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Top-level categories</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-white hover:border-ink/20 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Sub-Categories</span>
            <div className="w-7 h-7 rounded-lg bg-amber/10 flex items-center justify-center text-amber">
              <SparklesIcon size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.subCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Nested under departments</div>
        </Surface>
      </div>

      {/* Error Banner */}
      {err && <ErrorBanner message={err} />}

      {/* 2. Create Category Card */}
      {canWrite && (
        <Surface className="border border-ink/10 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-ink/10 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <PlusIcon size={15} />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-ink">Add New Wholesale Category</h3>
                <p className="text-[11px] text-ink-4">
                  Categories created here are selected by sellers when publishing products and wholesale offers.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(!isCreateOpen)}
              className="text-xs font-mono text-ink-4 hover:text-ink transition-colors px-2 py-1"
            >
              {isCreateOpen ? 'Hide Form' : 'Show Form'}
            </button>
          </div>

          {isCreateOpen && (
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Name */}
                <div className="md:col-span-4 space-y-1.5">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                    Category Name <span className="text-rose">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={draftName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Building Materials, Spices..."
                    className="w-full h-9 px-3 text-xs bg-slate-50/60 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all placeholder:text-ink-4/60"
                  />
                </div>

                {/* Slug */}
                <div className="md:col-span-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                      Slug Identifier <span className="text-rose">*</span>
                    </label>
                    <span className="text-[10px] text-ink-4 font-mono">auto-synced</span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={draftSlug}
                      onChange={(e) => {
                        setDraftSlug(slugify(e.target.value));
                        setIsSlugTouched(true);
                      }}
                      placeholder="e.g. building-materials"
                      className="w-full h-9 px-3 text-xs font-mono bg-slate-50/60 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Parent Category */}
                <div className="md:col-span-3 space-y-1.5">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                    Parent Department
                  </label>
                  <select
                    value={draftParentId}
                    onChange={(e) => setDraftParentId(e.target.value)}
                    className="w-full h-9 px-3 text-xs bg-slate-50/60 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                  >
                    <option value="">— Top Level (Root Category) —</option>
                    {rows.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.parentId ? `↳ ${r.name}` : r.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Order */}
                <div className="md:col-span-2 space-y-1.5">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={draftSortOrder}
                    onChange={(e) => setDraftSortOrder(Number(e.target.value))}
                    className="w-full h-9 px-3 text-xs font-mono bg-slate-50/60 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all text-center"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-ink/5">
                <span className="text-[11px] text-ink-4">
                  New categories will be automatically set to <strong className="text-emerald-700">Active</strong> upon creation.
                </span>
                <Button
                  type="submit"
                  disabled={!draftName.trim() || !draftSlug.trim() || create.isPending}
                  loading={create.isPending}
                  className="px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <PlusIcon size={14} />
                  <span>Create Category</span>
                </Button>
              </div>
            </form>
          )}
        </Surface>
      )}

      {/* 3. Search & Filter Bar */}
      <Surface className="p-3.5 border border-ink/10 bg-white space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <SearchIcon
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories by name or slug…"
              className="w-full h-9 pl-9 pr-8 text-xs bg-slate-50/60 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {/* Status Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-ink/10 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  statusFilter === 'all'
                    ? 'bg-white text-ink font-semibold shadow-xs'
                    : 'text-ink-4 hover:text-ink'
                }`}
              >
                All Status
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('active')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  statusFilter === 'active'
                    ? 'bg-white text-emerald-700 font-semibold shadow-xs'
                    : 'text-ink-4 hover:text-ink'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('inactive')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  statusFilter === 'inactive'
                    ? 'bg-white text-ink-3 font-semibold shadow-xs'
                    : 'text-ink-4 hover:text-ink'
                }`}
              >
                Inactive
              </button>
            </div>

            {/* Hierarchy Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-ink/10 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setHierarchyFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  hierarchyFilter === 'all'
                    ? 'bg-white text-ink font-semibold shadow-xs'
                    : 'text-ink-4 hover:text-ink'
                }`}
              >
                All Tiers
              </button>
              <button
                type="button"
                onClick={() => setHierarchyFilter('root')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  hierarchyFilter === 'root'
                    ? 'bg-white text-ink font-semibold shadow-xs'
                    : 'text-ink-4 hover:text-ink'
                }`}
              >
                Root Only
              </button>
              <button
                type="button"
                onClick={() => setHierarchyFilter('sub')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  hierarchyFilter === 'sub'
                    ? 'bg-white text-ink font-semibold shadow-xs'
                    : 'text-ink-4 hover:text-ink'
                }`}
              >
                Subcategories
              </button>
            </div>

            <span className="text-xs font-mono text-ink-4 whitespace-nowrap pl-1">
              <strong>{filteredRows.length}</strong> of {rows.length}
            </span>
          </div>
        </div>
      </Surface>

      {/* 4. Category Registry Table */}
      <Surface className="border border-ink/10 bg-white overflow-hidden shadow-sm">
        {q.isLoading ? (
          <div className="divide-y divide-ink/5 p-6 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 animate-pulse pt-3 first:pt-0">
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/6" />
                </div>
                <div className="h-5 bg-slate-100 rounded w-20" />
                <div className="h-5 bg-slate-100 rounded w-28" />
                <div className="h-6 bg-slate-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-ink-4 mx-auto">
              <StoreIcon size={24} />
            </div>
            <h4 className="font-display text-base font-semibold text-ink">No categories found</h4>
            <p className="text-xs text-ink-4 max-w-sm mx-auto">
              {search || statusFilter !== 'all' || hierarchyFilter !== 'all'
                ? 'No taxonomy categories match your current search and filter settings.'
                : 'There are no categories configured in the catalog yet.'}
            </p>
            {(search || statusFilter !== 'all' || hierarchyFilter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setHierarchyFilter('all');
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-5">Category & Hierarchy</th>
                  <th className="py-3 px-4">Slug Identifier</th>
                  <th className="py-3 px-4">Parent Department</th>
                  <th className="py-3 px-4 text-center">Sort Order</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {canWrite && <th className="py-3 px-5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
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
          </div>
        )}
      </Surface>

      {/* 5. Edit Category Modal */}
      {editTarget && (
        <EditCategoryModal
          category={editTarget}
          all={rows}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* 6. Delete Category Confirmation Dialog */}
      {deleteTarget && (
        <DeleteCategoryModal
          category={deleteTarget}
          all={rows}
          onClose={() => setDeleteTarget(null)}
        />
      )}
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
    <tr className="hover:bg-slate-50/50 transition-colors group">
      {/* Category Name & Hierarchy Indentation */}
      <td className="py-3 px-5">
        <div className="flex items-center gap-2" style={{ paddingLeft: row.depth * 24 }}>
          {row.depth > 0 && (
            <span className="text-ink-4/60 font-mono text-sm select-none">↳</span>
          )}
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-ink-3 shrink-0 group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors">
            {row.depth === 0 ? <StoreIcon size={15} /> : <LayersIcon size={14} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-semibold text-sm ${row.active ? 'text-ink' : 'line-through text-ink-4'}`}>
                {row.name}
              </span>
              {row.depth > 0 ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200/50">
                  Subcategory
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-ink-3">
                  Root
                </span>
              )}
            </div>
            {parent && (
              <span className="text-[11px] text-ink-4">
                Under: <strong className="text-ink-3">{parent.name}</strong>
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Slug Identifier with Copy Button */}
      <td className="py-3 px-4">
        <button
          type="button"
          onClick={() => onCopySlug(row.slug)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-[11px] bg-slate-100 text-ink-3 hover:bg-slate-200 transition-all border border-ink/5 group/copy"
          title="Click to copy slug"
        >
          <span>{row.slug}</span>
          {isCopied ? (
            <CheckCheckIcon size={12} className="text-emerald-600" />
          ) : (
            <CopyIcon size={11} className="text-ink-4 opacity-60 group-hover/copy:opacity-100" />
          )}
        </button>
      </td>

      {/* Parent Department */}
      <td className="py-3 px-4">
        {canWrite ? (
          <select
            value={row.parentId ?? ''}
            onChange={(e) => handleParentChange(e.target.value)}
            disabled={update.isPending}
            className="h-8 px-2 text-xs bg-slate-50 border border-ink/15 rounded-md focus:outline-none focus:border-emerald-600 focus:bg-white transition-all max-w-[180px]"
          >
            <option value="">— Top Level —</option>
            {all
              .filter((a) => !invalidParentIds.has(a.id))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-xs text-ink-3">{parent?.name ?? '— Top Level —'}</span>
        )}
      </td>

      {/* Sort Order */}
      <td className="py-3 px-4 text-center">
        {canWrite ? (
          <input
            type="number"
            min={0}
            max={999}
            defaultValue={row.sortOrder}
            onBlur={handleSortChange}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-14 h-8 px-1 text-center font-mono text-xs bg-slate-50 border border-ink/15 rounded-md focus:outline-none focus:border-emerald-600 focus:bg-white transition-all inline-block"
          />
        ) : (
          <span className="font-mono text-xs text-ink-3">{row.sortOrder}</span>
        )}
      </td>

      {/* Active Toggle Status */}
      <td className="py-3 px-4 text-center">
        {canWrite ? (
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={update.isPending}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase transition-all shadow-2xs ${
              row.active
                ? 'bg-mint/15 text-emerald-700 border border-mint/30 hover:bg-mint/25'
                : 'bg-slate-100 text-ink-4 border border-ink/10 hover:bg-slate-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                row.active ? 'bg-emerald-600 animate-pulse' : 'bg-ink-4'
              }`}
            />
            {row.active ? 'Active' : 'Inactive'}
          </button>
        ) : (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
              row.active ? 'bg-mint/15 text-emerald-700' : 'bg-slate-100 text-ink-4'
            }`}
          >
            {row.active ? 'Active' : 'Inactive'}
          </span>
        )}
      </td>

      {/* Actions */}
      {canWrite && (
        <td className="py-3 px-5 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-md hover:bg-slate-100 text-ink-4 hover:text-ink transition-colors"
              title="Edit category"
            >
              <Edit3Icon size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-md hover:bg-rose/10 text-ink-4 hover:text-rose transition-colors"
              title="Delete category"
            >
              <Trash2Icon size={14} />
            </button>
          </div>
        </td>
      )}
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
    } catch (e: any) {
      setErr(e?.message || 'Failed to update category');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-ink/10 shadow-2xl max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-ink/10 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Edit3Icon size={16} />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Edit Category</h3>
              <p className="text-[11px] font-mono text-ink-4">ID: {category.id.slice(0, 8)} • {category.slug}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-ink-4 hover:text-ink hover:bg-slate-100 transition"
          >
            <XIcon size={16} />
          </button>
        </div>

        {err && (
          <div className="p-4 border-b border-rose/20 bg-rose/5">
            <ErrorBanner message={err} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold mb-1">
              Category Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-slate-50 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold mb-1">
              Parent Department
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full h-9 px-3 text-xs bg-slate-50 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
            >
              <option value="">— Top Level (Root Category) —</option>
              {all
                .filter((a) => !invalidParentIds.has(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold mb-1">
                Sort Order
              </label>
              <input
                type="number"
                min={0}
                max={999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold mb-1">
                Marketplace Status
              </label>
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`w-full h-9 px-3 text-xs font-mono font-semibold rounded-lg border flex items-center justify-center gap-2 transition-all ${
                  active
                    ? 'bg-mint/15 text-emerald-700 border-mint/30'
                    : 'bg-slate-100 text-ink-4 border-ink/10'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-600' : 'bg-ink-4'}`} />
                {active ? 'Active in Store' : 'Inactive (Hidden)'}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink/10">
            <Button type="button" variant="ghost" onClick={onClose} disabled={update.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={update.isPending}
              disabled={!name.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Save Changes
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
    } catch (e: any) {
      setErr(e?.message || 'Failed to delete category');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-ink/10 shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-ink/10 bg-rose-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose/15 text-rose flex items-center justify-center shrink-0">
              <AlertTriangleIcon size={18} />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Delete Category</h3>
              <p className="text-[11px] font-mono text-ink-4">{category.slug}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-ink-4 hover:text-ink hover:bg-slate-100 transition"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {err && <ErrorBanner message={err} />}

          {hasChildren ? (
            <div className="p-4 rounded-xl bg-amber/10 border border-amber/20 space-y-2">
              <div className="flex items-center gap-2 text-amber font-semibold text-xs">
                <AlertCircleIcon size={16} />
                <span>Cannot Delete Category With Subcategories</span>
              </div>
              <p className="text-xs text-ink-3 leading-relaxed">
                <strong>{category.name}</strong> currently has {children.length} active subcategories (
                {children.map((c) => c.name).join(', ')}). You must reassign or remove these child
                categories before deleting.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-ink-3 leading-relaxed">
                Are you sure you want to permanently delete <strong>{category.name}</strong>?
              </p>
              <div className="p-3 rounded-xl bg-slate-50 border border-ink/10 text-[11px] text-ink-4">
                ⚠️ Sellers will no longer be able to select this category when publishing new products or wholesale offers.
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={hasChildren || del.isPending}
              loading={del.isPending}
              onClick={handleDelete}
            >
              Delete Category
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
