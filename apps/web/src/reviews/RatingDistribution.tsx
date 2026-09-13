import type { JSX } from 'react';

export type Distribution = Record<1 | 2 | 3 | 4 | 5, number>;

export function RatingDistribution({ counts, total }: { counts: Distribution; total: number }): JSX.Element {
  return (
    <div className="space-y-1">
      {([5, 4, 3, 2, 1] as const).map((r) => {
        const n = counts[r];
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={r} className="flex items-center gap-2 text-xs">
            <span className="w-4 text-right">{r}</span>
            <div className="h-2 flex-1 rounded bg-gray-200">
              <div className="h-2 rounded bg-yellow-400" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-6 text-right text-gray-500">{n}</span>
          </div>
        );
      })}
    </div>
  );
}