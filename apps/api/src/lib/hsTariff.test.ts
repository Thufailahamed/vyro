import { describe, it, expect } from 'vitest';
import { estimateDuty, listKnownHsCodes } from './hsTariff';

describe('estimateDuty', () => {
  it('returns duty for known HS code', async () => {
    const r = await estimateDuty('0901.21', 'BR', 100000); // 1000 LKR
    expect(r?.dutyCents).toBeGreaterThan(0);
    // 100000 * 1500 / 10000 = 15000
    expect(r?.dutyCents).toBe(15000);
  });

  it('returns HS_CODE_UNKNOWN warning for missing code', async () => {
    const r = await estimateDuty('9999.99', 'XX', 100000);
    expect(r?.warning).toBe('HS_CODE_UNKNOWN');
    expect(r?.dutyCents).toBe(0);
  });

  it('returns null on invalid input', async () => {
    expect(await estimateDuty('', '', -1)).toBeNull();
    expect(await estimateDuty(null as unknown as string, '', 1000)).toBeNull();
    expect(await estimateDuty('0901.21', '', Number.NaN)).toBeNull();
  });

  it('returns zero duty for 0% HS line', async () => {
    const r = await estimateDuty('8471.30', 'CN', 100000);
    expect(r?.dutyCents).toBe(0);
    expect(r?.warning).toBeUndefined();
  });

  it('rounds duty to nearest cent', async () => {
    const r = await estimateDuty('0901.21', 'BR', 333); // 333 * 1500 / 10000 = 49.95
    expect(r?.dutyCents).toBe(50);
  });
});

describe('listKnownHsCodes', () => {
  it('returns non-empty list', () => {
    expect(listKnownHsCodes().length).toBeGreaterThan(0);
  });
});