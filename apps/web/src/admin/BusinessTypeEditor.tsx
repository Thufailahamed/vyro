import { useState, useMemo } from 'react';
import { Surface, Button, ErrorBanner } from '@/components/ui';
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
  CheckIcon,
  XIcon,
  CopyIcon,
  CheckCheckIcon,
  AlertTriangleIcon,
} from '@/components/icons';

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

  return (
    <div className="space-y-6">
      {/* 1. KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-3 max-w-lg">
        <Surface className="p-4 border border-ink/10 bg-white hover:border-ink/20 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Business Types</span>
            <div className="w-7 h-7 rounded-lg bg-amber/10 flex items-center justify-center text-amber">
              <SparklesIcon size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {metrics.total}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Total commerce classifications</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-white hover:border-ink/20 transition-all shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Active Types</span>
            <div className="w-7 h-7 rounded-lg bg-mint/10 flex items-center justify-center text-mint">
              <CheckIcon size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-mint tracking-tight">
            {metrics.activeCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Available during onboarding</div>
        </Surface>
      </div>

      {err && <ErrorBanner message={err} />}

      {/* 2. Create Form */}
      {canWrite && (
        <Surface className="border border-ink/10 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-ink/10 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <PlusIcon size={15} />
              </div>
              <div>
                <h3 className="font-display text-sm font-semibold text-ink">Add New Business Type</h3>
                <p className="text-[11px] text-ink-4">
                  Define business classification personas used for buyer and supplier profile registration.
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
                <div className="md:col-span-6 space-y-1.5">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                    Type Name <span className="text-rose">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={draftName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Restaurant, Supermarket, Construction..."
                    className="w-full h-9 px-3 text-xs bg-slate-50/60 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all placeholder:text-ink-4/60"
                  />
                </div>

                <div className="md:col-span-6 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                      Slug Identifier <span className="text-rose">*</span>
                    </label>
                    <span className="text-[10px] text-ink-4 font-mono">auto-synced</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={draftSlug}
                    onChange={(e) => {
                      setDraftSlug(slugify(e.target.value));
                      setIsSlugTouched(true);
                    }}
                    placeholder="e.g. restaurant"
                    className="w-full h-9 px-3 text-xs font-mono bg-slate-50/60 border border-ink/15 rounded-lg focus:outline-none focus:border-emerald-600 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-ink/5">
                <span className="text-[11px] text-ink-4">
                  New business types will be enabled for selection immediately.
                </span>
                <Button
                  type="submit"
                  disabled={!draftName.trim() || !draftSlug.trim() || create.isPending}
                  loading={create.isPending}
                  className="px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <PlusIcon size={14} />
                  <span>Create Business Type</span>
                </Button>
              </div>
            </form>
          )}
        </Surface>
      )}

      {/* 3. Search & Filter Bar */}
      <Surface className="p-3.5 border border-ink/10 bg-white space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <SearchIcon
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search business types…"
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

          <div className="flex items-center gap-2">
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
                All
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

            <span className="text-xs font-mono text-ink-4 whitespace-nowrap pl-1">
              <strong>{filteredRows.length}</strong> of {rows.length}
            </span>
          </div>
        </div>
      </Surface>

      {/* 4. Business Types Table */}
      <Surface className="border border-ink/10 bg-white overflow-hidden shadow-sm">
        {q.isLoading ? (
          <div className="divide-y divide-ink/5 p-6 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 animate-pulse pt-3 first:pt-0">
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/4" />
                </div>
                <div className="h-5 bg-slate-100 rounded w-20" />
                <div className="h-6 bg-slate-200 rounded w-16" />
              </div>
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-ink-4 mx-auto">
              <SparklesIcon size={24} />
            </div>
            <h4 className="font-display text-base font-semibold text-ink">No business types found</h4>
            <p className="text-xs text-ink-4 max-w-sm mx-auto">
              {search || statusFilter !== 'all'
                ? 'No business types match your current search and filter settings.'
                : 'There are no business types configured in the catalog yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-5">Business Type</th>
                  <th className="py-3 px-4">Slug Identifier</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {canWrite && <th className="py-3 px-5 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
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
          </div>
        )}
      </Surface>

      {/* Edit Modal */}
      {editTarget && (
        <EditBusinessTypeModal
          typeRow={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteBusinessTypeModal
          typeRow={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
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
    <tr className="hover:bg-slate-50/50 transition-colors group">
      <td className="py-3 px-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber/10 flex items-center justify-center text-amber shrink-0 group-hover:bg-emerald-50 group-hover:text-emerald-700 transition-colors">
            <SparklesIcon size={15} />
          </div>
          <span className={`font-semibold text-sm ${row.active ? 'text-ink' : 'line-through text-ink-4'}`}>
            {row.name}
          </span>
        </div>
      </td>

      <td className="py-3 px-4">
        <button
          type="button"
          onClick={() => onCopySlug(row.slug)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-[11px] bg-slate-100 text-ink-3 hover:bg-slate-200 transition-all border border-ink/5"
          title="Click to copy slug"
        >
          <span>{row.slug}</span>
          {isCopied ? (
            <CheckCheckIcon size={12} className="text-emerald-600" />
          ) : (
            <CopyIcon size={11} className="text-ink-4 opacity-60" />
          )}
        </button>
      </td>

      <td className="py-3 px-4 text-center">
        {canWrite ? (
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={update.isPending}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase transition-all ${
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

      {canWrite && (
        <td className="py-3 px-5 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-md hover:bg-slate-100 text-ink-4 hover:text-ink transition-colors"
              title="Edit business type"
            >
              <Edit3Icon size={14} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-md hover:bg-rose/10 text-ink-4 hover:text-rose transition-colors"
              title="Delete business type"
            >
              <Trash2Icon size={14} />
            </button>
          </div>
        </td>
      )}
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
    } catch (e: any) {
      setErr(e?.message || 'Failed to update business type');
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
        <div className="px-6 py-4 border-b border-ink/10 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Edit3Icon size={16} />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Edit Business Type</h3>
              <p className="text-[11px] font-mono text-ink-4">{typeRow.slug}</p>
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
              Type Name
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
              Status
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
              {active ? 'Active in Onboarding' : 'Inactive (Disabled)'}
            </button>
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
    } catch (e: any) {
      setErr(e?.message || 'Failed to delete business type');
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
              <h3 className="font-display text-base font-semibold text-ink">Delete Business Type</h3>
              <p className="text-[11px] font-mono text-ink-4">{typeRow.slug}</p>
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
          <p className="text-xs text-ink-3 leading-relaxed">
            Are you sure you want to permanently delete the <strong>{typeRow.name}</strong> business classification?
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={del.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={handleDelete}
            >
              Delete Type
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
