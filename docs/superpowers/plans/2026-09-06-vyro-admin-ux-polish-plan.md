# T8 Admin UX Polish Implementation Plan

**Goal:** Cross-role UX polish — global search, audit export scheduling, saved views, keyboard shortcuts.

**Architecture:** No new top-level routes besides `/api/admin/search` and audit-export schedule CRUD. Saved views in localStorage. Keyboard shortcuts via top-level keymap.

**Tech Stack:** Hono, React 19 + react-query, zod, vitest.

## Global Constraints

- Permissions reused from T1-T7; no new permission keys.
- Saved views = localStorage.
- Audit export delivery = stub cron.

---

### Task T8.1: Global search backend

**Files:**
- Create: `apps/api/src/modules/admin/search/searchRepository.ts`
- Create: `apps/api/src/modules/admin/search/searchService.ts`
- Create: `apps/api/src/modules/admin/search/searchRoutes.ts`
- Modify: `apps/api/src/index.ts`

`GET /api/admin/search?q=<term>&limit=8`. Returns grouped results filtered by role.

### Task T8.2: Global search frontend

**Files:**
- Create: `apps/web/src/admin/useGlobalSearch.ts`
- Create: `apps/web/src/admin/GlobalSearchBar.tsx`
- Modify: `apps/web/src/admin/Shell.tsx`

Top-bar search with debounce + dropdown.

### Task T8.3: Audit export schedules schema

**Files:**
- Create: `packages/db/migrations/0014_audit_export_schedules.sql`
- Create: `packages/db/src/schema/auditExportSchedules.ts`

Table + drizzle schema.

### Task T8.4: Audit export schedule backend

**Files:**
- Create: `apps/api/src/modules/admin/audit/exportSchedulesRepository.ts`
- Create: `apps/api/src/modules/admin/audit/exportSchedulesService.ts`
- Create: `apps/api/src/modules/admin/audit/exportSchedulesRoutes.ts`
- Modify: `apps/api/src/index.ts`

CRUD: POST list, POST cancel. Audit `audit_export.create`, `audit_export.cancel`.

### Task T8.5: Add audit-export cron stub

**Files:**
- Modify: `apps/api/src/modules/admin/observability/cronRegistry.ts`

Add `audit-export-runner` entry (no-op handler).

### Task T8.6: Saved views lib

**Files:**
- Create: `apps/web/src/admin/lib/savedViews.ts`

CRUD over localStorage. Schema: `{id, name, filters, createdAt}`.

### Task T8.7: Saved views UI hooks

**Files:**
- Create: `apps/web/src/admin/useSavedViews.ts`

React hook wrapping savedViews lib with state.

### Task T8.8: Saved views chips component

**Files:**
- Create: `apps/web/src/admin/components/SavedViewsBar.tsx`

Render chips above tables.

### Task T8.9: Keyboard shortcuts hook

**Files:**
- Create: `apps/web/src/admin/useKeyboardShortcuts.ts`

Mount chord listener + help overlay.

### Task T8.10: Wire shortcuts into Shell

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`

Mount `useKeyboardShortcuts`; `Cmd+K` focuses GlobalSearchBar via ref or event.

### Task T8.11: Tests

**Files:**
- Create: `apps/api/test/admin/search.test.ts`
- Create: `apps/api/test/admin/auditExportSchedules.test.ts`
- Create: `apps/web/src/admin/lib/savedViews.test.ts`

### Task T8.12: E2E

**Files:**
- Modify: `scripts/e2e.md`

Section 7i: global search, audit export scheduling.

### Task T8.13: Verification

typecheck + tests + commit.
