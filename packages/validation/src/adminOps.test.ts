import { describe, it, expect } from 'vitest';
import { adminReasonBody } from './adminOps';

describe('adminReasonBody', () => {
  it('rejects short reason', () => {
    expect(adminReasonBody.safeParse({ reason: 'x' }).success).toBe(false);
  });

  it('accepts valid reason', () => {
    expect(adminReasonBody.safeParse({ reason: 'duplicate payout — retry approved' }).success).toBe(true);
  });
});
