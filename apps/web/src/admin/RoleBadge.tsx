import { ROLE_META, type AdminRole } from './lib/roles';

const ROLE_STYLES: Record<string, { badge: string; dot: string }> = {
  super_admin: { badge: 'bg-rose/15 text-rose border-rose/30', dot: 'bg-rose' },
  ops: { badge: 'bg-amber/15 text-amber border-amber/30', dot: 'bg-amber' },
  finance: { badge: 'bg-mint/15 text-mint border-mint/30', dot: 'bg-mint' },
  support: { badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30', dot: 'bg-sky-500' },
  default: { badge: 'bg-ink/10 text-ink/80 border-ink/20', dot: 'bg-ink/50' },
};

export function RoleBadge({ role, compact = false }: { role: AdminRole | string; compact?: boolean }) {
  const normKey =
    role === 'admin' || role === 'admin_role'
      ? 'super_admin'
      : (role as AdminRole);

  const meta = ROLE_META[normKey as AdminRole] ?? {
    label: role === 'admin_role' ? 'Super Admin' : String(role).replace('_', ' '),
    color: 'default',
    description: 'Platform Operator',
  };

  const style = ROLE_STYLES[normKey] ?? ROLE_STYLES.default ?? { badge: 'bg-ink/10 text-ink/80 border-ink/20', dot: 'bg-ink/50' };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border rounded ${style.badge}`}
        title={meta.description}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />
        <span>{meta.label}</span>
      </span>
      {!compact && <span className="text-[10px] font-mono text-ink-4">Verified</span>}
    </div>
  );
}

