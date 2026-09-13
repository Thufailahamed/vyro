import { describe, expect, it } from 'vitest';
import { supplierSlugSchema, updateSupplierSlugSchema } from '../src/suppliers';

describe('supplierSlugSchema', () => {
  it('accepts kebab slug', () => {
    expect(supplierSlugSchema.parse('colombo-fresh-dairy').toString()).toBe('colombo-fresh-dairy');
  });
  it('rejects uppercase', () => {
    expect(() => supplierSlugSchema.parse('Colombo')).toThrow();
  });
  it('rejects spaces', () => {
    expect(() => supplierSlugSchema.parse('colombo fresh')).toThrow();
  });
  it('rejects > 60 chars', () => {
    expect(() => supplierSlugSchema.parse('a'.repeat(61))).toThrow();
  });
  it('accepts single word', () => {
    expect(supplierSlugSchema.parse('dairy').toString()).toBe('dairy');
  });
  it('rejects empty', () => {
    expect(() => supplierSlugSchema.parse('')).toThrow();
  });
});

describe('updateSupplierSlugSchema', () => {
  it('accepts valid slug', () => {
    expect(updateSupplierSlugSchema.parse({ slug: 'foo' }).slug).toBe('foo');
  });
  it('rejects invalid slug', () => {
    expect(() => updateSupplierSlugSchema.parse({ slug: 'FOO' })).toThrow();
  });
});
