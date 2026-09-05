# T7 Observability Implementation Plan

**Goal:** Add health dashboard and cron management to super_admin console.

**Architecture:** No new tables. Reuse existing cron handlers. New admin endpoints under `/api/admin/health/dashboard` and `/api/admin/cron`. New `/admin/observability` web page with 3 tabs.

**Tech Stack:** Hono, React 19 + react-query, zod, vitest.

## Global Constraints

- super_admin for `cron:trigger`. ops for `health:read`, `cron:read`.
- Manual cron trigger writes audit.

---

### Task T7.1: Permissions + role matrix

**Files:**
- Modify: `packages/auth/src/permissions.ts`
- Modify: `packages/auth/src/rolePermissions.ts`

Add: `health:read`, `cron:read`, `cron:trigger`. super_admin all; ops `health:read`+`cron:read`.

### Task T7.2: Cron registry

**Files:**
- Create: `apps/api/src/modules/admin/observability/cronRegistry.ts`

Export list of cron jobs `{ name, schedule, handler }`.

### Task T7.3: Health service

**Files:**
- Create: `apps/api/src/modules/admin/observability/healthService.ts`
- Create: `apps/api/src/modules/admin/observability/healthRoutes.ts`

Aggregates DB latency, pending webhook deliveries, failed webhook deliveries (24h), open abuse reports, pending KYC, pending refunds.

### Task T7.4: Cron routes

**Files:**
- Create: `apps/api/src/modules/admin/observability/cronRoutes.ts`

GET list, POST trigger.

### Task T7.5: Tests

**Files:**
- Create: `apps/api/test/admin/health.test.ts`
- Create: `apps/api/test/admin/cron.test.ts`

### Task T7.6: Mount routes

**Files:**
- Modify: `apps/api/src/index.ts`

### Task T7.7: Frontend hooks + page

**Files:**
- Create: `apps/web/src/admin/useAdminObservability.ts`
- Create: `apps/web/src/admin/ObservabilityPage.tsx`

### Task T7.8: Shell + routes

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`
- Modify: `apps/web/src/App.tsx`

### Task T7.9: E2E

**Files:**
- Modify: `scripts/e2e.md`

### Task T7.10: Verification

typecheck + tests + build + commit.

---
