import { describe, expect, it } from 'vitest';
import { checkoutSchema } from '@vyro/validation/cart';

describe('checkout on credit input', () => {
  it('accepts paymentMethod=credit with terms', () => {
    const r = checkoutSchema.safeParse({ businessId: 'b1', paymentMethod: 'credit', creditTerms: 'net14' });
    expect(r.success).toBe(true);
  });
});
