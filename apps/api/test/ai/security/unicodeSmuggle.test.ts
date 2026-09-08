import { describe, it, expect } from 'vitest';
import { assertNoAdversarialUnicode } from '../../../src/modules/ai/guard';

describe('security: unicode smuggle', () => {
  it('catches zero-width joiners inside product names', () => {
    expect(() => assertNoAdversarialUnicode('ri‍ce')).toThrow();
    expect(() => assertNoAdversarialUnicode('ri​ce')).toThrow();
    expect(() => assertNoAdversarialUnicode('ri‌ce')).toThrow();
  });

  it('catches bidi overrides', () => {
    expect(() => assertNoAdversarialUnicode('rice ‮ price')).toThrow();
    expect(() => assertNoAdversarialUnicode('‪rice')).toThrow();
  });

  it('catches line and paragraph separators', () => {
    expect(() => assertNoAdversarialUnicode('line break')).toThrow();
    expect(() => assertNoAdversarialUnicode('para break')).toThrow();
  });

  it('passes plain ASCII and common punctuation', () => {
    expect(() => assertNoAdversarialUnicode('rice')).not.toThrow();
    expect(() => assertNoAdversarialUnicode('Samba Rice 5kg (white)')).not.toThrow();
  });
});
