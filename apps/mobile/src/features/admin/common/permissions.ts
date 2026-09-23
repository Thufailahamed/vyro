/**
 * Admin role → permission map, copied verbatim from
 * packages/auth/src/rolePermissions.ts (the mobile app is not part of the
 * pnpm workspace, so it cannot import @vyro/auth). Keep the two in sync.
 */
import { useAuth } from '@/lib/auth';
import type { Tone } from '@/theme/tokens';

export const ADMIN_ROLES = ['super_admin', 'ops', 'finance', 'support'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const PERMISSION_KEYS = [
  'user:read', 'user:suspend', 'user:unsuspend',
  'business:read', 'business:freeze', 'business:unfreeze',
  'supplier:read', 'supplier:freeze', 'supplier:unfreeze', 'supplier:verify',
  'product:read', 'product:moderate',
  'category:read', 'category:write',
  'type:read', 'type:write',
  'dispute:read', 'dispute:resolve', 'dispute:note',
  'payment:read', 'payment:refund',
  'payment:verify_bank_transfer', 'payment:reconcile_cod',
  'refund:approve', 'refund:process',
  'settlement:read', 'settlement:approve',
  'payout:read', 'payout:approve', 'payout:process',
  'adjustment:create', 'adjustment:approve',
  'commission:read', 'commission:write',
  'reconciliation:read', 'reconciliation:resolve',
  'financial_report:read',
  'ledger:read', 'invoice:read',
  'settings:read', 'settings:write',
  'admin:read', 'admin:invite', 'admin:role_change',
  'audit:read', 'audit:export',
  'abuse_report:read', 'abuse_report:resolve',
  'kyc:read', 'kyc:review',
  'takedown:write',
  'feature_flag:read', 'feature_flag:write',
  'email_template:read', 'email_template:write',
  'webhook:read', 'webhook:write', 'webhook:retry',
  'session:revoke',
  'impersonation:start', 'impersonation:end',
  'data_export:run',
  '2fa:enforce',
  'health:read',
  'cron:read', 'cron:trigger',
  'queues:read', 'queues:write',
  'notification:read', 'notification:write', 'notification:dismiss',
  'observability:read', 'observability:write',
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

const all = (...p: Permission[]): ReadonlySet<string> => new Set<string>(p);

export const ROLE_PERMISSIONS: Readonly<Record<AdminRole, ReadonlySet<string>>> = {
  super_admin: new Set<string>(PERMISSION_KEYS),
  ops: all(
    'user:read', 'user:suspend', 'user:unsuspend',
    'business:read', 'business:freeze', 'business:unfreeze',
    'supplier:read', 'supplier:freeze', 'supplier:unfreeze', 'supplier:verify',
    'product:read', 'product:moderate',
    'category:read', 'category:write',
    'type:read', 'type:write',
    'dispute:read', 'dispute:note',
    'admin:read', 'admin:invite',
    'audit:read',
    'abuse_report:read', 'abuse_report:resolve',
    'kyc:read', 'kyc:review',
    'takedown:write',
    'health:read',
    'cron:read',
    'notification:read', 'notification:dismiss',
    'observability:read', 'observability:write',
  ),
  finance: all(
    'user:read', 'business:read', 'supplier:read', 'product:read',
    'category:read', 'type:read',
    'dispute:read',
    'payment:read', 'payment:refund',
    'payment:verify_bank_transfer', 'payment:reconcile_cod',
    'refund:approve', 'refund:process',
    'settlement:read', 'settlement:approve',
    'payout:read', 'payout:approve', 'payout:process',
    'adjustment:create', 'adjustment:approve',
    'commission:read', 'commission:write',
    'reconciliation:read', 'reconciliation:resolve',
    'financial_report:read',
    'ledger:read', 'invoice:read',
    'settings:read',
    'admin:read',
    'audit:read',
    'notification:read', 'notification:dismiss',
  ),
  support: all(
    'user:read',
    'business:read',
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
    'notification:read', 'notification:dismiss',
  ),
};

export const INVITABLE_ROLES: Readonly<Record<AdminRole, readonly AdminRole[]>> = {
  super_admin: ['super_admin', 'ops', 'finance', 'support'],
  ops: ['ops', 'finance', 'support'],
  finance: [],
  support: [],
};

export function isAdminRole(s: string | null | undefined): s is AdminRole {
  return typeof s === 'string' && (ADMIN_ROLES as readonly string[]).includes(s);
}

/** Legacy `admin` role is treated as super_admin, same as the API. */
export function normalizeRole(role: string | null | undefined): AdminRole | null {
  if (!role) return null;
  const r = role === 'admin' || role === 'admin_role' ? 'super_admin' : role;
  return isAdminRole(r) ? r : null;
}

export function hasPermission(role: string | null | undefined, perm: Permission | string): boolean {
  const r = normalizeRole(role);
  if (!r) return false;
  return ROLE_PERMISSIONS[r].has(perm);
}

/** The signed-in operator's admin role (normalised), or null. */
export function useAdminRole(): AdminRole | null {
  const { user } = useAuth();
  return normalizeRole(user?.adminRole ?? null);
}

/** True when the signed-in operator's role grants `perm`. */
export function usePermission(perm: Permission | string): boolean {
  const role = useAdminRole();
  return hasPermission(role, perm);
}

/** Roles the signed-in operator may invite / assign. */
export function useInvitableRoles(): readonly AdminRole[] {
  const role = useAdminRole();
  return role ? INVITABLE_ROLES[role] : [];
}

export const ROLE_META: Record<AdminRole, { label: string; short: string; tone: Tone; description: string }> = {
  super_admin: { label: 'Super admin', short: 'Super', tone: 'danger', description: 'Full platform access' },
  ops: { label: 'Operations', short: 'Ops', tone: 'warning', description: 'User, business, supplier, catalog moderation' },
  finance: { label: 'Finance', short: 'Finance', tone: 'success', description: 'Payments, refunds, payouts, ledger' },
  support: { label: 'Support', short: 'Support', tone: 'info', description: 'Read-only + dispute notes' },
};

export function roleLabel(role: string | null | undefined): string {
  const r = normalizeRole(role);
  return r ? ROLE_META[r].label : role ? String(role).replace(/_/g, ' ') : '—';
}
