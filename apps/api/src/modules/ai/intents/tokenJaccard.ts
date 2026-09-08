/**
 * Token-Jaccard similarity. Drops punctuation, lower-cases, splits on whitespace,
 * and computes |A ∩ B| / |A ∪ B| over unique tokens. Returns 0 for either side
 * empty; 1 when both token sets are identical.
 */
export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}

export function tokenJaccard(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}
