# VYRO Admin Catalog Moderation — T2 Design

**Date:** 2026-09-06
**Status:** Approved
**Parent:** `2026-09-06-vyro-admin-core-ops-design.md` (T1)
**Predecessor:** T1 — roles + invites + audit log
**Phase:** 2 of 8 in enterprise admin roadmap

## Goal

Give the `ops` admin role a complete moderation surface for the catalogue: products, categories, business-type catalogue, and supplier-type catalogue. All writes audit-logged, permission-gated, reversible.

## Scope

### New API endpoints (all `requirePermission(...)`)

| Method | Path | Perm | Purpose |
|---|---|---|---|
| GET | `/api/admin/products` | `product:read` | List with filters (status, category, supplier, q). Cursor paginated. |
| GET | `/api/admin/products/:id` | `product:read` | Header + supplier offers + images + recent activity. |
| PATCH | `/api/admin/products/:id` | `product:moderate` | Edit name/description/category/brand/pack/active. Soft-delete via `active=0`. |
| POST | `/api/admin/products/:id/feature` | `product:moderate` | Toggle `featured=1` flag (new column). |
| GET | `/api/admin/categories` | `category:read` | Tree. |
| POST | `/api/admin/categories` | `category:write` | Create. |
| PATCH | `/api/admin/categories/:id` | `category:write` | Rename / reparent / reorder. |
| DELETE | `/api/admin/categories/:id` | `category:write` | Soft-delete (set `active=0`, refuse if children exist). |
| GET | `/api/admin/types/business` | `type:read` | List. |
| POST | `/api/admin/types/business` | `type:write` | Create. |
| PATCH | `/api/admin/types/business/:id` | `type:write` | Rename / toggle active. |
| DELETE | `/api/admin/types/business/:id` | `type:write` | Soft-delete. |
| GET | `/api/admin/types/supplier` | `type:read` | List. |
| POST | `/api/admin/types/supplier` | `type:write` | Create. |
| PATCH | `/api/admin/types/supplier/:id` | `type:write` | Rename / toggle active. |
| DELETE | `/api/admin/types/supplier/:id` | `type:write` | Soft-delete. |

All PATCH/POST/DELETE write through `auditAdmin(...)` with `action` strings: `product.update`, `product.feature`, `category.create`, `category.update`, `category.delete`, `business_type.create`, `business_type.update`, `business_type.delete`, `supplier_type.create`, `supplier_type.update`, `supplier_type.delete`.

### Schema migration (`0009_admin_catalog.sql`)

```sql
ALTER TABLE `products` ADD `featured` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `products` ADD `moderation_notes` text;--> statement-breakpoint
CREATE INDEX `products_featured_idx` ON `products` (`featured`) WHERE `featured` = 1;--> statement-breakpoint
ALTER TABLE `categories` ADD `active` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `business_types` ADD `active` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `supplier_types` ADD `active` integer NOT NULL DEFAULT 1;
```

Down migration: `0009_admin_catalog_down.sql` reverses each.

### Web layer

Files:
- Create: `apps/web/src/admin/CatalogPage.tsx` — tabbed: Products / Categories / Business Types / Supplier Types
- Create: `apps/web/src/admin/ProductDetailPage.tsx` — admin view of a product (header + offers + audit trail)
- Create: `apps/web/src/admin/{CategoryTreeEditor,BusinessTypeEditor,SupplierTypeEditor}.tsx`
- Create: `apps/web/src/admin/{useAdminProducts,useAdminCategories,useAdminTypes}.ts` — React Query hooks
- Modify: `apps/web/src/App.tsx` — add `/admin/catalog`, `/admin/catalog/products/:id`
- Modify: `apps/web/src/admin/Shell.tsx` — sidebar Catalog link gated on `product:read` or `category:read` or `type:read`

Reuse: `PageHeader`, `Surface`, `Button`, `ErrorBanner`, `Input`, `RoleBadge`, existing admin patterns.

## Data flow

- `CatalogPage`: four `<Tabs>` (URL `?tab=products|categories|business-types|supplier-types`).
- `ProductDetailPage`: `useQuery(['admin-product', id])` → GET → render + edit form. Mutations invalidate `['admin-product', id]` and `['admin-products']`.
- Category tree: nested table, drag-free reorder via `sort_order` Input. Reparent via parent select.
- Type editors: simple list with inline rename + activate toggle.

## Error handling

- 400 — validation (zod)
- 403 — missing permission (existing `requirePermission`)
- 404 — id not found
- 409 — `CATEGORY_HAS_CHILDREN` (delete attempt), `TYPE_IN_USE` (type referenced by active business/supplier), `PRODUCT_LOCKED` (active POs reference it — refuse hard-delete)

## Testing

- `apps/api/test/admin/products.test.ts` — list / detail / patch / feature, audit row written
- `apps/api/test/admin/categories.test.ts` — create / update / delete / reparent / 409 on children
- `apps/api/test/admin/types.test.ts` — both business + supplier, 409 on in-use
- `apps/web/src/admin/CatalogPage.test.ts` — tab switching, query keys
- `apps/web/src/admin/ProductDetailPage.test.ts` — edit form submit

Final: `pnpm test`, `pnpm typecheck`, `pnpm audit:rbac`, `pnpm --filter @vyro/web build`.

## Out of scope (later phases)

- Bulk actions on products (T8 UX polish)
- Image moderation / takedowns (T4 trust & safety)
- Product variants / SKU editor
- Search-as-you-type (T8)

## Constraints

- No new permission keys beyond what ops role already has
- No changes to public catalogue surface (web shop) — admin-only
- All writes audit-logged
- Soft-delete only (no DROP / DELETE)
- RBAC coverage via existing `rbac-audit` script (extend to cover new endpoints)
