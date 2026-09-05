# VYRO Admin Catalog Moderation (T2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship ops-role moderation surface for products, categories, and type catalogues. All writes audit-logged.

**Architecture:** New `admin/catalog` API module with 16 endpoints (4 surfaces × 4 verbs). Web tabbed `/admin/catalog` page with per-tab editors. Single DB migration adds `featured`, `moderation_notes`, `active` columns.

**Tech Stack:** Drizzle/D1, Hono, vitest, TanStack Query, React 19, zod.

## Global Constraints

- Use `requirePermission(...)` for every endpoint
- All writes call `auditAdmin({...})` with action string + before/after
- RBAC audit script (`pnpm audit:rbac`) must stay green
- Soft-delete only — never DROP or hard DELETE
- `exactOptionalPropertyTypes: true` — spread conditionally for optional fields
- No new permission keys; ops role's existing matrix covers all
- TypeScript strict, no `any` outside test mocks
- vitest module-level mocks (not drizzle chunk inspection)

---

### Task 1: Schema migration 0009

**Files:**
- Create: `packages/db/migrations/0009_admin_catalog.sql`
- Create: `packages/db/migrations/0009_admin_catalog_down.sql`
- Modify: `packages/db/src/schema/products.ts` (add `featured`, `moderationNotes`)
- Modify: `packages/db/src/schema/categories.ts` (add `active`)
- Modify: `packages/db/src/schema/businessTypes.ts` (add `active`)
- Modify: `packages/db/src/schema/supplierTypes.ts` — confirm `active` already exists, add if missing

- [ ] Add columns + index per spec
- [ ] Verify migration apply/roundtrip locally
- [ ] Commit: `feat(db): T2 catalog moderation columns`

### Task 2: Validation schemas

**Files:**
- Create: `packages/validation/src/adminCatalog.ts`
- Tests: `packages/validation/test/adminCatalog.test.ts`

Schemas:
- `adminProductListQuery` — `q?`, `categoryId?`, `supplierId?`, `active?`, `cursor?`, `limit?` (default 50)
- `adminProductPatchBody` — partial: `name`, `description`, `categoryId`, `brand`, `unit`, `packSize`, `active`, `moderationNotes`
- `adminCategoryCreateBody` — `slug`, `name`, `parentId?`, `sortOrder?`
- `adminCategoryUpdateBody` — partial of above
- `adminTypeCreateBody` — generic `{ slug, name }`
- `adminTypeUpdateBody` — `{ name?, active? }`
- All `z.string().min(1)` for ids, `z.coerce.number().int().min(0)` for sort order

- [ ] Write tests
- [ ] Run — pass
- [ ] Commit: `feat(validation): T2 catalog schemas`

### Task 3: Products repository + service

**Files:**
- Create: `apps/api/src/modules/admin/catalog/productsRepository.ts`
- Create: `apps/api/src/modules/admin/catalog/productsService.ts`
- Tests: `apps/api/test/admin/products.test.ts`

Repository: `listProducts({db, q, categoryId, supplierId, active, cursor, limit})` returning `{ items, nextCursor }`. `getProduct(db, id)` returning header + supplier offers + images + audit tail (last 20). `updateProduct(db, id, patch, expectedUpdatedAt?)` for optimistic concurrency.

Service:
- `updateProduct` — zod parse, build audit `{before, after}`, call repo, return new state. Refuses if `expectedUpdatedAt` mismatch → `409 PRODUCT_LOCKED`.

- [ ] Write tests (list, get, patch happy + 404 + audit written + optimistic concurrency)
- [ ] Run — pass
- [ ] Commit: `feat(api): T2 products repo + service`

### Task 4: Categories repository + service

**Files:**
- Create: `apps/api/src/modules/admin/catalog/categoriesRepository.ts`
- Create: `apps/api/src/modules/admin/catalog/categoriesService.ts`
- Tests: `apps/api/test/admin/categories.test.ts`

Repository: `listCategoriesTree(db)`, `createCategory`, `updateCategory`, `softDeleteCategory` (set `active=0`).

Service:
- `softDeleteCategory` — refuse if any child `active=1` → `409 CATEGORY_HAS_CHILDREN`.
- `updateCategory` — allow reparent; if new parent is a descendant of the moved category → `400 CATEGORY_CYCLE`.

- [ ] Write tests (CRUD + tree cycle guard + children guard)
- [ ] Run — pass
- [ ] Commit: `feat(api): T2 categories repo + service`

### Task 5: Types repository + service (business + supplier)

**Files:**
- Create: `apps/api/src/modules/admin/catalog/typesRepository.ts`
- Create: `apps/api/src/modules/admin/catalog/typesService.ts`
- Tests: `apps/api/test/admin/types.test.ts`

Repository: `listBusinessTypes`, `listSupplierTypes`, `createBusinessType`, `updateBusinessType`, `softDeleteBusinessType`, parallel for supplier.

Service:
- `softDeleteBusinessType` — refuse if any business with `business_type_id = id` AND `status='active'` exists → `409 TYPE_IN_USE`.
- Same for supplier type.

