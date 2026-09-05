# T5 Platform Config Implementation Plan

**Goal:** Add feature flags, email templates, and webhook delivery management to the super_admin console.

**Architecture:** New `webhooks` + `webhook_deliveries` tables. Refactor `platform_settings` to per-section rows with version column. New admin endpoints under `/api/admin/feature-flags`, `/api/admin/email-templates`, `/api/admin/webhooks`. New `/admin/platform` web page with 3 tabs.

**Tech Stack:** Drizzle D1, Hono, React 19 + react-query, zod, vitest.

## Global Constraints

- super_admin only via `requirePermission`.
- Optimistic concurrency on `platform_settings` writes via `expectedVersion` → 409 `STALE_WRITE`.
- All mutations audited via `auditAdmin`.
- zod `.strict()` + `exactOptionalPropertyTypes: true`.

---

### Task T5.1: Permissions + role matrix

**Files:**
- Modify: `packages/auth/src/permissions.ts`
- Modify: `packages/auth/src/rolePermissions.ts`

Add: `feature_flag:read|write`, `email_template:read|write`, `webhook:read|write|retry`.
super_admin gets all; ops/finance/support unchanged.

### Task T5.2: Schema migration 0012

**Files:**
- Create: `packages/db/migrations/0012_admin_platform_config.sql`
- Create: `packages/db/migrations/0012_admin_platform_config_down.sql`
- Create: `packages/db/src/schema/webhooks.ts`
- Create: `packages/db/src/schema/webhookDeliveries.ts`
- Modify: `packages/db/src/schema/platformSettings.ts` (refactor per-section)
- Modify: `packages/db/src/schema/index.ts`

### Task T5.3: Validation schemas

**Files:**
- Create: `packages/validation/src/adminPlatformConfig.ts`
- Modify: `packages/validation/src/index.ts`
- Create: `packages/validation/test/adminPlatformConfig.test.ts`

Schemas: `adminFeatureFlagsGet` (none), `adminFeatureFlagsUpdateBody` (json value + expectedVersion), `adminEmailTemplatesUpdateBody`, `adminWebhookCreateBody`, `adminWebhookUpdateBody`, `adminWebhookIdParam`, `adminWebhookDeliveryIdParam`.

### Task T5.4: Feature flags module

**Files:**
- Create: `apps/api/src/modules/admin/platform/featureFlagsRepository.ts`
- Create: `apps/api/src/modules/admin/platform/featureFlagsService.ts`
- Create: `apps/api/src/modules/admin/platform/featureFlagsRoutes.ts`

GET returns current JSON + version. PUT validates expectedVersion, writes new value, bumps version, audits.

### Task T5.5: Email templates module

**Files:**
- Create: `apps/api/src/modules/admin/platform/emailTemplatesRepository.ts`
- Create: `apps/api/src/modules/admin/platform/emailTemplatesService.ts`
- Create: `apps/api/src/modules/admin/platform/emailTemplatesRoutes.ts`

Same pattern as feature flags.

### Task T5.6: Webhooks module

**Files:**
- Create: `apps/api/src/modules/admin/platform/webhooksRepository.ts`
- Create: `apps/api/src/modules/admin/platform/webhooksService.ts`
- Create: `apps/api/src/modules/admin/platform/webhooksRoutes.ts`

Endpoints: list, create, update, delete (soft), list deliveries, retry delivery.

### Task T5.7: Tests

**Files:**
- Create: `apps/api/test/admin/featureFlags.test.ts`
- Create: `apps/api/test/admin/emailTemplates.test.ts`
- Create: `apps/api/test/admin/webhooks.test.ts`

Cover: read, update with version, stale write 409; webhook CRUD + delivery list + retry.

### Task T5.8: Mount routes

**Files:**
- Modify: `apps/api/src/index.ts`

Mount feature flags, email templates, webhooks routers.

### Task T5.9: Frontend hooks + page

**Files:**
- Create: `apps/web/src/admin/useAdminPlatformConfig.ts`
- Create: `apps/web/src/admin/PlatformPage.tsx`

Page: 3 tabs. JSON editors for flags/templates, table for webhooks + delivery log.

### Task T5.10: Shell + routes

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`
- Modify: `apps/web/src/App.tsx`

NavLink gated on feature_flag:read || email_template:read || webhook:read. Add `/admin/platform` route.

### Task T5.11: Fixtures + e2e

**Files:**
- Modify: `scripts/seed.ts`
- Modify: `scripts/e2e.md`

Add `webhookFixture`, `webhookDeliveryFixture`. Add e2e section 7f.

### Task T5.12: Verification

typecheck + tests + build + commit.

---
