/** Merge per-engine outputs into a ranked insights feed. Pure, no IO. */
export interface Insight {
  kind: string;
  evidence: string;
  action: string;
}

export function mergeInsights(parts: {
  moves: Array<{ productName: string; pct: number }>;
  anomalies: Array<{ productName: string; ratio: number }>;
  savings: Array<{ productName: string; savingCents: number }>;
}): Insight[] {
  const out: Insight[] = [
    ...parts.savings.slice(0, 4).map((s) => ({
      kind: 'saving',
      evidence: `${s.productName}: save Rs. ${(s.savingCents / 100).toFixed(2)}`,
      action: '/analytics',
    })),
    ...parts.moves.slice(0, 4).map((m) => ({
      kind: 'price',
      evidence: `${m.productName} moved ${m.pct}%`,
      action: '/analytics',
    })),
    ...parts.anomalies.slice(0, 2).map((a) => ({
      kind: 'anomaly',
      evidence: `${a.productName} is ${a.ratio}x your recent range`,
      action: '/analytics',
    })),
  ];
  return out.slice(0, 10);
}
