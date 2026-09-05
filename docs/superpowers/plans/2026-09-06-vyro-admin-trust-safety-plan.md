# T4 Trust & Safety Implementation Plan

**Goal:** Add abuse report queue, KYC review, and user suspension tooling for `support` admin role.

**Architecture:** Three new tables (`abuse_reports`, `kyc_reviews`). New admin endpoints under `/api/admin/abuse-reports` and `/api/admin/kyc`. Upgrade existing user suspend route with `requirePermission`. New `/admin/trust-safety` web page with 3 tabs. All mutations audited.

**Tech Stack:** Drizzle D1, Hono, React 19 + react-query, zod, vitest.

## Global Constraints

- Existing role/permission matrix in `packages/auth/src/rolePermissions.ts` — extend, don't replace.
- `auditAdmin({ctx, action, target, before?, after?})` for every mutation.
- zod `.strict()` + `exactOptionalPropertyTypes: true` — use conditional spread.
- API uses `requirePermission` (not `requireRole({admin:true})`) for new endpoints.
- Web uses `usePermission()` hook + `PageHeader title sub` pattern.

---

### Task T4.1: Extend permissions + role matrix

**Files:**
- Modify: `packages/auth/src/permissions.ts`
- Modify: `packages/auth/src/rolePermissions.ts`
- Modify: `apps/api/src/lib/errors.ts` (add `ABUSE_REPORT_NOT_OPEN`, `KYC_NOT_PENDING`)

Add: `abuse_report:read`, `abuse_report:resolve`, `kyc:read`, `kyc:review`, `takedown:write`.
Roles: super_admin gets all; ops gets all; support gets all; finance unchanged.

### Task T4.2: Schema migration 0011

**Files:**
- Create: `packages/db/migrations/0011_admin_trust_safety.sql`
- Create: `packages/db/migrations/0011_admin_trust_safety_down.sql`
- Create: `packages/db/src/schema/abuseReports.ts`
- Create: `packages/db/src/schema/kycReviews.ts`
- Modify: `packages/db/src/schema/index.ts`

SQL per design spec. Indexes on status, target_type+target_id, user_id.

### Task T4.3: Validation schemas

**Files:**
- Create: `packages/validation/src/adminTrustSafety.ts`
- Modify: `packages/validation/src/index.ts`
- Create: `packages/validation/test/adminTrustSafety.test.ts`

Schemas: `adminAbuseReportsListQuery`, `adminAbuseReportIdParam`, `adminAbuseReportNoteBody`, `adminAbuseReportResolveBody`, `adminKycListQuery`, `adminKycIdParam`, `adminKycDecisionBody`, `adminKycCreateBody`.

### Task T4.4: Abuse reports module

**Files:**
- Create: `apps/api/src/modules/admin/trustSafety/abuseReportsRepository.ts`
- Create: `apps/api/src/modules/admin/trustSafety/abuseReportsService.ts`
- Create: `apps/api/src/modules/admin/trustSafety/abuseReportsRoutes.ts`

Endpoints: `GET /`, `GET /:id`, `POST /:id/claim`, `POST /:id/notes`, `POST /:id/resolve`, `POST /:id/takedown`.
Service handles status transitions and audit.

### Task T4.5: KYC module

**Files:**
- Create: `apps/api/src/modules/admin/trustSafety/kycRepository.ts`
- Create: `apps/api/src/modules/admin/trustSafety/kycService.ts`
- Create: `apps/api/src/modules/admin/trustSafety/kycRoutes.ts`

Endpoints: `GET /`, `GET /:id`, `POST /`, `POST /:id/decision`.

### Task T4.6: Upgrade user suspend route

**Files:**
- Modify: `apps/api/src/modules/admin/users.ts`

Switch `requireRole({admin:true})` → `requirePermission('user:suspend')` / `user:unsuspend`. Add `auditAdmin` calls.

### Task T4.7: Tests

**Files:**
- Create: `apps/api/test/admin/abuseReports.test.ts`
- Create: `apps/api/test/admin/kyc.test.ts`
- Create: `apps/api/test/admin/userSuspend.test.ts`

Cover: list, claim, resolve, takedown; KYC decision flow; suspend/unsuspend audit + role matrix.

### Task T4.8: Mount routes

**Files:**
- Modify: `apps/api/src/index.ts`

Mount `adminAbuseReportsRouter` and `adminKycRouter` at `/api/admin`.

### Task T4.9: Frontend hooks + page

**Files:**
- Create: `apps/web/src/admin/useAdminTrustSafety.ts`
- Create: `apps/web/src/admin/TrustSafetyPage.tsx`

Hooks: useAbuseReports, useClaimReport, useNoteReport, useResolveReport, useTakedown, useKycList, useKycDecision, useSuspendUser, useUnsuspendUser.
Page: 3 tabs (Reports, KYC, Users).

### Task T4.10: Shell + routes

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`
- Modify: `apps/web/src/App.tsx`

Add NavLink gated on abuse_report:read || kyc:read || user:suspend. Add `/admin/trust-safety` route.

### Task T4.11: Fixtures + e2e

**Files:**
- Modify: `scripts/seed.ts`
- Modify: `scripts/e2e.md`

Add `abuseReportFixture`, `kycReviewFixture`. Add section 7e to e2e.

### Task T4.12: Verification

**Files:**
- Run: `pnpm --filter @vyro/api exec tsc --noEmit`
- Run: `pnpm --filter @vyro/api exec vitest run`
- Run: `pnpm --filter @vyro/web exec vitest run`
- Run: `pnpm exec vite build`
- Commit

---
