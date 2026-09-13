import { describe, it, expect, vi } from 'vitest';
import { evaluateRule } from '../../src/observability/evaluator';

const rule = {
  name: 'api.p95_latency_ms',
  component: 'api' as const,
  description: '',
  query: { kind: 'ae_sql', sql: 'SELECT 0' },
  comparator: 'gt' as const,
  threshold: 1500,
  window: '5m' as const,
  severity: 'warning' as const,
  cooldownSec: 1800,
  channels: [],
  recipients: [],
  enabled: true,
};

describe('evaluateRule', () => {
  it('returns ok=true when value passes threshold', async () => {
    const env = { CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 'b' } as any;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ v: 100 }] }), {
        status: 200,
      }),
    );
    const v = await evaluateRule(env, rule, fetchMock as any);
    expect(v.ok).toBe(true);
    expect(v.value).toBe(100);
  });

  it('returns ok=false when value fails threshold', async () => {
    const env = { CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 'b' } as any;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ v: 2000 }] }), {
        status: 200,
      }),
    );
    const v = await evaluateRule(env, rule, fetchMock as any);
    expect(v.ok).toBe(false);
    expect(v.value).toBe(2000);
  });

  it('returns ok=true (no-op) when value missing', async () => {
    const env = { CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 'b' } as any;
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const v = await evaluateRule(env, rule, fetchMock as any);
    expect(v.ok).toBe(true);
    expect(v.value).toBeNull();
  });

  it('treats d1_health threshold 0 as failed when ping fails', async () => {
    const env = {
      DB: { prepare: () => ({ first: async () => null }) },
    } as any;
    const v = await evaluateRule(
      env,
      { ...rule, query: { kind: 'd1_health' }, threshold: 0, comparator: 'eq' },
    );
    expect(v.ok).toBe(false);
  });

  it('treats d1_health threshold 0 as ok when ping returns row', async () => {
    const env = {
      DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
    } as any;
    const v = await evaluateRule(
      env,
      { ...rule, query: { kind: 'd1_health' }, threshold: 0, comparator: 'eq' },
    );
    expect(v.ok).toBe(true);
  });
});