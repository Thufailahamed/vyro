# Vyro Ops Runbook

Day-2 operations for the Vyro Worker + SPA + D1 stack.

The API and the SPA share **one origin** (`https://vyro-api.thufailahamed627.workers.dev`
by default). The Worker serves `/api/*` and ships the built SPA via
`[assets]`. There is no separate Pages project.

## Health checks

```bash
# Liveness + DB ping
curl https://vyro-api.thufailahamed627.workers.dev/api/health

# Version + deploy timestamp
curl https://vyro-api.thufailahamed627.workers.dev/api/health/version
```

`/api/health` returns `200` with `{ ok: true, ready: true, db: 'ok' }` when
healthy, or `503` when D1 is unreachable.

## Build + deploy

```bash
# One-shot: builds SPA then deploys Worker (uploads assets in the same deploy).
node scripts/deploy-backend.mjs --env production

# Build only (no deploy) — useful for CI matrix builds.
node scripts/deploy-backend.mjs --build-only
```

If `BETTER_AUTH_SECRET` hasn't been set yet, the first deploy will succeed but
auth will be broken. See "Secret rotation" below.

## Rollback

### Worker (API + SPA together)

```bash
# List recent deployments
wrangler deployments list --config apps/api/wrangler.toml

# Roll back to the previous version
wrangler rollback --config apps/api/wrangler.toml
```

A Worker rollback restores **both** the API code and the SPA bundle that was
uploaded with that deployment — there's nothing separate to roll back.

### D1 (database)

D1 migrations are append-only. To roll back a bad migration:

```bash
# Restore from a backup
wrangler d1 restore vyro --remote --name "pre-deploy-YYYY-MM-DD"

# Or apply a forward-fix migration
pnpm db:migrate
```

## Secret rotation

```bash
# Rotate the Better Auth secret (invalidates all sessions — users must sign in again).
npx wrangler secret put BETTER_AUTH_SECRET --env production \
  --config apps/api/wrangler.toml
```

The secret is read at runtime from `env.BETTER_AUTH_SECRET`. Never commit it
to `wrangler.toml`.

## Backups

### D1

```bash
# Manual snapshot
wrangler d1 export vyro --remote --output backup-$(date +%Y%m%d).sql
```

D1 daily automatic backups are enabled in the Cloudflare dashboard.

### R2 (avatars + product images)

R2 versioning + lifecycle rules should be configured in the Cloudflare
dashboard. Manual export:

```bash
wrangler r2 object get vyro-products/path/to/file --file ./local-backup.bin
```

## KV cache clear

```bash
# Delete a single key (e.g. a stuck rate-limit entry)
wrangler kv:key delete --binding CACHE "ratelimit:global:1.2.3.4" --remote

# Bulk delete by prefix requires a custom script (prefix scan + delete loop).
```

## Incident response

1. Check `/api/health` — DB down?
2. `wrangler tail --config apps/api/wrangler.toml` for live request logs.
3. Cloudflare status: https://www.cloudflarestatus.com/
4. Bad deploy → `wrangler rollback --config apps/api/wrangler.toml`.
5. Suspected auth compromise → rotate `BETTER_AUTH_SECRET` and clear rate-limit
   keys for the affected IP range from KV.

## Cron / scheduled work

The Worker is configured with `crons = ["0 3 * * *"]` (3 AM UTC nightly).
The `scheduled` export in `apps/api/src/worker.ts` dispatches to registered
jobs in `apps/api/src/cron/`. Jobs can also be triggered manually through:

```bash
curl -X POST https://vyro-api.thufailahamed627.workers.dev/api/admin/cron/<job>/run \
  -H "Cookie: <admin session>"
```

List registered jobs and last-run status:

```bash
curl https://vyro-api.thufailahamed627.workers.dev/api/admin/cron \
  -H "Cookie: <admin session>"
```

## Custom domains

If you migrate to a custom domain, edit `apps/api/wrangler.toml`
`[env.production.vars]` and set **all three** of these to the same URL:

- `WEB_ORIGIN`
- `ADMIN_ORIGIN`
- `BETTER_AUTH_URL`

Then redeploy (`node scripts/deploy-backend.mjs --env production`). CORS,
cookies, and CSRF all derive their allow-list from those vars.
