import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

type Detail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: number;
  members: Array<{ userId: string; role: string; email: string | null }>;
  offerCount: number;
  activePoCount: number;
};

export function SupplierDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery({
    queryKey: ['admin-supplier', id],
    queryFn: () => api.get<{ supplier: Detail }>(`/admin/suppliers/${id}`),
    retry: false,
  });

  const toggleFreeze = useMutation({
    mutationFn: () =>
      detail.data?.supplier.status === 'suspended'
        ? api.post(`/admin/suppliers/${id}/unfreeze`)
        : api.post(`/admin/suppliers/${id}/freeze`, { reason: 'admin' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-supplier', id] });
      void qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      toast.success('Supplier updated');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (detail.isError) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Admin</p>
        <h1 className="vyro-display text-2xl">Supplier not found</h1>
        <Link to="/admin/suppliers" className="text-volt underline text-sm">
          ← Back to suppliers
        </Link>
      </div>
    );
  }
  if (!detail.data) return <p className="text-sm text-ink-4">Loading…</p>;

  const s = detail.data.supplier;
  const isFrozen = s.status === 'suspended';

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Supplier</p>
          <h1 className="vyro-display text-2xl">{s.name}</h1>
          <p className="text-sm text-ink-4">{s.description ?? 'No description.'}</p>
        </div>
        <Button
          variant={isFrozen ? 'primary' : 'danger'}
          onClick={() => toggleFreeze.mutate()}
          disabled={toggleFreeze.isPending}
        >
          {isFrozen ? 'Unfreeze supplier' : 'Freeze supplier'}
        </Button>
      </header>

      <div className="grid sm:grid-cols-3 gap-px bg-ink/10">
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Status</div>
          <div className="mt-2">
            <Badge variant={isFrozen ? 'danger' : 'success'}>
              {isFrozen ? 'Frozen' : 'Active'}
            </Badge>
          </div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Offers</div>
          <div className="text-2xl vyro-display mt-1">{s.offerCount}</div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Active POs</div>
          <div className="text-2xl vyro-display mt-1">{s.activePoCount}</div>
        </div>
      </div>

      <Surface kind="elevated" className="p-6 space-y-4">
        <h2 className="vyro-display text-lg">Members ({s.members.length})</h2>
        {s.members.length === 0 ? (
          <p className="text-sm text-ink-4">No members on file.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4">
              <tr>
                <th className="text-left py-2 font-normal">Email</th>
                <th className="text-left py-2 font-normal">Role</th>
              </tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.userId} className="border-t border-line">
                  <td className="py-2 font-mono text-xs">{m.email ?? '—'}</td>
                  <td className="py-2"><Badge variant="neutral">{m.role}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <Surface kind="elevated" className="p-6">
        <h2 className="vyro-display text-lg mb-2">Lifecycle</h2>
        <p className="text-xs text-ink-4">
          Created {new Date(s.createdAt).toLocaleString()} · ID <span className="font-mono">{s.id}</span>
        </p>
      </Surface>

      <Link to="/admin/suppliers" className="text-xs text-ink-4 hover:text-volt">
        ← Back to suppliers
      </Link>
    </div>
  );
}
