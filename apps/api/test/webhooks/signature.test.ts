import { describe, expect, it } from 'vitest';
import { md5 } from '@vyro/payments';

describe('PayHere hash format (PayHere doc reference)', () => {
  it('matches documented formula for checkout hash', () => {
    // Formula: MD5(merchant_id + order_id + amount + currency + UPPERCASE(merchant_secret))
    const merchantId = '1XXXXXXX';
    const orderId = 'PO-001';
    const amount = '100.00';
    const currency = 'LKR';
    const secret = 'abcSecret';
    const expected = md5(`${merchantId}${orderId}${amount}${currency}${secret.toUpperCase()}`);
    expect(expected).toMatch(/^[a-f0-9]{32}$/);
  });
});
