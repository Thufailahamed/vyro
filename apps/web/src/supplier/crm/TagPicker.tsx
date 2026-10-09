import { cn } from '@vyro/ui';
import type { LeadTag } from '@vyro/validation';
import { TAG_META } from './crmUi';

const TAGS: LeadTag[] = ['hot', 'warm', 'cold'];

const ACTIVE: Record<LeadTag, string> = {
  hot: 'bg-rose/10 text-rose shadow-[inset_0_0_0_1.5px_rgba(196,90,74,0.5)]',
  warm: 'bg-amber/10 text-[#a86c28] shadow-[inset_0_0_0_1.5px_rgba(196,132,58,0.55)]',
  cold: 'bg-ink/[0.06] text-ink shadow-[inset_0_0_0_1.5px_rgba(12,14,11,0.35)]',
};

interface Props {
  value: LeadTag | null;
  onChange: (tag: LeadTag | null) => void;
  disabled?: boolean;
}

export function TagPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TAGS.map((t) => {
        const active = value === t;
        const m = TAG_META[t];
        return (
          <button
            key={t}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(active ? null : t)}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold capitalize transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? ACTIVE[t]
                : 'bg-paper text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.3)]',
            )}
          >
            <span className={cn('size-2 rounded-full', active ? m.dot : 'bg-ink/25')} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
