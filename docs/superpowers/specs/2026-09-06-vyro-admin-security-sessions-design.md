# Admin Security & Sessions Design

**Goal:** Give `super_admin` control over admin sessions, 2FA enforcement, impersonation, and GDPR data export.

**Scope:** Phase T6 of the admin platform. Touches: users module, audit log, sessions.

**Non-goals:** No password reset email delivery infra. No biometric 2FA. No enterprise SSO.

## Roles & permissions

Existing permissions (already in matrix):
- `user:suspend`, `user:unsuspend`
- `audit:read`, `audit:export`

New permissions for T6:
- `session:revoke` — revoke any admin or user session.
- `impersonation:start`, `impersonation:end` — act-as another user.
- `data_export:run` — GDPR data export for a user.
- `2fa:enforce` — toggle 2FA enforcement on/off per role.

Role matrix updates:
- `super_admin`: gets all new permissions.
- `ops`, `finance`, `support`: no change.

## Domain model

### `admin_impersonations`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv4 |
| `admin_user_id` | text | super_admin doing the impersonation |
| `target_user_id` | text | user being impersonated |
| `reason` | text | mandatory free text |
| `started_at` | int | epoch ms |
| `ended_at` | int | nullable |
| `ip` | text | nullable |
| `user_agent` | text | nullable |

### `data_export_requests`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv4 |
| `user_id` | text | target user |
| `requested_by` | text | super_admin id |
| `status` | text enum | `pending`, `ready`, `failed`, `expired` |
| `download_url` | text | nullable — would be a signed URL in prod |
| `expires_at` | int | nullable |
| `created_at` | int | |

### `sessions` (existing)
Extend: `revoked_by_admin_id`, `revoked_reason`. Used for `session:revoke` audit.

### `users` (existing)
Add `require_2fa` int default 0 (per user 2FA enforcement).

## API endpoints

All under `/api/admin/*`, all require session + super_admin.

### Sessions
- `GET /api/admin/sessions` — list active admin sessions. Permission: `session:revoke`.
- `POST /api/admin/sessions/:id/revoke` — kill a session. Permission: `session:revoke`.

### 2FA
- `POST /api/admin/users/:id/2fa/enforce` — set `require_2fa=true`. Permission: `2fa:enforce`.
- `POST /api/admin/users/:id/2fa/unenforce` — clear. Permission: `2fa:enforce`.

### Impersonation
- `POST /api/admin/impersonate` — body: `{targetUserId, reason}`. Permission: `impersonation:start`. Sets `X-Impersonated-By` header on response. Audit row `impersonation.start`.
- `POST /api/admin/impersonate/end` — end current impersonation. Audit `impersonation.end`.
- `GET /api/admin/impersonate` — current impersonation status.

### GDPR export
- `POST /api/admin/data-export` — body: `{userId}`. Permission: `data_export:run`. Returns export id.
- `GET /api/admin/data-export/:id` — returns status.

## Audit

Every mutation appends a row to `admin_audit_logs`:
- `session.revoke`, `user.2fa.enforce`, `user.2fa.unenforce`
- `impersonation.start`, `impersonation.end`
- `data_export.create`

## Web admin

New page `/admin/security` with tabs:
1. **Sessions** — list of active admin sessions, revoke button.
2. **2FA** — search user, enforce/unenforce.
3. **Impersonation** — start form (target + reason), end button.
4. **Data export** — request export, view status.

Sidebar entry gated on `session:revoke || 2fa:enforce || impersonation:start || data_export:run`. Listed under "Security".

## Tests

- `apps/api/test/admin/sessions.test.ts` — list, revoke, audit.
- `apps/api/test/admin/impersonation.test.ts` — start/end, audit, 401 without perm.
- `apps/api/test/admin/dataExport.test.ts` — create, get, status.

## E2E

Section 7g in `scripts/e2e.md`. Walks through session revoke, 2FA enforce, impersonation start/end, data export request.

## Migrations

`packages/db/migrations/0013_admin_security.sql`:
```sql
CREATE TABLE admin_impersonations (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX admin_impersonations_admin_idx ON admin_impersonations(admin_user_id);
CREATE INDEX admin_impersonations_target_idx ON admin_impersonations(target_user_id);

CREATE TABLE data_export_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  download_url TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN require_2fa INTEGER NOT NULL DEFAULT 0;

ALTER TABLE sessions ADD COLUMN revoked_by_admin_id TEXT REFERENCES users(id);
ALTER TABLE sessions ADD COLUMN revoked_reason TEXT;
```
