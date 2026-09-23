import { cn } from '@vyro/ui';
import { ROLE_META, type AdminRole } from './lib/roles';

/**
 * Tones use mid-luminance palette colours so the same pill reads on both the
 * dark sidebar (bg-void) and light paper pages.
 */
const ROLE_STYLES: Record<string, { badge: string; dot: string }> = {
  super_admin: { badge: 'bg-rose/15 text-rose ring-rose/25', dot: 'bg-rose' },
  ops: { badge: 'bg-amber/15 text-amber ring-amber/25', dot: 'bg-amber' },
  finance: { badge: 'bg-mint/15 text-mint ring-mint/25', dot: 'bg-mint' },
  support: { badge: 'bg-copper/15 text-copper ring-copper/25', dot: 'bg-copper' },
  default: { badge: 'bg-ink-4/15 text-ink-4 ring-ink-4/25', dot: 'bg-ink-4' },
};

function sentenceCase(s: string) {
  const t = s.replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function RoleBadge({ role, compact = false }: { role: AdminRole | string; compact?: boolean }) {
  const normKey =
    role === 'admin' || role === 'admin_role'
      ? 'super_admin'
      : (role as AdminRole);

  const meta = ROLE_META[normKey as AdminRole] ?? {
    label: role === 'admin_role' ? 'Super admin' : sentenceCase(String(role)),
    color: 'default',
    description: 'Platform operator',
  };

  const style = ROLE_STYLES[normKey] ?? ROLE_STYLES.default ?? { badge: 'bg-ink-4/15 text-ink-4 ring-ink-4/25', dot: 'bg-ink-4' };

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset',
          compact ? 'px-2 py-px text-[10px] leading-4' : 'px-2.5 py-0.5 text-[11px] leading-5',
          style.badge,
        )}
        title={meta.description}
      >
        <span className={cn('size-1.5 shrink-0 rounded-full', style.dot)} aria-hidden />
        {meta.label}
      </span>
      {!compact && <span className="text-[11px] text-ink-4">Verified</span>}
    </span>
  );
}
