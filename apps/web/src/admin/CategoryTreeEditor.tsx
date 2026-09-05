import { useState } from 'react';
import { Surface, Button, ErrorBanner } from '@/components/ui';
import {
  useAdminCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  type CategoryRow,
} from './useAdminCatalog';
import { usePermission } from './lib/permissions';

export function CategoryTreeEditor() {
  const canWrite = usePermission('category:write');
  const q = useAdminCategories();
  const create = useCreateCategory();
  const [draftSlug, setDraftSlug] = useState('');
  const [draftName, setDraftName] = useState('');
  const err =
    q.error instanceof Error
      ? q.error.message
      : create.error instanceof Error
        ? create.error.message
        : null;
  const rows = q.data ?? [];
  const tree = buildTree(rows);
  return (
    <>
      {err ? <ErrorBanner message={err} /> : null}
      {canWrite ? (
        <Surface>
          <div className="flex gap-2 items-end">
            <label className="block text-sm flex-1">
              <span className="text-xs text-ink-500">Slug</span>
              <input
                value={draftSlug}
                onChange={(e) => setDraftSlug(e.target.value)}
                className="border rounded px-2 py-1 w-full text-sm"
              />
            </label>
            <label className="block text-sm flex-1">
              <span className="text-xs text-ink-500">Name</span>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="border rounded px-2 py-1 w-full text-sm"
              />
            </label>
            <Button
              onClick={() => {
                create.mutate(
                  { slug: draftSlug, name: draftName },
                  {
                    onSuccess: () => {
                      setDraftSlug('');
                      setDraftName('');
                    },
                  },
                );
              }}
              disabled={!draftSlug || !draftName}
            >
              Create
            </Button>
          </div>
        </Surface>
      ) : null}
      <Surface>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Slug</th>
              <th className="text-left p-2">Parent</th>
              <th className="text-left p-2">Order</th>
              <th className="text-left p-2">Active</th>
              {canWrite ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {flat(tree).map((r) => (
              <CategoryRowView key={r.id} row={r} canWrite={canWrite} all={rows} />
            ))}
          </tbody>
        </table>
      </Surface>
    </>
  );
}

function CategoryRowView({
  row,
  canWrite,
  all,
}: {
  row: TreeNode;
  canWrite: boolean;
  all: CategoryRow[];
}) {
  const update = useUpdateCategory(row.id);
  const del = useDeleteCategory(row.id);
  return (
    <tr className="border-t">
      <td className="p-2" style={{ paddingLeft: 8 + row.depth * 16 }}>
        {row.active ? row.name : <span className="line-through text-ink-400">{row.name}</span>}
      </td>
      <td className="p-2 text-ink-500">{row.slug}</td>
      <td className="p-2">
        {canWrite ? (
          <select
            value={row.parentId ?? ''}
            onChange={(e) =>
              update.mutate({ parentId: e.target.value === '' ? null : e.target.value })
            }
            className="border rounded px-1 py-0.5 text-sm"
          >
            <option value="">— top —</option>
            {all
              .filter((a) => a.id !== row.id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        ) : (
          (row.parentId ?? '—')
        )}
      </td>
      <td className="p-2">
        {canWrite ? (
          <input
            type="number"
            value={row.sortOrder}
            onChange={(e) => update.mutate({ sortOrder: Number(e.target.value) })}
            className="w-16 border rounded px-1 py-0.5 text-sm"
          />
        ) : (
          row.sortOrder
        )}
      </td>
      <td className="p-2">
        {canWrite ? (
          <input
            type="checkbox"
            checked={row.active}
            onChange={(e) => update.mutate({ active: e.target.checked })}
          />
        ) : row.active ? (
          'yes'
        ) : (
          'no'
        )}
      </td>
      {canWrite ? (
        <td className="p-2">
          <Button variant="ghost" onClick={() => del.mutate()}>
            Delete
          </Button>
        </td>
      ) : null}
    </tr>
  );
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
type TreeNode = CategoryRow & { depth: number; children: TreeNode[] };
