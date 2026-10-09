import type { LeadConversionStatus } from '@vyro/validation';

const STYLES: Record<LeadConversionStatus, { bg: string; dot: string }> = {
  new: { bg: 'bg-ink/[0.05] text-ink-3 ring-ink/12', dot: 'bg-ink-4' },
  contacted: { bg: 'bg-copper/10 text-copper-deep ring-copper/25', dot: 'bg-copper' },
  quoted: { bg: 'bg-volt/25 text-ink ring-volt-deep/35', dot: 'bg-volt-deep' },
  won: { bg: 'bg-mint/12 text-mint-deep ring-mint/30', dot: 'bg-mint' },
  lost: { bg: 'bg-rose/10 text-rose ring-rose/25', dot: 'bg-rose' },
};

interface Props {
  status: LeadConversionStatus | null;
  className?: string;
}

export function ConversionBadge({ status, className = '' }: Props) {
  if (!status) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-ink-4 ring-1 ring-inset ring-ink/15 ring-dashed ${className}`}>
        <span className="size-1.5 rounded-full bg-ink-4/40" />
        Untracked
      </span>
    );
  }

  const conf = STYLES[status] ?? STYLES.new;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize leading-5 ring-1 ring-inset ${conf.bg} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${conf.dot}`} />
      {status}
    </span>
  );
}
