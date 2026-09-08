import { ROLE_META, type AdminRole } from './lib/roles';

export function RoleBadge({ role }: { role: AdminRole | string }) {
  const normalized = role === 'admin' ? 'super_admin' : (role as AdminRole);
  const meta = ROLE_META[normalized] ?? {
    label: String(role),
    color: 'stone',
    description: 'Admin',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs bg-${meta.color}-100 text-${meta.color}-800`}
    >
      {meta.label}
    </span>
  );
}
