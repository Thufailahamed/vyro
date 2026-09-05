import type { Permission } from './permissions';

export const ADMIN_ROLES = ['super_admin', 'ops', 'finance', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const all = (...p: Permission[]) => Object.freeze(new Set<Permission>(p));

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, ReadonlySet<Permission>>> = Object.freeze({
  super_admin: all(
    'user:read', 'user:suspend', 'user:unsuspend',
    'business:read', 'business:freeze', 'business:unfreeze',
    'supplier:read', 'supplier:freeze', 'supplier:unfreeze',
    'product:read', 'product:moderate',
    'category:read', 'category:write',
    'type:read', 'type:write',
    'dispute:read', 'dispute:resolve', 'dispute:note',
    'payment:read', 'payment:refund',
    'payout:read', 'payout:approve',
    'ledger:read', 'invoice:read',
    'settings:read', 'settings:write',
    'admin:read', 'admin:invite', 'admin:role_change',
    'audit:read', 'audit:export',
    'abuse_report:read', 'abuse_report:resolve',
    'kyc:read', 'kyc:review',
    'takedown:write',
  ),
  ops: all(
    'user:read', 'user:suspend', 'user:unsuspend',
    'business:read', 'business:freeze', 'business:unfreeze',
    'supplier:read', 'supplier:freeze', 'supplier:unfreeze',
    'product:read', 'product:moderate',
    'category:read', 'category:write',
    'type:read', 'type:write',
    'dispute:read', 'dispute:note',
    'admin:read', 'admin:invite',
    'audit:read',
    'abuse_report:read', 'abuse_report:resolve',
    'kyc:read', 'kyc:review',
    'takedown:write',
  ),
  finance: all(
    'user:read', 'business:read', 'supplier:read', 'product:read',
    'category:read', 'type:read',
    'dispute:read',
    'payment:read', 'payment:refund',
    'payout:read', 'payout:approve',
    'ledger:read', 'invoice:read',
    'settings:read',
    'admin:read',
    'audit:read',
  ),
  support: all(
    'user:read', 'user:suspend', 'user:unsuspend',
    'business:read', 'business:freeze', 'business:unfreeze',
    'supplier:read', 'supplier:freeze', 'supplier:unfreeze',
    'product:read', 'product:moderate',
    'category:read', 'type:read',
    'dispute:read', 'dispute:note',
    'payment:read', 'payout:read', 'ledger:read', 'invoice:read',
    'settings:read',
    'admin:read',
    'audit:read',
    'abuse_report:read', 'abuse_report:resolve',
    'kyc:read', 'kyc:review',
    'takedown:write',
  ),
});

export const INVITABLE_ROLES: Readonly<Record<AdminRole, readonly AdminRole[]>> = Object.freeze({
  super_admin: ['super_admin', 'ops', 'finance', 'support'],
  ops: ['ops', 'finance', 'support'],
  finance: [],
  support: [],
});

export function hasPermission(role: AdminRole | null, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(perm);
}

export function isAdminRole(s: string | null): s is AdminRole {
  return s !== null && (ADMIN_ROLES as readonly string[]).includes(s);
}
