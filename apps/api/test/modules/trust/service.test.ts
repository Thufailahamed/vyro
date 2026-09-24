import { describe, it, expect, vi } from 'vitest';
import { recomputeOnTimeMetric } from '../../../src/modules/trust/service';

describe('recomputeOnTimeMetric', () => {
  it('uses only the trailing 30 deliveries, not all-time', async () => {
    const fakeDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([
                  { delivered_at: 100, on_time: 1 },
                  { delivered_at: 200, on_time: 0 },
                ]),
              }),
            }),
          }),
        }),
      }),
    } as any;
    const out = await recomputeOnTimeMetric('sup-1', fakeDb);
    expect(out.deliveredCount).toBe(2);
    expect(out.onTimeCount).toBe(1);
  });
});