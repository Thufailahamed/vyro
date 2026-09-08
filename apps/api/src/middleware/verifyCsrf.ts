import type { MiddlewareHandler } from 'hono';
import { httpError } from '../lib/errors';
import type { Env } from '../env';

// Machine-to-machine callers that legitimately arrive with no Origin header.
const EXEMPT_EXACT = ['/api/csp-report', '/api/webhooks/payhere'];

/**
 * Origin-based CSRF defence for state-changing requests.
 *
 * Only enforced when the request carries a session cookie (`ctx` populated by
 * `middleware/session.ts`). Unauthenticated state-changing calls (sign-in,
 * sign-up, password reset, public catalog POSTs that 401 downstream) get a
 * pass here — they're not the CSRF attack surface; CSRF relies on a victim
 * being already authenticated. Anonymous endpoints don't need a second check.
 *
 * For authenticated requests, the browser always sends either `Origin` (for
 * fetch/XHR) or `Sec-Fetch-Site: same-origin` (for classic form posts).
 * We accept: a listed allow-origin, or self-origin derived from the request URL.
 */
export const verifyCsrf = (): MiddlewareHandler => async (c, next) => {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const path = c.req.path;
  if (EXEMPT_EXACT.includes(path)) return next();

  // Only authenticated requests carry CSRF risk. Anonymous calls fall through
  // to the route's own 401 handling.
  const ctx = c.get('ctx' as never) as { userId: string } | undefined;
  if (!ctx) return next();

  const env = c.env as Env;
  const self = (() => {
    try {
      return new URL(c.req.url).origin;
    } catch {
      return undefined;
    }
  })();
  const allowed = [env.WEB_ORIGIN, env.ADMIN_ORIGIN, self].filter(Boolean) as string[];

  const origin = c.req.header('origin');
  if (origin) {
    if (!allowed.includes(origin)) {
      throw httpError(403, 'FORBIDDEN', 'Origin not allowed');
    }
    return next();
  }

  // No Origin header: rely on Sec-Fetch-Site. Browsers sending 'none' include
  // non-browser callers (curl, server-to-server) — they're allowed because they
  // can't carry the victim's cookies anyway.
  const site = c.req.header('sec-fetch-site');
  if (site === 'same-origin' || site === 'none') return next();

  throw httpError(403, 'FORBIDDEN', 'Origin header missing or not allowed');
};
