# VYRO Feature Gaps — Production Completeness

**Date:** 2026-09-05
**Status:** Approved design, pending implementation
**Scope:** Close all 33 identified feature gaps across business, supplier, and admin portals so the platform can credibly claim feature completeness on go-live.

## 1. Background

VYRO has been built phase-by-phase through sub-projects A→D (MVP, redesign, foundations, supplier portal, admin portal, profile settings). Each phase shipped clean tests and merged to `main`. A consolidated audit of the three portals surfaced 33 gaps: 8 blockers (false "all features" claims), 17 majors (broken UX), and 8 minors (polish). This spec closes them in 10 ordered phases.

## 2. Goals

- Remove every blocker: no portal surface advertises behavior it cannot deliver.
- Bring every unused backend endpoint behind live UI, or document why it remains internal.
- Reach a state where `pnpm typecheck && pnpm test` is green and `scripts/e2e.md` walks the entire user journey without manual workarounds.
- Establish the component/test patterns that the next (B-track) hardening phases will inherit.

## 3. Non-goals

- Cross-cutting hardening (security audit, observability, perf, compliance, ops). Those are deferred to subsequent sub-projects B1–B5.
- New product capabilities beyond closing existing gaps (e.g. real-time chat, real payments gateway, native mobile).
- Brand or marketing-copy revisions outside of pages touched by gaps.

## 4. Gap inventory

Severity legend: **B**locker · **M**ajor · **m**inor.

### 4.1 Business portal (15)
| # | sev | page | gap |
|---|---|---|---|
| B1 | B | HomePage | Entire landing is hardcoded mock arrays (products, suppliers, districts, trust stats, FAQ, journey) |
| B2 | B | DashboardPage | Monthly TimeSeries chart seeded with `mulberry32` fake values; `ActionRow` defined but unrendered |
| B3 | B | SupplierOrdersPage | Reject button POSTs `transition('rejected')` — `rejected` not in `OrderStatus` enum → 400 |
| B4 | B | SupplierOnboardingPage | `/suppliers/types` reuses business types table — supplier categories misrepresent data |
| B5 | M | OrderDetailPage | `NEXT_OPTIONS_BY_ROLE` omits `preparing` and `in_transit`; panel hidden mid-flow; default value hardcoded `completed` |
| B6 | M | OrdersPage | Status filter uses lowercase ids, API enum is uppercase — filter does nothing; no supplier column |
| B7 | M | CartPage | `supplierCount` shown twice in metric stack; no quantity-edit; no `minOrderQty` enforcement |
| B8 | M | SignupPage | No phone field despite backend schema expecting one |
| B9 | M | SearchPage | Input updates URL `q` per keystroke → refetch storm |
| B10 | M | SecurityForm | 2FA toggle admits "Enrollment coming soon" — persists flag with no enrollment flow |
| B11 | m | ProfileForm | Avatar is a raw URL text field, no upload |
| B12 | m | LoginPage | No forgot-password link; no 2FA challenge slot |
| B13 | m | ProductDetailPage | Unsafe `availabilityStatus → OrderStatus` cast; unused `ProductPlaceholder` import |
| B14 | m | NotificationsForm | Hint text claims messages from suppliers/admins; no chat module exists |
| B15 | m | BusinessOnboardingPage | Sri Lankan districts hardcoded inline |

### 4.2 Supplier portal (12)
| # | sev | page | gap |
|---|---|---|---|
| S1 | B | SettingsPage | Read-only `<dl>`; `PATCH /suppliers/:id/settings` exists but unused |
| S2 | B | Shell + DashboardPage | "Open orders" tile + dashboard link route to `/supplier/orders` mounted under `<Layout>`, not `SupplierShell` |
| S3 | B | PricingPage | Volume breaks + customer-specific rate negotiation explicitly stubbed "coming soon" |
| S4 | M | DeliveriesPage | Read-only list; transition API exists, no UI triggers |
| S5 | M | PaymentsPage | Read-only list; confirm API exists, no UI trigger |
| S6 | M | AnalyticsPage | Recomputes client-side; bypasses cached `/api/analytics/supplier`; bucket mislabeled |
| S7 | M | InventoryPage | Only 3-state enum, no numeric stock tracking |
| S8 | m | CustomersPage | No pagination; no per-customer detail |
| S9 | m | ProductsPage | Catalog fetch forces `limit=500`; `window.confirm` for delete |
| S10 | m | ProductFormPage | No readonly indicator in edit mode |
| S11 | m | useSupplierId | Role union omits `sales` despite DB allowing it |
| S12 | m | DashboardPage | `FlowLine` states hardcoded "done" |

