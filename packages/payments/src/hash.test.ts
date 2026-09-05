import { describe, expect, it } from 'vitest';
import { md5 } from './hash';

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
