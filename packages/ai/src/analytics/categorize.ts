/** Local minimal shape — decouples the rule engine from the DB package. */
export interface CategoryMappingLike {
  id: string;
  businessId: string | null;
  matchPattern: string;
  categorySlug: string;
  priority: number;
  source: 'seed' | 'manual';
  createdAt: number;
}

export type CategorySlug = 'food' | 'packaging' | 'cleaning' | 'office' | 'equipment' | 'other';

export interface CategorizableItem {
  description: string;
}

export interface CategorizedItem extends CategorizableItem {
  categorySlug: CategorySlug;
  categorySource: 'rule' | 'default';
}

const DEFAULT_CATEGORY: CategorySlug = 'other';

/**
 * Pure categorization. Per-business mappings (where businessId === bizId) win
 * over globals (businessId IS NULL). Among ties, highest priority wins; on
 * still-tied priorities, first-encountered wins (stable sort).
 *
 * No LLM. No fuzzy. No embeddings. Manual corrections flip source to 'manual'
 * upstream; this function returns 'rule' | 'default' only.
 */
export function categorizeItems(
  items: CategorizableItem[],
  mappings: CategoryMappingLike[],
  businessId: string,
): CategorizedItem[] {
  return items.map((item) => {
    const desc = (item.description ?? '').toLowerCase();
    const candidates = mappings
      .filter((m) => m.businessId === null || m.businessId === businessId)
      .filter((m) => desc.includes(m.matchPattern.toLowerCase()))
      .sort((a, b) => {
        const aBiz = a.businessId === businessId ? 1 : 0;
        const bBiz = b.businessId === businessId ? 1 : 0;
        if (aBiz !== bBiz) return bBiz - aBiz;
        return b.priority - a.priority;
      });
    const winner = candidates[0];
    if (!winner) {
      return { ...item, categorySlug: DEFAULT_CATEGORY, categorySource: 'default' };
    }
    return {
      ...item,
      categorySlug: (winner.categorySlug as CategorySlug) ?? DEFAULT_CATEGORY,
      categorySource: 'rule',
    };
  });
}

/**
 * Build a new per-business mapping row from a manual correction. Caller is
 * responsible for inserting via Drizzle.
 */
export function buildManualMapping(input: {
  id: string;
  businessId: string;
  matchPattern: string;
  categorySlug: CategorySlug;
  createdAt: number;
}): CategoryMappingLike {
  return {
    id: input.id,
    businessId: input.businessId,
    matchPattern: input.matchPattern,
    categorySlug: input.categorySlug,
    priority: 50,
    source: 'manual',
    createdAt: input.createdAt,
  };
}
