# Admin Notifications Center — Design

> **For agentic workers:** Followed by an implementation plan. Required skill: `superpowers:writing-plans`.

**Goal:** Give admins a single inbox + bell-badge surface for the things currently buried in /admin/money, /admin/trust-safety, /admin/observability/queues, and /admin/security, with critical alerts also emailing them.

**Architecture:** Extend the existing `notifications` table with a nullable `recipientRole` column so admin alerts share the same dispatch + queue + email pipeline as buyer/supplier notifications. New `notifyAdmins(...)` helper on the existing dispatcher. Six module-level triggers fan out by admin role. New `/admin/notifications` inbox page + shell bell widget.

**Tech Stack:** Hono + D1 (Drizzle), existing `NOTIFICATIONS_QUEUE`, existing `sendEmailOrThrow`, React + TanStack Query, RBAC union extensions, vitest.

---

## 1. Data model

### 1.1 `notifications` table (`packages/db/src/schema/notifications.ts`)

Add columns:

- `recipientRole` `text` NULL — one of `super_admin | ops | finance | support`. CHECK constraint: exactly one of `userId` OR `recipientRole` is set.
- `severity` `text` NOT NULL DEFAULT `'info'` — one of `info | warning | critical`.
- `sourceRef` `text` NULL — opaque `type:id` pointer (e.g. `refund:abc123`). Dedupe-friendly for future use.

New index:

- `recipient_role_unread_idx (recipientRole, readAt, createdAt DESC)` — powers inbox listing and unread-count.

Existing columns unchanged: `id, userId, type, title, body, link, readAt, source ('system'|'ai'), createdAt`.

### 1.2 `userSettings` table (`packages/db/src/schema/userSettings.ts`)

Add column:

- `notifyAdminAlerts` `integer` NOT NULL DEFAULT `1` — `0` to opt out of admin-alert emails for the user's role.

### 1.3 Notification catalog (`packages/shared/src/constants/notifications.ts`)

Extend `NOTIFICATION_CATEGORY` with:

- `admin_alert` — admin-targeted alerts.

Extend `NotificationSource` union with `'admin'`.

Add `ADMIN_ALERT_SEVERITY` const tuple `['info', 'warning', 'critical']`.

---

## 2. Permissions

### 2.1 New permission union entries (`packages/auth/src/permissions.ts`)

Add three keys:

- `notification:read` — see admin inbox
- `notification:write` — broadcast to admins
- `notification:dismiss` — mark admin notification read

### 2.2 Role grants (`packages/auth/src/rolePermissions.ts`)

Additive only:

| Role | New grants |
|---|---|
| `super_admin` | `notification:read`, `notification:write`, `notification:dismiss` |
| `ops` | `notification:read`, `notification:dismiss` |
| `finance` | `notification:read`, `notification:dismiss` |
| `support` | `notification:read`, `notification:dismiss` |

No role loses existing permissions.

---

## 3. Dispatcher + email

### 3.1 `notifyAdmins` helper (`apps/api/src/modules/notifications/dispatcher.ts`)

Signature:

```ts
export type AdminAlertInput = {
  role: AdminRole;                              // 'super_admin' | 'ops' | 'finance' | 'support'
  severity: 'info' | 'warning' | 'critical';
  category: 'admin_alert';
  title: string;
  body: string;
  link?: string | null;
  sourceRef?: string | null;
  actorUserId?: string | null;                  // triggering admin, if any
};

export async function notifyAdmins(
  db: D1Database,
  input: AdminAlertInput,
): Promise<{ recipients: number }>;
```

Behavior:

1. Resolve recipients: `SELECT id, email FROM users WHERE adminRole = ? AND status = 'active'`.
2. For each recipient, insert one `notifications` row with `recipientRole=role, userId=NULL, severity, sourceRef, source='admin', category=admin_alert`.
3. If `severity === 'critical'`: enqueue one job per recipient on `NOTIFICATIONS_QUEUE` with payload `{ notificationId, recipientUserId, kind: 'admin_alert_email' }`.
4. Emit `auditAdmin({ action: 'notification.broadcast', target: { type: 'admin_notification', id: sourceRef ?? 'ad-hoc' }, metadata: { role, severity, recipients } })`.
5. Return `{ recipients }`.

