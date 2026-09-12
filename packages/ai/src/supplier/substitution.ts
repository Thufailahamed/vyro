import type { SolverCatalogOffer, SolverRfqItem } from './types';

export interface CatalogMatchResult {
  matchType: 'exact' | 'fuzzy' | 'substitute' | 'unmatched';
  offer?: SolverCatalogOffer;
  isAlternative: boolean;
  alternativeReason?: string;
}

function tokenize(str: string): Set<string> {
  const words = str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function findCatalogMatch(
  item: SolverRfqItem,
  catalog: SolverCatalogOffer[],
  includeAlternatives: boolean = true,
): CatalogMatchResult {
  // 1. Check exact productId match
  if (item.productId) {
    const exact = catalog.find((c) => c.productId === item.productId);
    if (exact) {
      if (exact.availabilityStatus !== 'out_of_stock') {
        return { matchType: 'exact', offer: exact, isAlternative: false };
      }
      // Exact item is out of stock - find substitute if allowed
      if (includeAlternatives) {
        const sub = findSubstitute(exact, item, catalog);
        if (sub) {
          return {
            matchType: 'substitute',
            offer: sub,
            isAlternative: true,
            alternativeReason: `Original product '${exact.name}' is currently out of stock. Proposing in-stock substitute '${sub.name}'.`,
          };
        }
      }
      // Return exact anyway with out_of_stock indicator if no substitute
      return { matchType: 'exact', offer: exact, isAlternative: false };
    }
  }

  // 2. Token Jaccard matching on description
  const itemTokens = tokenize(item.description);
  let bestScore = 0;
  let bestOffer: SolverCatalogOffer | undefined;

  for (const offer of catalog) {
    const offerTokens = tokenize(offer.name);
    const score = jaccardSimilarity(itemTokens, offerTokens);
    if (score > bestScore) {
      bestScore = score;
      bestOffer = offer;
    }
  }

  if (bestOffer && bestScore >= 0.3) {
    if (bestOffer.availabilityStatus !== 'out_of_stock') {
      return { matchType: 'fuzzy', offer: bestOffer, isAlternative: false };
    }
    if (includeAlternatives) {
      const sub = findSubstitute(bestOffer, item, catalog);
      if (sub) {
        return {
          matchType: 'substitute',
          offer: sub,
          isAlternative: true,
          alternativeReason: `Matched item '${bestOffer.name}' is out of stock. Proposing substitute '${sub.name}'.`,
        };
      }
    }
    return { matchType: 'fuzzy', offer: bestOffer, isAlternative: false };
  }

  return { matchType: 'unmatched', isAlternative: false };
}

function findSubstitute(
  baseOffer: SolverCatalogOffer,
  item: SolverRfqItem,
  catalog: SolverCatalogOffer[],
): SolverCatalogOffer | undefined {
  const inStockOffers = catalog.filter(
    (c) =>
      c.supplierProductId !== baseOffer.supplierProductId &&
      c.availabilityStatus !== 'out_of_stock',
  );

  // Match in same category first
  if (baseOffer.category) {
    const categoryMatches = inStockOffers.filter(
      (c) => c.category && c.category.toLowerCase() === baseOffer.category!.toLowerCase(),
    );
    if (categoryMatches.length > 0) {
      const itemTokens = tokenize(item.description);
      categoryMatches.sort((a, b) => {
        const scoreA = jaccardSimilarity(itemTokens, tokenize(a.name));
        const scoreB = jaccardSimilarity(itemTokens, tokenize(b.name));
        return scoreB - scoreA;
      });
      return categoryMatches[0];
    }
  }

  // Fallback to highest token similarity among all in-stock items
  const itemTokens = tokenize(item.description);
  let bestScore = 0;
  let bestSub: SolverCatalogOffer | undefined;
  for (const offer of inStockOffers) {
    const score = jaccardSimilarity(itemTokens, tokenize(offer.name));
    if (score > bestScore) {
      bestScore = score;
      bestSub = offer;
    }
  }
  return bestScore >= 0.25 ? bestSub : undefined;
}
