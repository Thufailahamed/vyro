import type { LeadTag } from '@vyro/validation';

const TAGS: LeadTag[] = ['hot', 'warm', 'cold'];

const TAG_STYLES: Record<LeadTag, string> = {
  hot: 'bg-red-100 text-red-700 border-red-200',
  warm: 'bg-amber-100 text-amber-700 border-amber-200',
  cold: 'bg-blue-100 text-blue-700 border-blue-200',
};

interface Props {
  value: LeadTag | null;
  onChange: (tag: LeadTag | null) => void;
  disabled?: boolean;
}

export function TagPicker({ value, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-ink-4">Tag</span>
      {TAGS.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            disabled={disabled}
            onClick={() => onChange(active ? null : t)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition ${
              active ? TAG_STYLES[t] : 'border-ink-3 bg-paper text-ink-3 hover:border-ink-2'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            {t}
          </button>
        );
      })}
      {value && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className="text-xs text-ink-4 underline hover:text-ink-2"
        >
          clear
        </button>
      )}
    </div>
  );
}
