import { describe, expect, it } from 'vitest';
import adminIndex from '../../src/modules/trust/adminIndex';

describe('trust admin router shape', () => {
  it('exports a Hono router', () => {
    expect(typeof adminIndex.fetch).toBe('function');
  });
});
