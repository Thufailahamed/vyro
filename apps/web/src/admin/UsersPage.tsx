import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Badge, Input } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { useAdminTable } from '@/lib/useAdminTable';

type User = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isAdmin: boolean;
  status: 'active' | 'suspended';
  membershipsCount: number;
  createdAt: number;
};

export function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const table = useAdminTable<User>({
    endpoint: '/admin/users',
    queryKey: ['admin-users'],
    rowKey: 'items',
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/suspend`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User suspended'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  const unsuspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/unsuspend`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User restored'); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  const list = table.rows;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Moderation"
        title="Users"
        sub={`${list.length} user${list.length === 1 ? '' : 's'} on this page.`}
      />

      <div className="max-w-sm">
        <Input
          placeholder="Search email or name…"
          value={table.searchInput}
          onChange={(e) => table.setSearchInput(e.target.value)}
        />
      </div>

      <Surface kind="elevated" className="overflow-hidden">
        {list.length === 0 ? (
          <p className="p-10 text-center text-sm text-ink-4">No users match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-ink text-paper text-[11px] uppercase tracking-[0.14em]">
              <tr>
                <th className="text-left px-4 py-3 font-normal">Name</th>
                <th className="text-left px-4 py-3 font-normal">Email</th>
                <th className="text-left px-4 py-3 font-normal">Role</th>
                <th className="text-right px-4 py-3 font-normal">Memberships</th>
                <th className="text-left px-4 py-3 font-normal">Status</th>
                <th className="text-right px-4 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-ink-3 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.isAdmin ? <Badge variant="brand">Admin</Badge> : <Badge variant="neutral">User</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">{u.membershipsCount}</td>
                  <td className="px-4 py-3">
                    {u.status === 'suspended' ? (
                      <Badge variant="danger">Suspended</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.status === 'suspended' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unsuspend.mutate(u.id)}
                        disabled={unsuspend.isPending}
                      >
                        Unsuspend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => suspend.mutate(u.id)}
                        disabled={suspend.isPending || u.isAdmin}
                        title={u.isAdmin ? 'Cannot suspend admin' : undefined}
                      >
                        Suspend
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {table.hasMore && (
          <div className="border-t border-line p-3 text-center">
            <button
              type="button"
              onClick={table.loadMore}
              disabled={table.fetchingMore}
              className="text-xs font-medium text-copper hover:text-ink disabled:opacity-50"
            >
              {table.fetchingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </Surface>
    </div>
  );
}
