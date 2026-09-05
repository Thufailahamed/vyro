import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorBanner, Input } from '@/components/ui';
import { AdminRoleSelect } from './AdminRoleSelect';
import { INVITABLE_ROLES, type AdminRole } from '@vyro/auth';
import { useAdminRole } from './lib/permissions';
import { api } from '@/lib/api';

export function InviteAdminDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('ops');
  const actor = useAdminRole();
  const qc = useQueryClient();
  const allowed = actor ? (INVITABLE_ROLES[actor] as readonly AdminRole[]) : [];
  const mut = useMutation({
    mutationFn: async () => {
      await api.post('/admin/invites', { email, role });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-invites'] });
      onClose();
    },
  });
  const errMsg = mut.error instanceof Error ? mut.error.message : null;
  return (
    <div className="space-y-3">
      {errMsg ? <ErrorBanner message={errMsg} /> : null}
      <label className="block">
        <span className="text-sm">Email</span>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </label>
      <label className="block">
        <span className="text-sm">Role</span>
        <AdminRoleSelect value={role} onChange={setRole} allowedRoles={[...allowed]} />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => mut.mutate()} disabled={!email || mut.isPending}>
          Send invite
        </Button>
      </div>
    </div>
  );
}
