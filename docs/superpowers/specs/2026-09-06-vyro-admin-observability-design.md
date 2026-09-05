# Admin Observability Design

**Goal:** Give `super_admin` a health/cron observability console.

**Scope:** Phase T7 of the admin platform. Touches: existing cron infrastructure, web admin shell.

**Non-goals:** No APM/metrics aggregation. No log search. No alerting.

## Roles & permissions

New permissions for T7:
- `health:read` — see health dashboard.
- `cron:read`, `cron:trigger` — list cron jobs and manually trigger them.

Role matrix updates:
- `super_admin`: gets all new permissions.
- `ops`: gets `health:read` and `cron:read` (not `cron:trigger`).
- `finance`, `support`: no change.

## Domain model

No new tables. Reuse `admin_audit_logs` for cron run records.

### In-memory (loaded from wrangler config)
- Cron jobs list — derived from `wrangler.toml` `[triggers] crons` or imported constants.
- Each job: `{ name, schedule, handler, lastRunAt, lastStatus, lastDurationMs }`.

### Health probes
- `GET /api/admin/health/dashboard` — collects:
  - DB latency (simple `SELECT 1`).
  - Pending webhook deliveries count.
  - Failed webhook deliveries count (last 24h).
  - Open abuse reports count.
  - Pending KYC count.
  - Pending refunds count.
  - Recent errors (last 50 from log buffer — in-memory, optional).

## API endpoints

All under `/api/admin/*`, super_admin only.

### Health
- `GET /api/admin/health/dashboard` — Permission: `health:read`. Returns aggregated snapshot.

### Cron
- `GET /api/admin/cron` — list jobs with last-run status. Permission: `cron:read`.
- `POST /api/admin/cron/:name/trigger` — manually run a cron handler. Permission: `cron:trigger`. Audit row `cron.manual_trigger`.

## Audit

- `cron.manual_trigger` with before/after.

## Web admin

New page `/admin/observability` with tabs:
1. **Health** — health dashboard cards.
2. **Cron** — list of cron jobs + manual trigger button.
3. **Errors** — recent errors list (last 50).

Sidebar entry gated on `health:read || cron:read`. Listed under "Observability".

## Tests

- `apps/api/test/admin/health.test.ts` — health snapshot.
- `apps/api/test/admin/cron.test.ts` — list + manual trigger with audit.

## E2E

Section 7h in `scripts/e2e.md`.

## Migrations

None.
