export interface InferenceSignal {
  kind: 'preferred_supplier' | 'frequently_ordered' | 'procurement_default';
  key: string;
  occurrences: number;
}

export interface InferredPreference {
  kind: InferenceSignal['kind'];
  key: string;
  valueJson: string;
  confidence: number;
  occurrences: number;
}

const MIN_OCCURRENCES = 3;
const CONFIDENCE_FLOOR = 0.5;

/**
 * Pure inference. Maps raw signals (e.g. "sup-1 appeared 7 times in last 90d")
 * to a per-business preference candidate. Never persists; never promotes
 * inferred → user. The cron + memory layer owns promotion.
 */
export function inferPreferences(signals: InferenceSignal[]): InferredPreference[] {
  const out: InferredPreference[] = [];
  for (const s of signals) {
    if (s.occurrences < MIN_OCCURRENCES) continue;
    const confidence = Math.min(1, CONFIDENCE_FLOOR + s.occurrences * 0.05);
    out.push({
      kind: s.kind,
      key: s.key,
      valueJson: JSON.stringify({ occurrences: s.occurrences }),
      confidence,
      occurrences: s.occurrences,
    });
  }
  return out;
}
