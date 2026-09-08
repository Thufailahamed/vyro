# Vyro

Sri Lanka wholesale distribution platform. Monorepo: `apps/api` (Hono on
Cloudflare Workers + D1) and `apps/web` (React SPA: buyer pages, supplier
portal at `/supplier/*`, admin portal at `/admin/*`). Shared code lives under
`packages/`.

## Layout

```
apps/
  api/          # Worker. Owns /api/* and serves the SPA via [assets].
  web/          # React SPA. Builds to apps/web/dist.
packages/
  auth/         # better-auth wiring + admin role helpers
  db/           # Drizzle schema + D1 migrations
  shared/       # Constants, types, branding helpers shared client/server
  validation/   # Zod schemas (request bodies, query strings)
  payments/     # PayHere webhook + signature verification
  ui/           # Shared component primitives
  ai/           # Internal AI helpers (search ranking, summaries)
```

## Requirements

- Node 20+
- pnpm 9+
- A Cloudflare account with Workers, D1 (`vyro`), R2 (`vyro-products`),
  KV (`vyro`), Analytics Engine (`vyro_metrics`), and two Queues
  (`audit`, `notifications`).

## Local development

```sh
pnpm install
pnpm db:migrate                     # apply D1 migrations to local D1
pnpm db:seed                        # optional: seed sample data
pnpm dev                            # turbo-runs web (5173) + api (8787)
```

The Vite dev server proxies `/api/*` to the Worker at `localhost:8787`.
Cookies issued by the Worker are scoped to `localhost:8787` in dev, so the
SPA must use relative `fetch('/api/...')` — never an absolute URL.

## Production deployment

The API Worker serves the built SPA from a **single origin**. There is no
separate Pages deploy; the SPA bundle ships as Worker static assets under
`apps/web/dist` (via `[assets]` in `wrangler.toml`).

```sh
# One-shot: builds the SPA and deploys the Worker (which uploads the assets).
node scripts/deploy-backend.mjs --env production

# Or step-by-step:
pnpm --filter @vyro/web build
pnpm --filter @vyro/api exec wrangler deploy --env production \
  --config apps/api/wrangler.toml
```

### Required secrets

`BETTER_AUTH_SECRET` is **not** in `wrangler.toml` (would leak via git).
Set it as a secret before the first deploy:

```sh
npx wrangler secret put BETTER_AUTH_SECRET --env production \
  --config apps/api/wrangler.toml
```

### Routing contract

- `https://vyro-api.thufailahamed627.workers.dev/` → SPA (`index.html`)
- `https://vyro-api.thufailahamed627.workers.dev/api/*` → API Worker
- Any non-API path that doesn't match a static asset → SPA fallback
  (React Router resolves client-side).

`run_worker_first = ["/api/*"]` in `[assets]` ensures the Worker always sees
API traffic before the asset layer can return `index.html`.

### Custom domain

If you attach a custom domain, change **all three** of these in
`apps/api/wrangler.toml` `[env.production.vars]` to the same URL:

- `WEB_ORIGIN`
- `ADMIN_ORIGIN`
- `BETTER_AUTH_URL`

Cookie domain, CORS, and CSRF all compare against `WEB_ORIGIN`/`ADMIN_ORIGIN`.

## Scripts

- `pnpm typecheck` — `tsc --noEmit` across the whole monorepo
- `pnpm test` — vitest for api, auth, shared, validation
- `pnpm build` — production build of every package
- `node scripts/deploy-web.mjs` — build SPA then deploy Worker
- `node scripts/deploy-backend.mjs [--build-only]` — same as above with
  optional build-only mode

## Cron / scheduled work

`[triggers] crons = ["0 3 * * *"]` runs the Worker handler's `scheduled`
export nightly. See `apps/api/src/cron/` for registered jobs. Jobs are also
exposed under `/api/admin/cron` for manual triggering and listing.

## See also

- `docs/runbook.md` — day-2 operations (rollback, secrets, backups, incidents).
