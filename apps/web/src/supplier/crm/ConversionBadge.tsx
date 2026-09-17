import type { LeadConversionStatus } from '@vyro/validation';

const STYLES: Record<LeadConversionStatus, { bg: string; dot: string }> = {
  new: { bg: 'bg-mist text-ink-2 border-ink/10', dot: 'bg-ink-4' },
  contacted: { bg: 'bg-copper/10 text-copper-deep border-copper/25', dot: 'bg-copper' },
  quoted: { bg: 'bg-volt/20 text-ink border-volt/40 font-medium', dot: 'bg-volt-deep' },
  won: { bg: 'bg-mint/15 text-mint-deep border-mint/30 font-medium', dot: 'bg-mint' },
  lost: { bg: 'bg-rose/10 text-rose border-rose/25', dot: 'bg-rose' },
};

interface Props {
  status: LeadConversionStatus | null;
  className?: string;
}

export function ConversionBadge({ status, className = '' }: Props) {
  if (!status) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/20 px-2.5 py-0.5 text-[11px] font-mono text-ink-4 ${className}`}>
        <span className="size-1 rounded-full bg-ink-4/40" />
        untracked
      </span>
    );
  }

  const conf = STYLES[status] ?? { bg: 'bg-mist text-ink-3 border-ink/10', dot: 'bg-ink-4' };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-mono font-medium capitalize tracking-wide transition-colors ${conf.bg} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${conf.dot}`} />
      {status}
    </span>
  );
}
