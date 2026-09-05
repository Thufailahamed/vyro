import { describe, expect, it } from 'vitest';
import {
  adminProductListQuery,
  adminProductPatchBody,
  adminCategoryCreateBody,
  adminCategoryUpdateBody,
  adminBusinessTypeCreateBody,
  adminBusinessTypeUpdateBody,
} from '../src/adminCatalog';

describe('adminProductListQuery', () => {
  it('accepts empty object with defaults', () => {
    const r = adminProductListQuery.parse({});
    expect(r.limit).toBe(50);
  });
  it('coerces active and featured from strings', () => {
    const r = adminProductListQuery.parse({ active: 'true', featured: 'false', limit: '20' });
    expect(r.active).toBe(true);
    expect(r.featured).toBe(false);
    expect(r.limit).toBe(20);
  });
  it('rejects unknown keys', () => {
    expect(() => adminProductListQuery.parse({ foo: 'bar' })).toThrow();
  });
  it('rejects limit > 100', () => {
    expect(() => adminProductListQuery.parse({ limit: '500' })).toThrow();
  });
});

describe('adminProductPatchBody', () => {
  it('accepts single field', () => {
    expect(() => adminProductPatchBody.parse({ name: 'Foo' })).not.toThrow();
  });
  it('accepts nullable fields', () => {
    const r = adminProductPatchBody.parse({ description: null, moderationNotes: null });
    expect(r.description).toBeNull();
  });
  it('rejects unknown keys', () => {
    expect(() => adminProductPatchBody.parse({ foo: 1 })).toThrow();
  });
  it('rejects too-long name', () => {
    expect(() => adminProductPatchBody.parse({ name: 'x'.repeat(201) })).toThrow();
  });
});

describe('adminCategoryCreateBody', () => {
  it('requires slug + name', () => {
    expect(() => adminCategoryCreateBody.parse({})).toThrow();
  });
  it('accepts minimal valid input', () => {
    const r = adminCategoryCreateBody.parse({ slug: 'beverages', name: 'Beverages' });
    expect(r.slug).toBe('beverages');
  });
  it('rejects too-long slug', () => {
    expect(() => adminCategoryCreateBody.parse({ slug: 'x'.repeat(61), name: 'X' })).toThrow();
  });
});

describe('adminCategoryUpdateBody', () => {
  it('accepts empty object (no-op)', () => {
    expect(() => adminCategoryUpdateBody.parse({})).not.toThrow();
  });
  it('accepts parentId null for top-level', () => {
    const r = adminCategoryUpdateBody.parse({ parentId: null });
    expect(r.parentId).toBeNull();
  });
});

describe('adminBusinessTypeCreateBody', () => {
  it('requires slug + name', () => {
    expect(() => adminBusinessTypeCreateBody.parse({ slug: 'x' })).toThrow();
  });
});

describe('adminBusinessTypeUpdateBody', () => {
  it('accepts active toggle only', () => {
    const r = adminBusinessTypeUpdateBody.parse({ active: false });
    expect(r.active).toBe(false);
  });
});
