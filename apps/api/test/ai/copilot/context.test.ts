import { describe, expect, it } from 'vitest';
import { applyPageContext } from '../../../src/modules/ai/context';

describe('applyPageContext', () => {
  const catalog = { products: ['Samba Rice', 'Chicken'], suppliers: ['ABC Foods', 'Best Supply'] };

  it('fills missing productName from context on pronoun prompts', () => {
    const r = applyPageContext({}, { page: 'product', productName: 'Samba Rice' }, catalog, 'find something cheaper');
    expect(r.slots.productName).toBe('Samba Rice');
    expect(r.filledFromContext).toBe(true);
  });

  it('never overrides explicit slots', () => {
    const r = applyPageContext({ productName: 'Chicken' }, { page: 'product', productName: 'Samba Rice' }, catalog, 'cheapest chicken');
    expect(r.slots.productName).toBe('Chicken');
  });

  it('ignores unknown context names', () => {
    const r = applyPageContext({}, { page: 'product', productName: 'Unicorn Meat' }, catalog, 'find something cheaper');
    expect(r.slots.productName).toBeUndefined();
  });

  it('fills supplierName on supplier page context', () => {
    const r = applyPageContext({}, { page: 'supplier', supplierName: 'ABC Foods' }, catalog, 'any alternatives?');
    expect(r.slots.supplierName).toBe('ABC Foods');
  });

  it('returns slots unchanged when no context', () => {
    const r = applyPageContext({ productName: 'Chicken' }, undefined, catalog, 'cheaper');
    expect(r.slots.productName).toBe('Chicken');
    expect(r.filledFromContext).toBe(false);
  });
});
