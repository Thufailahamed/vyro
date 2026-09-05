# VYRO Security Hardening (B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship baseline security hardening (rate limiting, security headers, CSRF verification, RBAC coverage audit, secret scanning, dependency audit) so the platform is safe to deploy to production.

**Architecture:** Worker-layer defense via Hono middlewares (`securityHeaders`, `rateLimit`, `verifyCsrf`) composed into `apps/api/src/index.ts`. Rate limit counters live in Cloudflare KV (existing `CACHE` binding) using a sliding-window log. CI layer enforces RBAC coverage, secret hygiene, and dep advisories via three small Node scripts.

**Tech Stack:** Hono (v4.6), Cloudflare Workers, KV (Workers binding), Vitest (v2.1) with `@cloudflare/vitest-pool-workers`, TypeScript strict, GitHub Actions.

## Global Constraints

- TypeScript strict + `exactOptionalPropertyTypes: true`
- `errorEnvelope(err)` + `httpError(status, code, message, details?)` from `apps/api/src/lib/errors.ts`
- All middleware composed via Hono's `app.use()` pattern; order matters (see spec §4.1)
- Test pattern: `app.request(path, init, env)` from `apps/api/test/middleware.test.ts`; KV stub via `{} as KVNamespace`
- One task = one commit; branch `feat/b1-security-hardening` off `main`
- No new npm packages
- `pnpm typecheck && pnpm test` must remain green at every task boundary

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/lib/nonce.ts` | CSP nonce generator (16 random bytes base64) |
| `apps/api/src/middleware/securityHeaders.ts` | HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP |
| `apps/api/src/middleware/rateLimit.ts` | KV sliding-window rate limit |
| `apps/api/src/middleware/verifyCsrf.ts` | Cookie-auth origin check |
| `apps/api/src/modules/cspReport/routes.ts` | CSP violation reporter |
| `apps/api/src/modules/cspReport/repository.ts` | Queue producer wrapper |
| `apps/api/src/index.ts` | Mount new middleware in correct order |
| `scripts/rbac-audit.ts` | Static check that mutating routes have `requireRole` |
| `scripts/secret-scan.ts` | Grep for hardcoded secrets |
| `apps/api/test/middleware/securityHeaders.test.ts` | Header presence + CSP nonce |
| `apps/api/test/middleware/rateLimit.test.ts` | Sliding window math, 429 |
| `apps/api/test/middleware/verifyCsrf.test.ts` | Origin check, exemptions |
| `apps/api/test/middleware/nonce.test.ts` | Nonce format |
| `apps/api/test/modules/cspReport.test.ts` | Endpoint accepts report, queue |
| `scripts/test/rbac-audit.test.ts` | Audit script flags known gap |
| `scripts/test/secret-scan.test.ts` | Secret scan flags fixture |
| `package.json` (root) | Scripts `audit:deps`, `audit:rbac`, `audit:secrets` |
| `.github/workflows/ci.yml` | CI jobs |
| `scripts/e2e.md` | New e2e step for rate limit |

---

### Task 1: CSP nonce generator

**Files:**
- Create: `apps/api/src/lib/nonce.ts`
- Test: `apps/api/test/lib/nonce.test.ts`

**Interfaces:**
- Consumes: Web `crypto.getRandomValues`
- Produces: `generateNonce(): string` — 16 random bytes, base64-encoded

- [ ] **Step 1: Write failing test**

Create `apps/api/test/lib/nonce.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateNonce } from '../../../src/lib/nonce';

