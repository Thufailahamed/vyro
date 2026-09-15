import { CalendarIcon } from '@/components/icons';

interface Props {
  sinceYear?: number | null;
  memberYears?: number | null;
  sinceDate?: string | null;
}

export function MemberSinceBadge({ sinceYear, memberYears, sinceDate }: Props) {
  if (sinceYear == null) return null;
  const suffix = memberYears == null ? '' : memberYears <= 0 ? ' · New' : ` · ${memberYears} yrs`;
  const dateLabel = sinceDate ? new Date(sinceDate).toLocaleDateString() : null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold bg-ink/5 text-ink-2 border border-ink/15 rounded-full"
      title={dateLabel ? `Supplier on Vyro since ${dateLabel}` : `Member since ${sinceYear}`}
      aria-label={`Member since ${sinceYear}`}
    >
      <CalendarIcon size={12} />
      MEMBER SINCE {sinceYear}{suffix}
    </span>
  );
}
