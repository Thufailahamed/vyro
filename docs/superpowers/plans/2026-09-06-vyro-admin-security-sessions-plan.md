# T6 Security & Sessions Implementation Plan

**Goal:** Add admin session management, 2FA enforcement, user impersonation, and GDPR data export to super_admin console.

**Architecture:** Two new tables (`admin_impersonations`, `data_export_requests`). Extend `users` with `require_2fa` and `sessions` with revoke columns. New admin endpoints under `/api/admin/sessions`, `/api/admin/impersonate`, `/api/admin/data-export`, `/api/admin/users/:id/2fa`. New `/admin/security` web page with 4 tabs.

**Tech Stack:** Drizzle D1, Hono, React 19 + react-query, zod, vitest.

## Global Constraints

- super_admin only via `requirePermission`.
- Impersonation must be auditable with reason.
- GDPR export is async (status transitions pending → ready).

---

### Task T6.1: Permissions + role matrix

**Files:**
- Modify: `packages/auth/src/permissions.ts`
- Modify: `packages/auth/src/rolePermissions.ts`

Add: `session:revoke`, `impersonation:start`, `impersonation:end`, `data_export:run`, `2fa:enforce`.

### Task T6.2: Schema migration 0013

**Files:**
- Create: `packages/db/migrations/0013_admin_security.sql`
- Create: `packages/db/migrations/0013_admin_security_down.sql`
- Create: `packages/db/src/schema/adminImpersonations.ts`
- Create: `packages/db/src/schema/dataExportRequests.ts`
- Modify: `packages/db/src/schema/users.ts` (add require_2fa)
- Modify: `packages/db/src/schema/sessions.ts` (add revoke columns)
- Modify: `packages/db/src/schema/index.ts`

### Task T6.3: Validation schemas

**Files:**
- Create: `packages/validation/src/adminSecurity.ts`
- Modify: `packages/validation/src/index.ts`
- Create: `packages/validation/test/adminSecurity.test.ts`

### Task T6.4: Sessions module

**Files:**
- Create: `apps/api/src/modules/admin/security/sessionsRepository.ts`
- Create: `apps/api/src/modules/admin/security/sessionsService.ts`
- Create: `apps/api/src/modules/admin/security/sessionsRoutes.ts`

Endpoints: GET /, POST /:id/revoke.

### Task T6.5: Impersonation module

**Files:**
- Create: `apps/api/src/modules/admin/security/impersonationRepository.ts`
- Create: `apps/api/src/modules/admin/security/impersonationService.ts`
- Create: `apps/api/src/modules/admin/security/impersonationRoutes.ts`

Endpoints: POST /, POST /end, GET /.

### Task T6.6: Data export module

**Files:**
- Create: `apps/api/src/modules/admin/security/dataExportRepository.ts`
- Create: `apps/api/src/modules/admin/security/dataExportService.ts`
- Create: `apps/api/src/modules/admin/security/dataExportRoutes.ts`

Endpoints: POST /, GET /:id.

### Task T6.7: 2FA enforcement

**Files:**
- Modify: `apps/api/src/modules/admin/users.ts` (add 2fa enforce/unenforce routes)
- Modify: `apps/api/src/modules/admin/usersRepository.ts` (add setRequire2fa)

### Task T6.8: Tests

**Files:**
- Create: `apps/api/test/admin/sessions.test.ts`
- Create: `apps/api/test/admin/impersonation.test.ts`
- Create: `apps/api/test/admin/dataExport.test.ts`

### Task T6.9: Mount routes

**Files:**
- Modify: `apps/api/src/index.ts`

### Task T6.10: Frontend hooks + page

**Files:**
- Create: `apps/web/src/admin/useAdminSecurity.ts`
- Create: `apps/web/src/admin/SecurityPage.tsx`

### Task T6.11: Shell + routes

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`
- Modify: `apps/web/src/App.tsx`

### Task T6.12: Fixtures + e2e

**Files:**
- Modify: `scripts/seed.ts`
- Modify: `scripts/e2e.md`

### Task T6.13: Verification

typecheck + tests + build + commit.

---
