import type { MiddlewareHandler } from 'hono';
import { httpError } from '../lib/errors';
import type { Ctx } from './session';
import { hasPermission, type Permission } from '@vyro/auth';

interface RoleSpec {
  business?: readonly string[];
  supplier?: readonly string[];
  admin?: boolean;
  permission?: Permission;
}

export const requireRole = (spec: RoleSpec): MiddlewareHandler => async (c, next) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No context');
  if (spec.permission) {
    if (hasPermission(ctx.adminRole, spec.permission)) return next();
    throw httpError(403, 'FORBIDDEN', `Missing permission: ${spec.permission}`);
  }
  if (spec.admin && ctx.adminRole) return next();
  if (spec.business && ctx.businesses.some((b) => spec.business!.includes(b.role))) return next();
  if (spec.supplier && ctx.suppliers.some((s) => spec.supplier!.includes(s.role))) return next();
  throw httpError(403, 'FORBIDDEN', 'Insufficient role');
};

export const requirePermission = (perm: Permission): MiddlewareHandler =>
  requireRole({ permission: perm });
