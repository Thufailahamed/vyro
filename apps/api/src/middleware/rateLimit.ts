import type { MiddlewareHandler } from 'hono';
import { httpError } from '../lib/errors';
import type { Env } from '../env';

interface RateLimitOpts {
  key: string;
  limit: number;
  window: number;
}

interface Ctx {
  userId?: string;
}

export const rateLimit = (opts: RateLimitOpts): MiddlewareHandler => async (c, next) => {
  const env = c.env as Env;
  const ctx = c.get('ctx') as Ctx | undefined;
  const identifier = ctx?.userId ?? c.req.header('cf-connecting-ip') ?? 'unknown';
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / opts.window);
  const kvKey = `rl:${opts.key}:${identifier}:${bucket}`;
  const raw = await env.CACHE.get(kvKey);
  const count = raw ? JSON.parse(raw).count + 1 : 1;
  await env.CACHE.put(kvKey, JSON.stringify({ count }), { expirationTtl: opts.window * 2 });
  c.header('X-RateLimit-Limit', String(opts.limit));
  c.header('X-RateLimit-Remaining', String(Math.max(0, opts.limit - count)));
  c.header('X-RateLimit-Reset', String((bucket + 1) * opts.window));
  if (count > opts.limit) {
    c.header('Retry-After', String(opts.window));
    throw httpError(429, 'RATE_LIMITED', 'Too many requests', { retryAfter: opts.window });
  }
  await next();
};