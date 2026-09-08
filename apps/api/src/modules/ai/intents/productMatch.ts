import type { AiRepos, ProductRow } from './repos';
import { tokenJaccard } from './tokenJaccard';

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

const JACCARD_ACCEPT = 0.4;
const JACCARD_CONFIDENT = 0.5;

/**
 * resolveProduct: exact-name match wins; a single fuzzy hit is re-ranked by
 * token-Jaccard and accepted when above threshold; multiple fuzzy hits produce
 * a clarification instead of a random pick.
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
    const loose = await repos.findProductByName(name);
    if (loose) return { kind: 'single', product: loose };
    return { kind: 'unknown', name: rawName.trim() };
  }
  const exact = hits.find((h) => h.name.toLowerCase() === name);
  if (exact) return { kind: 'single', product: exact };

  // Re-rank fuzzy hits by token-Jaccard. Below threshold → clarify.
  const ranked = hits
    .map((h) => ({ h, j: tokenJaccard(rawName, h.name) }))
    .sort((a, b) => b.j - a.j);
  const top = ranked[0]!;
  if (ranked.length === 1 && top.j >= JACCARD_ACCEPT) {
    return { kind: 'single', product: top.h };
  }
  if (top.j >= JACCARD_CONFIDENT && top.j - (ranked[1]?.j ?? 0) >= 0.2) {
    return { kind: 'single', product: top.h };
  }
  return {
    kind: 'clarify',
    question: `I found several products matching "${rawName.trim()}". Which one do you mean?`,
    options: ranked.slice(0, 4).map((x) => x.h.name),
  };
}

