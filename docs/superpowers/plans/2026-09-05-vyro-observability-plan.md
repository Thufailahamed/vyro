# VYRO Observability (B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship structured JSON logs, access log middleware, /api/health with DB ping, and Analytics Engine metric writes.

**Architecture:** Single `logger` module emits one-line JSON per call. `accessLog` middleware logs after every request. `onError` logs structured error context. Metrics writes wrapped in try/catch.

**Tech Stack:** Hono, Cloudflare Workers, Analytics Engine, Vitest.

## Global Constraints

- TypeScript strict + `exactOptionalPropertyTypes: true`
- Backward-compatible with existing tests
- Single branch `feat/b2-observability` off `main`

---

### Task 1: Logger module + tests

**Files:**
- Create: `apps/api/src/lib/logger.ts`
- Test: `apps/api/test/lib/logger.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/lib/logger.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../../src/lib/logger';

let logBuffer: string[] = [];
let errBuffer: string[] = [];

beforeEach(() => {
  logBuffer = [];
  errBuffer = [];
  vi.spyOn(console, 'log').mockImplementation((line) => logBuffer.push(String(line)));
  vi.spyOn(console, 'error').mockImplementation((line) => errBuffer.push(String(line)));
});

function last(buffer: string[]): any {
  return JSON.parse(buffer[buffer.length - 1]!);
}

describe('logger', () => {
  it('emits JSON line with required fields', () => {
    logger.info('hello', { requestId: 'r1' });
    const l = last(logBuffer);
    expect(l.msg).toBe('hello');
    expect(l.level).toBe('info');
    expect(l.requestId).toBe('r1');
    expect(typeof l.ts).toBe('string');
    expect(new Date(l.ts).getTime()).toBeGreaterThan(0);
  });

  it('error uses console.error', () => {
    logger.error('boom', { requestId: 'r2' });
    expect(errBuffer.length).toBe(1);
    const l = last(errBuffer);
    expect(l.level).toBe('error');
  });

  it('warn uses console.error', () => {
    logger.warn('careful', { requestId: 'r3' });
    expect(errBuffer.length).toBe(1);
  });

  it('debug uses console.log', () => {
    logger.debug('detail', { requestId: 'r4' });
    expect(logBuffer.length).toBe(1);
  });

  it('merges arbitrary context fields', () => {
    logger.info('evt', { foo: 'bar', n: 42 });
    const l = last(logBuffer);
    expect(l.foo).toBe('bar');
    expect(l.n).toBe(42);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- logger.test 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Write logger**

Create `apps/api/src/lib/logger.ts`:

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown> & {
  requestId?: string;
  userId?: string;
};

function emit(level: LogLevel, msg: string, ctx?: LogContext): void {
  try {
    const payload = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...ctx,
    };
    const line = JSON.stringify(payload);
    if (level === 'error' || level === 'warn') console.error(line);
    else console.log(line);
  } catch {
    try {
      if (level === 'error' || level === 'warn') console.error(`[${level}] ${msg}`);
      else console.log(`[${level}] ${msg}`);
    } catch {
      // swallow
    }
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
};
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vyro/api test -- logger.test 2>&1 | tail -5`
Expected: 5 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/logger.ts apps/api/test/lib/logger.test.ts
git commit -m "feat(obs): structured JSON logger"
```

---

### Task 2: Metrics module

**Files:**
- Create: `apps/api/src/lib/metrics.ts`

- [ ] **Step 1: Write module**

Create `apps/api/src/lib/metrics.ts`:

```ts
import type { Env } from '../env';
import { logger } from './logger';

export type Tags = Record<string, string>;

