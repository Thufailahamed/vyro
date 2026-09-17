import { describe, expect, it } from 'vitest';
import * as cron from '../../src/modules/trust/cron';

describe('trust cron module shape', () => {
  it('exports trustSignalsRebuild', () => {
    expect(typeof cron.trustSignalsRebuild).toBe('function');
  });
});
