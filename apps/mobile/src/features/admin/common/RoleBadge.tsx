import { ShieldCheck } from 'lucide-react-native';
import { Badge } from '@/ui';
import { normalizeRole, ROLE_META } from './permissions';

/** Admin role pill — tone per role, same palette intent as the web RoleBadge. */
export function RoleBadge({ role, size = 'sm' }: { role: string | null | undefined; size?: 'sm' | 'md' }) {
  const r = normalizeRole(role);
  if (!r) return <Badge label={role ? String(role).replace(/_/g, ' ') : 'Operator'} tone="neutral" size={size} />;
  const meta = ROLE_META[r];
  return <Badge label={meta.label} tone={meta.tone} icon={ShieldCheck} size={size} />;
}
