import { describe, it, expect } from 'vitest';
import { generateNonce } from '../../src/lib/nonce';

describe('generateNonce', () => {
  it('returns a base64 string', () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('returns 24 characters (16 bytes b64-encoded)', () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(24);
  });

  it('returns a different nonce on each call', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});