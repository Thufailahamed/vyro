# VYRO Security Hardening (Sub-project B1)

**Date:** 2026-09-05
**Status:** Approved design, pending implementation
**Parent:** `docs/superpowers/specs/2026-09-05-vyro-feature-gaps-design.md` §10 deferred tracks
**Scope:** Baseline security hardening for production go-live: rate limiting, security headers, CSRF enforcement, RBAC coverage audit, secret scanning, dependency audit. No new product features.

## 1. Background

The 10-phase gap plan (P1-P10) shipped all feature surface across buyer, supplier, and admin portals. Five hardening tracks were explicitly deferred (B1-B5). B1 is the gate: rate limiting and CSRF validation affect every future endpoint, and security headers affect every HTML response. Doing it first unblocks F1 (real-time messaging) and F2 (pricing tiers) without retrofit risk.

Current state (audited):
- `apps/api/src/middleware/cors.ts` — allowlist-based CORS, static env origins. Good.
- `apps/api/src/middleware/rbac.ts` — `requireRole({ admin, business, supplier })`. Used by every mutating route but **not enforced by automated audit**.
- `apps/api/src/middleware/requestId.ts` — sets `x-request-id`. Good.
- `apps/api/src/index.ts` — no rate limiting. No security headers. No CSP. Confirmed via grep.
- `packages/auth/src/index.ts` — better-auth v1 with `emailAndPassword`, `twoFactor` plugin. No explicit CSRF config; better-auth origin check on cookie-auth covers the rest.
- `wrangler.toml` — secrets present as plaintext `[vars]` (dev). Production secrets must move to `wrangler secret put`. Documented in runbook (B5).
- `.github/` — no CI workflows exist yet.

## 2. Goals

- Every endpoint has a rate limit. Sensitive endpoints (auth login, password reset) get tighter limits.
- Every response includes HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy. HTML responses also include a strict CSP with per-request nonce.
- Mutating cookie-auth routes verify Origin matches allowlist before processing.
- Every mutating route (`POST/PATCH/PUT/DELETE`) is covered by `requireRole` — enforced by CI.
- No secrets committed to source — enforced by CI.
- No high-severity npm advisories in production dependencies — enforced by CI.

## 3. Non-goals

- SAST / Snyk / CodeQL scanning — deferred to a separate hardening pass if requested.
- Penetration test readiness — deferred.
- WAF rules via Cloudflare dashboard — deferred (B5 ops).
- Migration to external secret manager (AWS Secrets Manager, Doppler) — keep `wrangler secret put` for now.
- HSTS preload submission — set header with `preload` directive but do not submit to preload list (out of scope).

## 4. Architecture

### 4.1 Middleware order in `apps/api/src/index.ts`

```
app.use('*', requestId())
app.use('*', securityHeaders())      // NEW — sets all security headers including CSP with nonce
app.use('*', cors())
app.use('*', session())              // existing — populates ctx so rate limit can key on userId
app.use('*', rateLimit({ key: 'global', limit: 60, window: 60 }))  // NEW — global default (key on userId or IP)
app.use('/api/auth/*', rateLimit({ key: 'auth', limit: 20, window: 60 }))  // NEW
app.use('/api/auth/login', rateLimit({ key: 'auth-login', limit: 5, window: 60 }))  // NEW
app.use('/api/auth/forgot-password', rateLimit({ key: 'auth-forgot', limit: 5, window: 60 }))  // NEW
app.use('/api/auth/2fa/*', rateLimit({ key: 'auth-2fa', limit: 10, window: 60 }))  // NEW
app.use('/api/*', verifyCsrf())      // NEW — cookie-auth mutation guard
```

`session()` runs before `rateLimit` so the rate limiter can key on `userId` when present. The `/api/auth/login` rate limit precedes session creation and keys on IP only because no user exists yet. `verifyCsrf()` is exempt for pre-session auth routes (`/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`) and for the CSP report endpoint.

### 4.2 Storage: Cloudflare KV (binding `CACHE`)

Rate-limit counters use the existing KV binding. Sliding-window log per key. Read-then-write inside a single request. TTL = `window * 2` to bound key growth.

Key shape: `rl:{key}:{identifier}:{minuteBucket}` where `minuteBucket = floor(now / window)`. Each value is JSON `{ count: number }`. Old buckets are pruned via TTL.

Trade-off vs in-memory: KV is edge-distributed so a burst on one POP counts against the global limit. In-memory would allow ~16x the limit by spawning isolates per region. KV wins.

