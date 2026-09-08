import { describe, it, expect } from 'vitest';
import { categorizeItems, buildManualMapping } from './categorize';
import type { CategoryMapping } from '@vyro/db/schema';

const mappings: CategoryMapping[] = [
  { id: 'g1', businessId: null, matchPattern: 'rice', categorySlug: 'food', priority: 10, source: 'seed', createdAt: 0 },
  { id: 'g2', businessId: null, matchPattern: 'carton', categorySlug: 'packaging', priority: 10, source: 'seed', createdAt: 0 },
  { id: 'g3', businessId: null, matchPattern: 'paper', categorySlug: 'office', priority: 10, source: 'seed', createdAt: 0 },
  { id: 'b1', businessId: 'biz-1', matchPattern: 'rice', categorySlug: 'equipment', priority: 20, source: 'manual', createdAt: 0 },
];

describe('categorizeItems', () => {
  it('returns default category when no match', () => {
    const out = categorizeItems([{ description: 'unknown widget' }], mappings, 'biz-1');
    expect(out[0]!.categorySlug).toBe('other');
    expect(out[0]!.categorySource).toBe('default');
  });

  it('applies global rule when no per-business override', () => {
    const out = categorizeItems([{ description: 'Basmati Rice 5kg' }], mappings, 'biz-2');
    expect(out[0]!.categorySlug).toBe('food');
    expect(out[0]!.categorySource).toBe('rule');
  });

  it('per-business mapping overrides global at higher priority', () => {
    const out = categorizeItems([{ description: 'Basmati Rice 5kg' }], mappings, 'biz-1');
    expect(out[0]!.categorySlug).toBe('equipment');
    expect(out[0]!.categorySource).toBe('rule');
  });

  it('first matching pattern in priority order wins', () => {
    const local: CategoryMapping[] = [
      { id: 'b2', businessId: 'biz-3', matchPattern: 'rice', categorySlug: 'food', priority: 30, source: 'manual', createdAt: 0 },
      { id: 'b3', businessId: 'biz-3', matchPattern: 'rice', categorySlug: 'equipment', priority: 40, source: 'manual', createdAt: 0 },
    ];
    const out = categorizeItems([{ description: 'rice bag' }], local, 'biz-3');
    expect(out[0]!.categorySlug).toBe('equipment');
  });

  it('case-insensitive substring match', () => {
    const out = categorizeItems([{ description: 'OFFICE PAPER A4' }], mappings, 'biz-x');
    expect(out[0]!.categorySlug).toBe('office');
  });

  it('preserves original description and returns all rows', () => {
    const items = [
      { description: 'rice' },
      { description: 'carton box' },
      { description: 'thingamajig' },
    ];
    const out = categorizeItems(items, mappings, 'biz-1');
    expect(out).toHaveLength(3);
    expect(out[0]!.categorySlug).toBe('equipment');
    expect(out[1]!.categorySlug).toBe('packaging');
    expect(out[2]!.categorySlug).toBe('other');
  });

  it('buildManualMapping creates a per-business priority-50 row', () => {
    const row = buildManualMapping({
      id: 'm1',
      businessId: 'biz-9',
      matchPattern: 'rice',
      categorySlug: 'food',
      createdAt: 1000,
    });
    expect(row).toMatchObject({
      id: 'm1',
      businessId: 'biz-9',
      matchPattern: 'rice',
      categorySlug: 'food',
      priority: 50,
      source: 'manual',
      createdAt: 1000,
    });
  });
});
