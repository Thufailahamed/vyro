# VYRO Observability (Sub-project B2)

**Date:** 2026-09-05
**Status:** Approved design, pending implementation
**Parent:** `docs/superpowers/specs/2026-09-05-vyro-feature-gaps-design.md` §10 deferred tracks

## 1. Background

Current state:
- `apps/api/src/lib/errors.ts:42` has one `console.error('Unhandled error', err)` call (unstructured)
- `apps/api/src/index.ts:57` exposes `/api/health` returning `{ ok: true }` only
- 16 `console.log` / `console.error` calls scattered across routes (unstructured)
- No correlation ID across logs (requestId middleware exists but logs don't include it)
- No metrics aggregation (Analytics Engine not bound)
- No run logs retention policy documented

Production requires structured logs (parseable), per-request metrics (latency, error rate, status distribution), and Sentry-style error grouping.

## 2. Goals

- All `apps/api` logs emit as single-line JSON with `requestId`, `userId` (when known), `level`, `msg`, `ts`.
- Per-request access log middleware captures method, path, status, latencyMs, requestId.
- Unhandled error handler logs full structured error before returning envelope.
- `/api/health` reports DB ping + build SHA + commit SHA + uptime.
- Cloudflare Analytics Engine binding added to env for metric writes (counters + timings).
- Backward-compatible: existing tests pass without modification.

## 3. Non-goals

- Frontend error reporting (no Sentry install for web in v1).
- Distributed tracing (Workers has no APM SDK).
- Logpush destination setup (operational concern, config only).
- Custom dashboards (Cloudflare Grafana integration is out-of-scope).

## 4. Architecture

### 4.1 Logger

```ts
// apps/api/src/lib/logger.ts
export type LogContext = {
  requestId?: string;
  userId?: string;
  // ...arbitrary structured fields
};

export function log(level: 'debug'|'info'|'warn'|'error', msg: string, ctx?: LogContext): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    requestId: ctx?.requestId,
    userId: ctx?.userId,
    ...ctx,
  };
  const line = JSON.stringify(payload);
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (m, c?) => log('debug', m, c),
  info: (m, c?) => log('info', m, c),
  warn: (m, c?) => log('warn', m, c),
  error: (m, c?) => log('error', m, c),
};
```

Replaces raw `console.log` / `console.error` calls in `apps/api/src/`.

### 4.2 Access log middleware

```ts
// apps/api/src/middleware/accessLog.ts
export const accessLog = (): MiddlewareHandler => async (c, next) => {
  const start = Date.now();
  await next();
  const latencyMs = Date.now() - start;
  const ctx = c.get('ctx') as { userId?: string } | undefined;
  logger.info('http.access', {
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    latencyMs,
    requestId: c.get('requestId'),
    userId: ctx?.userId,
  });
};
```

### 4.3 Health endpoint

```ts
// apps/api/src/modules/health/routes.ts
app.get('/api/health', async (c) => {
  let dbOk = false;
  try {
    const row = await c.env.DB.prepare('SELECT 1 as ok').first();
    dbOk = row?.ok === 1;
  } catch { dbOk = false; }
  return c.json({
    ok: dbOk,
    db: dbOk ? 'ok' : 'down',
    version: c.env.VERSION ?? 'dev',
    ts: new Date().toISOString(),
  });
});
```

`VERSION` env var optional. Defaults to `'dev'` if not set.

### 4.4 Analytics Engine binding

```ts
// apps/api/src/env.ts
export interface Env {
  // ...existing
  METRICS?: AnalyticsEngineDataset;
}
```

Wrangler config adds:
```toml
[[analytics_engine_datasets]]
binding = "METRICS"
dataset = "vyro_metrics"
```

Metric writes are best-effort `try/catch` — never fail requests because metric write fails.

```ts
// apps/api/src/lib/metrics.ts
export function metric(name: string, value = 1, tags?: Record<string, string>): void {
  const env = getRequestEnv();
  if (!env?.METRICS) return;
  try {
    env.METRICS.writeDataPoint({
      blobs: [name, ...Object.values(tags ?? {})],
      doubles: [value],
      indexes: [name],
    });
  } catch (err) {
    logger.warn('metrics.write_failed', { name, err: String(err) });
  }
}
```

### 4.5 Error handler

```ts
app.onError((err, c) => {
  logger.error('http.error', {
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: statusFromErr(err),
    requestId: c.get('requestId'),
    userId: c.get('ctx')?.userId,
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
  });
  const env = errorEnvelope(err);
  return c.json(env.body, env.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
});
```

## 5. Components

| File | Purpose |
|---|---|
| `apps/api/src/lib/logger.ts` | Structured JSON logger |
| `apps/api/src/lib/metrics.ts` | Analytics Engine write helper |
| `apps/api/src/middleware/accessLog.ts` | Per-request access log |
| `apps/api/src/modules/health/routes.ts` | Extended /api/health |
| `apps/api/src/index.ts` | Wire accessLog; replace health inline; update onError |
| `apps/api/src/env.ts` | Add optional METRICS binding, optional VERSION |
| `apps/api/wrangler.toml` | Add analytics_engine_datasets binding |
| `apps/api/test/lib/logger.test.ts` | JSON shape test |
| `apps/api/test/middleware/accessLog.test.ts` | Access log test |
| `apps/api/test/modules/health.test.ts` | Health endpoint test |

## 6. Data flow

```
inbound request
  → requestId() sets c.get('requestId')
  → accessLog() logs http.access after handler completes
  → handler runs
  → if error: onError logs http.error with full context, returns envelope
  → if 2xx: response sent
```

Logpush picks up `console.log` lines, parses JSON, ships to dataset.

## 7. Error handling

- Logger never throws (stringify errors caught, fall back to plain string).
- Metrics writes wrapped in try/catch.
- /api/health DB check wrapped in try/catch (returns `{ ok: false, db: 'down' }`).

## 8. Testing

- Logger: shape test (output parses as JSON with required keys).
- accessLog: writes one log line per request.
- /api/health: returns ok when DB mock returns row; returns db:down when DB throws.
- All existing tests pass (no behavior change in route handlers).

## 9. Phases

1. Logger module + tests
2. Metrics module (mocked binding for test)
3. Access log middleware + tests
4. Health endpoint + tests
5. Wire into index.ts, update onError to log
6. Update wrangler.toml + env.ts
7. Typecheck + full tests green

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Log volume blows up cost | Default level `info`. `debug` not emitted in production env unless explicitly enabled. |
| Logger throws break requests | All logger calls wrapped defensively. |
| Analytics Engine binding optional in dev | Defensive check; metrics no-op if binding absent. |
| DB health check hangs | 2s timeout via AbortSignal race. |

## 11. Acceptance criteria

1. All `console.log` / `console.error` in `apps/api/src/` replaced with `logger.info` / `logger.error`.
2. Access log line emitted per request with method/path/status/latencyMs/requestId.
3. `/api/health` returns `{ ok, db, version, ts }`.
4. Error handler logs `http.error` before returning envelope.
5. All existing tests still pass.

## 12. Out of scope

- Frontend telemetry.
- Logpush configuration.
- Custom dashboards.
- Distributed tracing.
