import { describe, expect, it } from 'vitest';
import { parseNlFilters } from './nlFilters';

describe('parseNlFilters', () => {
  it('extracts priceMaxCents + sort + delivery and strips phrases', () => {
    const r = parseNlFilters('cheap rice under Rs. 20,000 tomorrow');
    expect(r.filters.priceMaxCents).toBe(2_000_000);
    expect(r.filters.availableWithinDays).toBe(1);
    expect(r.filters.sort).toBe('price_asc');
    expect(r.query).toMatch(/rice/);
    expect(r.query).not.toMatch(/under/i);
  });

  it('maps category slang', () => {
    const r = parseNlFilters('flour for bakery');
    expect(r.filters.categorySlug).toBe('bakery');
    expect(r.query).toMatch(/flour/);
  });

  it('leaves clean queries alone', () => {
    const r = parseNlFilters('samba rice 25kg');
    expect(r.query).toBe('samba rice 25kg');
    expect(r.filters.priceMaxCents).toBeUndefined();
    expect(r.filters.sort).toBeUndefined();
  });

  it('parses lead-time sort from urgent', () => {
    const r = parseNlFilters('cooking oil urgent');
    expect(r.filters.sort).toBe('lead_asc');
    expect(r.query).toMatch(/cooking oil/);
  });

  it('extracts supplier name from "from <Supplier>"', () => {
    const r = parseNlFilters('sugar from Best Wholesale');
    expect(r.filters.supplierName).toBe('Best Wholesale');
    expect(r.query).toMatch(/sugar/);
  });

  it('handles "in 2 days" → availableWithinDays=2', () => {
    const r = parseNlFilters('rice in 2 days');
    expect(r.filters.availableWithinDays).toBe(2);
  });
});
