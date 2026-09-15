import { ShieldCheckIcon } from '@/components/icons';

interface Props {
  active: boolean;
  memberSinceYear?: number | null;
  expiresAt?: number | null;
}

export function TrustSealBadge({ active, memberSinceYear, expiresAt }: Props) {
  if (!active) return null;
  const exp = expiresAt ? new Date(expiresAt).toLocaleDateString() : null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-700 border border-amber-500/40 rounded-full"
      title={exp ? `TrustSEAL verified · expires ${exp}` : 'TrustSEAL verified supplier'}
      aria-label="TrustSEAL verified supplier"
    >
      <ShieldCheckIcon size={12} />
      TRUSTSEAL{memberSinceYear ? ` · SINCE ${memberSinceYear}` : ''}
    </span>
  );
}
