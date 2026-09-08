/** Category intelligence over pre-aggregated spend. Pure, no IO. */
export function topCategory(rows: Array<{ category: string; totalCents: number }>): string | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => b.totalCents - a.totalCents)[0]!.category;
}

export function fastestGrowing(
  prev: Array<{ category: string; totalCents: number }>,
  curr: Array<{ category: string; totalCents: number }>,
): { category: string; pct: number } | null {
  const prevMap = new Map(prev.map((r) => [r.category, r.totalCents]));
  let best: { category: string; pct: number } | null = null;
  for (const c of curr) {
    const p = prevMap.get(c.category) ?? 0;
    if (p <= 0) continue;
    const pct = Math.round(((c.totalCents - p) / p) * 100);
    if (!best || pct > best.pct) best = { category: c.category, pct };
  }
  return best;
}
