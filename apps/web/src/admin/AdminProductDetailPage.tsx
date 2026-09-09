import { Link, useParams } from 'react-router-dom';
import { PageHeader, Surface, Button, ErrorBanner } from '@/components/ui';
import {
  useAdminProduct,
  useUpdateProduct,
  useToggleFeatured,
} from './useAdminCatalog';
import { usePermission } from './lib/permissions';

export function AdminProductDetailPage() {
  const { id = '' } = useParams();
  const canModerate = usePermission('product:moderate');
  const q = useAdminProduct(id ?? null);
  const update = useUpdateProduct(id);
  const toggleFeatured = useToggleFeatured(id);
  const err = q.error instanceof Error ? q.error.message : null;
  if (err) return <ErrorBanner message={err} />;
  const data = q.data;
  if (!data) return <div className="text-sm text-ink-500">Loading…</div>;
  const p = data.product;
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <Link
        to="/admin/catalog"
        className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-3 hover:text-ink transition"
      >
        <span>← Back to Catalog Registry</span>
      </Link>
      <PageHeader
        title={p.name}
        sub={p.brand ?? undefined}
        actions={
          canModerate ? (
            <Button
              variant="secondary"
              onClick={() => toggleFeatured.mutate(!p.featured)}
              disabled={toggleFeatured.isPending}
            >
              {p.featured ? 'Unfeature' : 'Feature'}
            </Button>
          ) : null
        }
      />
      <Surface>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            update.mutate({
              name: String(fd.get('name') ?? p.name),
              description: fd.get('description') ? String(fd.get('description')) : null,
              brand: fd.get('brand') ? String(fd.get('brand')) : null,
              packSize: fd.get('packSize') ? String(fd.get('packSize')) : null,
              unit: String(fd.get('unit') ?? p.unit),
              active: fd.get('active') === 'on',
              moderationNotes: fd.get('moderationNotes')
                ? String(fd.get('moderationNotes'))
                : null,
              expectedUpdatedAt: p.updatedAt,
            });
          }}
        >
          <label className="block text-sm">
            <span className="text-xs text-ink-500">Name</span>
            <input
              name="name"
              defaultValue={p.name}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-500">Description</span>
            <textarea
              name="description"
              defaultValue={p.description ?? ''}
              className="border rounded px-2 py-1 w-full text-sm"
              rows={3}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block text-sm">
              <span className="text-xs text-ink-500">Brand</span>
              <input
                name="brand"
                defaultValue={p.brand ?? ''}
                className="border rounded px-2 py-1 w-full text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-ink-500">Unit</span>
              <input
                name="unit"
                defaultValue={p.unit}
                className="border rounded px-2 py-1 w-full text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-ink-500">Pack size</span>
              <input
                name="packSize"
                defaultValue={p.packSize ?? ''}
                className="border rounded px-2 py-1 w-full text-sm"
              />
            </label>
          </div>
          <label className="block text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={p.active}
              className="mr-2"
            />
            Active
          </label>
          <label className="block">
            <span className="text-xs text-ink-500">Moderation notes</span>
            <textarea
              name="moderationNotes"
              defaultValue={p.moderationNotes ?? ''}
              className="border rounded px-2 py-1 w-full text-sm"
              rows={2}
            />
          </label>
          {canModerate ? (
            <Button type="submit" disabled={update.isPending}>
              Save
            </Button>
          ) : null}
        </form>
      </Surface>
      <Surface>
        <h3 className="text-sm font-semibold p-2">Recent admin activity</h3>
        <ul className="text-sm">
          {data.audit.map((a) => (
            <li key={a.id} className="border-t p-2">
              <span className="text-ink-500">{new Date(a.createdAt).toISOString()}</span>{' '}
              <span>{a.action}</span>{' '}
              <span className="text-ink-500">by {a.actorId}</span>
            </li>
          ))}
          {data.audit.length === 0 ? (
            <li className="p-2 text-ink-500">No activity recorded yet.</li>
          ) : null}
        </ul>
      </Surface>
    </div>
  );
}
