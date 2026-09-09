import { describe, it, expect, vi } from 'vitest';

const run = vi.fn();
const where = vi.fn().mockReturnValue({ run });
const del = vi.fn().mockReturnValue({ where });

vi.mock('@vyro/db', () => ({
  getDb: () => ({ delete: del }),
}));

import { handleQueueEventsPrune } from '../src/cron/queue-events-prune';

describe('handleQueueEventsPrune', () => {
  it('returns deleted count from D1', async () => {
    run.mockResolvedValueOnce({ meta: { changes: 9 } });
    const out = await handleQueueEventsPrune({ DB: {} as any, QUEUE_EVENTS_RETENTION_DAYS: '3' } as any);
    expect(out.deleted).toBe(9);
    expect(del).toHaveBeenCalled();
    expect(where).toHaveBeenCalled();
  });

  it('defaults retention to 7 days when env unset', async () => {
    run.mockResolvedValueOnce({ meta: { changes: 0 } });
    const before = Date.now();
    const out = await handleQueueEventsPrune({ DB: {} as any } as any);
    expect(out.deleted).toBe(0);
    expect(where).toHaveBeenCalled();
    expect(before).toBeGreaterThan(0);
  });

  it('handles missing changes field', async () => {
    run.mockResolvedValueOnce({});
    const out = await handleQueueEventsPrune({ DB: {} as any } as any);
    expect(out.deleted).toBe(0);
  });
});