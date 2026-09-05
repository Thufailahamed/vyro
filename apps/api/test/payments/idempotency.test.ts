import { describe, expect, it } from 'vitest';
import { hashRequestBody } from '../../src/lib/idempotency';

describe('idempotency hash', () => {
  it('is order-independent for object keys', () => {
    const a = hashRequestBody({ a: 1, b: 2 });
    const b = hashRequestBody({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('differs for different values', () => {
    expect(hashRequestBody({ x: 1 })).not.toBe(hashRequestBody({ x: 2 }));
  });

  it('handles nested objects', () => {
    const a = hashRequestBody({ x: { y: 1, z: 2 } });
    const b = hashRequestBody({ x: { z: 2, y: 1 } });
    expect(a).toBe(b);
  });

  it('handles arrays', () => {
    expect(hashRequestBody([1, 2, 3])).toBe(hashRequestBody([1, 2, 3]));
    expect(hashRequestBody([1, 2, 3])).not.toBe(hashRequestBody([3, 2, 1]));
  });
});
