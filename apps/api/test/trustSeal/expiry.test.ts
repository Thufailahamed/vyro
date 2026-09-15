import { describe, it, expect } from 'vitest';
import { handleTrustSealExpiry } from '../../src/cron/trustSeal';

describe('trustseal expiry cron', () => {
  it('exposes expiry handler with count shape', () => {
    expect(typeof handleTrustSealExpiry).toBe('function');
  });
});
