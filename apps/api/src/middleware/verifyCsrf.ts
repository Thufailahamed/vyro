import type { MiddlewareHandler } from 'hono';
import { httpError } from '../lib/errors';
import type { Env } from '../env';

interface Ctx {
  userId: string;
}

const EXEMPT_PREFIXES = ['/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password'];
const EXEMPT_EXACT = ['/api/csp-report'];

export const verifyCsrf = (): MiddlewareHandler => async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  const path = c.req.path;
  if (EXEMPT_EXACT.includes(path)) return next();
  if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return next();
  const env = c.env as Env;
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) return next();
  const origin = c.req.header('origin');
  const allowed = [env.WEB_ORIGIN, env.ADMIN_ORIGIN];
  if (!origin || !allowed.includes(origin)) {
    throw httpError(403, 'FORBIDDEN', 'Origin header missing or not allowed');
  }
  await next();
};