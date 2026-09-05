# Admin Platform Config Design

**Goal:** Give `super_admin` the runtime control plane for platform behavior — feature flags, email templates, and webhook delivery.

**Scope:** Phase T5 of the admin platform. Touches: platform_settings table, new webhook tables, web admin shell.

**Non-goals:** No general CMS. No email sending infra. No webhook retry/backoff worker (just config + log).

## Roles & permissions

New permissions for T5:
- `feature_flag:read`, `feature_flag:write`
- `email_template:read`, `email_template:write`
- `webhook:read`, `webhook:write`, `webhook:retry`

Role matrix updates:
- `super_admin`: gets all new permissions.
- `ops`, `finance`, `support`: no change (super_admin only).

## Domain model

### `platform_settings` (already exists from earlier work)
Extend with typed sections:
- `feature_flags` — JSON object of `{ [flag_name]: { enabled: boolean, rollout?: number, notes?: string } }`.
- `email_templates` — JSON object of `{ [template_key]: { subject: string, body: string, locale: string } }`.

Add columns:
- `section` text PK — `'feature_flags' | 'email_templates'`
- `value_json` text — JSON payload
- `version` int — optimistic concurrency
- `updated_by` text — admin user id
- `updated_at` int

For schema simplicity, store per-section rows with full JSON value. Use `version` for optimistic concurrency on writes.

### `webhooks` (new)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv4 |
| `name` | text | display name |
| `url` | text | target URL |
| `event_types` | text | JSON array of subscribed events |
| `secret` | text | signing secret (encrypted at rest in prod) |
| `active` | int | 0/1 |
| `created_by` | text | admin user id |
| `created_at` | int | |

### `webhook_deliveries` (new)
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv4 |
| `webhook_id` | text | FK |
| `event_type` | text | |
| `payload_json` | text | body sent |
| `status` | text enum | `pending`, `success`, `failed` |
| `response_status` | int | HTTP status |
| `response_body` | text | truncated response (nullable) |
| `attempt_count` | int | |
| `next_retry_at` | int | nullable |
| `created_at` | int | |

## API endpoints

All under `/api/admin/*`, all require session + super_admin.

### Feature flags
- `GET /api/admin/feature-flags` — returns current `feature_flags` JSON. Permission: `feature_flag:read`.
- `PUT /api/admin/feature-flags` — body: full JSON value, must include `expectedVersion`. Permission: `feature_flag:write`. Returns new version on success; 409 `STALE_WRITE` on mismatch.

### Email templates
- `GET /api/admin/email-templates` — returns current `email_templates` JSON. Permission: `email_template:read`.
- `PUT /api/admin/email-templates` — body: full JSON value + `expectedVersion`. Permission: `email_template:write`.

### Webhooks
- `GET /api/admin/webhooks` — list with filters. Permission: `webhook:read`.
- `POST /api/admin/webhooks` — create. Permission: `webhook:write`.
- `PATCH /api/admin/webhooks/:id` — update. Permission: `webhook:write`.
- `DELETE /api/admin/webhooks/:id` — disable (soft). Permission: `webhook:write`.
- `GET /api/admin/webhooks/:id/deliveries` — recent deliveries. Permission: `webhook:read`.
- `POST /api/admin/webhooks/:id/retry/:deliveryId` — re-attempt delivery. Permission: `webhook:retry`.

## Audit

Every mutation appends a row to `admin_audit_logs`:
- `feature_flag.update`, `email_template.update`
- `webhook.create`, `webhook.update`, `webhook.delete`, `webhook.retry`

`before`/`after` capture the JSON values.

## Web admin

New page `/admin/platform` with tabs:
1. **Feature flags** — JSON editor + version display.
2. **Email templates** — list of templates with subject/body editors.
3. **Webhooks** — list of webhooks, create/edit/disable, recent deliveries + retry button.

Sidebar entry gated on `feature_flag:read || email_template:read || webhook:read`. Listed under "Platform".

## Tests

- `apps/api/test/admin/featureFlags.test.ts` — read, update with version, stale write 409.
- `apps/api/test/admin/emailTemplates.test.ts` — read, update.
- `apps/api/test/admin/webhooks.test.ts` — CRUD + list deliveries + retry.

## E2E

Section 7f in `scripts/e2e.md`. Walks through feature flag update, email template update, webhook create + delivery.

## Migrations

`packages/db/migrations/0012_admin_platform_config.sql`:
```sql
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  event_types TEXT NOT NULL,
  secret TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX webhooks_active_idx ON webhooks(active);

CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  response_status INTEGER,
  response_body TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX webhook_deliveries_webhook_idx ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX webhook_deliveries_status_idx ON webhook_deliveries(status);

-- Update platform_settings to be per-section
DROP TABLE IF EXISTS platform_settings;
CREATE TABLE platform_settings (
  section TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id),
  updated_at INTEGER NOT NULL
);
```
