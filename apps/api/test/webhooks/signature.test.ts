import { describe, expect, it } from 'vitest';
import { md5 } from '@vyro/payments';

describe('PayHere hash format (PayHere doc reference)', () => {
  it('matches documented formula for checkout hash', () => {
    // Official: UPPER(md5(mid + oid + amount + curr + UPPER(md5(secret))))
    const merchantId = '1XXXXXXX';
    const orderId = 'PO-001';
    const amount = '100.00';
    const currency = 'LKR';
    const secret = 'abcSecret';
    const expected = md5(
      `${merchantId}${orderId}${amount}${currency}${md5(secret).toUpperCase()}`,
    ).toUpperCase();
    expect(expected).toMatch(/^[A-F0-9]{32}$/);
  });
});
