import { ShieldCheckIcon } from '@/components/icons';

interface Props {
  verified: boolean;
  level?: string | null;
  verifiedAt?: number | null;
}

export function VerifiedBuyerBadge({ verified, level, verifiedAt }: Props) {
  if (!verified) return null;
  const date = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : null;
  const label = `VERIFIED${level && level !== 'none' ? ` · ${level.toUpperCase()}` : ''}`;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 rounded-full"
      title={date ? `Verified buyer · ${level} · ${date}` : 'Verified buyer'}
      aria-label="Verified buyer"
    >
      <ShieldCheckIcon size={12} />
      {label}
    </span>
  );
}
