import { ROLE_META, type AdminRole } from './lib/roles';

export function RoleBadge({ role }: { role: AdminRole }) {
  const meta = ROLE_META[role];
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs bg-${meta.color}-100 text-${meta.color}-800`}
    >
      {meta.label}
    </span>
  );
}