### 3.2 `NOTIFICATIONS_QUEUE` consumer (`apps/api/src/queue/notifications.ts`)

Extend `handleNotificationsBatch` to handle `kind: 'admin_alert_email'`:

1. Look up recipient email + `notifyAdminAlerts` flag from `userSettings`.
2. If opted out, no-op.
3. Render `adminAlert` template (subject + body using `title`, `body`, `link`, `severity`).
4. Call `sendEmailOrThrow({ to, subject, html })`.

Template lives at `apps/api/src/lib/emailTemplates/adminAlert.ts`.

### 3.3 Existing routes (`apps/api/src/modules/notifications/routes.ts`)

Existing `GET /me` keeps filtering `userId = currentUserId` — unaffected. No code path surfaces admin rows to buyers/suppliers.

---

## 4. API surface

New module `apps/api/src/modules/admin/notifications/`:

- `repository.ts` — `listInbox(db, adminRole, filters, cursor)`, `unreadCount(db, adminRole)`, `markRead(db, id, adminRole)`, `markAllRead(db, adminRole)`, `broadcast(db, input, actorUserId)`. Each function filters by `recipientRole = currentAdmin.adminRole` to prevent cross-role reads.
- `service.ts` — param parsing (csv severity, cursor base64, sort), calls repo. Same `parseCsv`/`parseSort` shape as `paymentSearchService.ts`.
- `schema.ts` — zod query/body schemas: `adminNotificationQuery`, `adminNotificationBroadcast`.
- `routes.ts` — Hono sub-router mounted at `/api/admin/notifications`.

Mount in `apps/api/src/modules/admin/routes.ts` after existing mounts.

Endpoints:

| Method | Path | Permission | Behavior |
|---|---|---|---|
| `GET` | `/api/admin/notifications` | `notification:read` | List inbox for current admin's role. Query: `severity` csv, `category`, `unreadOnly` bool, `cursor`, `limit` (default 50, max 200), `sort` (`createdAt-desc` default, `createdAt-asc`). Returns `{ notifications, nextCursor, unreadCount }`. |
| `GET` | `/api/admin/notifications/unread-count` | `notification:read` | `{ count: number }`. Server-side cached 30s via response header. |
| `POST` | `/api/admin/notifications/:id/read` | `notification:dismiss` | Mark one read for current role. 404 if not in inbox. |
| `POST` | `/api/admin/notifications/read-all` | `notification:dismiss` | Bulk read for current role up to `beforeTs` (optional). Returns `{ updated: number }`. |
| `POST` | `/api/admin/notifications` | `notification:write` | Body `{ role, severity, title, body, link?, sourceRef? }`. Calls `notifyAdmins`. Returns `{ recipients, ids }`. |

All endpoints wrapped with `session() + requireRole({ admin: true })` like other admin sub-routers.

---

## 5. Web surface

### 5.1 New hooks (`apps/web/src/admin/useAdminNotifications.ts`)

- `useAdminNotificationInbox(filters, cursor)` → `UseQueryResult<{ notifications, nextCursor, unreadCount }>`
- `useAdminNotificationUnread()` → `UseQueryResult<number>`, `refetchInterval: 30_000`, refetches on `visibilitychange` to `visible`
- `useAdminNotificationDismiss()` → mutation
- `useAdminNotificationBroadcast()` → mutation
- `useAdminNotificationMarkAllRead()` → mutation, invalidates inbox + unread

Filters type: `{ severity?: AdminSeverity[]; category?: string; unreadOnly?: boolean; sort?: 'createdAt-desc' | 'createdAt-asc' }`.

### 5.2 `apps/web/src/admin/NotificationsPage.tsx`

- Filter bar: severity chips (`info`, `warning`, `critical`), category select, unread-only checkbox, sort select
- Inbox list rows: severity color bar (left border), title (bold), body (1-line clamp), relative time + absolute on hover, sourceRef link if present, dismiss `×` button
- Empty state: "All clear — no unread alerts" with green check
- Header right: "Mark all read" button (gated `notification:dismiss`)
- "Broadcast" button (gated `notification:write`) opens `<BroadcastDialog role={...} onClose={...}/>`
- URL-synced filters via `useSearchParams` like `PaymentsPage`