describe('generateNonce', () => {
  it('returns a base64 string', () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('returns 24 characters (16 bytes b64-encoded)', () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(24);
  });

  it('returns a different nonce on each call', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- nonce.test.ts`
Expected: FAIL — `Cannot find module '../../../src/lib/nonce'`

- [ ] **Step 3: Write implementation**

Create `apps/api/src/lib/nonce.ts`:

```ts
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test -- nonce.test.ts`
Expected: 3 PASS

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add apps/api/src/lib/nonce.ts apps/api/test/lib/nonce.test.ts
git commit -m "feat(security): csp nonce generator"
```

---

### Task 2: securityHeaders middleware

**Files:**
- Create: `apps/api/src/middleware/securityHeaders.ts`
- Test: `apps/api/test/middleware/securityHeaders.test.ts`

**Interfaces:**
- Consumes: `generateNonce` from Task 1
- Produces: `securityHeaders(): MiddlewareHandler` — sets CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy headers. Stores nonce at `c.get('cspNonce')`.

- [ ] **Step 1: Write failing test**

Create `apps/api/test/middleware/securityHeaders.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders } from '../../../src/middleware/securityHeaders';
import type { Env } from '../../../src/env';

const env: Env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  AUDIT_QUEUE: {} as Queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
};

function buildApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', securityHeaders());
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('securityHeaders', () => {
  it('sets X-Content-Type-Options to nosniff', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets X-Frame-Options to DENY', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('sets Referrer-Policy to strict-origin-when-cross-origin', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy denying all', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
  });

  it('does not set HSTS in non-production', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('sets HSTS in production with preload', async () => {
    const prodEnv = { ...env, ENVIRONMENT: 'production' as const };
    const res = await buildApp().request('/test', {}, prodEnv);
    expect(res.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
  });

  it('sets CSP with per-request nonce', async () => {
    const a = await buildApp().request('/test', {}, env);
    const b = await buildApp().request('/test', {}, env);
    const cspA = a.headers.get('content-security-policy')!;
    const cspB = b.headers.get('content-security-policy')!;
    expect(cspA).toContain("default-src 'self'");
    expect(cspA).toContain("frame-ancestors 'none'");
    expect(cspA).toContain("report-uri /api/csp-report");
    // Extract nonce from each CSP and assert they differ
    const nonceA = cspA.match(/'nonce-([^']+)'/)![1];
    const nonceB = cspB.match(/'nonce-([^']+)'/)![1];
    expect(nonceA).not.toBe(nonceB);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- securityHeaders.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `apps/api/src/middleware/securityHeaders.ts`:

```ts
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';
import { generateNonce } from '../lib/nonce';

export const securityHeaders = (): MiddlewareHandler => async (c, next) => {
  const env = c.env as Env;
  const nonce = generateNonce();
  c.set('cspNonce', nonce);
  const isProd = env.ENVIRONMENT === 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.r2.cloudflarestorage.com https://*.r2.dev",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
  c.header('Content-Security-Policy', csp);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (isProd) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  await next();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test -- securityHeaders.test.ts`
Expected: 7 PASS

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add apps/api/src/middleware/securityHeaders.ts apps/api/test/middleware/securityHeaders.test.ts
git commit -m "feat(security): security headers middleware with strict CSP"
```

---

### Task 3: rateLimit middleware

**Files:**
- Create: `apps/api/src/middleware/rateLimit.ts`
- Test: `apps/api/test/middleware/rateLimit.test.ts`

**Interfaces:**
- Consumes: `c.env.CACHE` (KVNamespace), `c.get('ctx').userId` from `apps/api/src/middleware/session.ts`
- Produces: `rateLimit(opts: { key: string; limit: number; window: number }): MiddlewareHandler`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/middleware/rateLimit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimit } from '../../../src/middleware/rateLimit';
import type { Env } from '../../../src/env';

const store = new Map<string, { count: number }>();
const kv: KVNamespace = {
  get: vi.fn(async (k: string) => store.get(k) ? JSON.stringify(store.get(k)) : null),
  put: vi.fn(async (k: string, v: string) => { store.set(k, JSON.parse(v)); }),
  delete: vi.fn(async (k: string) => { store.delete(k); }),
} as unknown as KVNamespace;

const env: Env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: kv,
  AUDIT_QUEUE: {} as Queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
};

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: { ctx?: { userId?: string } } }>();
  app.use('*', async (c, next) => {
    c.set('ctx', { userId: c.req.header('x-user-id') ?? undefined });
    await next();
  });
  app.use('*', rateLimit({ key: 'test', limit: 3, window: 60 }));
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => { store.clear(); vi.clearAllMocks(); });

