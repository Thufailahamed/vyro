import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { PageHeader, Button, ErrorBanner, Surface } from '@/components/ui';
import { usePermission } from './lib/permissions';
import { RoleBadge } from './RoleBadge';
import { InviteAdminDialog } from './InviteAdminDialog';
import { AdminRoleSelect } from './AdminRoleSelect';
import { ADMIN_ROLES, type AdminRole } from './lib/roles';
import { isAdminRole } from '@vyro/auth';
import { api } from '@/lib/api';

interface AdminUser {
  id: string;
  email: string;
  adminRole: AdminRole | null;
  lastActivityAt: number | null;
}
interface Invite {
  id: string;
  email: string;
  role: AdminRole;
  expiresAt: number;
  acceptedAt: number | null;
}

export function RolesPage() {
  const canInvite = usePermission('admin:invite');
  const canChange = usePermission('admin:role_change');
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const admins = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const r = await api.get<{ users: AdminUser[] }>('/admin/users');
      return r.users;
    },
  });

  const invites = useQuery({
    queryKey: ['admin-invites'],
    queryFn: async () => {
      const r = await api.get<{ invites: Invite[] }>('/admin/invites');
      return r.invites;
    },
    enabled: canInvite,
  });

  const change = useMutation({
    mutationFn: async (vars: { id: string; role: AdminRole | null }) => {
      if (vars.role) {
        await api.patch(`/admin/users/${vars.id}/role`, { role: vars.role });
      } else {
        await api.del(`/admin/users/${vars.id}/role`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const errMsg = admins.error instanceof Error ? admins.error.message : null;
  const changeErr = change.error instanceof Error ? change.error.message : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Roles" subtitle="Manage platform administrators">
        {canInvite ? (
          <Button onClick={() => setInviteOpen(true)}>Invite admin</Button>
        ) : null}
      </PageHeader>

      {errMsg ? <ErrorBanner message={errMsg} /> : null}
      {changeErr ? <ErrorBanner message={changeErr} /> : null}

      <Surface>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Role</th>
              <th className="text-left p-2">Last activity</th>
              {canChange ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {(admins.data ?? []).map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.email}</td>
                <td className="p-2">
                  {u.adminRole && isAdminRole(u.adminRole) ? (
                    <RoleBadge role={u.adminRole} />
                  ) : (
                    <span className="text-ink-500">—</span>
                  )}
                </td>
                <td className="p-2">
                  {u.lastActivityAt
                    ? new Date(u.lastActivityAt).toISOString()
                    : '—'}
                </td>
                {canChange ? (
                  <td className="p-2 flex gap-2">
                    <AdminRoleSelect
                      value={(u.adminRole ?? 'ops') as AdminRole}
                      onChange={(r) => change.mutate({ id: u.id, role: r })}
                      allowedRoles={ADMIN_ROLES}
                    />
                    <Button
                      variant="ghost"
                      onClick={() => change.mutate({ id: u.id, role: null })}
                    >
                      Demote
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>

      {canInvite && inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h2 className="text-lg font-semibold mb-4">Invite admin</h2>
            <InviteAdminDialog onClose={() => setInviteOpen(false)} />
          </div>
        </div>
      ) : null}

      {canInvite && (invites.data ?? []).length > 0 ? (
        <Surface>
          <h3 className="text-sm font-semibold p-2">Pending invites</h3>
          {(invites.data ?? []).map((i) => (
            <div key={i.id} className="flex justify-between border-t py-2 px-2">
              <div>
                {i.email} · <RoleBadge role={i.role} />
              </div>
              <div>
                {i.acceptedAt
                  ? 'accepted'
                  : `expires ${new Date(i.expiresAt).toISOString()}`}
              </div>
            </div>
          ))}
        </Surface>
      ) : null}
    </div>
  );
}