Trade-off vs D1: D1 adds ~10ms per write and is overkill for ephemeral counters. KV wins.

### 4.3 Identifier strategy

- Anonymous routes: `cf-connecting-ip` header (Cloudflare provides this on every request).
- Authenticated routes (post-session): `userId` from `c.get('ctx').userId` — falls back to IP if missing.
- Login: IP only (no user yet).

## 5. Components

### 5.1 `apps/api/src/middleware/securityHeaders.ts`

```ts
export const securityHeaders = (): MiddlewareHandler => async (c, next) => {
  const nonce = generateNonce();
  c.set('cspNonce', nonce);
  const isProd = c.env.ENVIRONMENT === 'production';
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,  // Turnstile future
    `style-src 'self' 'unsafe-inline'`,  // Tailwind injects inline styles
    `img-src 'self' data: https://*.r2.cloudflarestorage.com https://*.r2.dev`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.vyro-api.workers.dev`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `report-uri /api/csp-report`,
  ].join('; ');
  c.header('Content-Security-Policy', csp);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (isProd) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  await next();
};
```

### 5.2 `apps/api/src/middleware/rateLimit.ts`

```ts
interface RateLimitOpts {
  key: string;             // route label, e.g. 'auth-login'
  limit: number;          // max requests per window
  window: number;          // window in seconds
}
export const rateLimit = (opts: RateLimitOpts): MiddlewareHandler => async (c, next) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  const identifier = ctx?.userId ?? c.req.header('cf-connecting-ip') ?? 'unknown';
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / opts.window);
  const kvKey = `rl:${opts.key}:${identifier}:${bucket}`;
  const current = await c.env.CACHE.get(kvKey);
  const count = current ? Number(JSON.parse(current).count) + 1 : 1;
  await c.env.CACHE.put(kvKey, JSON.stringify({ count }), { expirationTtl: opts.window * 2 });
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

### 5.3 `apps/api/src/middleware/verifyCsrf.ts`

```ts
export const verifyCsrf = (): MiddlewareHandler => async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') return next();
  // Skip pre-session auth routes (they issue cookies, not consume)
  // and CSP report endpoint (browser sends without origin)
  const path = c.req.path;
  if (
    path.startsWith('/api/auth/login') ||
    path.startsWith('/api/auth/forgot-password') ||
    path.startsWith('/api/auth/reset-password') ||
    path === '/api/csp-report'
  ) return next();
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) return next(); // unauthenticated non-auth route — let downstream handle 401
  const origin = c.req.header('origin');
  const allowed = [c.env.WEB_ORIGIN, c.env.ADMIN_ORIGIN];
  if (!origin || !allowed.includes(origin)) {
    throw httpError(403, 'CSRF_FORBIDDEN', 'Origin header missing or not allowed');
  }
  await next();
};
```

### 5.4 `apps/api/src/lib/nonce.ts`

```ts
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
```

### 5.5 `scripts/rbac-audit.ts`

Static parser. Walks `apps/api/src/modules/**/routes.ts`. For each route definition, checks if `POST`, `PATCH`, `PUT`, `DELETE` has a `requireRole(...)` call somewhere in the chain. Failures listed with file:line.

```ts
// invocation
// pnpm audit:rbac
// exits 1 if any gap found
```

Allowed exemptions (documented inline):
- `/api/health` (GET only)
- `/api/auth/*` — better-auth handles its own gating
- `/api/csp-report` — report endpoint, browser sends without Origin

### 5.6 `scripts/secret-scan.ts`

Greps for patterns matching secret assignments outside allowed files.

Allowed files: `wrangler.toml`, `wrangler.*.toml`, `*.example`, `*.test.ts`.
Patterns: `(BETTER_AUTH_SECRET|R2_ACCESS_KEY|API_KEY|PRIVATE_KEY)\s*=\s*['"][^'"]{8,}['"]`.

```ts
// pnpm audit:secrets
// exits 1 on hit
```

### 5.7 `apps/api/src/modules/cspReport/routes.ts`

New module. `POST /api/csp-report` accepts JSON `{ 'csp-report': {...} }`. Pushes to `AUDIT_QUEUE` with action `csp.violation`, resourceType `csp_report`. Returns 204.

### 5.8 CI workflow `.github/workflows/ci.yml`

Jobs:
- `typecheck`: `pnpm typecheck`
- `test`: `pnpm test`
- `audit-deps`: `pnpm audit:deps`
- `audit-rbac`: `pnpm audit:rbac`
- `audit-secrets`: `pnpm audit:secrets`

Triggers: pull_request, push to main.

## 6. Data flow

