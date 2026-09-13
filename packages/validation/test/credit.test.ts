import { describe, expect, it } from 'vitest';
import { creditRepaySchema, adminCreditFacilityPatchSchema } from '../src/credit';

describe('credit validation', () => {
  it('rejects zero repay amount', () => {
    expect(creditRepaySchema.safeParse({ amountCents: 0, paymentId: 'p1' }).success).toBe(false);
  });
  it('rejects limit patch without fields', () => {
    expect(adminCreditFacilityPatchSchema.safeParse({}).success).toBe(false);
  });
});
