import { describe, expect, it } from 'vitest';
import { handleCreditOverdue } from '../../src/cron/creditOverdue';

describe('credit overdue handler', () => {
  it('is a function', () => {
    expect(typeof handleCreditOverdue).toBe('function');
  });
});
