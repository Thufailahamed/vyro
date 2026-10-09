import { ShieldCheckIcon } from '@/components/icons';

interface Props {
  verified: boolean;
  level?: string | null;
  verifiedAt?: number | null;
}

export function VerifiedBuyerBadge({ verified, level, verifiedAt }: Props) {
  if (!verified) return null;
  const date = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : null;
  const lvl = level && level !== 'none' ? level : null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-mint/10 px-2 py-0.5 text-[10px] font-bold uppercase leading-4 tracking-[0.06em] text-mint-deep ring-1 ring-inset ring-mint/30"
      title={date ? `Verified buyer · ${level} · ${date}` : 'Verified buyer'}
      aria-label="Verified buyer"
    >
      <ShieldCheckIcon size={11} />
      Verified{lvl ? <span className="font-semibold opacity-70">· {lvl}</span> : null}
    </span>
  );
}
