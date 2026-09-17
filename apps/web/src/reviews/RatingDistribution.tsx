import type { JSX } from 'react';

export type Distribution = Record<1 | 2 | 3 | 4 | 5, number>;

export function RatingDistribution({ counts, total }: { counts: Distribution; total: number }): JSX.Element {
  return (
    <div className="space-y-1.5 w-full">
      {([5, 4, 3, 2, 1] as const).map((r) => {
        const n = counts[r] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={r} className="flex items-center gap-2 text-xs">
            <span className="w-5 text-right font-mono text-ink-3 font-semibold flex items-center justify-end gap-0.5">
              <span>{r}</span>
              <span className="text-[10px] text-amber-500">★</span>
            </span>
            <div className="h-2 flex-1 rounded bg-gray-200 overflow-hidden">
              <div
                className="h-2 rounded bg-yellow-400 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-9 text-right font-mono text-xs text-ink-4">
              {pct}%
            </span>
            <span className="w-6 text-right font-mono text-xs text-ink-3 font-semibold">
              {n}
            </span>
          </div>
        );
      })}
    </div>
  );
}