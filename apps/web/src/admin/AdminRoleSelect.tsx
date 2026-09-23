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
      aria-label="Admin role"
      className={`h-8 cursor-pointer rounded-lg bg-paper px-2.5 text-xs font-medium text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-shadow duration-200 focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {opts.map((r) => (
        <option key={r} value={r}>
          {r === 'super_admin' ? 'Super admin' : r === 'ops' ? 'Operations' : r.charAt(0).toUpperCase() + r.slice(1)}
        </option>
      ))}
    </select>
  );
}
