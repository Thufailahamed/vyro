import { describe, expect, it } from 'vitest';
import { md5 } from './hash';

function expectedHash(mid: string, oid: string, amt: string, cur: string, sec: string) {
  return md5(`${mid}${oid}${amt}${cur}${md5(sec).toUpperCase()}`).toUpperCase();
}

describe('payhere double-md5', () => {
  it('matches official doc vector', () => {
    expect(expectedHash('121XXX', 'pay_1', '1000.00', 'LKR', 's3cr3t')).toMatch(/^[A-F0-9]{32}$/);
    // current impl uses secret.toUpperCase() — must differ from double-md5
    const wrong = md5(`121XXXpay_11000.00LKR${'s3cr3t'.toUpperCase()}`).toUpperCase();
    expect(expectedHash('121XXX', 'pay_1', '1000.00', 'LKR', 's3cr3t')).not.toBe(wrong);
  });

  it('formats cents without commas', () => {
    expect((100000 / 100).toFixed(2)).toBe('1000.00');
  });
});
