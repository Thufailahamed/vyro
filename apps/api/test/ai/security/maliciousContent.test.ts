import { describe, it, expect } from 'vitest';
import { sanitizeProductName } from '../../../src/modules/ai/context';

describe('security: malicious content', () => {
  it('strips control characters from product names', () => {
    const out = sanitizeProductName('rice');
    expect(out).toBe('rice');
  });

  it('strips HTML tags', () => {
    const out = sanitizeProductName('rice<script>alert(1)</script>');
    expect(out).not.toMatch(/<script>/i);
    expect(out).not.toMatch(/<\/script>/i);
  });

  it('collapses whitespace runs', () => {
    const out = sanitizeProductName('rice       flour   sugar');
    expect(out).toBe('rice flour sugar');
  });

  it('returns empty string for non-string input', () => {
    // @ts-expect-error testing runtime guard
    expect(sanitizeProductName(undefined)).toBe('');
    // @ts-expect-error testing runtime guard
    expect(sanitizeProductName(null)).toBe('');
  });

  it('rejects adversarial unicode by default', () => {
    expect(() => sanitizeProductName('ri‍ce')).toThrow();
  });

  it('passes normal text untouched', () => {
    expect(sanitizeProductName('Samba Rice 5kg')).toBe('Samba Rice 5kg');
  });
});
