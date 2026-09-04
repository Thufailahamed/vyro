import type { MiddlewareHandler } from 'hono';
import { createAuth, loadSessionContext, type SessionContext } from '@vyro/auth';
import { httpError } from '../lib/errors';
import type { Env } from '../env';

export type Ctx = SessionContext;

declare module 'hono' {
  interface ContextVariableMap {
    ctx: Ctx;
    requestId: string;
  }
}

export const session = (): MiddlewareHandler => async (c, next) => {
  const env = c.env as Env;
  const auth = createAuth(env);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) throw httpError(401, 'UNAUTHORIZED', 'No active session');
  const ctx = await loadSessionContext(env.DB, result.user.id);
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'User not found');
  c.set('ctx', ctx);
  await next();
};
