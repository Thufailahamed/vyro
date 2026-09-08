import { describe, it, expect } from 'vitest';
import { sanitizeFilename, buildR2Key } from '../../src/modules/documents/repository';

describe('sanitizeFilename', () => {
  it('strips directory traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
  });
  it('replaces path separators and control chars', () => {
    expect(sanitizeFilename('a/b\\c.txt')).toBe('a_b_c.txt');
    expect(sanitizeFilename('bad\x00name.pdf')).toBe('badname.pdf');
  });
  it('caps length to 100', () => {
    expect(sanitizeFilename('x'.repeat(200) + '.pdf')).toHaveLength(100);
  });
});

describe('buildR2Key', () => {
  it('joins businessId, uploadId, and sanitized filename', () => {
    expect(buildR2Key('biz-1', 'up-1', '../../etc/passwd')).toBe('biz-1/up-1/passwd');
  });
});