### 4.3 Admin portal (8)
| # | sev | page | gap |
|---|---|---|---|
| A1 | B | DisputedPage | No accept/reject/resolve buttons; no `resolve` API; row links dead |
| A2 | B | BusinessDetailPage | "Suspend (coming soon)" permanently disabled; no freeze API for businesses |
| A3 | M | AuditPage | `limit=200` hardcoded; no server filters; "Inspect →" dead URL; metadata hidden |
| A4 | M | HomePage | Tile counts use `array.length`, not platform totals; ignores `/api/analytics/admin` |
| A5 | M | UsersPage | Search no-debounce; ignores `nextCursor` → pagination broken |
| A6 | M | Lists (Suppliers/Businesses) | Client-side filter only; no server paging; no status filter |
| A7 | M | Shell | `RequireAdmin` renders "Forbidden" div, doesn't redirect |
| A8 | m | SupplierDetailPage | `activePoCount` includes cancelled POs |

## 5. Architecture

### 5.1 Constraints
- No new packages. All work stays in `apps/web/` and `apps/api/`.
- Use existing `Surface`, `PageHeader`, `Button`, `Input`, `Label`, `StatusDots` from `@vyro/ui`.
- Use existing `errorEnvelope` + `ApiError` — do not introduce alternative error shapes.
- Each migration is a numbered file under `packages/db/migrations/`. No schema drift.

### 5.2 Shared patterns

**API handler shape**
```ts
router.post('/path',
  requireRole(['admin']),
  zValidator('json', schema),
  async (c) => {
    const body = c.req.valid('json');
    const result = await repository.doThing(c.get('user'), body);
    if (!result.ok) throw new HttpError(result.code, result.message, 409);
    return c.json(result.value);
  }
);
```

**Web mutation shape**
```ts
const mutation = useMutation({
  mutationFn: (input) => api.post('/path', input),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['key'] }),
  onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
});
```

**Reusable admin table hook**
```ts
const { rows, loading, hasMore, loadMore, setFilter } = useAdminTable({
  endpoint: '/admin/suppliers',
  queryKey: ['admin-suppliers'],
  initialFilter: { status: 'active' },
});
```

### 5.3 Data flow (representative: P1 dispute resolution)

```
business POST /deliveries/:poId/transitions { to: 'disputed' }
  → notifications.insert(buyerId, 'dispute.opened', poId)
  → audit_log('po.dispute.opened', actorId, poId)

admin POST /admin/disputes/:poId/resolve { outcome: 'refund' | 'release' }
  → PO status → 'cancelled' (refund) or back to 'delivered' (release)
  → notifications.insert(counterpartyId, 'dispute.resolved', poId)
  → audit_log('dispute.resolved', adminId, poId, { outcome })
```

### 5.4 Error handling

- zod parse failure → 400 `code: 'invalid_body'`.
- Role/scope failure → 403 `code: 'forbidden'`.
- State-machine preconditions → 409 `code: 'invalid_transition'` with current + attempted status.
- All errors carry stable `code` for client `switch`.
- Mutations are non-optimistic: invalidate query on success.

## 6. Phases

Each phase ships one concern, ends at green `pnpm typecheck && pnpm test`, and lands as a branch off `main` (`feat/gap-p<N>-<slug>`).

### Phase 1 — Disputes end-to-end
- **API.** New module `apps/api/src/modules/admin/disputes.ts`. `POST /admin/disputes/:poId/resolve` accepts `{ outcome: 'refund_business' | 'release_supplier', note }`. Updates PO, writes notification to counterparty, writes audit log.
- **Web.** `<DisputeResolutionPanel>` mounted on `<DisputedPage>` rows. Open detail shows counterparty, evidence (PO timeline + notes), accept/reject actions.
- **Tests.** API: admin can resolve, non-admin cannot, idempotency, double-resolve returns 409. Web: smoke walkthrough in `scripts/e2e.md`.
- **Closes.** A1.

### Phase 2 — Suspend / unsuspend business
- **API.** `POST /admin/businesses/:id/freeze`, `:id/unfreeze`. Mirror supplier flow (audit log + status flag).
- **Web.** Replace disabled stub with `<BusinessSuspendButton>`. Toast on success.
- **Tests.** API: tenant isolation, audit row written, role check.
- **Closes.** A2.

### Phase 3 — Supplier mutations wired to UI
- **3a Settings.** `<SupplierSettingsForm>` calls existing `PATCH /suppliers/:id/settings`. Form fields: name, description, address.
- **3b Deliveries.** `<DeliveryTransitionButtons>` on each row, gated by current state. Calls `POST /deliveries/:poId/transitions`.
- **3c Payments.** `<PaymentConfirmButton>` on each pending row. Calls `POST /payments/:id/confirm`.
- **Tests.** Each: happy path + invalid transition.
- **Closes.** S1, S4, S5.

### Phase 4 — Buyer dashboard honest data
- **API.** `GET /analytics/business/monthly-spend?months=12` returns real PO aggregates (denominator excludes cancelled).
- **Web.** Replace `buildMockSpend` with the new query. Render `<ActionRow>` (defined but unused). Fix `supplierCount` double-count in cart.
- **Tests.** API: aggregate correctness on seeded data.
- **Closes.** B2.

