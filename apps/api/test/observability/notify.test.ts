import { describe, it, expect, vi } from 'vitest';
import {
  notifySlack,
  notifyEmail,
} from '../../src/observability/notify';

const baseCtx = {
  ruleName: 'api.p95_latency_ms',
  severity: 'warning' as const,
  component: 'api' as const,
  value: 1800,
  threshold: 1500,
  window: '5m',
};

describe('notifySlack', () => {
  it('POSTs Block Kit payload to webhook', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const ok = await notifySlack(
      { ALERT_SLACK_WEBHOOK_URL: 'https://hooks/x' } as any,
      baseCtx,
      fetchMock as any,
    );
    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text).toContain('api.p95_latency_ms');
    expect(body.blocks).toHaveLength(3);
  });

  it('retries once on 5xx, then drops', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('boom', { status: 503 }))
      .mockResolvedValueOnce(new Response('boom', { status: 503 }));
    const ok = await notifySlack(
      { ALERT_SLACK_WEBHOOK_URL: 'https://hooks/x' } as any,
      baseCtx,
      fetchMock as any,
    );
    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns false when webhook url missing', async () => {
    const ok = await notifySlack({} as any, baseCtx);
    expect(ok).toBe(false);
  });
});

describe('notifyEmail', () => {
  it('POSTs to Resend API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"id":"x"}', { status: 200 }),
      );
    const ok = await notifyEmail(
      {
        RESEND_API_KEY: 're_x',
        OPS_EMAIL: 'ops@example.test',
      } as any,
      baseCtx,
      fetchMock as any,
    );
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('resend.com');
    expect(init.headers.Authorization).toBe('Bearer re_x');
  });

  it('returns false when RESEND_API_KEY missing', async () => {
    const ok = await notifyEmail(
      { OPS_EMAIL: 'ops@example.test' } as any,
      baseCtx,
    );
    expect(ok).toBe(false);
  });
});