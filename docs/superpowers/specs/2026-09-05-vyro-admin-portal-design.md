# VYRO Admin Portal — Sub-project C Design

**Date:** 2026-09-05
**Status:** Approved
**Parent:** `2026-09-04-vyro-mvp-design.md`
**Predecessor:** `2026-09-05-vyro-supplier-portal-design.md` (sub-project B)

## Goal

Complete the platform admin portal: ship 3 drill-down/moderation pages plus polish the 6 existing pages to match the design system tokens established in sub-project B.

## Scope

9 admin pages under `/admin/*` with `AdminShell`:

| # | Route | Page | Status |
|---|---|---|---|
| 1 | `/admin/login` | `LoginPage` | polish |
| 2 | `/admin` | Dashboard (`AdminHomePage`) | polish |
| 3 | `/admin/suppliers` | `SuppliersPage` | polish |
| 4 | `/admin/suppliers/:id` | `SupplierDetailPage` | **new** |
| 5 | `/admin/businesses` | `BusinessesPage` | polish |
| 6 | `/admin/businesses/:id` | `BusinessDetailPage` | **new** |
| 7 | `/admin/users` | `UsersPage` | **new** |
| 8 | `/admin/disputed` | `DisputedPage` | polish |
| 9 | `/admin/audit` | `AuditPage` | polish |

## New API endpoints

3 endpoints in `apps/api/src/modules/admin/routes.ts`, all gated by `requireRole({ admin: true })`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/suppliers/:id` | Supplier header + members + offer count + active PO count |
| GET | `/api/admin/businesses/:id` | Business header + members + order count + 20 most recent orders |
| POST | `/api/admin/suppliers/:id/unfreeze` | Pair of existing `/freeze`; sets `status = 'active'` |

Both GET endpoints compose from existing tables (no new schema). Freeze/unfreeze write to `audit_logs`.

## Web layer

Files:
- Create: `apps/web/src/admin/SupplierDetailPage.tsx`
- Create: `apps/web/src/admin/BusinessDetailPage.tsx`
- Create: `apps/web/src/admin/UsersPage.tsx`
- Modify: `apps/web/src/App.tsx` (3 new routes nested under `<AdminShell>`)
- Polish (visual only): `HomePage.tsx`, `LoginPage.tsx`, `Lists.tsx`, `DisputedAndAudit.tsx`

Reuse: `PageHeader`, `StatusDots`, `Surface`, `Badge`, `Button`, `MetricNumber`, `FlowLine` (all already shipped in B + polish sweeps).

Polish criteria:
- `PageHeader` present on every page
- `StatusDots` for PO/status display
- `slate-*` → `ink-*` if any leaked
- `font-bold` → `font-semibold`
- Consistent nav highlight (already done)

## Data flow

- `SupplierDetailPage`: React Query `['admin-supplier', id]` → GET → render header + members + offers table + freeze/unfreeze button
- `BusinessDetailPage`: React Query `['admin-business', id]` → GET → render header + members + recent orders table
- `UsersPage`: React Query `['admin-users']` → GET → render table with suspend/unsuspend
- Mutations invalidate list + detail queries

## Error handling

- 404 → inline "not found" with back link
- 403 → existing `RequireAdmin` guard
- Network errors → toast via existing `useToast`

## Testing

Per-endpoint unit tests in `apps/api/test/admin/` using the `vi.hoisted` + path.resolve pattern:

- `supplierDetail.test.ts` — 404 on miss, 200 with full payload on hit
- `businessDetail.test.ts` — 404 on miss, 200 with full payload on hit
- `freezeUnfreeze.test.ts` — 404 on miss, 200 + audit entry on success

Final verification: `pnpm exec vitest run` (existing suite must stay green), `pnpm typecheck`, `pnpm --filter @vyro/web build`.

## Out of scope

- Pagination on offers/orders lists inside detail pages (cap at 20 most recent)
- Global search across suppliers/businesses/users
- Bulk actions (multi-select)
- New audit log filtering controls

## Constraints

- No mocks — real endpoints
- No new endpoint beyond the 3 listed
- No new schema
- No tests for the 3 new web pages (visual + smoke only, per sub-project B convention)
