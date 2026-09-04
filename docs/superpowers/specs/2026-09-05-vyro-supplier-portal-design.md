# VYRO Supplier Portal — Design

**Date:** 2026-09-05
**Sub-project:** B (out of A/B/C/D)
**Goal:** Ship 11 supplier-facing pages backed by real APIs (4 new) inside `apps/web/src/pages/supplier/`, gated by a `SupplierShell` that mirrors `admin/Shell.tsx`.
**Parent design:** `docs/superpowers/specs/2026-09-04-vyro-redesign-design.md` (esp. §5.2 + §6.2).
**Foundations (sub-project A) shipped:** `2026-09-05-vyro-foundations-design.md` — user/supplier/platform settings, analytics cache, supplier analytics route, admin analytics route, catalogue endpoints, admin users endpoints.

---

## Architecture

- **Route group:** `/supplier/*` under `apps/web/src/App.tsx`, nested under a new `SupplierShell` layout.
- **Shell:** `apps/web/src/supplier/Shell.tsx` reads `AuthProvider` session. Resolves `currentSupplierId` from `supplierMemberships[0]?.supplierId`. If none → render `<NoSupplierMembership />` CTA pointing to `/onboarding/supplier`.
- **Layout:** left nav with 11 entries, top header with supplier name + (if multi-supplier) inline `<select>` switcher that updates `currentSupplierId`.
- **State:** No new providers. Reuse `AuthProvider` (already includes `supplierMemberships`). Page-local react-query per page (`queryKey: ['supplier', supplierId, ...]`).
- **Real-time:** No websocket. Dashboard + orders inbox poll with `refetchInterval: 30_000`. Cost: 1 stale read per page-load-type. Acceptable per spec §6.

## Routes

| Route | Page | API |
|---|---|---|
| `/supplier` | redirect → `/supplier/dashboard` | — |
| `/supplier/dashboard` | `DashboardPage` | `GET /api/analytics/supplier` + `GET /api/purchase-orders?supplierId=` |
| `/supplier/products` | `ProductsPage` | `GET /api/supplier-products/by-supplier/:supplierId` |
| `/supplier/products/new` | `ProductFormPage` (mode=create) | `POST /api/supplier-products` |
| `/supplier/products/:id/edit` | `ProductFormPage` (mode=edit) | `GET /api/supplier-products/:id` + `PATCH` |
| `/supplier/pricing` | `PricingPage` | bulk `PATCH /api/supplier-products/:id` per row |
| `/supplier/inventory` | `InventoryPage` | `GET /api/supplier-products/by-supplier/:supplierId` |
| `/supplier/analytics` | `AnalyticsPage` | `GET /api/analytics/supplier?range=` |
| `/supplier/customers` | `CustomersPage` | `GET /api/suppliers/:id/customers` (NEW) |
| `/supplier/deliveries` | `DeliveriesPage` | `GET /api/deliveries?supplierId=&status=` (NEW) |
| `/supplier/payments` | `PaymentsPage` | `GET /api/payments?supplierId=&status=` (NEW) |
| `/supplier/settings` | `SettingsPage` | `GET/PATCH /api/suppliers/:id/settings` |

## New API endpoints (4)

| Method + Path | Module | Notes |
|---|---|---|
| `GET /api/suppliers/:id/customers` | new `apps/api/src/modules/suppliers/customers.ts` | Distinct businesses with ≥1 PO from this supplier. Membership guard (owner/manager/sales); 404 not 403 on miss. Returns `{ items: { businessId, name, totalOrders, totalCents, lastOrderAt }[] }`. |
| `GET /api/deliveries?supplierId=&status=&cursor=` | new `apps/api/src/modules/deliveries/list.ts` | Joins `purchase_orders` for filter. Owner/manager/sales. Pagination 50/page. |
| `GET /api/payments?supplierId=&status=&cursor=` | new `apps/api/src/modules/payments/list.ts` | Same pattern. |
| `GET /api/purchase-orders/:id/events` | new `apps/api/src/modules/purchaseOrders/events.ts` | Timeline of `order_events` rows. |

**Migration:** confirm `order_events` exists in `packages/db/src/schema/`. If missing, add it; spec §14 deferred (carry forward) — assume exists based on `freshDb.ts:9`.

**Conventions:** every new endpoint uses `requireRole` (or supplier-role guard), session middleware, returns `{ items, nextCursor? }` for lists, write `audit_logs` for mutations, push through `errorEnvelope`.

## Page contract (per page)

1. Resolve `supplierId` from shell context (no local fetch if not present).
2. Skeleton during initial load.
3. EmptyState with primary CTA when no data.
4. ErrorBanner with retry on query error.
5. Mutations: `queryClient.invalidateQueries(['supplier', supplierId, ...])`.

## Component reuse

From `@vyro/ui`: `Button, Card, SectionCard, Field, Input, Select, Switch, Dialog, Drawer, Tabs, Badge, Chip, EmptyState, PageHeader, PageSection, Skeleton, Spinner, ErrorBanner, MetricStack, StatTile, StatusBadge, StatusDots, TimeSeries, BarChart, Sparkline, ProgressRing`.

From `apps/web/src/components/ui.tsx`: any app-only wrappers layered on the primitives.

## Data fetching

- Library: `@tanstack/react-query` v5. Conventions already established in `apps/web/src/pages/SupplierOrdersPage.tsx:1-22`.
- API client: `apps/web/src/lib/api.ts` (`credentials: 'include'` by default).
- Mutations done with `api.post/patch/del` directly + `queryClient.refetchQueries(...)` (no `useMutation` wrapper).

## Settings (page 11)

Mirrors `apps/api/src/modules/settings/supplier.ts` schema. Single `<form>` divided into:

- **Company** — companyName, registrationNo, taxId, contactEmail, contactPhone.
- **Warehouse** — warehouseAddress, warehouseCity, warehouseDistrict, warehouseLat, warehouseLng.
- **Operations** — defaultLeadTimeDays.
- **Payout** — payoutMethod (`bank | cash`), bankName, bankAccountNo, bankBranch.
- **Notifications** — notifyNewOrders, notifyLowStock, notifyPaymentReceived (Switch toggles).

Save → PATCH; show inline `<SuccessBanner />` 2s.

## Error handling

- 401 → `<Navigate to="/login?redirect=/supplier/dashboard" />` (auth-aware).
- 403 (admin removed user) → toast + redirect to `/onboarding/supplier`.
- 5xx / network → `<ErrorBanner onRetry={refetch} />`.

## Testing

- Vitest unit tests for the 4 new API endpoints (mock pattern from foundations plan).
- Smoke: `pnpm dev`, log in, walk `/supplier/dashboard → ... → /supplier/settings`, screenshot every page.
- No per-page component tests (visual + smoke).

## Out of scope

- Multi-supplier switcher detail UI beyond a top selector.
- Bulk CSV import for products/pricing.
- Websocket / SSE for real-time PO events (use 30s polling instead).
- Component-level a11y audit (defer to later sub-project).
- Receipts, invoices, refund UI — handle as part of admin portal (sub-project C) or a future spec.

---

## Open assumptions carried forward

- `order_events` already exists in DB; if not, add a single drizzle migration before T-task for the events endpoint.
- `purchase_orders` already has `supplierId` column (verified earlier in design A).
