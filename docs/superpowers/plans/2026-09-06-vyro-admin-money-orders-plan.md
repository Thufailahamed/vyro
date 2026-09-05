# VYRO Admin Money/Orders (T3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.

**Goal:** Finance-role money surface: refunds queue, payouts batches, ledger summary, invoice overrides, chargebacks.

**Architecture:** New `admin/money` module. Schema adds `payout_batches` + `chargebacks` tables + `payouts.batch_id` column. Permission gates existing refund/payout endpoints. Web `/admin/money` tabbed page.

**Tech Stack:** Drizzle/D1, Hono, vitest, TanStack Query, React 19, zod.

---

### Task 1: Schema migration 0010

**Files:**
- Create: `packages/db/migrations/0010_admin_money.sql`
- Create: `packages/db/migrations/0010_admin_money_down.sql`
- Modify: `packages/db/src/schema/payouts.ts` (add `batchId`)
- Create: `packages/db/src/schema/payoutBatches.ts`
- Create: `packages/db/src/schema/chargebacks.ts`
- Modify: `packages/db/src/schema/index.ts` (export new tables)

- [ ] Add columns + tables per spec
- [ ] Apply migration locally; verify roundtrip
- [ ] Commit: `feat(db): T3 money columns + payout_batches + chargebacks`

### Task 2: Validation schemas

**Files:**
- Create: `packages/validation/src/adminMoney.ts`
- Tests: `packages/validation/test/adminMoney.test.ts`

Schemas: `adminRefundApproveBody`, `adminRefundRejectBody`, `adminPayoutBatchCreateBody`, `adminPayoutApproveBody`, `adminInvoiceOverrideBody`, `adminChargebackResolveBody`, list queries with cursor.

- [ ] Tests
- [ ] Run — pass
- [ ] Commit: `feat(validation): T3 money schemas`

### Task 3: Errors extensions

**Files:**
- Modify: `apps/api/src/lib/errors.ts` (add REFUND_NOT_PENDING, PAYOUT_NOT_PENDING, BATCH_ALREADY_APPROVED, CHARGEBACK_RESOLVED)

- [ ] Commit: `chore(api): T3 money error codes`

### Task 4: Refunds module

**Files:**
- Create: `apps/api/src/modules/admin/money/refundsRepository.ts`
- Create: `apps/api/src/modules/admin/money/refundsService.ts`
- Create: `apps/api/src/modules/admin/money/refundsRoutes.ts`
- Modify: `apps/api/src/index.ts` (mount)
- Tests: `apps/api/test/admin/refunds.test.ts`

- [ ] Tests (queue list, approve, reject, 409 on wrong status, audit)
- [ ] Run — pass
- [ ] Commit: `feat(api): T3 refunds queue`

### Task 5: Payouts batches

**Files:**
- Create: `apps/api/src/modules/admin/money/payoutBatchesRepository.ts`
- Create: `apps/api/src/modules/admin/money/payoutBatchesService.ts`
- Create: `apps/api/src/modules/admin/money/payoutBatchesRoutes.ts`
- Modify: `apps/api/src/index.ts`
- Tests: `apps/api/test/admin/payouts.test.ts`

- [ ] Tests (batch create from balances, approve, 409, audit)
- [ ] Run — pass
- [ ] Commit: `feat(api): T3 payout batches`

### Task 6: Ledger + invoice + chargebacks

**Files:**
- Create: `apps/api/src/modules/admin/money/ledgerService.ts` + `ledgerRoutes.ts`
- Create: `apps/api/src/modules/admin/money/invoiceOverridesService.ts` + `invoiceOverridesRoutes.ts`
- Create: `apps/api/src/modules/admin/money/chargebacksService.ts` + `chargebacksRoutes.ts`
- Modify: `apps/api/src/index.ts`
- Tests: `apps/api/test/admin/ledger.test.ts`, `invoiceOverrides.test.ts`, `chargebacks.test.ts`

- [ ] Tests
- [ ] Run — pass
- [ ] Commit: `feat(api): T3 ledger/invoice/chargebacks`

### Task 7: Gate existing endpoints

**Files:**
- Modify: `apps/api/src/modules/refunds/routes.ts` (replace `session()` with `requirePermission('payment:refund')`)
- Modify: `apps/api/src/modules/payouts/admin.ts` (gate with perm checks)

- [ ] Adjust tests if needed
- [ ] Run rbac-audit + all tests
- [ ] Commit: `feat(api): T3 gate refund/payout endpoints with permissions`

### Task 8: Frontend hooks

**Files:**
- Create: `apps/web/src/admin/useAdminMoney.ts` — refund queue, payout queue, ledger, invoice, chargeback hooks

- [ ] Commit: `feat(web): T3 money hooks`

### Task 9: MoneyPage + tabs

**Files:**
- Create: `apps/web/src/admin/MoneyPage.tsx` + 5 tab components

- [ ] Commit: `feat(web): T3 MoneyPage`

### Task 10: Shell + routes + e2e + verification

- [ ] Routes wired, Shell NavLink gated
- [ ] Fixtures + e2e.md T3 section
- [ ] typecheck / tests / rbac-audit / vite build
- [ ] Final commit: `feat(admin): T3 money/orders — finance role surface complete`
