# Portal Admin Full Access — Design

Date: 2026-09-09
Approach: A — Ops Command Center + deep modules (approved)
Related: `docs/superpowers/specs/2026-09-05-vyro-admin-portal-design.md`,
`2026-09-06-vyro-admin-core-ops-design.md`, `2026-09-06-vyro-admin-money-orders-design.md`

## 1. Context

Vyro monorepo: `apps/api` (Hono on Workers + D1), `apps/web` (React SPA,
admin at `/admin/*`). Existing admin already ships: Home/analytics,
suppliers, businesses, users, disputed, roles, catalog, money/payments,
trust-safety, platform (flags/templates/webhooks), security
(sessions/impersonate/export/2FA), observability (health/cron/queues),
notifications, global search, audit/activity, AI usage.

Gap (user-confirmed): order operations is the biggest blind spot. Admin
cannot today see and act on the full order lifecycle, payouts/refunds,
deliveries, and invoices/ledger from one place.

Requirements (user-confirmed):
- Powers: view & manage orders, refunds & payouts, deliveries/logistics,
  invoices & ledger (all four).
- Access model: single super-admin (`isAdmin`), full read/write, full audit.
- Visibility: both live command center AND reports/exports.

## 2. Architecture

Reuse existing `AdminShell`, `RequireAdmin`, `AdminAuthProvider`. No second
portal. No new auth tables.

New frontend routes in `apps/web/src/App.tsx` under `/admin`:
- `/admin` — upgraded `HomePage.tsx` to Command Center.
- `/admin/orders`, `/admin/orders/:id` — new `OrdersPage`, `OrderDetailPage`.
- `/admin/deliveries` — new `DeliveriesPage`.
- `/admin/finance` — new `FinancePage` with tabs (payouts, refunds,
  invoices, ledger).

New backend modules in `apps/api/src/modules/admin/`:
- `orders.ts`, `deliveries.ts`, `finance.ts`, `commandCenter.ts`,
  mounted in existing `routes.ts` as `/api/admin/orders`,
  `/api/admin/deliveries`, `/api/admin/finance`, `/api/admin/command-center`.
- Zod schemas in `packages/validation`; Drizzle reads against existing
  `purchaseOrders`, `payments`, `payouts`, `refunds`, `invoices`, `ledger`,
  `deliveries` tables. No new core tables.
- Saved views reuse existing `useSavedViews` hook pattern.

## 3. Components

Command Center (`/admin`): needs-action queue (stuck payments from
refund-stuck checker, payout failures, SLA-breached deliveries, open
disputes, pending KYC counts), existing KPI tiles (GMV, buyers, suppliers,
dispute rate), live event feed (last 50 audit + queue events, 60s
`refetchInterval`), deep links into modules.

Orders: filterable table (status, district, supplier, date range),
detail timeline (created, paid, fulfilled, delivered plus audit trail),
actions with confirm + `reason` field: status override, cancel,
assign/escalate, trigger refund. Reuses `BulkActionBar` + bulk executor.

Deliveries: board/table by status, SLA badges, proof-of-delivery viewer,
re-assign, mark lost/damaged.

Finance: payouts tab (retry/release with idempotency key), refunds tab
(issue/approve, surfaces stuck-money cron results), invoices tab
(view/void/reissue), ledger tab (immutable viewer + CSV export).

Nav: extend `Shell.tsx` with Orders, Deliveries, Finance entries; keep
Money/Payments as-is (Finance links to them).

## 4. Data flow, RBAC, audit

Reads: `api.get()` via React Query; Command Center polls 30-60s, detail
pages manual refetch. Global search extended to order ID, invoice ID,
tracking ID.

Writes: `api.post/patch` with `{ reason }` required for overrides,
refunds, releases. Backend: `RequireAdmin` → Zod → Drizzle transaction →
`admin_audit_logs` insert (`actorUserId`, `action`, `entity`, `entityId`,
`before/after`, `batchId` for bulk).

RBAC: single super-admin; `Shell.tsx` `isAdmin` gate unchanged. All admins
have full access; control is via audit, not roles. No read-only tier in
this spec.

Notifications: reuse admin alerts pipeline (payout failure, KYC review,
refund-stuck, DLQ scan already emit).

## 5. Error handling

- Idempotency keys on refund/payout retry; duplicate submit returns
  existing result.
- Optimistic-lock on status override: `expectedUpdatedAt` checked; on
  mismatch return 409 with "refresh and retry".
- Stuck-money guard: refund-stuck cron is source of truth, surfaced not
  recomputed in UI.
- All failures toast in UI and write `failed` audit entry.

## 6. Testing and reports

Reports: 7d/30d/90d range consistent with analytics; CSV export on Orders,
Ledger, Payouts reusing `/api/admin/audit/export` pattern.

Tests: vitest RBAC matrix (non-admin 403 on all new routes), bulk
executor tests for refund/retry, Playwright smoke Command Center →
Order detail → refund.

## 7. Out of scope

Tiered roles, read-only staff, CMS/support tickets, supplier-side changes.
Future specs if needed.
