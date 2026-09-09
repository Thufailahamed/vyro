import { describe, it, expect, vi } from 'vitest';
import { listQueueEvents, getQueueEvent, pruneQueueEvents } from '../src/modules/admin/queues/queuesRepository';

describe('listQueueEvents', () => {
  it('returns rows when no filters', async () => {
    const where = vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([{ id: '1' }]) });
    const from = vi.fn().mockReturnValue({ where });
    const limit = vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([{ id: '1' }]) });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ orderBy }) });
    const db = { select } as any;
    const rows = await listQueueEvents(db, { limit: 10 });
    expect(rows).toEqual([{ id: '1' }]);
  });
});

describe('getQueueEvent', () => {
  it('returns row when found', async () => {
    const get = vi.fn().mockResolvedValue({ id: 'x', queue: 'audit', msgId: 'm', event: 'retry' });
    const where = vi.fn().mockReturnValue({ get });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const row = await getQueueEvent({ select } as any, 'x');
    expect(row?.id).toBe('x');
  });

  it('returns null when missing', async () => {
    const get = vi.fn().mockResolvedValue(undefined);
    const where = vi.fn().mockReturnValue({ get });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const row = await getQueueEvent({ select } as any, 'absent');
    expect(row).toBeNull();
  });
});

describe('pruneQueueEvents', () => {
  it('returns deleted count', async () => {
    const run = vi.fn().mockResolvedValue({ changes: 5 });
    const where = vi.fn().mockReturnValue({ run });
    const del = vi.fn().mockReturnValue({ where });
    const n = await pruneQueueEvents({ delete: del } as any, 1000);
    expect(n).toBe(5);
    expect(where).toHaveBeenCalled();
  });

  it('returns 0 when no rows changed', async () => {
    const run = vi.fn().mockResolvedValue({});
    const where = vi.fn().mockReturnValue({ run });
    const del = vi.fn().mockReturnValue({ where });
    const n = await pruneQueueEvents({ delete: del } as any, 1000);
    expect(n).toBe(0);
  });
});