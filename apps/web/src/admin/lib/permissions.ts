import { useAdminAuth } from '../Shell';
import { hasPermission, type Permission, type AdminRole } from '@vyro/auth';

interface AdminAuthWithRole {
  user?: { adminRole?: AdminRole | null } | null;
}

export function usePermission(perm: Permission): boolean {
  const auth = useAdminAuth() as unknown as AdminAuthWithRole;
  const role = (auth.user?.adminRole ?? null) as AdminRole | null;
  return hasPermission(role, perm);
}

export function useAdminRole(): AdminRole | null {
  const auth = useAdminAuth() as unknown as AdminAuthWithRole;
  return (auth.user?.adminRole ?? null) as AdminRole | null;
}
