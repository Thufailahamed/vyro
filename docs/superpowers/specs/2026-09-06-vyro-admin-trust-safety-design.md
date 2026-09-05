# Admin Trust & Safety Design

**Goal:** Give the `support` admin role the tools to handle abuse reports, KYC review, and user/account takedowns, without bumping support up to ops.

**Scope:** Phase T4 of the admin platform. Touches: users module, abuse reports, KYC review, web admin shell.

**Non-goals:** No automated content moderation. No ML scoring. No email/dispatch to reporters — staff notes only. No payments/ledger work (handled in T3). No catalog moderation (T2).

## Roles & permissions

Existing permissions (already in `packages/auth/src/permissions.ts`):
- `user:read`, `user:suspend`, `user:unsuspend`
- `business:freeze`, `business:unfreeze`
- `supplier:freeze`, `supplier:unfreeze`
- `dispute:read`, `dispute:note`, `dispute:resolve`

New permissions for T4:
- `abuse_report:read`, `abuse_report:resolve` — review and dismiss/resolve abuse reports.
- `kyc:read`, `kyc:review` — review KYC submissions and approve/reject.
- `takedown:write` — perform content takedown on listings (reuse product:moderate for product listings).

Role matrix updates:
- `super_admin`: gets all new permissions.
- `ops`: gets `abuse_report:read`, `abuse_report:resolve`, `kyc:read`, `kyc:review`, `takedown:write` (ops already moderates products).
- `support`: gets `abuse_report:read`, `abuse_report:resolve`, `kyc:read`, `kyc:review`, `takedown:write` (the primary owner).
- `finance`: no change.

## Domain model

### `abuse_reports`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv4 |
| `reporter_user_id` | text | nullable for anonymous tip |
| `target_type` | text enum | `user`, `business`, `supplier`, `product`, `review` |
| `target_id` | text | FK by convention |
| `reason` | text | short category — `spam`, `fraud`, `harassment`, `misinformation`, `other` |
| `details` | text | free-form description |
| `status` | text enum | `open`, `investigating`, `resolved`, `dismissed` |
| `assigned_to` | text | admin user id (nullable) |
| `resolution_notes` | text | staff notes (nullable) |
| `created_at` | int | epoch ms |
| `updated_at` | int | epoch ms |

### `kyc_reviews`
| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUIDv4 |
| `user_id` | text | target user |
| `status` | text enum | `pending`, `approved`, `rejected`, `needs_more_info` |
| `documents_json` | text | JSON array of submitted doc references (urls/hashes) |
| `notes` | text | staff notes |
| `reviewed_by` | text | admin user id (nullable) |
| `reviewed_at` | int | epoch ms (nullable) |
| `created_at` | int | epoch ms |

`takedowns` is a derived view — we record every content takedown as an `audit_log` row with `action='takedown.create'` and `target` describing the listing. No new table needed.

## API endpoints

All under `/api/admin/*`, all require session + `abuse_report:read|kyc:read|user:suspend|takedown:write`.

### Abuse reports
- `GET /api/admin/abuse-reports` — list with filters `?status=open&assignedTo=me&cursor=&limit=`. Permission: `abuse_report:read`.
- `GET /api/admin/abuse-reports/:id` — single report + thread of staff notes (reuses `audit_log`). Permission: `abuse_report:read`.
- `POST /api/admin/abuse-reports/:id/claim` — claim ownership. Permission: `abuse_report:read`.
- `POST /api/admin/abuse-reports/:id/notes` — append a note. Permission: `abuse_report:read`.
- `POST /api/admin/abuse-reports/:id/resolve` — close as `resolved` or `dismissed`. Permission: `abuse_report:resolve`.
- `POST /api/admin/abuse-reports/:id/takedown` — perform content takedown (sets target inactive), requires `takedown:write`.

### KYC
- `GET /api/admin/kyc` — list with `?status=pending`. Permission: `kyc:read`.
- `GET /api/admin/kyc/:id` — single submission. Permission: `kyc:read`.
- `POST /api/admin/kyc` — create review (called when user submits KYC). Permission: `kyc:read` (user-facing or staff-initiated).
- `POST /api/admin/kyc/:id/decision` — body: `{decision: 'approved'|'rejected'|'needs_more_info', notes}`. Permission: `kyc:review`.

### User suspension (existing route upgrades)
- `POST /api/admin/users/:id/suspend` — already exists; switch from `requireRole({admin:true})` to `requirePermission('user:suspend')`. Adds audit.
- `POST /api/admin/users/:id/unsuspend` — same as above with `user:unsuspend`.

## Audit

Every state change appends a row to `audit_log`:
- `abuse_report.claim`, `abuse_report.note`, `abuse_report.resolve`, `abuse_report.takedown`
- `kyc.create`, `kyc.approve`, `kyc.reject`, `kyc.needs_more_info`
- `user.suspend`, `user.unsuspend`

`before`/`after` capture the report/kyc fields and the user status transitions.

## Web admin

New page `/admin/trust-safety` with tabs:
1. **Reports** — table of `open`/`investigating` reports, claim/resolve/takedown actions.
2. **KYC** — table of pending KYC submissions, decision buttons.
3. **Users** — search a user, suspend/unsuspend.

Sidebar entry gated on `abuse_report:read || kyc:read || user:suspend`. Listed under "Trust & Safety".

## Tests

- `apps/api/test/admin/abuseReports.test.ts` — list, claim, resolve, takedown (per role).
- `apps/api/test/admin/kyc.test.ts` — list, decision flow, audit row.
- `apps/api/test/admin/userSuspend.test.ts` — suspend/unsuspend with audit; role matrix (support can suspend, finance cannot).
- Existing dispute tests should still pass.

## E2E

Section 7e in `scripts/e2e.md`. Walks through report claim → note → resolve; KYC pending → approve → audit; user suspend → unsuspend.

## Migrations

`packages/db/migrations/0011_admin_trust_safety.sql`:
```sql
CREATE TABLE abuse_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  assigned_to TEXT,
  resolution_notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX abuse_reports_status_idx ON abuse_reports(status);
CREATE INDEX abuse_reports_target_idx ON abuse_reports(target_type, target_id);

CREATE TABLE kyc_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  documents_json TEXT,
  notes TEXT,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX kyc_reviews_status_idx ON kyc_reviews(status);
CREATE INDEX kyc_reviews_user_idx ON kyc_reviews(user_id);
```
