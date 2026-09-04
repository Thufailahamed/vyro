import { describe, expect, it } from 'vitest';
import { businessTypesResponseSchema, supplierTypesResponseSchema } from '../src/index';

describe('type catalogues', () => {
  it('business types response parses', () => {
    const r = businessTypesResponseSchema.parse({
      types: [{ id: 'b1', slug: 'restaurant', name: 'Restaurant', sortOrder: 1 }],
    });
    expect(r.types).toHaveLength(1);
  });
  it('supplier types response parses', () => {
    expect(supplierTypesResponseSchema.parse({ types: [] }).types).toEqual([]);
  });
});
