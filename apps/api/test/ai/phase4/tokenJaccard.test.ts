import { describe, it, expect } from 'vitest';
import { tokenJaccard, tokenize } from '../../../src/modules/ai/intents/tokenJaccard';

describe('tokenJaccard', () => {
  it('1.0 on identical strings', () => {
    expect(tokenJaccard('rice 25kg', 'rice 25kg')).toBe(1);
  });
  it('partial overlap', () => {
    expect(tokenJaccard('samba rice', 'red rice')).toBeCloseTo(1 / 3, 3);
  });
  it('0 when disjoint', () => {
    expect(tokenJaccard('rice', 'sugar')).toBe(0);
  });
  it('case + punctuation insensitive', () => {
    expect(tokenJaccard('Samba Rice 25kg', 'samba rice')).toBeGreaterThan(0.5);
  });
  it('tokenize splits on Unicode punctuation', () => {
    expect(tokenize('Samba, Rice — 25kg!')).toEqual(['samba', 'rice', '25kg']);
  });
});
