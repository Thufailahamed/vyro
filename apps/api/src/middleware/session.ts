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
  try {
    const auth = createAuth(env);
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!result) throw httpError(401, 'UNAUTHORIZED', 'No active session');
    const ctx = await loadSessionContext(env.DB, result.user.id);
    if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'User not found');
    c.set('ctx', ctx);
  } catch (err) {
    // Any failure to resolve the session (no session, expired, DB unavailable)
    // is treated as unauthenticated — never leaks 5xx.
    if (err instanceof Error && 'status' in err && typeof (err as { status: number }).status === 'number') {
      throw err;
    }
    throw httpError(401, 'UNAUTHORIZED', 'No active session');
  }
  await next();
};
