import { describe, expect, it } from 'vitest';
import { generateSlug, ensureUniqueSlug } from '../../src/modules/storefront/service';

describe('generateSlug', () => {
  it('lowercases', () => expect(generateSlug(null, 'Colombo')).toBe('colombo'));
  it('replaces spaces with dashes', () => expect(generateSlug(null, 'Fresh Dairy')).toBe('fresh-dairy'));
  it('strips punctuation', () => expect(generateSlug(null, "Joe's Dairy!")).toBe('joe-s-dairy'));
  it('collapses repeated dashes', () => expect(generateSlug(null, 'a - b')).toBe('a-b'));
  it('trims leading/trailing dashes', () => expect(generateSlug(null, '  hello  ')).toBe('hello'));
  it('truncates to 60 chars', () => {
    const s = generateSlug(null, 'a'.repeat(80));
    expect(s.length).toBeLessThanOrEqual(60);
  });
  it('returns empty for null city/name', () => expect(generateSlug(null, null)).toBe(''));
  it('includes city prefix', () => expect(generateSlug('Colombo', 'Fresh')).toBe('colombo-fresh'));
});

describe('ensureUniqueSlug', () => {
  it('returns base when not taken', () => {
    expect(ensureUniqueSlug('foo', new Set())).toBe('foo');
  });
  it('appends -2 when taken', () => {
    expect(ensureUniqueSlug('foo', new Set(['foo']))).toBe('foo-2');
  });
  it('appends -3 when foo and foo-2 taken', () => {
    expect(ensureUniqueSlug('foo', new Set(['foo', 'foo-2']))).toBe('foo-3');
  });
  it('caps at 60 chars', () => {
    const taken = new Set(Array.from({ length: 50 }, (_, i) => `long-slug-${i}`));
    const out = ensureUniqueSlug('a'.repeat(60), taken);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(taken.has(out)).toBe(false);
  });
});
