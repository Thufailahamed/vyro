import { describe, expect, it } from 'vitest';

describe('cron/handleWeeklyPayoutBatch', () => {
  it('exists and is exported from cron/handlers', async () => {
    // Dynamic import so vitest can resolve the .ts path; the import throws
    // synchronously via the bundler if the module is missing or any of its
    // dependencies fail. The export assertion catches the not-yet-exported case.
    const mod = (await import('../../src/cron/handlers')) as unknown as {
      handleWeeklyPayoutBatch?: unknown;
    };
    expect(typeof mod.handleWeeklyPayoutBatch).toBe('function');
  });
});
