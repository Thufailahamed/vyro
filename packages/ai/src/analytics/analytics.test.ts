import { describe, expect, it } from 'vitest';
import { priceWatchMove } from './priceWatch';
import { detectAnomaly, median } from './anomaly';
import { scoreSuppliers } from './supplierIntel';
import { procurementHealth } from './health';
import { forecastNextMonth } from './forecast';
import { topCategory, fastestGrowing } from './category';
import { mergeInsights } from './insights';

describe('priceWatchMove', () => {
  it('flags +8% with >=2 buys per window', () => {
    const r = priceWatchMove({ recentAvg: 10800, recentN: 3, priorAvg: 10000, priorN: 3 });
    expect(r?.pct).toBe(8);
  });
  it('returns null when recentN < 2', () => {
    expect(priceWatchMove({ recentAvg: 12000, recentN: 1, priorAvg: 10000, priorN: 3 })).toBeNull();
  });
  it('returns null below 5% threshold', () => {
    expect(priceWatchMove({ recentAvg: 10200, recentN: 3, priorAvg: 10000, priorN: 3 })).toBeNull();
  });
});

describe('anomaly', () => {
  it('computes median and flags >125%', () => {
    expect(median([100, 200, 300])).toBe(200);
    const r = detectAnomaly([18000, 19000, 20000, 18500], 25500);
    expect(r.flagged).toBe(true);
    expect(r.median).toBeGreaterThan(0);
  });
  it('does not flag normal prices', () => {
    expect(detectAnomaly([18000, 19000, 20000], 19500).flagged).toBe(false);
  });
});

describe('supplierIntel', () => {
  it('awards badges deterministically', () => {
    const rows = scoreSuppliers([
      { supplierId: 'a', supplierName: 'A', total: 10, accepted: 9, rejected: 1, cancelled: 0, delivered: 8, minPrice: 10000, minLead: 2 },
      { supplierId: 'b', supplierName: 'B', total: 10, accepted: 6, rejected: 2, cancelled: 2, delivered: 5, minPrice: 9000, minLead: 5 },
    ]);
    expect(rows[0]!.badges).toContain('best_overall');
    expect(rows.map((r) => r.badges).flat()).toContain('best_price');
  });
});

describe('health', () => {
  it('deducts concentration and price penalties transparently', () => {
    const h = procurementHealth({ maxShare: 0.42, savingsRatio: 0.06, minAccept: 0.9, gapCV: 0.2 });
    expect(h.score).toBe(70);
    expect(h.subs.concentration).toBe(-15);
    expect(h.subs.price).toBe(-15);
  });
  it('scores 100 when healthy', () => {
    expect(procurementHealth({ maxShare: 0.2, savingsRatio: 0.01, minAccept: 0.95, gapCV: 0.1 }).score).toBe(100);
  });
});

describe('forecast', () => {
  it('returns prediction with range', () => {
    const f = forecastNextMonth([100000, 110000, 120000]);
    expect(f.prediction).toBe(110000);
    expect(f.low).toBeLessThanOrEqual(f.prediction);
    expect(f.high).toBeGreaterThanOrEqual(f.prediction);
  });
});

describe('category', () => {
  it('finds top and fastest growing', () => {
    expect(topCategory([{ category: 'Food', totalCents: 640000 }, { category: 'Cleaning', totalCents: 50000 }])).toBe('Food');
    expect(fastestGrowing([{ category: 'Food', totalCents: 100 }], [{ category: 'Food', totalCents: 118 }])?.pct).toBe(18);
  });
});

describe('insights', () => {
  it('merges savings first', () => {
    const list = mergeInsights({
      moves: [{ productName: 'Rice', pct: 8 }],
      anomalies: [],
      savings: [{ productName: 'Oil', savingCents: 230000 }],
    });
    expect(list[0]!.kind).toBe('saving');
    expect(list.length).toBeLessThanOrEqual(10);
  });
});
