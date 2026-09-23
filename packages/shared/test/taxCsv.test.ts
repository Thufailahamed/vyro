import { describe, expect, it } from 'vitest';
import { extractInclusiveTax } from '../src/lib/tax';
import { parseCsv, parseCsvRecords, toCsv } from '../src/lib/csv';

describe('extractInclusiveTax', () => {
  it('returns zero tax for unregistered suppliers', () => {
    const t = extractInclusiveTax(118_000, { vatRegistered: false, ssclRegistered: false });
    expect(t).toMatchObject({ netCents: 118_000, vatCents: 0, ssclCents: 0, taxCents: 0 });
  });

  it('extracts 18% VAT from a VAT-inclusive total', () => {
    const t = extractInclusiveTax(118_000, { vatRegistered: true, ssclRegistered: false });
    expect(t.netCents).toBe(100_000);
    expect(t.vatCents).toBe(18_000);
    expect(t.netCents + t.taxCents).toBe(118_000);
  });

  it('puts SSCL inside the VAT base', () => {
    // net 100,000 → SSCL 2,500 → VAT 18% of 102,500 = 18,450 → gross 120,950
    const t = extractInclusiveTax(120_950, { vatRegistered: true, ssclRegistered: true });
    expect(t).toMatchObject({ netCents: 100_000, ssclCents: 2_500, vatCents: 18_450 });
  });

  it('never changes the gross through rounding', () => {
    for (const gross of [1, 99, 12_345, 777_777, 1_000_003]) {
      const t = extractInclusiveTax(gross, { vatRegistered: true, ssclRegistered: true });
      expect(t.netCents + t.ssclCents + t.vatCents).toBe(gross);
      expect(t.vatCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('csv', () => {
  it('parses quoted fields, escaped quotes, CRLF and BOM', () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""",3\n\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', '3'],
    ]);
  });

  it('keeps newlines inside quoted cells', () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([['a'], ['line1\nline2']]);
  });

  it('normalizes headers into snake_case keys', () => {
    const { headers, records } = parseCsvRecords('Offer ID,Price LKR\nabc, 12.50 ');
    expect(headers).toEqual(['offer_id', 'price_lkr']);
    expect(records).toEqual([{ offer_id: 'abc', price_lkr: '12.50' }]);
  });

  it('round-trips through toCsv and neutralises formulas', () => {
    const out = toCsv(['name', 'n'], [['=HYPERLINK("x")', -5], ['a,b', null]]);
    expect(parseCsv(out)).toEqual([
      ['name', 'n'],
      [`'=HYPERLINK("x")`, '-5'],
      ['a,b', ''],
    ]);
    expect(parseCsvRecords(out).records[0]).toEqual({ name: '=HYPERLINK("x")', n: '-5' });
  });
});
