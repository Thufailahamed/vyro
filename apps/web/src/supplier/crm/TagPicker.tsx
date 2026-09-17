import type { LeadTag } from '@vyro/validation';

const TAGS: LeadTag[] = ['hot', 'warm', 'cold'];

const TAG_STYLES: Record<LeadTag, { active: string; idle: string; dot: string }> = {
  hot: {
    active: 'bg-rose/15 text-rose border-rose/40 font-semibold shadow-xs',
    idle: 'hover:border-rose/30 hover:bg-rose/5 text-ink-3',
    dot: 'bg-rose',
  },
  warm: {
    active: 'bg-amber-500/15 text-amber-700 border-amber-500/40 font-semibold shadow-xs',
    idle: 'hover:border-amber-500/30 hover:bg-amber-500/5 text-ink-3',
    dot: 'bg-amber-600',
  },
  cold: {
    active: 'bg-sky-500/15 text-sky-700 border-sky-500/40 font-semibold shadow-xs',
    idle: 'hover:border-sky-500/30 hover:bg-sky-500/5 text-ink-3',
    dot: 'bg-sky-600',
  },
};

interface Props {
  value: LeadTag | null;
  onChange: (tag: LeadTag | null) => void;
  disabled?: boolean;
}

export function TagPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TAGS.map((t) => {
        const active = value === t;
        const style = TAG_STYLES[t];
        return (
          <button
            key={t}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(active ? null : t)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium capitalize transition-all duration-150 ${
              active
                ? style.active
                : `border-ink/15 bg-paper ${style.idle}`
            } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
          >
            <span className={`size-1.5 rounded-full ${active ? style.dot : 'bg-ink-4/40'}`} />
            {t}
          </button>
        );
      })}
      {value && (
        <button
          type="button"
          disabled={disabled}
          aria-pressed={false}
          onClick={() => onChange(null)}
          className="text-xs text-ink-4 hover:text-ink-1 underline transition-colors cursor-pointer ml-1"
        >
          clear
        </button>
      )}
    </div>
  );
}