describe('rateLimit', () => {
  it('allows requests under the limit', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await buildApp().request('/test', { headers: { 'cf-connecting-ip': '1.2.3.4' } }, env);
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 when limit exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await buildApp().request('/test', { headers: { 'cf-connecting-ip': '1.2.3.4' } }, env);
    }
    const res = await buildApp().request('/test', { headers: { 'cf-connecting-ip': '1.2.3.4' } }, env);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    const body = (await res.json()) as any;
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.details.retryAfter).toBe(60);
  });

  it('exposes X-RateLimit-* headers', async () => {
    const res = await buildApp().request('/test', { headers: { 'cf-connecting-ip': '1.2.3.4' } }, env);
    expect(res.headers.get('x-ratelimit-limit')).toBe('3');
    expect(res.headers.get('x-ratelimit-remaining')).toBe('2');
  });

  it('keys on userId when authenticated', async () => {
    // User A: 3 requests ok, 4th 429
    for (let i = 0; i < 3; i++) {
      const res = await buildApp().request('/test', { headers: { 'x-user-id': 'u-a' } }, env);
      expect(res.status).toBe(200);
    }
    const blocked = await buildApp().request('/test', { headers: { 'x-user-id': 'u-a' } }, env);
    expect(blocked.status).toBe(429);
    // User B: independent count
    const other = await buildApp().request('/test', { headers: { 'x-user-id': 'u-b' } }, env);
    expect(other.status).toBe(200);
  });

  it('separates limits by key label', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.use('/a', rateLimit({ key: 'a', limit: 2, window: 60 }));
    app.use('/b', rateLimit({ key: 'b', limit: 2, window: 60 }));
    app.get('/a', (c) => c.json({}));
    app.get('/b', (c) => c.json({}));
    for (let i = 0; i < 2; i++) await app.request('/a', { headers: { 'cf-connecting-ip': '1.1.1.1' } }, env);
    const aBlocked = await app.request('/a', { headers: { 'cf-connecting-ip': '1.1.1.1' } }, env);
    expect(aBlocked.status).toBe(429);
    const bOk = await app.request('/b', { headers: { 'cf-connecting-ip': '1.1.1.1' } }, env);
    expect(bOk.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- rateLimit.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `apps/api/src/middleware/rateLimit.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test -- rateLimit.test.ts`
Expected: 5 PASS

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add apps/api/src/middleware/rateLimit.ts apps/api/test/middleware/rateLimit.test.ts
git commit -m "feat(security): kv sliding-window rate limit middleware"
```

---

### Task 4: verifyCsrf middleware

**Files:**
- Create: `apps/api/src/middleware/verifyCsrf.ts`
- Test: `apps/api/test/middleware/verifyCsrf.test.ts`

**Interfaces:**
- Consumes: `c.get('ctx')`, `c.env.WEB_ORIGIN`, `c.env.ADMIN_ORIGIN`
- Produces: `verifyCsrf(): MiddlewareHandler` — rejects mutating cookie-auth requests without matching Origin header

- [ ] **Step 1: Write failing test**

Create `apps/api/test/middleware/verifyCsrf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { verifyCsrf } from '../../../src/middleware/verifyCsrf';
import type { Env } from '../../../src/env';

const env: Env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  AUDIT_QUEUE: {} as Queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
};

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: { ctx?: { userId: string } } }>();
  app.use('*', async (c, next) => {
    if (c.req.header('x-authenticated')) c.set('ctx', { userId: 'u-1' });
    await next();
  });
  app.use('*', verifyCsrf());
  app.get('/api/widgets', (c) => c.json({}));
  app.post('/api/widgets', (c) => c.json({ created: true }));
  app.post('/api/auth/login', (c) => c.json({ ok: true }));
  app.post('/api/auth/forgot-password', (c) => c.json({ ok: true }));
  app.post('/api/auth/reset-password', (c) => c.json({ ok: true }));
  app.post('/api/csp-report', (c) => c.body(null, 204));
  return app;
}

