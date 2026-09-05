export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'support';

export const ROLE_META: Record<
  AdminRole,
  { label: string; color: string; description: string }
> = {
  super_admin: { label: 'Super admin', color: 'rose', description: 'Full platform access' },
  ops: { label: 'Ops', color: 'amber', description: 'User, business, supplier, catalog moderation' },
  finance: { label: 'Finance', color: 'emerald', description: 'Payments, refunds, payouts, ledger' },
  support: { label: 'Support', color: 'sky', description: 'Read-only + dispute notes' },
};

export const ADMIN_ROLES: AdminRole[] = ['super_admin', 'ops', 'finance', 'support'];
