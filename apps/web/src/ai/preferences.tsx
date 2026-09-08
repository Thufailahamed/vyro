import { SparklesIcon, CheckCircleIcon, Trash2Icon } from '@/components/icons';

export interface PrefRow {
  id: string;
  kind: 'preferred_supplier' | 'frequently_ordered' | 'procurement_default';
  key: string;
  valueJson: string;
  source: 'user' | 'inferred';
  confidence: number;
  occurrences: number;
}

const LABEL: Record<string, string> = {
  preferred_supplier: 'Preferred supplier',
  frequently_ordered: 'Frequently ordered',
  procurement_default: 'Procurement default',
};

export function PreferencesList({
  rows,
  onPromote,
  onRemove,
  promoting,
}: {
  rows: PrefRow[];
  onPromote: (p: PrefRow) => void;
  onRemove: (p: PrefRow) => void;
  promoting: boolean;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const eligible = r.source === 'inferred' && r.confidence >= 0.85 && r.occurrences >= 5;
        return (
          <li key={r.id} className="bg-paper border border-ink/15 p-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-4">{LABEL[r.kind] ?? r.kind}</span>
                <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border ${r.source === 'user' ? 'border-mint/40 text-mint bg-mint/5' : 'border-copper/40 text-copper bg-copper/5'}`}>
                  {r.source === 'user' ? 'User' : 'Inferred'}
                </span>
                {r.source === 'inferred' && (
                  <span className="text-[10px] font-mono text-ink-4">
                    {Math.round(r.confidence * 100)}% · {r.occurrences}×
                  </span>
                )}
              </div>
              <p className="font-display text-base text-ink">{r.key}</p>
              <p className="text-xs text-ink-4 font-mono break-all">{r.valueJson}</p>
            </div>
            <div className="flex items-center gap-2">
              {eligible ? (
                <button
                  type="button"
                  onClick={() => onPromote(r)}
                  disabled={promoting}
                  className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-mint hover:text-ink"
                >
                  <CheckCircleIcon size={13} /> Promote
                </button>
              ) : r.source === 'inferred' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-ink-4" title="Needs ≥ 0.85 confidence and ≥ 5 occurrences">
                  <SparklesIcon size={11} /> Needs more evidence
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onRemove(r)}
                className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-ink-4 hover:text-rose"
              >
                <Trash2Icon size={13} /> Remove
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
