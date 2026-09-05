import { useState } from 'react';
import { Surface, Button, ErrorBanner } from '@/components/ui';
import {
  useAdminBusinessTypes,
  useCreateBusinessType,
  useUpdateBusinessType,
  useDeleteBusinessType,
} from './useAdminCatalog';
import { usePermission } from './lib/permissions';

export function BusinessTypeEditor() {
  const canWrite = usePermission('type:write');
  const q = useAdminBusinessTypes();
  const create = useCreateBusinessType();
  const [draftSlug, setDraftSlug] = useState('');
  const [draftName, setDraftName] = useState('');
  const err =
    q.error instanceof Error
      ? q.error.message
      : create.error instanceof Error
        ? create.error.message
        : null;
  const rows = q.data ?? [];
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
              onClick={() =>
                create.mutate(
                  { slug: draftSlug, name: draftName },
                  {
                    onSuccess: () => {
                      setDraftSlug('');
                      setDraftName('');
                    },
                  },
                )
              }
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
              <th className="text-left p-2">Slug</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Active</th>
              {canWrite ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BusinessTypeRowView key={r.id} row={r} canWrite={canWrite} />
            ))}
          </tbody>
        </table>
      </Surface>
    </>
  );
}

function BusinessTypeRowView({
  row,
  canWrite,
}: {
  row: { id: string; slug: string; name: string; active: boolean };
  canWrite: boolean;
}) {
  const update = useUpdateBusinessType(row.id);
  const del = useDeleteBusinessType(row.id);
  return (
    <tr className="border-t">
      <td className="p-2 text-ink-500">{row.slug}</td>
      <td className="p-2">
        {canWrite ? (
          <input
            value={row.name}
            onChange={(e) => update.mutate({ name: e.target.value })}
            className="border rounded px-1 py-0.5 text-sm"
          />
        ) : (
          row.name
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
