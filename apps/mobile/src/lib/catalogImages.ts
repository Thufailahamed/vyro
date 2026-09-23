/** Curated wholesale lot photos. Seeded Unsplash IDs are remapped here so local D1 does not need a re-seed. */
export const CATALOG_IMAGES = {
  SUGAR: 'https://images.unsplash.com/photo-1562245376-3f9dae9f0e73?auto=format&fit=crop&w=800&q=80',
  SUGAR_ALT: 'https://images.unsplash.com/photo-1602634896158-b9b4e3381304?auto=format&fit=crop&w=800&q=80',
  FLOUR: 'https://images.unsplash.com/photo-1714842981153-ffeaf74e7a1a?auto=format&fit=crop&w=800&q=80',
  FLOUR_ALT: 'https://images.unsplash.com/photo-1627735483792-233bf632619b?auto=format&fit=crop&w=800&q=80',
  COCONUT_OIL: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=800&q=80',
  RICE: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80',
} as const;

export const FALLBACK_PRODUCT_IMAGE = CATALOG_IMAGES.RICE;

/** Product IDs whose stored image is known-wrong or needs a stronger lot photo. */
export const PRODUCT_CATALOG_IMAGES: Record<string, string> = {
  'p-sugar-1kg': CATALOG_IMAGES.SUGAR,
  'p-sugar-50kg': CATALOG_IMAGES.SUGAR,
  'p-flour-1kg': CATALOG_IMAGES.FLOUR,
  'p-oil-coconut-1l': CATALOG_IMAGES.COCONUT_OIL,
};

const PRODUCT_IMAGE_ALTS: Record<string, string> = {
  'p-sugar-1kg': CATALOG_IMAGES.SUGAR_ALT,
  'p-sugar-50kg': CATALOG_IMAGES.SUGAR_ALT,
  'p-flour-1kg': CATALOG_IMAGES.FLOUR_ALT,
};

/** Unsplash photo ids that were labeled as commodities but depict something else. */
const MISLABELED_PHOTO_REPLACEMENTS: Record<string, string> = {
  'photo-1581441363689': CATALOG_IMAGES.SUGAR, // rose
  'photo-1509440159596': CATALOG_IMAGES.FLOUR, // bread loaves
  'photo-1622484212850': CATALOG_IMAGES.SUGAR, // chocolate
};

function replaceMislabeled(url: string): { url: string; wasBad: boolean } {
  for (const [fragment, replacement] of Object.entries(MISLABELED_PHOTO_REPLACEMENTS)) {
    if (url.includes(fragment)) return { url: replacement, wasBad: true };
  }
  return { url, wasBad: false };
}

export function resolveCatalogImage(
  productId?: string | null,
  url?: string | null,
  index = 0,
): string | undefined {
  const primary = productId ? PRODUCT_CATALOG_IMAGES[productId] : undefined;
  const alt = productId ? PRODUCT_IMAGE_ALTS[productId] : undefined;
  const curated = index > 0 && alt ? alt : primary;

  if (url) {
    const mapped = replaceMislabeled(url);
    if (mapped.wasBad) return curated ?? mapped.url;
    return mapped.url;
  }

  return curated;
}