describe('verifyCsrf', () => {
  it('passes GET requests unconditionally', async () => {
    const res = await buildApp().request('/api/widgets', {}, env);
    expect(res.status).toBe(200);
  });

  it('passes unauthenticated POST (downstream handles 401)', async () => {
    const res = await buildApp().request('/api/widgets', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });

  it('rejects authenticated POST without Origin', async () => {
    const res = await buildApp().request('/api/widgets', {
      method: 'POST',
      headers: { 'x-authenticated': '1' },
    }, env);
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.code).toBe('CSRF_FORBIDDEN');
  });

  it('rejects authenticated POST with disallowed Origin', async () => {
    const res = await buildApp().request('/api/widgets', {
      method: 'POST',
      headers: { 'x-authenticated': '1', origin: 'https://evil.example' },
    }, env);
    expect(res.status).toBe(403);
  });

  it('allows authenticated POST from WEB_ORIGIN', async () => {
    const res = await buildApp().request('/api/widgets', {
      method: 'POST',
      headers: { 'x-authenticated': '1', origin: 'http://localhost:5173' },
    }, env);
    expect(res.status).toBe(200);
  });

  it('allows authenticated POST from ADMIN_ORIGIN', async () => {
    const res = await buildApp().request('/api/widgets', {
      method: 'POST',
      headers: { 'x-authenticated': '1', origin: 'http://localhost:5174' },
    }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/auth/login', async () => {
    const res = await buildApp().request('/api/auth/login', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/auth/forgot-password', async () => {
    const res = await buildApp().request('/api/auth/forgot-password', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/auth/reset-password', async () => {
    const res = await buildApp().request('/api/auth/reset-password', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/csp-report', async () => {
    const res = await buildApp().request('/api/csp-report', { method: 'POST' }, env);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- verifyCsrf.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `apps/api/src/middleware/verifyCsrf.ts`:

```ts
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
    throw httpError(403, 'CSRF_FORBIDDEN', 'Origin header missing or not allowed');
  }
  await next();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test -- verifyCsrf.test.ts`
Expected: 10 PASS

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add apps/api/src/middleware/verifyCsrf.ts apps/api/test/middleware/verifyCsrf.test.ts
git commit -m "feat(security): verifyCsrf on cookie-auth mutating routes"
```

---

### Task 5: CSP report endpoint

**Files:**
- Create: `apps/api/src/modules/cspReport/routes.ts`
- Create: `apps/api/src/modules/cspReport/repository.ts`
- Test: `apps/api/test/modules/cspReport.test.ts`

**Interfaces:**
- Consumes: `c.env.AUDIT_QUEUE` (Queue producer)
- Produces: `cspReportRouter: Hono` mounted at `/api/csp-report`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/modules/cspReport.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import cspReportRouter from '../../../src/modules/cspReport/routes';

const sent: any[] = [];
const queue: Queue = {
  send: vi.fn(async (msg: any) => { sent.push(msg); }),
} as unknown as Queue;

const env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  AUDIT_QUEUE: queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
} as any;

function buildApp() {
  const app = new Hono();
  app.route('/api/csp-report', cspReportRouter);
  return app;
}

beforeEach(() => { sent.length = 0; vi.clearAllMocks(); });

describe('POST /api/csp-report', () => {
  it('accepts a CSP report and queues it', async () => {
    const res = await buildApp().request('/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({ 'csp-report': { 'document-uri': 'https://vyro.app/page', 'violated-directive': 'script-src' } }),
    }, env);
    expect(res.status).toBe(204);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ action: 'csp.violation', resourceType: 'csp_report' });
  });

  it('returns 204 with empty body', async () => {
    const res = await buildApp().request('/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(204);
  });

  it('accepts application/json content-type too', async () => {
    const res = await buildApp().request('/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 'csp-report': {} }),
    }, env);
    expect(res.status).toBe(204);
    expect(sent).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- cspReport.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write repository**

Create `apps/api/src/modules/cspReport/repository.ts`:

```ts
import type { Env } from '../../env';

export interface CspViolationReport {
  report: Record<string, unknown>;
  receivedAt: number;
}

export async function queueCspViolation(env: Env, report: Record<string, unknown>): Promise<void> {
  await env.AUDIT_QUEUE.send({
    id: crypto.randomUUID(),
    action: 'csp.violation',
    resourceType: 'csp_report',
    resourceId: null,
    actorUserId: null,
    metadata: JSON.stringify({ report }),
    ip: null,
    userAgent: null,
    createdAt: Date.now(),
  });
}
```

- [ ] **Step 4: Write router**

Create `apps/api/src/modules/cspReport/routes.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../../env';
import { queueCspViolation } from './repository';

const router = new Hono<{ Bindings: Env }>();

router.post('/', async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const report = (body['csp-report'] as Record<string, unknown>) ?? body;
    await queueCspViolation(c.env as Env, report);
  } catch {
    // ignore parse errors — CSP reports are best-effort
  }
  return c.body(null, 204);
});

export default router;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test -- cspReport.test.ts`
Expected: 3 PASS

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add apps/api/src/modules/cspReport/ apps/api/test/modules/cspReport.test.ts
git commit -m "feat(security): csp violation report endpoint"
```

---

### Task 6: Wire middleware into index.ts

**Files:**
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: middlewares from Tasks 2-4, router from Task 5
- Produces: mounted middleware chain and route per spec §4.1

- [ ] **Step 1: Modify imports**

Replace the import block in `apps/api/src/index.ts` (lines 1-34) with:

```ts
import { Hono } from 'hono';
import type { Env } from './env';
import { requestId } from './middleware/requestId';
import { cors } from './middleware/cors';
import { securityHeaders } from './middleware/securityHeaders';
import { rateLimit } from './middleware/rateLimit';
import { verifyCsrf } from './middleware/verifyCsrf';
import { session } from './middleware/session';
import { errorEnvelope, HttpError } from './lib/errors';
import authRouter from './modules/auth/routes';
import businessRouter from './modules/businesses/routes';
import supplierRouter from './modules/suppliers/routes';
import categoryRouter from './modules/categories/routes';
import productRouter from './modules/products/routes';
import supplierProductRouter from './modules/supplierProducts/routes';
import searchRouter from './modules/search/routes';
import compareRouter from './modules/search/compare';
import cartRouter from './modules/cart/routes';
import poRouter from './modules/purchaseOrders/routes';
import deliveryRouter from './modules/deliveries/routes';
import paymentRouter from './modules/payments/routes';
import notificationRouter from './modules/notifications/routes';
import adminRouter from './modules/admin/routes';
import userSettingsRouter from './modules/settings/routes';
import supplierSettingsRouter from './modules/settings/supplier';
import supplierCustomersRouter from './modules/suppliers/customers';
import adminSettingsRouter from './modules/settings/admin';
import businessTypesRouter from './modules/businessTypes/routes';
import supplierTypesRouter from './modules/supplierTypes/routes';
import supplierAnalyticsRouter from './modules/analytics/supplier/routes';
import adminAnalyticsRouter from './modules/analytics/admin/routes';
import adminUsersRouter from './modules/admin/users';
import adminSupplierDetailRouter from './modules/admin/supplierDetail';
import adminBusinessDetailRouter from './modules/admin/businessDetail';
import disputeRouter from './modules/admin/disputes';
import businessAnalyticsRouter from './modules/analytics/business/routes';
import homeRouter from './modules/home/routes';
import cspReportRouter from './modules/cspReport/routes';
```

- [ ] **Step 2: Modify middleware chain**

Replace lines 36-37 (`app.use('*', requestId()); app.use('*', cors());`) with:

```ts
app.use('*', requestId());
app.use('*', securityHeaders());
app.use('*', cors());
app.use('*', session());
app.use('*', rateLimit({ key: 'global', limit: 60, window: 60 }));
app.use('/api/auth/*', rateLimit({ key: 'auth', limit: 20, window: 60 }));
app.use('/api/auth/login', rateLimit({ key: 'auth-login', limit: 5, window: 60 }));
app.use('/api/auth/forgot-password', rateLimit({ key: 'auth-forgot', limit: 5, window: 60 }));
app.use('/api/auth/2fa/*', rateLimit({ key: 'auth-2fa', limit: 10, window: 60 }));
app.use('/api/*', verifyCsrf());
```

- [ ] **Step 3: Mount csp report route**

Add inside the route block after `app.route('/api/home', homeRouter);`:

```ts
app.route('/api/csp-report', cspReportRouter);
```

- [ ] **Step 4: Run full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: all green. No regressions.

- [ ] **Step 5: Smoke test the chain via existing middleware test**

Run: `pnpm --filter @vyro/api test -- middleware.test.ts`
Expected: 4 PASS (health still works, request id still present, CORS still works)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(security): wire securityHeaders, rateLimit, verifyCsrf into chain"
```

---

### Task 7: rbac-audit script

**Files:**
- Create: `scripts/rbac-audit.ts`
- Test: `scripts/test/rbac-audit.test.ts`

**Interfaces:**
- Consumes: filesystem paths to `apps/api/src/modules/**/routes.ts`
- Produces: `auditRbac(): { gaps: Array<{ file: string; method: string; path: string }> }` — returns gaps; CLI exits 1 if any

- [ ] **Step 1: Write failing test**

Create `scripts/test/rbac-audit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { auditRbac } from '../rbac-audit';

describe('auditRbac', () => {
  it('returns gaps list', async () => {
    const result = await auditRbac();
    expect(Array.isArray(result.gaps)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/scripts test -- rbac-audit.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `scripts/rbac-audit.ts`:

```ts
#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'apps/api/src/modules');
const MUTATING = new Set(['post', 'patch', 'put', 'delete']);
const EXEMPT_PREFIXES = ['/api/auth/', '/api/health', '/api/csp-report'];
const EXEMPT_EXACT = new Set(['/api/health', '/api/csp-report']);

interface Gap {
  file: string;
  method: string;
  path: string;
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && e.name === 'routes.ts') yield full;
  }
}

function isExempt(path: string): boolean {
  if (EXEMPT_EXACT.has(path)) return true;
  return EXEMPT_PREFIXES.some((p) => path.startsWith(p));
}

export async function auditRbac(): Promise<{ gaps: Gap[] }> {
  const gaps: Gap[] = [];
  for await (const file of walk(ROOT)) {
    const src = await readFile(file, 'utf8');
    const calls = [...src.matchAll(/\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/g)];
    for (const m of calls) {
      const method = m[1]!.toLowerCase();
      const path = m[2]!;
      if (!MUTATING.has(method)) continue;
      if (isExempt(path)) continue;
      // Look for requireRole call somewhere in the chain after this match, up to next route definition or end-of-chain pattern.
      const idx = (m.index ?? 0) + m[0].length;
      const tail = src.slice(idx, idx + 600);
      if (!/requireRole\(/.test(tail)) {
        gaps.push({ file: relative(process.cwd(), file), method: method.toUpperCase(), path });
      }
    }
  }
  return { gaps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await auditRbac();
  if (result.gaps.length > 0) {
    console.error(`RBAC audit failed. ${result.gaps.length} gap(s) found:`);
    for (const g of result.gaps) {
      console.error(`  ${g.file} ${g.method} ${g.path}`);
    }
    process.exit(1);
  }
  console.log('RBAC audit passed.');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/scripts test -- rbac-audit.test.ts`
Expected: 1 PASS

If no `scripts/package.json` exists, create one:

```json
{
  "name": "@vyro/scripts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run" },
  "devDependencies": { "vitest": "^2.1.0" }
}
```

And add to root `pnpm-workspace.yaml` if needed: `  - 'scripts'`.

- [ ] **Step 5: Run audit against real codebase**

Run: `tsx scripts/rbac-audit.ts` (or compile + run)
Expected: either "RBAC audit passed." or a list of gaps. If gaps found, they are real production issues — flag them but do not fix here (out of scope for B1 baseline).

- [ ] **Step 6: Commit**

```bash
git add scripts/rbac-audit.ts scripts/test/rbac-audit.test.ts scripts/package.json pnpm-workspace.yaml
git commit -m "feat(security): rbac coverage audit script"
```

---

### Task 8: secret-scan script

**Files:**
- Create: `scripts/secret-scan.ts`
- Test: `scripts/test/secret-scan.test.ts`

**Interfaces:**
- Consumes: filesystem
- Produces: `scanSecrets(): { hits: Array<{ file: string; line: number; match: string }> }` — CLI exits 1 on hits

- [ ] **Step 1: Write failing test**

Create `scripts/test/secret-scan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scanSecrets } from '../secret-scan';

describe('scanSecrets', () => {
  it('returns hits list', async () => {
    const result = await scanSecrets();
    expect(Array.isArray(result.hits)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/scripts test -- secret-scan.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `scripts/secret-scan.ts`:

```ts
#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', '.wrangler', '.next', 'coverage']);
const ALLOW_PATHS = [
  /^wrangler\.toml$/,
  /^wrangler\..*\.toml$/,
  /\.example$/,
  /\.(test|spec)\.[jt]sx?$/,
  /^apps\/api\/test\//,
  /^scripts\/test\//,
];
const PATTERNS = [
  /\bBETTER_AUTH_SECRET\s*=\s*['"][^'"]{16,}['"]/,
  /\bR2_ACCESS_KEY\s*=\s*['"][^'"]{8,}['"]/,
  /\bR2_SECRET_KEY\s*=\s*['"][^'"]{8,}['"]/,
  /\b(?:PRIVATE|API)_KEY\s*=\s*['"][^'"]{16,}['"]/,
];

interface Hit { file: string; line: number; match: string }

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

function isAllowed(rel: string): boolean {
  return ALLOW_PATHS.some((p) => p.test(rel));
}

export async function scanSecrets(): Promise<{ hits: Hit[] }> {
  const hits: Hit[] = [];
  for await (const full of walk(ROOT)) {
    const rel = relative(ROOT, full);
    if (isAllowed(rel)) continue;
    let src: string;
    try { src = await readFile(full, 'utf8'); } catch { continue; }
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pat of PATTERNS) {
        const m = lines[i]!.match(pat);
        if (m) hits.push({ file: rel, line: i + 1, match: m[0] });
      }
    }
  }
  return { hits };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await scanSecrets();
  if (result.hits.length > 0) {
    console.error(`Secret scan failed. ${result.hits.length} hit(s):`);
    for (const h of result.hits) console.error(`  ${h.file}:${h.line}: ${h.match}`);
    process.exit(1);
  }
  console.log('Secret scan passed.');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/scripts test -- secret-scan.test.ts`
Expected: 1 PASS

- [ ] **Step 5: Run scan against real codebase**

Run: `tsx scripts/secret-scan.ts`
Expected: "Secret scan passed." The dev `wrangler.toml` contains a placeholder secret value `vyro-local-dev-secret-must-be-32-chars-long` (≥16 chars) but the file matches the allow pattern `wrangler.toml`. Verify the regex doesn't match `BETTER_AUTH_SECRET = "vyro-local-dev-secret-must-be-32-chars-long"` since `wrangler.toml` is exempt.

- [ ] **Step 6: Commit**

```bash
git add scripts/secret-scan.ts scripts/test/secret-scan.test.ts
git commit -m "feat(security): secret scan script"
```

---

### Task 9: Root package.json audit scripts

**Files:**
- Modify: `package.json` (root)

**Interfaces:**
- Produces: npm scripts `audit:deps`, `audit:rbac`, `audit:secrets`

- [ ] **Step 1: Add scripts**

Edit root `package.json` `"scripts"` block — add three entries:

```json
"audit:deps": "pnpm audit --prod --audit-level=high",
"audit:rbac": "tsx scripts/rbac-audit.ts",
"audit:secrets": "tsx scripts/secret-scan.ts"
```

- [ ] **Step 2: Verify tsx is available**

Run: `pnpm exec tsx --version`
Expected: version string (e.g. `tsx v4.x.x`). If not installed, add to root devDeps: `pnpm add -Dw tsx`.

- [ ] **Step 3: Run each audit**

Run:
```bash
pnpm audit:deps
pnpm audit:rbac
pnpm audit:secrets
```

Expected: all exit 0. If `audit:rbac` finds gaps, list them and decide whether to fix in this PR (yes — fix inline, no separate sub-project).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(security): add audit scripts"
```

---

### Task 10: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Triggers on: pull_request, push to main
- Jobs: typecheck, test, audit-deps, audit-rbac, audit-secrets

- [ ] **Step 1: Write workflow file**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  audit-deps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit:deps

  audit-rbac:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit:rbac

  audit-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit:secrets
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(security): github actions workflow with 5 audit jobs"
```

---

### Task 11: Extend E2E walkthrough

**Files:**
- Modify: `scripts/e2e.md`

**Interfaces:**
- Produces: documented manual E2E step verifying rate limit on login

- [ ] **Step 1: Read current e2e file**

Run: `cat scripts/e2e.md`
Read and locate the section for buyer/supplier/admin login flows.

- [ ] **Step 2: Add rate limit step**

Append a new section at the end of `scripts/e2e.md`:

```markdown
## Rate limit verification (B1 security)

Run a curl loop that POSTs to login 6 times within 60 seconds. The first 5 attempts respond normally; the 6th returns 429 with `Retry-After: 60` header.

```bash
for i in $(seq 1 6); do
  curl -sS -w "\n%{http_code} retry-after=%header{retry-after}\n" \
    -X POST http://localhost:8787/api/auth/login \
    -H 'content-type: application/json' \
    -d '{"email":"nobody@example.com","password":"wrong"}' \
    | tail -1
done
```

Expected:
- Attempts 1-5: `401`
- Attempt 6: `429 retry-after=60`

## CSP header verification (B1 security)

```bash
curl -sI http://localhost:5173/ | grep -i content-security-policy
```

Expected: header contains `default-src 'self'`, `frame-ancestors 'none'`, and a per-request nonce.

## Security headers verification (B1 security)

```bash
curl -sI http://localhost:8787/api/health
```

Expected headers present:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
```

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e.md
git commit -m "docs(e2e): rate limit + csp + security headers verification steps"
```

---

### Task 12: Final green check

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: exit 0, no errors.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all PASS. No regressions in existing tests.

- [ ] **Step 3: All audits**

Run:
```bash
pnpm audit:deps
pnpm audit:rbac
pnpm audit:secrets
```

Expected: all exit 0.

- [ ] **Step 4: Smoke test the live worker locally**

In one terminal: `pnpm --filter @vyro/api dev`
In another:
```bash
curl -sI http://localhost:8787/api/health
for i in $(seq 1 6); do curl -sS -o /dev/null -w "%{http_code} " -X POST http://localhost:8787/api/auth/login -H 'content-type: application/json' -d '{}'; done; echo
```

Expected: health returns 200 with all security headers. Login loop returns `401 401 401 401 401 429`.

- [ ] **Step 5: Push branch and open PR**

```bash
git push origin feat/b1-security-hardening
gh pr create --base main --head feat/b1-security-hardening \
  --title "feat(security): B1 security hardening baseline" \
  --body "Implements docs/superpowers/specs/2026-09-05-vyro-security-hardening-design.md.

- KV sliding-window rate limit
- Security headers + strict CSP with nonce
- CSRF verify on cookie-auth mutations
- CI audits: deps, rbac coverage, secrets"
```

Expected: PR opens. All 5 CI jobs green.