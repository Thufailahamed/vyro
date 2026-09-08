import { describe, expect, it, vi } from 'vitest';
import { recordAiMetric } from '../../src/modules/ai/metrics';

describe('recordAiMetric', () => {
  it('calls writeDataPoint with correct shape', () => {
    const writeDataPoint = vi.fn();
    recordAiMetric({ METRICS: { writeDataPoint } as any } as any, {
      businessId: 'b1',
      userId: 'u1',
      intent: 'find_cheapest',
      provider: 'workersAI',
      model: 'm',
      latencyMs: 100,
      tokensIn: 10,
      tokensOut: 4,
      ok: true,
    });
    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint.mock.calls[0][0].doubles).toEqual([100, 10, 4]);
    expect(writeDataPoint.mock.calls[0][0].indexes).toEqual(['b1', 'u1']);
    expect(writeDataPoint.mock.calls[0][0].blobs[0]).toBe('find_cheapest');
  });

  it('no-ops when METRICS missing', () => {
    expect(() => recordAiMetric({} as any, {} as any)).not.toThrow();
  });

  it('swallows writeDataPoint errors', () => {
    const writeDataPoint = vi.fn(() => { throw new Error('boom'); });
    expect(() => recordAiMetric({ METRICS: { writeDataPoint } as any } as any, {
      businessId: 'b1', userId: 'u1', intent: 'i', provider: 'p', model: 'm', latencyMs: 1, ok: true,
    })).not.toThrow();
  });
});
