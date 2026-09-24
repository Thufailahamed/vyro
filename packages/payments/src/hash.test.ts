import { describe, expect, it } from 'vitest';
import { md5, sha256Hex, hmacSha256Sync, timingSafeEqualHex } from './hash';

// Known MD5 vectors (RFC 1321 reference cases).
describe('md5', () => {
  it('matches RFC 1321 empty-string vector', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('matches RFC 1321 abc vector', () => {
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('matches PayHere test vector (1234567890)', () => {
    expect(md5('1234567890')).toBe('e807f1fcf82d132f9bb018ca6738a19f');
  });
});

describe('sha256Hex (sync, Workers-safe)', () => {
  it('hashes the empty string per FIPS 180-4', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('hmacSha256Sync', () => {
  it('matches RFC 4231 Test Case 2', () => {
    expect(hmacSha256Sync('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('hashes with a key longer than the 64-byte block', () => {
    expect(hmacSha256Sync('T'.repeat(131), 'larger than block-size key')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('timingSafeEqualHex', () => {
  it('accepts equal hex, rejects mismatched or different-length input', () => {
    const a = 'a'.repeat(64);
    expect(timingSafeEqualHex(a, a)).toBe(true);
    expect(timingSafeEqualHex(a, 'b'.repeat(64))).toBe(false);
    expect(timingSafeEqualHex(a, 'a'.repeat(63))).toBe(false);
  });
});
