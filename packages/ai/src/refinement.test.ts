import { describe, expect, it } from 'vitest';
import { heuristicClassify } from './intents';

const dict = {
  products: ['samba rice', 'chicken', 'cooking oil'],
  suppliers: ['Supplier A', 'Alpha Foods'],
};

describe('procurement language', () => {
  it('"I need 50kg rice" is a cheapest lookup with quantity', () => {
    const r = heuristicClassify('I need 50kg samba rice', dict);
    expect(r.intent).toBe('find_cheapest');
    expect(r.slots.productName).toBe('samba rice');
    expect(r.slots.quantity).toBe(50);
    expect(r.slots.unit).toBe('kg');
  });

  it('"50 kilos" normalizes to kg', () => {
    const r = heuristicClassify('I need 50 kilos samba rice', dict);
    expect(r.slots.quantity).toBe(50);
    expect(r.slots.unit).toBe('kg');
  });

  it('"five bottles" parses word numbers and units', () => {
    const r = heuristicClassify('I need five bottles cooking oil', dict);
    expect(r.slots.quantity).toBe(5);
    expect(r.slots.unit).toBe('bottle');
  });

  it('"2 bags" parses bag units', () => {
    const r = heuristicClassify('get me 2 bags samba rice', dict);
    expect(r.slots.quantity).toBe(2);
    expect(r.slots.unit).toBe('bag');
  });

  it('"10 cartons" parses carton units', () => {
    const r = heuristicClassify('order 10 cartons chicken', dict);
    expect(r.slots.quantity).toBe(10);
    expect(r.slots.unit).toBe('carton');
  });
});

describe('spend routing', () => {
  it('"how much did I spend on rice last month" is product_spend', () => {
    const r = heuristicClassify('how much did I spend on samba rice last month', dict);
    expect(r.intent).toBe('product_spend');
    expect(r.slots.productName).toBe('samba rice');
    expect(r.slots.period).toBe('month');
  });

  it('"spend with supplier" is supplier_spend', () => {
    const r = heuristicClassify('how much did I spend with Supplier A last month', dict);
    expect(r.intent).toBe('supplier_spend');
    expect(r.slots.supplierName).toBe('Supplier A');
  });

  it('bare spend is business spend_summary', () => {
    const r = heuristicClassify('how much did I spend this month', dict);
    expect(r.intent).toBe('spend_summary');
  });
});

describe('supplier recommend', () => {
  it('"which supplier is best" routes to supplier_recommend', () => {
    const r = heuristicClassify('which supplier is best for samba rice', dict);
    expect(r.intent).toBe('supplier_recommend');
    expect(r.slots.productName).toBe('samba rice');
  });
});

describe('multi-product caution', () => {
  it('lowers confidence when two products match', () => {
    const r = heuristicClassify('cheapest samba rice and chicken', dict);
    expect(r.intent).toBe('find_cheapest');
    expect(r.confidence).toBeLessThanOrEqual(0.55);
  });
});
