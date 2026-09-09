import { ADMIN_ROLES, type AdminRole } from './lib/roles';

export function AdminRoleSelect({
  value,
  onChange,
  allowedRoles,
  disabled,
  className = '',
}: {
  value: AdminRole;
  onChange: (r: AdminRole) => void;
  allowedRoles?: AdminRole[] | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}) {
  const opts = (allowedRoles ?? ADMIN_ROLES).filter((r) => r !== 'super_admin' || allowedRoles?.includes('super_admin'));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as AdminRole)}
      disabled={disabled}
      className={`bg-paper border border-ink/20 rounded px-2.5 py-1 text-xs font-mono font-medium text-ink focus:border-ink focus:outline-none transition disabled:opacity-50 ${className}`}
    >
      {opts.map((r) => (
        <option key={r} value={r}>
          {r === 'super_admin' ? 'Super Admin' : r === 'ops' ? 'Operations' : r.charAt(0).toUpperCase() + r.slice(1)}
        </option>
      ))}
    </select>
  );
}