- [ ] Write tests
- [ ] Run — pass
- [ ] Commit: `feat(api): T2 types repo + service`

### Task 6: Catalog routes mount

**Files:**
- Create: `apps/api/src/modules/admin/catalog/routes.ts`
- Modify: `apps/api/src/modules/admin/routes.ts` (mount `catalog` under existing admin prefix)
- Tests: `apps/api/test/admin/catalogRoutes.test.ts`

16 endpoints wired through `requirePermission(...)`. All mutating routes call service which calls `auditAdmin`. Use Hono sub-app pattern.

- [ ] Write tests (perm-gate per endpoint)
- [ ] Run — pass
- [ ] Commit: `feat(api): T2 catalog routes`

### Task 7: RBAC audit script extension

**Files:**
- Modify: `apps/api/src/scripts/rbac-audit.ts`
- Tests: `apps/api/test/scripts/rbac-audit.test.ts`

Add the 16 catalog routes to the audit registry with expected permission. Asserts no `requireRole({admin: true})` is left on these routes.

- [ ] Extend
- [ ] Run `pnpm audit:rbac` — pass
- [ ] Commit: `chore(api): T2 rbac audit registry`

### Task 8: Frontend hooks

**Files:**
- Create: `apps/web/src/admin/useAdminProducts.ts`
- Create: `apps/web/src/admin/useAdminCategories.ts`
- Create: `apps/web/src/admin/useAdminTypes.ts`
- Tests: `apps/web/src/admin/useAdminCatalog.test.ts`

Hooks: `useAdminProducts(filters)` cursor-paginated; `useAdminProduct(id)` detail; `useUpdateProduct` mutation; `useAdminCategories()` tree; `useAdminBusinessTypes()`, `useAdminSupplierTypes()`.

- [ ] Write tests (query keys + mutation invalidation)
- [ ] Run — pass
- [ ] Commit: `feat(web): T2 catalog hooks`

### Task 9: CatalogPage

**Files:**
- Create: `apps/web/src/admin/CatalogPage.tsx`
- Tests: `apps/web/src/admin/CatalogPage.test.ts`

4 tabs via URL search param `?tab=`. Each tab lazy-loads its table. Top of page: `PageHeader` + filter bar.

- [ ] Write tests
- [ ] Run — pass
- [ ] Commit: `feat(web): T2 CatalogPage`

### Task 10: CategoryTreeEditor

**Files:**
- Create: `apps/web/src/admin/CategoryTreeEditor.tsx`

Renders nested table from tree. Inline rename, parent select dropdown, sort order input, soft-delete with confirm. On 409 → ErrorBanner with "Has children — cannot delete".

- [ ] Commit: `feat(web): T2 CategoryTreeEditor`

### Task 11: BusinessTypeEditor + SupplierTypeEditor

**Files:**
- Create: `apps/web/src/admin/BusinessTypeEditor.tsx`
- Create: `apps/web/src/admin/SupplierTypeEditor.tsx`

Two list pages with create form + inline toggle active + soft-delete. Mirror each other.

- [ ] Commit: `feat(web): T2 type editors`

### Task 12: ProductDetailPage

**Files:**
- Create: `apps/web/src/admin/ProductDetailPage.tsx`
- Tests: `apps/web/src/admin/ProductDetailPage.test.ts`

Detail view: header card + offers table + audit tail. Edit form opens in same page, `PATCH` mutation. Featured toggle button.

- [ ] Write tests
- [ ] Run — pass
- [ ] Commit: `feat(web): T2 ProductDetailPage`

### Task 13: Shell + routes

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx` — Catalog NavLink gated on any of `product:read`/`category:read`/`type:read`
- Modify: `apps/web/src/App.tsx` — add `/admin/catalog` and `/admin/catalog/products/:id`

- [ ] Add routes
- [ ] Commit: `feat(web): T2 catalog routes`

### Task 14: Fixtures + e2e

**Files:**
- Modify: `scripts/seed.ts` — add `categoryFixture`, `businessTypeFixture`, `supplierTypeFixture`, `featuredProductFixture`
- Modify: `scripts/e2e.md` — T2 section: product edit, category tree cycle, type in-use guard, featured toggle

- [ ] Commit: `chore(scripts): T2 fixtures + e2e walkthrough`

### Task 15: Final verification

- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — all green
- [ ] `pnpm audit:rbac` — pass
- [ ] `pnpm --filter @vyro/web build` (via vite direct since `tsc -b` has pre-existing D1 issue)
- [ ] Commit fixups if any

### Task 16: Wrap

- [ ] Mark all sub-tasks done
- [ ] Hand off to T3 (Money/orders)

---

## Verification matrix

| Surface | Endpoint count | Tests | Audit coverage |
|---|---|---|---|
| Products | 4 | 8 | ✓ |
| Categories | 4 | 6 | ✓ |
| Business types | 4 | 4 | ✓ |
| Supplier types | 4 | 4 | ✓ |
| Routes | — | 8 | n/a |
| RBAC | — | 1 | n/a |
| Web | — | 6 | n/a |
