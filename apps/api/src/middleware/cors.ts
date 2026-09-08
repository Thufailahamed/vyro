import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';

export const cors = (): MiddlewareHandler => async (c, next) => {
  const env = c.env as Env;
  const origin = c.req.header('origin');
  const allowed = [env.WEB_ORIGIN, env.ADMIN_ORIGIN];
  if (origin && allowed.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Credentials', 'true');
    c.header('Access-Control-Allow-Headers', 'content-type, authorization, x-request-id');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    c.header('Access-Control-Max-Age', '86400');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
};
