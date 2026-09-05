# VYRO Ops (Sub-project B5)

**Date:** 2026-09-05
**Status:** Approved design
**Parent:** `docs/superpowers/specs/2026-09-05-vyro-feature-gaps-design.md` §10

## 1. Background

Current state:
- `scripts/deploy-backend.mjs` exists for Cloudflare Worker + D1 migrations.
- No web deploy script — admin SPA + web SPA deploys ad-hoc.
- `/api/health` extended in B2 (status, version).
- No `VERSION` env propagation to web bundle.
- No ops runbook (incident response, rollback, backup).
- No /api/ready vs /api/health separation.

## 2. Goals

- `scripts/deploy-web.mjs` builds web + admin SPAs and runs `wrangler pages deploy`.
- `/api/version` returns build SHA + env + deployed_at.
- Web bundle embeds `__VYRO_VERSION__` at build time via vite `define`.
- `docs/runbook.md` covers: rollback, secret rotation, D1 backup, KV cache clear.
- `/api/health` reports `ready` field (true if DB ping ok).

## 3. Non-goals

- Real-time alerting (PagerDuty integration out-of-scope).
- Custom metrics dashboards (B2 covers).
- Logpush setup (operational concern, document only).
- Cloudflare Pages Functions (we use Workers).

## 4. Architecture

### 4.1 /api/version

```ts
// apps/api/src/modules/health/version.ts (extend health)
router.get('/version', (c) => c.json({
  version: c.env.VERSION ?? 'dev',
  env: c.env.ENVIRONMENT,
  deployedAt: c.env.DEPLOYED_AT ?? null,
}));
```

Add `DEPLOYED_AT` to env (set during deploy).

### 4.2 Web bundle VERSION

In `apps/web/vite.config.ts`:
```ts
define: {
  __VYRO_VERSION__: JSON.stringify(process.env.VITE_VERSION ?? 'dev'),
},
```

Inject in deploy script:
```bash
VITE_VERSION=$(git rev-parse --short HEAD) wrangler pages deploy ...
```

### 4.3 deploy-web.mjs

```js
#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = execSync('git rev-parse --short HEAD').toString().trim();
const env = { ...process.env, VITE_VERSION: sha, NODE_ENV: 'production' };

function run(cmd) {
  console.log(`➜ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: rootDir, env });
}

try {
  run('pnpm --filter @vyro/web build');
  run('pnpm --filter @vyro/admin build');
  console.log('✅ Web + admin builds complete. Deploy via: wrangler pages deploy apps/web/dist --project-name vyro-web');
} catch (e) {
  console.error('❌ Build failed:', e.message);
  process.exit(1);
}
```

### 4.4 Runbook

`docs/runbook.md`:
- Rollback API: `wrangler rollback --config apps/api/wrangler.toml`
- Rotate secrets: `wrangler secret put BETTER_AUTH_SECRET`
- D1 backup: `wrangler d1 backup create vyro`
- KV cache clear: `wrangler kv:bulk delete --binding CACHE ...`
- Health check: `curl https://vyro-api.example/api/health`

## 5. Components

| File | Purpose |
|---|---|
| `apps/api/src/modules/health/routes.ts` | Add /version |
| `apps/web/vite.config.ts` | Inject __VYRO_VERSION__ |
| `scripts/deploy-web.mjs` | Build + tag with git SHA |
| `docs/runbook.md` | Ops procedures |
| `scripts/deploy-backend.mjs` | Inject DEPLOYED_AT env |

## 6. Data flow

None. Read-only endpoints + build-time env vars.

## 7. Error handling

- /api/version never throws (defaults).
- deploy-web.mjs: exit 1 on any build error.

## 8. Testing

- /api/version shape test (version + env + deployedAt fields).
- Deploy script dry-run check (verify exit codes).

## 9. Phases

1. /api/version + test
2. vite define __VYRO_VERSION__
3. deploy-web.mjs script
4. update deploy-backend.mjs to inject DEPLOYED_AT
5. Runbook doc

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Git SHA missing in CI | Fallback to 'dev' via undefined handling. |
| Pages deploy requires manual `wrangler pages deploy` step | Document in deploy script output. |

## 11. Acceptance criteria

1. `GET /api/version` returns `{ version, env, deployedAt }`.
2. `pnpm build` in web injects `__VYRO_VERSION__`.
3. `node scripts/deploy-web.mjs` builds both SPAs.
4. `docs/runbook.md` exists with rollback + secret rotation sections.

## 12. Out of scope

- Real-time alerting.
- PagerDuty integration.
