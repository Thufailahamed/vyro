import type { MiddlewareHandler } from 'hono';
import { logger } from '../lib/logger';

export const accessLog = (): MiddlewareHandler => async (c, next) => {
  const start = Date.now();
  await next();
  const latencyMs = Date.now() - start;
  const ctx = c.get('ctx') as { userId?: string } | undefined;
  const path = (() => {
    try { return new URL(c.req.url).pathname; } catch { return '?'; }
  })();
  logger.info('http.access', {
    method: c.req.method,
    path,
    status: c.res.status,
    latencyMs,
    requestId: c.get('requestId'),
    userId: ctx?.userId,
  });
};
