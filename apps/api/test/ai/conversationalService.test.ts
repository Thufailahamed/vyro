import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber } from '../../src/modules/whatsapp/conversationalService';

describe('conversationalService phone normalization', () => {
  it('normalizes local 077 numbers to Sri Lankan international format 9477', () => {
    expect(normalizePhoneNumber('0771234567')).toBe('94771234567');
  });

  it('normalizes +94 numbers by stripping plus', () => {
    expect(normalizePhoneNumber('+94 77 123 4567')).toBe('94771234567');
  });

  it('handles already normalized 9477 numbers', () => {
    expect(normalizePhoneNumber('94771234567')).toBe('94771234567');
  });
});