### 5.3 Shell bell (`apps/web/src/admin/Shell.tsx` header)

- New bell icon left of "Sign out", only rendered if `hasPermission(user.adminRole, 'notification:read')`
- Badge: count, or `9+` for ≥10
- Click → navigate to `/admin/notifications?unreadOnly=1`
- Desktop hover popover: top 5 unread via same hook with `limit=5, unreadOnly=true, sort=createdAt-desc`. "See all" link at bottom
- Popover closes on outside click + Esc

### 5.4 Nav (`apps/web/src/admin/Shell.tsx` side nav)

- Add `BellIcon` entry "Notifications" between Overview and Suppliers
- Gated `notification:read`
- Shows count badge next to label when unread > 0

### 5.5 Lazy route (`apps/web/src/App.tsx`)

Add `Route path="notifications"` under admin shell, gated `RequireAdmin`.

---

## 6. Triggers

Six v1 triggers. Each calls `notifyAdmins(...)` after the existing DB write succeeds and only on state change:

| # | Event | Source module | Role | Severity | sourceRef |
|---|---|---|---|---|---|
| 1 | Refund `status='requested'` older than 24h | new cron `refund-stuck-checker` in `apps/api/src/cron/handlers.ts` (hourly) | finance | warning | `refund:{id}` |
| 2 | Payout marked failed (`status='failed'`) | `apps/api/src/modules/payouts/admin.ts:markPaid` failure path | finance | critical | `payout:{id}` |
| 3 | Chargeback opened (`status='open'`) | `apps/api/src/modules/chargebacks/routes.ts:create` | finance + ops (two notify calls) | warning | `chargeback:{id}` |
| 4 | Queue DLQ event for any non-self-replay | `apps/api/src/lib/queueInstrument.ts:recordQueueEvent` when `event='dlq'` and `sourceRef !== 'queue:self-replay'` | ops | critical | `queue:{name}:{msgId}` |
| 5 | Abuse report filed with `reason='fraud'` | `apps/api/src/modules/abuseReports/routes.ts:create` | ops | warning | `abuse_report:{id}` |
| 6 | KYC marked `review_required` | `apps/api/src/modules/admin/kyc/routes.ts:update` | ops | info | `kyc:{userId}` |

Each trigger also writes an `admin_audit_logs` row via existing `auditAdmin(...)` with `action='notification.triggered'` for traceability.

Cron registration in `apps/api/src/cron/handlers.ts` includes `refund-stuck-checker` with hourly cadence; query is `SELECT id FROM refunds WHERE status='requested' AND createdAt < ? - 24h`; skip if a row with same `sourceRef` was created in last 6h (in-memory check via `notifications.sourceRef` lookup).

---

## 7. Test plan

TDD throughout. Target ≥ 90% line coverage for new modules.

### 7.1 API unit + integration tests (`apps/api/test/admin/notifications/`)

- `dispatcher.test.ts` (6 tests)
  - role scoping: returns N recipients matching adminRole
  - severity critical → enqueues one email job per recipient
  - severity info/warning → does NOT enqueue
  - auditAdmin called with correct action + metadata
  - zero recipients → no inserts, no errors, audit still emitted
  - `notifyAdminAlerts=0` opt-out: skips email path but still inserts notification row
- `repository.test.ts` (5 tests)
  - listInbox filters by recipientRole
  - listInbox unreadOnly excludes read rows
  - listInbox severity csv filter
  - unreadCount counts only `recipientRole = currentRole`
  - markRead scoped to role (cross-role id returns no rows)
- `routes.test.ts` (6 tests)
  - GET /: 401 without admin
  - GET /: 200 + body shape with filters
  - GET /unread-count: returns number
  - POST /:id/read: 200 + readAt set
  - POST /read-all: 200 + returns count
  - POST / (broadcast): 200 + audit + 403 without `notification:write`