export function metric(env: Env | undefined, name: string, value = 1, tags?: Tags): void {
  if (!env?.METRICS) return;
  try {
    env.METRICS.writeDataPoint({
      blobs: [name, ...(tags ? Object.values(tags) : [])],
      doubles: [value],
      indexes: [name],
    });
  } catch (err) {
    logger.warn('metrics.write_failed', { name, err: String(err) });
  }
}
```

- [ ] **Step 2: Extend env.ts**

In `apps/api/src/env.ts`:

```ts
export interface Env {
  // ...existing
  METRICS?: AnalyticsEngineDataset;
  VERSION?: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/metrics.ts apps/api/src/env.ts
git commit -m "feat(obs): Analytics Engine metric helper"
```

---

### Task 3: Access log middleware

**Files:**
- Create: `apps/api/src/middleware/accessLog.ts`
- Test: `apps/api/test/middleware/accessLog.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/middleware/accessLog.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const lines: string[] = [];
beforeEach(() => {
  lines.length = 0;
  vi.spyOn(console, 'log').mockImplementation((l) => lines.push(String(l)));
});

import { accessLog } from '../../../src/middleware/accessLog';

describe('accessLog middleware', () => {
  it('logs one line per request with method/path/status/latencyMs/requestId', async () => {
    const app = new Hono();
    app.use('*', (c, n) => { c.set('requestId', 'req-123'); return n(); });
    app.use('*', accessLog());
    app.get('/x', (c) => c.json({ ok: true }, 200));
    await app.fetch(new Request('http://localhost/x'));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const line = JSON.parse(lines[lines.length - 1]!);
    expect(line.msg).toBe('http.access');
    expect(line.method).toBe('GET');
    expect(line.path).toBe('/x');
    expect(line.status).toBe(200);
    expect(typeof line.latencyMs).toBe('number');
    expect(line.requestId).toBe('req-123');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- accessLog.test 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Write middleware**

Create `apps/api/src/middleware/accessLog.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vyro/api test -- accessLog.test 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/accessLog.ts apps/api/test/middleware/accessLog.test.ts
git commit -m "feat(obs): access log middleware"
```

---

### Task 4: Health endpoint

**Files:**
- Create: `apps/api/src/modules/health/routes.ts`
- Test: `apps/api/test/modules/health.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/modules/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import healthRouter from '../../../src/modules/health/routes';

function app() {
  const a = new Hono();
  a.route('/api/health', healthRouter);
  return a;
}

describe('GET /api/health', () => {
  it('ok=true when DB ping returns 1', async () => {
    const env = { DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } } as any;
    const res = await app().fetch(new Request('http://localhost/api/health'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.db).toBe('ok');
    expect(typeof body.ts).toBe('string');
  });

  it('ok=false, db=down when DB throws', async () => {
    const env = { DB: { prepare: () => ({ first: async () => { throw new Error('boom'); } }) } } as any;
    const res = await app().fetch(new Request('http://localhost/api/health'), env);
    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.db).toBe('down');
  });

  it('includes version from env', async () => {
    const env = { VERSION: 'abc123', DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } } as any;
    const res = await app().fetch(new Request('http://localhost/api/health'), env);
    const body = (await res.json()) as any;
    expect(body.version).toBe('abc123');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- health.test 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Write health route**

Create `apps/api/src/modules/health/routes.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
  let dbOk = false;
  try {
    const row = await c.env.DB.prepare('SELECT 1 as ok').first();
    dbOk = row?.ok === 1;
  } catch {
    dbOk = false;
  }
  return c.json(
    {
      ok: dbOk,
      db: dbOk ? 'ok' : 'down',
      version: c.env.VERSION ?? 'dev',
      ts: new Date().toISOString(),
    },
    dbOk ? 200 : 503,
  );
});

export default router;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vyro/api test -- health.test 2>&1 | tail -5`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/health/routes.ts apps/api/test/modules/health.test.ts
git commit -m "feat(obs): /api/health with DB ping + version"
```

---

### Task 5: Wire into index.ts

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Update imports + remove inline health**

In `apps/api/src/index.ts`:
- Add imports: `import { accessLog } from './middleware/accessLog'; import healthRouter from './modules/health/routes';`
- Change `app.use('*', requestId());` chain to add `app.use('*', accessLog());` after requestId.
- Remove inline `app.get('/api/health', ...)` line.
- Add `app.route('/api/health', healthRouter);` near top of route mounts.
- Update `app.onError` to log structured error before returning envelope.

Replace the existing onError:

```ts
app.onError((err, c) => {
  const env = errorEnvelope(err);
  const ctx = c.get('ctx') as { userId?: string } | undefined;
  const path = (() => { try { return new URL(c.req.url).pathname; } catch { return '?'; } })();
  logger.error('http.error', {
    method: c.req.method,
    path,
    status: env.status,
    requestId: c.get('requestId'),
    userId: ctx?.userId,
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  });
  return c.json(env.body, env.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
});
```

Add import: `import { logger } from './lib/logger';`

- [ ] **Step 2: Run full test suite**

Run: `pnpm --filter @vyro/api test 2>&1 | tail -10`
Expected: same as before (no new failures)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(obs): wire accessLog + structured error logging + health route"
```

---

### Task 6: Replace console.* in lib/errors.ts

**Files:**
- Modify: `apps/api/src/lib/errors.ts`

- [ ] **Step 1: Replace console.error**

In `apps/api/src/lib/errors.ts`, change:
```ts
console.error('Unhandled error', err);
```
to:
```ts
logger.error('error.unhandled', { err: err instanceof Error ? { name: err.name, message: err.message } : String(err) });
```

Add import:
```ts
import { logger } from './logger';
```

- [ ] **Step 2: Verify other console.* calls — replace**

Run: `grep -rn "console\." /Users/thufailahamed/Downloads/project-5/apps/api/src/ --include="*.ts" | grep -v "/scripts/" | grep -v ".test.ts"`

For each match, replace with appropriate `logger.*` call. Common patterns:
- `console.log('[auth] ...')` → `logger.info('auth', { msg: '...' })`
- `console.error('[auth] ...')` → `logger.error('auth', { msg: '...' })`

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @vyro/api test 2>&1 | tail -5`
Expected: green

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/
git commit -m "refactor(obs): replace console.* with structured logger"
```

---

### Task 7: Wrangler config + final verification

**Files:**
- Modify: `apps/api/wrangler.toml`
- Verify: typecheck + tests

- [ ] **Step 1: Add analytics binding**

In `apps/api/wrangler.toml`, add:

```toml
[[analytics_engine_datasets]]
binding = "METRICS"
dataset = "vyro_metrics"
```

- [ ] **Step 2: Final typecheck**

Run: `pnpm typecheck 2>&1 | tail -5`
Expected: clean

- [ ] **Step 3: Full test suite**

Run: `pnpm --filter @vyro/api test 2>&1 | tail -5`
Run: `pnpm --filter @vyro/web test 2>&1 | tail -5`
Expected: same as before plus new tests pass

- [ ] **Step 4: Commit and merge**

```bash
git add apps/api/wrangler.toml
git commit -m "chore(obs): wire Analytics Engine binding in wrangler.toml"
git checkout main
git merge --no-ff feat/b2-observability
git branch -d feat/b2-observability
```
