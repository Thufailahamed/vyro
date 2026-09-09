export const PERMISSION_KEYS = [
  'user:read', 'user:suspend', 'user:unsuspend',
  'business:read', 'business:freeze', 'business:unfreeze',
  'supplier:read', 'supplier:freeze', 'supplier:unfreeze', 'supplier:verify',
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
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

export const ALL_PERMISSIONS: ReadonlySet<Permission> = new Set(PERMISSION_KEYS);

export function isPermission(s: string): s is Permission {
  return (ALL_PERMISSIONS as ReadonlySet<string>).has(s);
}