### Phase 5 — Home page live data
- **API.** `GET /home/feed` returns `{ featuredProducts, verifiedSuppliers, trustStats, journeySteps, faq }`. `trustStats` derived from `/analytics/admin`.
- **Web.** Replace hardcoded arrays in `HomePage.tsx`. Sections consume typed payload.
- **Tests.** API: returns 200 with sane defaults when DB sparse.
- **Closes.** B1.

### Phase 6 — Supplier analytics uses cached endpoint
- **Web.** Swap `AnalyticsPage` data source to `/api/analytics/supplier`. Fix bucket labeling.
- **Tests.** Visual regression via E2E walkthrough.
- **Closes.** S6.

### Phase 7 — Order lifecycle UI fixes
- **Web.** Extend `NEXT_OPTIONS_BY_ROLE` to include `preparing` and `in_transit`. Fix `OrderDetailPage` default value derivation. Fix `SupplierOrdersPage` reject to use `cancelled` (admin can re-open) or new `declined` transition if/when added — coordinate with API.
- **Tests.** API: `transition` accepts and rejects the right enums.
- **Closes.** B5, B6, B3.

### Phase 8 — Admin UX
- **8a Lists.** Server-side filter + pagination + status filter on SuppliersPage, BusinessesPage, UsersPage. Cursor handling. Debounced search.
- **8b Audit.** Filters (action, resourceType, actorUserId, date range). Pagination. Dead "Inspect →" becomes a modal that renders metadata JSON.
- **8c Home.** Tile counts pull from `/api/analytics/admin` (already exists).
- **8d Shell.** `RequireAdmin` `<Navigate to="/admin/login" replace />` instead of inline Forbidden.
- **Tests.** API: filter/pagination contracts.
- **Closes.** A3, A4, A5, A6, A7.

### Phase 9 — Auth + profile completeness
- **9a Signup phone.** Add phone field to `SignupPage`. Pass through to backend schema.
- **9b Forgot password.** better-auth password-reset plugin (verify availability first). `/forgot` and `/reset?token=` pages.
- **9c Real 2FA.** better-auth two-factor plugin (verify). QR enrollment + verify step on `/profile/security`. LoginPage challenge slot.
- **9d Avatar upload.** `POST /settings/me/avatar` accepts multipart, stores in R2 bucket (reuse product image binding), returns URL.
- **Tests.** Per sub-phase: round-trip auth flow.
- **Closes.** B8, B10, B11, B12.

### Phase 10 — Polish sweep
- Search debounce; cart qty-edit + MOQ enforce; supplier column on orders list; useSupplierId role union includes `sales`; supplierOrders chrome routing; type catalog separation; StatusDots safety cast; unused imports; hardcoded districts move to constants; window.confirm → styled modal; Inventory quantity; Audit actor email resolution; Notifications "messages" hint removed.
- **Tests.** Regression: full E2E walkthrough passes.
- **Closes.** S2, S3 (PricingPage ship volume tiers as separate phase if backend not present), S7, S8, S9, S10, S11, S12, B4, B7, B9, B13, B14, B15, A8.

> Pricing volume-tier feature (S3) requires backend work that may not exist. If backend missing, treat S3 as a separate sub-project and skip in P10.

## 7. Testing strategy

- **API.** vitest under `@cloudflare/vitest-pool-workers` against D1 stub (existing pattern). Cover happy path, auth, tenant isolation, invalid transition per new endpoint.
- **Web.** Component tests only when logic is non-trivial (e.g., `useAdminTable`). Most validation via E2E walkthrough.
- **E2E.** `scripts/e2e.md` extended at each phase boundary. Final acceptance: full walkthrough with no manual workarounds.
- **Gate.** `pnpm typecheck && pnpm test` green before any phase is merged.

## 8. Risks & mitigations

| risk | mitigation |
|---|---|
| D1 migrations drift | Each migration numbered and committed in same phase as the code that uses it. |
| Worker bundle bloat | No heavyweight deps; avatar upload reuses R2 binding already in place. |
| better-auth plugin mismatch | Verify `passwordReset` and `twoFactor` plugins exist in installed version before depending. |
| Cached analytics staleness | Surface `?fresh=true` opt-in or cache-bust on query version bump. |
| Phase ordering sensitivity | Each phase ends with green tests; later phases never break earlier ones. |

## 9. Acceptance criteria

1. `pnpm typecheck` is clean.
2. `pnpm test` is green across all apps.
3. `scripts/e2e.md` walks the full buyer + supplier + admin journey without manual workarounds.
4. No portal surface advertises a feature it cannot deliver.
5. Every unused backend endpoint listed in audits is either wired to UI or documented as internal-only in a code comment.
6. Each of the 33 gaps has a closing commit or an explicit deferral note.

## 10. Out of scope (deferred to subsequent sub-projects)

- B1 Security hardening (secrets, rate limit, CSRF, RBAC audit)
- B2 Observability (logs, metrics, errors, alerts)
- B3 Performance (bundle, DB indexes, caching, CDN)
- B4 Compliance (terms, privacy, cookies, data export)
- B5 Ops (CI/CD, runbook, env config, backups)