- `cron-refund-stuck.test.ts` (2 tests)
  - fires notifyAdmins for each stale refund
  - skips when a notification with same sourceRef exists within 6h

### 7.2 Web hook tests (`apps/web/src/admin/useAdminNotifications.test.ts`)

- inbox hook: builds correct query string, joins csv severity, sort, cursor
- unread hook: refetchInterval 30s
- dismiss/broadcast/markAll: mutate expected paths + invalidate correct query keys

### 7.3 Web page tests (`apps/web/src/admin/NotificationsPage.test.tsx`)

- renders filter bar + empty state when inbox empty
- severity chip toggle updates URL params
- dismiss `×` invokes mutation
- broadcast modal: opens, submits, closes

(Testing approach matches `PaymentsPage` pattern: use plain DOM via direct queries; no RTL — package not installed.)

### 7.4 RBAC test (`apps/api/test/admin/notifications/rbac.test.ts`)

- 1 test per role × permission matrix ensuring grants match section 2.2

---

## 8. Out of scope (deferred)

- Dedupe on `sourceRef` via UNIQUE constraint (v1 allows bursts within 1h; doc caveat in code comment)
- Push notifications (no FCM/APNs/Web Push provider)
- Per-admin category subscription UI (role-based only)
- Anomaly / spike heuristics beyond the refund-stuck threshold
- Email digest (one email per critical only — no batching)
- Admin alert template editor UI (template is code-only for v1)
- SSE/websocket live push to the bell (30s polling + visibility refetch only)

---

## 9. File map

**Create:**
- `packages/db/src/migrations/0024_admin_notifications.sql` (D1 migration)
- `packages/shared/src/constants/notifications.ts` (extend in place)
- `apps/api/src/modules/admin/notifications/repository.ts`
- `apps/api/src/modules/admin/notifications/service.ts`
- `apps/api/src/modules/admin/notifications/schema.ts`
- `apps/api/src/modules/admin/notifications/routes.ts`
- `apps/api/src/lib/emailTemplates/adminAlert.ts`
- `apps/api/test/admin/notifications/dispatcher.test.ts`
- `apps/api/test/admin/notifications/repository.test.ts`
- `apps/api/test/admin/notifications/routes.test.ts`
- `apps/api/test/admin/notifications/cron-refund-stuck.test.ts`
- `apps/api/test/admin/notifications/rbac.test.ts`
- `apps/web/src/admin/useAdminNotifications.ts`
- `apps/web/src/admin/useAdminNotifications.test.ts`
- `apps/web/src/admin/NotificationsPage.tsx`
- `apps/web/src/admin/NotificationsPage.test.tsx`

**Modify:**

**Modify:**
- `packages/db/src/schema/notifications.ts` — add columns + index
- `packages/db/src/schema/userSettings.ts` — add `notifyAdminAlerts`
- `packages/auth/src/permissions.ts` — add 3 permission keys
- `packages/auth/src/rolePermissions.ts` — add grants
- `apps/api/src/modules/notifications/dispatcher.ts` — add `notifyAdmins`
- `apps/api/src/queue/notifications.ts` — handle `admin_alert_email` kind
- `apps/api/src/modules/admin/routes.ts` — mount sub-router
- `apps/api/src/cron/handlers.ts` — add `refund-stuck-checker`
- `apps/api/src/lib/queueInstrument.ts` — DLQ hook
- `apps/api/src/modules/payouts/admin.ts` — failure trigger
- `apps/api/src/modules/chargebacks/routes.ts` — open trigger
- `apps/api/src/modules/abuseReports/routes.ts` — fraud trigger
- `apps/api/src/modules/admin/kyc/routes.ts` — review trigger

---

## 10. Permissions summary

| Capability | Permission | Granted to |
|---|---|---|
| View `/admin/notifications` inbox + bell badge | `notification:read` | super_admin, ops, finance, support |
| Mark a single alert read | `notification:dismiss` | super_admin, ops, finance, support |
| Mark all read for role | `notification:dismiss` | super_admin, ops, finance, support |
| Broadcast to admins | `notification:write` | super_admin only |
| Receive email for critical alerts | per-user `notifyAdminAlerts` (default on) | every active admin user |
