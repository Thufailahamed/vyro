import { describe, expect, it } from 'vitest';
import * as cron from '../../src/modules/sponsored/cron';

describe('sponsored cron module shape', () => {
  it('exports sponsoredExpireSweep', () => {
    expect(typeof cron.sponsoredExpireSweep).toBe('function');
  });
});