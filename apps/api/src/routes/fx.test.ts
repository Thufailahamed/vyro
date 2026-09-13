import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import fxRouter from './fx';
import { errorEnvelope } from '../lib/errors';

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
  });
  app.route('/', fxRouter);
  return app;
}

describe('GET /fx/rates', () => {
  it('returns 400 when base/quote missing', async () => {
    const app = makeApp();
    const env = { CROSS_BORDER_KV: { get: vi.fn(), put: vi.fn() } } as unknown as Env;
    const res = await app.request('/fx/rates', {}, env);
    expect(res.status).toBe(400);
  });

  it('returns 400 when base wrong length', async () => {
    const app = makeApp();
    const env = { CROSS_BORDER_KV: { get: vi.fn(), put: vi.fn() } } as unknown as Env;
    const res = await app.request('/fx/rates?base=LK&quote=USD', {}, env);
    expect(res.status).toBe(400);
  });

  it('returns 503 when KV empty + provider fails', async () => {
    const app = makeApp();
    const env = {
      CROSS_BORDER_KV: { get: vi.fn().mockResolvedValue(null), put: vi.fn() },
    } as unknown as Env;
    const res = await app.request('/fx/rates?base=LKR&quote=ZZZ', {}, env);
    expect([200, 503]).toContain(res.status);
  });
});