### 6.1 Rate limit hit (auth login)

```
POST /api/auth/login (from 1.2.3.4, attempt 6 in 60s)
  → requestId() → x-req-id = abc
  → securityHeaders() → headers set, nonce=xyz
  → cors() → origin matches, headers set
  → rateLimit({key:'global', limit:60}) → count=6, under limit, continue
  → rateLimit({key:'auth', limit:20}) → count=6, under limit, continue
  → rateLimit({key:'auth-login', limit:5}) → count=6, OVER → 429 RATE_LIMITED
  → response: 429, Retry-After: 60, body { code:'RATE_LIMITED', message:'Too many requests', details:{retryAfter:60} }
```

### 6.2 CSP violation reported

```
Browser blocked inline script, sends POST /api/csp-report (no Origin header)
  → requestId() → securityHeaders() → cors() → verifyCsrf() → path matches exemption → next()
  → cspReport handler: parse body, push to AUDIT_QUEUE
  → response: 204
```

## 7. Error handling

| Code | Status | Trigger | Client action |
|---|---|---|---|
| `RATE_LIMITED` | 429 | limit exceeded | Back off `Retry-After` seconds |
| `CSRF_FORBIDDEN` | 403 | Origin missing/mismatch on mutating route | Refresh from allowed origin |
| `invalid_body` | 400 | zod failure | Fix and resubmit |

CSP violations do not return errors — they are logged for postmortem.

## 8. Testing strategy

- **Unit (per middleware)**: vitest with KV stub via `vi.mock`. Assert sliding-window math, header presence, nonce uniqueness per request.
- **Integration**: `buildApp()` composes all middleware + test route. Verify 429 after 5 logins, 403 on missing origin, CSP header present on HTML.
- **RBAC audit**: snapshot test — known gaps fixture → expected error list. Add a route missing `requireRole` → expect exit 1.
- **Secret scan**: include fixture file with bad pattern → expect exit 1.
- **E2E**: extend `scripts/e2e.md` step for login throttle (5 attempts → 6th gets 429).

## 9. Phases

Single phase. Ships in one branch: `feat/b1-security-hardening`. Ends at green CI.

Sub-tasks (in order):
1. `lib/nonce.ts` + unit test
2. `middleware/securityHeaders.ts` + unit test
3. `middleware/rateLimit.ts` + unit test
4. `middleware/verifyCsrf.ts` + unit test
5. `modules/cspReport/routes.ts` + unit test
6. Wire into `index.ts` order
7. `scripts/rbac-audit.ts` + tests
8. `scripts/secret-scan.ts` + tests
9. `package.json` scripts: `audit:deps`, `audit:rbac`, `audit:secrets`
10. `.github/workflows/ci.yml`
11. Extend `scripts/e2e.md`
12. Final: all CI jobs green

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| CSP breaks existing inline styles | `style-src 'unsafe-inline'` permitted (Tailwind runtime). Test SPA in browser before merge. |
| Rate limit false-positives on shared NAT IPs | Authenticated routes key on `userId`, not IP. Anonymous-only endpoints (search) get 60/min. |
| KV eventually-consistent across regions | Acceptable for rate limit (worst case: user gets 2x limit across region failover). Document. |
| Wrangler secret rotation breaks local dev | Document in B5 runbook. Dev keeps plaintext in `wrangler.toml` with comment "DO NOT USE IN PROD". |
| better-auth origin check duplicates with `verifyCsrf` | better-auth only checks on its own routes. Our middleware covers non-auth mutating routes. better-auth routes are exempted in `verifyCsrf` (see §5.3). No conflict. |
| RBAC audit false positives on test fixtures | Audit script skips `*.test.ts` and `routes.ts` files in `apps/api/test/`. |

## 11. Acceptance criteria

1. `pnpm typecheck` clean.
2. `pnpm test` green across all apps.
3. `pnpm audit:deps` exits 0.
4. `pnpm audit:rbac` exits 0.
5. `pnpm audit:secrets` exits 0.
6. All 4 CI jobs green on PR.
7. Login throttled at 6th attempt within 60s — verified by integration test.
8. CSP nonce unique per request — verified by integration test.
9. All existing tests pass — backwards compatible.

## 12. Out of scope (deferred)

- B2 Observability — next sub-project.
- B3 Performance — separate sub-project.
- B4 Compliance — separate sub-project.
- B5 Ops (runbook, backup) — separate sub-project.
- SAST / dependency vulnerability scanning beyond `pnpm audit` — separate if requested.
- WAF rules — separate if requested.