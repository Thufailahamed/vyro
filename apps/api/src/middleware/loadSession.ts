import type { MiddlewareHandler } from 'hono';
import { createAuth, loadSessionContext } from '@vyro/auth';
import type { Env } from '../env';
import { authEnv } from '../lib/authEnv';

/**
 * Best-effort session resolution: populates `ctx` when the request carries a
 * valid session cookie, but never rejects the request.
 *
 * The CSRF guard runs at the app level, *before* the per-router `session()`
 * middleware, so without this it could never tell whether the caller was
 * authenticated and silently skipped every check. Only state-changing
 * methods are probed so read traffic pays nothing.
 *
 * This lives in its own module (not `middleware/session.ts`) so that tests
 * which mock the session middleware do not have to stub this too.
 */
export const loadSessionIfPresent = (): MiddlewareHandler => async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }
  if (c.get('ctx')) {
    await next();
    return;
  }
  const env = c.env as Env;
  try {
    const auth = createAuth(authEnv(env));
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    if (result) {
      const ctx = await loadSessionContext(env.DB, result.user.id);
      if (ctx) c.set('ctx', ctx);
    }
  } catch {
    // Unauthenticated (or a transient auth failure) — the route's own
    // auth check decides. Never leak 5xx from here.
  }
  await next();
};
