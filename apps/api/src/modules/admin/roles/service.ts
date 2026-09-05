import { httpError } from '../../../lib/errors';
import { getAdminUser, setAdminRole, countSuperAdmins } from './repository';
import type { AdminRole } from '@vyro/auth';

export async function changeRole(
  d1: D1Database,
  opts: { actorId: string; targetId: string; newRole: AdminRole },
) {
  if (opts.targetId === opts.actorId && opts.newRole !== 'super_admin') {
    throw httpError(409, 'CANNOT_DEMOTE_SELF', 'Cannot demote self');
  }
  const target = await getAdminUser(d1, opts.targetId);
  if (!target) throw httpError(404, 'NOT_FOUND', 'User not found');
  if (target.adminRole === 'super_admin' && opts.newRole !== 'super_admin') {
    const count = await countSuperAdmins(d1);
    if (count <= 1) throw httpError(409, 'LAST_SUPER_ADMIN', 'Cannot remove last super_admin');
  }
  const rows = await setAdminRole(d1, opts.targetId, target.adminRole ?? null, opts.newRole);
  if (rows === 0) throw httpError(409, 'ROLE_CHANGED', 'Concurrent role change');
  return { userId: opts.targetId, role: opts.newRole };
}

export async function demote(d1: D1Database, opts: { actorId: string; targetId: string }) {
  if (opts.targetId === opts.actorId) {
    throw httpError(409, 'CANNOT_DEMOTE_SELF', 'Cannot demote self');
  }
  const target = await getAdminUser(d1, opts.targetId);
  if (!target) throw httpError(404, 'NOT_FOUND', 'User not found');
  if (target.adminRole === 'super_admin') {
    const count = await countSuperAdmins(d1);
    if (count <= 1) throw httpError(409, 'LAST_SUPER_ADMIN', 'Cannot remove last super_admin');
  }
  const rows = await setAdminRole(d1, opts.targetId, target.adminRole, null);
  if (rows === 0) throw httpError(409, 'ROLE_CHANGED', 'Concurrent role change');
}
