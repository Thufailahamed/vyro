import { describe, expect, it } from 'vitest';
import { CATALOG_IMAGES, resolveCatalogImage } from '../src/lib/catalogImages';

describe('resolveCatalogImage', () => {
  it('replaces the rose photo used for sugar lots', () => {
    expect(
      resolveCatalogImage('p-sugar-1kg', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format'),
    ).toBe(CATALOG_IMAGES.SUGAR);
  });

  it('replaces bread-loaf photos used for flour lots', () => {
    expect(
      resolveCatalogImage('p-flour-1kg', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format'),
    ).toBe(CATALOG_IMAGES.FLOUR);
  });

  it('rewrites known-wrong Unsplash ids even without a product id', () => {
    expect(resolveCatalogImage(null, 'https://images.unsplash.com/photo-1622484212850-eb596d769edc')).toBe(
      CATALOG_IMAGES.SUGAR,
    );
  });

  it('passes through unrelated product photos', () => {
    const rice = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format';
    expect(resolveCatalogImage('p-rice-5kg', rice)).toBe(rice);
  });

  it('uses an alternate lot photo for later gallery frames', () => {
    expect(
      resolveCatalogImage('p-sugar-1kg', 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635', 1),
    ).toBe(CATALOG_IMAGES.SUGAR_ALT);
  });
});
