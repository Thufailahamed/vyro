import type { AiRepos, ProductRow } from './repos';

export interface ProductMatch {
  kind: 'single';
  product: ProductRow;
}

export interface ProductClarify {
  kind: 'clarify';
  question: string;
  options: string[];
}

export type MatchOutcome = ProductMatch | ProductClarify;

/**
 * resolveProduct: exact-name match wins; a single fuzzy hit is accepted;
 * multiple fuzzy hits produce a clarification instead of a random pick.
 * Never hallucinates — unknown names return a clarification, not null.
 */
export async function resolveProduct(
  repos: AiRepos,
  rawName: string,
): Promise<MatchOutcome | { kind: 'unknown'; name: string }> {
  const name = rawName.trim().toLowerCase();
  if (!name) return { kind: 'unknown', name: rawName };
  const hits = await repos.searchProducts(name, 5);
  if (!hits.length) {
    // Fall back to the looser LIKE lookup before giving up.
    const loose = await repos.findProductByName(name);
    if (loose) return { kind: 'single', product: loose };
    return { kind: 'unknown', name: rawName.trim() };
  }
  const exact = hits.find((h) => h.name.toLowerCase() === name);
  if (exact) return { kind: 'single', product: exact };
  if (hits.length === 1) return { kind: 'single', product: hits[0]! };
  return {
    kind: 'clarify',
    question: `I found several products matching "${rawName.trim()}". Which one do you mean?`,
    options: hits.slice(0, 4).map((h) => h.name),
  };
}
