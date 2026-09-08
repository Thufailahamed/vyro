import { ROLE_META, type AdminRole } from './lib/roles';

const ROLE_STYLES: Record<string, { badge: string; dot: string }> = {
  super_admin: { badge: 'bg-rose/15 text-rose border-rose/30', dot: 'bg-rose' },
  ops: { badge: 'bg-amber/15 text-amber border-amber/30', dot: 'bg-amber' },
  finance: { badge: 'bg-mint/15 text-mint border-mint/30', dot: 'bg-mint' },
  support: { badge: 'bg-volt/15 text-volt border-volt/30', dot: 'bg-volt' },
  default: { badge: 'bg-paper/10 text-paper/80 border-paper/20', dot: 'bg-paper/50' },
};

export function RoleBadge({ role }: { role: AdminRole | string }) {
  const normKey =
    role === 'admin' || role === 'admin_role'
      ? 'super_admin'
      : (role as AdminRole);

  const meta = ROLE_META[normKey as AdminRole] ?? {
    label: role === 'admin_role' ? 'Super Admin' : String(role).replace('_', ' '),
    color: 'default',
    description: 'Platform Operator',
  };

  const style = ROLE_STYLES[normKey] ?? ROLE_STYLES.default ?? { badge: 'bg-paper/10 text-paper/80 border-paper/20', dot: 'bg-paper/50' };

  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border ${style.badge}`}
        title={meta.description}
      >
        <span className={`size-1.5 rounded-full ${style.dot} animate-pulse`} />
        <span>{meta.label}</span>
      </span>
      <span className="text-[9px] font-mono text-paper/40">Verified</span>
    </div>
  );
}
