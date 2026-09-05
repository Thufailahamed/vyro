import { ADMIN_ROLES, type AdminRole } from './lib/roles';

export function AdminRoleSelect({
  value,
  onChange,
  allowedRoles,
}: {
  value: AdminRole;
  onChange: (r: AdminRole) => void;
  allowedRoles?: AdminRole[];
}) {
  const opts = (allowedRoles ?? ADMIN_ROLES).filter((r) => r !== 'super_admin' || allowedRoles?.includes('super_admin'));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AdminRole)}
      className="border rounded px-2 py-1"
    >
      {opts.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}
