# VYRO Ops Runbook

Day-2 operations procedures.

## Health checks

```bash
# Liveness + DB ping
curl https://vyro-api.example/api/health

# Version + deploy timestamp
curl https://vyro-api.example/api/version
```

`/api/health` returns `200` with `{ ok: true, ready: true, db: 'ok' }` when healthy.
Returns `503` when DB is unreachable.

## Rollback

### Backend (Worker)

```bash
# List recent deployments
wrangler deployments list --config apps/api/wrangler.toml

# Roll back to previous version
wrangler rollback --config apps/api/wrangler.toml
```

### Frontend (Pages)

```bash
# Pages rollbacks via Cloudflare dashboard → Pages → vyro-web → Deployments → Rollback
```

### Database (D1)

D1 migrations are append-only. To roll back a bad migration:

```bash
# Restore from backup
wrangler d1 restore vyro --remote --name "pre-deploy-2026-09-05"

# Or apply a forward-fix migration
```

## Secret rotation

```bash
# Rotate Better Auth secret (invalidates all sessions)
wrangler secret put BETTER_AUTH_SECRET --config apps/api/wrangler.toml

# Rotate after any suspected compromise. Users must sign in again.
```

## Backup

### Database

```bash
# Manual snapshot
wrangler d1 export vyro --remote --output backup-$(date +%Y%m%d).sql
```

D1 daily automatic backups are enabled in the Cloudflare dashboard.

### R2 (avatars + product images)

R2 versioning + lifecycle rules should be configured in the Cloudflare dashboard.
Manual export:

```bash
wrangler r2 object get vyro-products/path/to/file --file ./local-backup.bin
```

## KV cache clear

```bash
# Delete a single key
wrangler kv:key delete --binding CACHE "ratelimit:global:1.2.3.4" --remote

# Bulk delete by prefix (custom script needed for prefix scan)
```

## Incident response

1. Check `/api/health` — DB down?
2. Check `wrangler tail` for recent errors.
3. Check Cloudflare status: https://www.cloudflarestatus.com/
4. If bad deploy: `wrangler rollback`.
5. If suspected attack: rotate `BETTER_AUTH_SECRET` + KV clear.

## Build + deploy

```bash
# Backend + D1 migrations
node scripts/deploy-backend.mjs

# Backend with seed data
node scripts/deploy-backend.mjs --seed

# Frontend (build only — manual wrangler pages deploy)
node scripts/deploy-web.mjs
```

Bundle SHA is injected at build time (visible via `/api/version`).
