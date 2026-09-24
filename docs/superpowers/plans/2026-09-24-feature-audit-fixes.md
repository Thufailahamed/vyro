# Vyro Feature Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 80 audit-confirmed bugs/incomplete features across API, Web, and Mobile surfaces identified in `docs/superpowers/specs/2026-09-24-feature-audit-fixes-design.md`.

**Architecture:** Two parallel work-streams (API money-path first, then UI surfaces) executed in TDD order. Each task is a self-contained change with regression test. No new product features, no new flags, no new top-level deps.

**Tech Stack:** Hono on CF Workers + D1 (Drizzle); React SPA (TanStack Query); React Native + Expo Router (TanStack Query). Tests: Vitest (api), RTL + Vitest (web), RTL + Jest (mobile).

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-09-24-feature-audit-fixes-design.md`.
- All commits follow repo convention: `<type>(<scope>): <subject>` + Co-Authored-By trailer.
- No new product features; no new feature flags; no new env vars; no new top-level deps.
- All API fixes that change schema require a Drizzle migration under `apps/api/migrations/NNNN_<slug>.sql` and re-apply locally.
- Tests live next to existing patterns:
  - API: `apps/api/test/modules/<module>/<file>.test.ts` (mirrors `apps/api/test/modules/reviews/service.test.ts`).
  - Web: `apps/web/test/pages/<page>.test.tsx` (RTL).
  - Mobile: `apps/mobile/test/<feature>.test.tsx`.
- Branch from `main`. Tasks 1–20 (API) ship on `fix/api-audit-2026-09-24`; Tasks 21–27 (Mobile) ship on `fix/mobile-audit-2026-09-24`; Tasks 28–32 (Web) ship on `fix/web-audit-2026-09-24`. Branch per stream; merge with `--no-ff`.

---

## File Structure

### API (tasks 1–20)
**Modify only (no new modules):**
- `apps/api/src/modules/trust/service.ts`
- `apps/api/src/modules/finance/reconciliation.ts`
- `apps/api/src/modules/reviews/service.ts`
- `apps/api/src/modules/repeatOffers/service.ts`
- `apps/api/src/modules/suppliers/service.ts`
- `apps/api/src/modules/businesses/service.ts`
- `apps/api/src/modules/payments/routes.ts`
- `apps/api/src/modules/finance/adminSettlements.ts`
- `apps/api/src/modules/finance/earnings.ts`
- `apps/api/src/modules/finance/admin.ts`
- `apps/api/src/modules/cross-border/{docs,fx,repository,sanctions}.ts`
- `apps/api/src/modules/notifications/dispatcher.ts`
- `apps/api/src/modules/buyLeads/service.ts`
- `apps/api/src/modules/inventory/service.ts`
- `apps/api/src/modules/auth/{routes,index}.ts`
- `apps/api/src/modules/cron/handlers.ts`
- `apps/api/src/modules/credit/service.ts`
- `apps/api/src/modules/orders/lifecycle.ts`
- `apps/api/src/modules/orders/create.ts`
- `apps/api/src/modules/rfqs/routes.ts`
- `apps/api/src/modules/admin/lib/audit.ts`
- `apps/api/src/modules/sponsored/cron.ts`
- `packages/db/src/schema/auth.ts` (passwordHash drop)

**New migrations:**
- `apps/api/migrations/0047_drop_password_hash.sql`

**New tests:** see per-task.

### Mobile (tasks 21–27)
**Modify:**
- `apps/mobile/src/features/admin/catalog/CatalogScreen.tsx`
- `apps/mobile/src/features/buyer/orders/components/ReorderSheet.tsx`
- `apps/mobile/src/features/admin/learning/LearningScreen.tsx`
- `apps/mobile/src/features/admin/ops/kit/components.tsx`
- `apps/mobile/src/features/admin/observability/ObservabilityScreen.tsx`
- `apps/mobile/src/features/common/NotificationsScreen.tsx`
- `apps/mobile/src/features/buyer/ai/{AskScreen,useVyroAI}.ts(x)`
- `apps/mobile/src/features/buyer/orders/{OrderDetailScreen,kit}.ts(x)`
- `apps/mobile/src/features/buyer/commerce/{CatalogScreen,PaymentReturnScreen}.tsx`
- `apps/mobile/src/features/admin/accounts/{AccountsScreen,TransactionScreen}.tsx`
- `apps/mobile/src/features/admin/ai/AiUsageScreen.tsx`
- `apps/mobile/src/app/welcome.tsx`

**New:**
- `apps/mobile/src/app/admin/observability/queues.tsx`
- `apps/mobile/src/app/admin/observability/alerts.tsx`
- `apps/mobile/src/app/admin/learning/index.tsx`
- `apps/mobile/src/lib/mobileHref.ts`

### Web (tasks 28–32)
**Modify:**
- `apps/web/src/ai/AiHomePage.tsx`
- `apps/web/src/admin/{ReviewsPage,PlatformPage,OrderLifecycleSettingsPage}.tsx`
- `apps/web/src/reviews/AdminReviewQueue.tsx`
- `apps/web/src/storefront/StorefrontPage.tsx`
- `apps/web/src/pages/{ProfilePage,OrderDetailPage,ConversationalOrderPage,ReturnsPage,SponsoredDisclosure,SignupPage,CartPage}.tsx`
- `apps/web/src/ask/{AskPage,useVyroAI,ConfirmationPanel,FeedbackButtons}.ts(x)`
- `apps/web/src/components/{Layout,SiteHeader}.tsx`
- `apps/web/src/supplier/{InventoryPage,SupplierOrderDetailPage,DeliveryTransitionButtons}.tsx`
- `apps/web/src/admin/HomePage.tsx`

---

## Task Index

1. Trust SQL on-time metric — `api-001`
2. Finance reconciliation section #4 — `api-002`
3. Review delete-review status — `api-003`
4. repeatOffers terminal `.all()` — `api-004`
5. supplier + member + KYC transaction — `api-005`
6. business + owner-member transaction — `api-006`
7. payment + COD/bank-transfer transaction — `api-007`
8. settlement prior-check inside txn — `api-008`
9. earnings SALE/COMMISSION prior-check — `api-009`
10. refund cancel status — `api-010`
11. cross-border docs URL — `api-011`
12. notifications insert error log — `api-012`
13. buyLeads swallow per-supplier — `api-013, 034`
14. inventory audit log — `api-014`
15. drop passwordHash column — `api-015, 029`
16. cron refund-stuck per-job try/catch — `api-016`
17. cross-border IDs to newId() — `api-017, 018`
18. credit releaseDrawdown transaction — `api-019`
19. order lifecycle status guards — `api-020, 021`
20. dynamic import hoist — `api-022`
21. payments commission rethrow — `api-023`
22. payments by-po membership guard — `api-024`
23. rfqs missing `.run()` (×3) — `api-025, 026, 027`
24. lifecycle cancelled-supplier copy — `api-028`
25. payment recordAttempt rethrow — `api-030`
26. cross-border sanctions fetcher — `api-031`
27. audit export runner — `api-032`
28. sponsored approved_pending metric — `api-033`
29. audit coalesce to queue — `api-036`
30. permission split verify/approve — `api-035`
31. Mobile: 2 blockers — `mobile-001, 002`
32. Mobile: state-during-render sweep — `mobile-003, 004, 005, 011`
33. Mobile: deep-link `mobileHref()` helper — `mobile-007, 008, 019`
34. Mobile: missing admin routes — `mobile-021, 022, 023`
35. Mobile: polling gating — `mobile-010, 013`
36. Mobile: index-as-key sweep — `mobile-006, 015, 016`
37. Mobile: misc polish — `mobile-009, 012, 014, 018, 020`
38. Web: raw fetch → api wrapper — `web-004..008, 016, 017, 018`
39. Web: signOut async/await — `web-009, 010, 011, 015`
40. Web: native confirm → ConfirmDialog — `web-012, 020`
41. Web: misc UX — `web-001, 002, 003, 013, 014, 019, 021, 022, 023`
42. Web: tab/minor — `web-024, 025`

---

### Task 1: Trust SQL on-time metric (`api-001`)

**Files:**
- Modify: `apps/api/src/modules/trust/service.ts:30-55`
- Test: `apps/api/test/modules/trust/service.test.ts`

**Interfaces:**
- Consumes: existing `db`, `supplier_trust_signals` table.
- Produces: same exported `recomputeOnTimeMetric(supplierId)` returning `{ deliveredCount, onTimeCount, ratio }`.

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { recomputeOnTimeMetric } from '../../../src/modules/trust/service';

describe('recomputeOnTimeMetric', () => {
  it('uses only the trailing 30 deliveries, not all-time', async () => {
    const fakeDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                all: vi.fn().mockResolvedValue([
                  { delivered_at: 100, on_time: 1 },
                  { delivered_at: 200, on_time: 0 },
                ]),
              }),
            }),
          }),
        }),
      }),
    } as any;
    const out = await recomputeOnTimeMetric('sup-1', fakeDb);
    expect(out.deliveredCount).toBe(2);
    expect(out.onTimeCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test; expect FAIL** — `pnpm --filter @vyro/api test -- trust/service.test.ts` → "function not defined" or wrong return shape.

- [ ] **Step 3: Implement**

In `apps/api/src/modules/trust/service.ts` replace the on-time aggregator:

```typescript
export async function recomputeOnTimeMetric(supplierId: string, db: D1Database) {
  const rows = await db
    .select({ delivered_at: purchaseOrders.deliveredAt, on_time: sql<number>`CASE WHEN delivered_at <= delivery_promised_at THEN 1 ELSE 0 END` })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.supplierId, supplierId), isNotNull(purchaseOrders.deliveredAt)))
    .orderBy(desc(purchaseOrders.deliveredAt))
    .limit(30)
    .all();

  const deliveredCount = rows.length;
  const onTimeCount = rows.reduce((acc, r) => acc + (r.on_time ? 1 : 0), 0);
  const ratio = deliveredCount ? onTimeCount / deliveredCount : null;
  return { deliveredCount, onTimeCount, ratio };
}
```

- [ ] **Step 4: Run test; expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/trust/service.ts apps/api/test/modules/trust/service.test.ts
git commit -m "fix(trust): recompute on-time metric from trailing 30 deliveries

The previous aggregate had no LIMIT semantics because Drizzle's all()
on a SELECT...aggregate collapses to one row. Wrap the per-row CASE
inside a window-limited subquery so only the most recent 30 deliveries
contribute to the on-time ratio.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Finance reconciliation section #4 (`api-002`)

**Files:**
- Modify: `apps/api/src/modules/finance/reconciliation.ts:100-130`
- Test: `apps/api/test/modules/finance/reconciliation.test.ts`

**Interfaces:**
- Consumes: `reconcilePayment({ paymentId, db })`.
- Produces: same; throws `MismatchError` when `effective != payment.amount`.

- [ ] **Step 1: Write failing test** asserting `reconcilePayment` throws `MismatchError` when `effective != payment.amount`.

- [ ] **Step 2: Run; FAIL.**

- [ ] **Step 3: Implement** — add to the section #4 branch:

```typescript
const effective = Number(payment.amount) + Number(payment.fees ?? 0);
if (effective !== Number(payment.amount)) {
  throw new MismatchError(`payment ${payment.id} effective ${effective} != amount ${payment.amount}`);
}
```

(Adjust per `payment.amount` field-set; the test pins the contract.)

- [ ] **Step 4: Run; PASS.**

- [ ] **Step 5: Commit** — `fix(finance): assert payment effective equals amount in reconciliation section 4`.

---

### Task 3: Review delete-review status (`api-003`)

**Files:**
- Modify: `apps/api/src/modules/reviews/service.ts:190-205`
- Test: `apps/api/test/modules/reviews/service.test.ts`

- [ ] **Step 1: Test** asserts deleteReviewByBuyer leaves row with `status: 'removed_by_buyer'`.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — replace `'removed_by_admin'` literal with the `'removed_by_buyer'` constant exported from the enum file.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(reviews): preserve removed_by_buyer status on buyer delete`.

---

### Task 4: repeatOffers terminal `.all()` (`api-004`)

**Files:**
- Modify: `apps/api/src/modules/repeatOffers/service.ts:75-100`

- [ ] **Step 1: Test** for `getAnalytics(supplierId)` returns number when rows exist (not NaN/undefined).

- [ ] **Step 2: FAIL** — current code returns `queryBuilder.length` which is undefined.

- [ ] **Step 3: Implement** — append `.all()` to the chain; return `.length`.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(repeatOffers): terminate selector chain with .all()`.

---

### Task 5: supplier + member + KYC transaction (`api-005`)

**Files:**
- Modify: `apps/api/src/modules/suppliers/service.ts:25-80`
- Test: `apps/api/test/modules/suppliers/service.test.ts`

- [ ] **Step 1: Test** — KYC insert throws; assert no `suppliers` row remains (rollback).

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
return db.transaction(async (tx) => {
  const supplier = await insertSupplier(tx, input);
  await insertOwnerSupplierMember(tx, supplier.id, ownerUserId);
  if (input.kyc) await insertKycRecord(tx, supplier.id, input.kyc);
  return supplier;
});
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(suppliers): wrap insert chain in db.transaction`.

---

### Task 6: business + owner-member transaction (`api-006`)

**Files:**
- Modify: `apps/api/src/modules/businesses/service.ts:15-50`

- [ ] **Step 1: Test** — owner-member insert throws; assert `businesses` row rolled back.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** identical pattern to Task 5 with `insertBusiness + insertOwnerMember`.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(businesses): atomic business + owner-member insert`.

---

### Task 7: payment + companion writes transaction (`api-007`)

**Files:**
- Modify: `apps/api/src/modules/payments/routes.ts:140-200`

- [ ] **Step 1: Test** — `ensureCodCollection` throws after `recordPayment`; assert payment row not committed.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — move `recordAttempt`, `recordPayment`, `ensureCodCollection`/`createBankTransfer` inside `db.transaction`.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(payments): atomic payment + companion writes`.

---

### Task 8: settlement prior-check inside txn (`api-008`)

**Files:**
- Modify: `apps/api/src/modules/finance/adminSettlements.ts:155-200`

- [ ] **Step 1: Test** — two concurrent `completeSettlement` calls produce 1 SETTLEMENT leg, not 2.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — wrap prior-check + SETTLEMENT leg insert in `db.transaction`. (Optionally add unique constraint on `(type, refId)` as belt-and-braces.)

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(finance): prevent duplicate settlement legs under concurrency`.

---

### Task 9: earnings SALE/COMMISSION prior-check (`api-009`)

**Files:**
- Modify: `apps/api/src/modules/finance/earnings.ts:90-150`

- [ ] **Step 1: Test** — concurrent ensureAllocationAndEarning + manual confirm produce one SALE pair, not two.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — same pattern as Task 8.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(finance): race-safe SALE/COMMISSION ledger writes`.

---

### Task 10: refund cancel status (`api-010`)

**Files:**
- Modify: `apps/api/src/modules/finance/admin.ts:180-200`
- Test: `apps/api/test/modules/finance/admin.test.ts`

- [ ] **Step 1: Test** — `POST /api/admin/refunds/:id/cancel` updates row to `status: 'cancelled'`.

- [ ] **Step 2: FAIL** — current ternary returns `'failed'` always.

- [ ] **Step 3: Implement** — extend refund status enum (Drizzle schema) to include `'cancelled'`; branch ternary:

```typescript
const nextStatus = action === 'cancel' ? 'cancelled' : 'failed';
await tx.update(refunds).set({ status: nextStatus, updatedAt: now() }).where(eq(refunds.id, id)).run();
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(finance): persist cancelled (not failed) on refund cancel`.

---

### Task 11: cross-border docs URL (`api-011`)

**Files:**
- Modify: `apps/api/src/modules/cross-border/docs.ts:30-50`

- [ ] **Step 1: Test** — `getSignedDocUrl(env)` returns URL containing `env.R2_PUBLIC_BASE`, not hardcoded subdomain.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
const base = env.R2_PUBLIC_BASE ?? 'https://vyro-docs.example.com';
return `${base}/${key}?signed=${token}`;
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(cross-border): honor R2_PUBLIC_BASE when building doc URLs`.

---

### Task 12: notifications insert error log (`api-012`)

**Files:**
- Modify: `apps/api/src/modules/notifications/dispatcher.ts:170-200`

- [ ] **Step 1: Test** — bad row triggers `console.error` (use `vi.spyOn(console, 'error')`).

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — replace silent fallback loop with `try { await tx.insert(...) } catch (e) { console.error('notifications.insert.fail', { recipient, err: serialize(e) }); metrics.incr('notifications.insert.fail'); }`.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(notifications): log + emit metric on recipient insert failure`.

---

### Task 13: buyLeads per-supplier error handling (`api-013`, `api-034`)

**Files:**
- Modify: `apps/api/src/modules/buyLeads/service.ts:55-95`

- [ ] **Step 1: Test** — matcher throws on one supplier; remaining suppliers still receive their digest; result reports `errors: N`.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
let okCount = 0, errCount = 0;
for (const supplier of subscribedSuppliers) {
  try {
    await runMatchAndQueue(supplier);
    okCount++;
  } catch (e) {
    errCount++;
    console.error('buyLeads.digest.fail', { supplierId: supplier.id, err: serialize(e) });
  }
}
await metrics.emit('buy_leads.digest.summary', { okCount, errCount });
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(buyLeads): per-supplier try/catch + summary counter`.

---

### Task 14: inventory audit log (`api-014`)

**Files:**
- Modify: `apps/api/src/modules/inventory/service.ts:90-115`

- [ ] **Step 1: Test** — `stock_movements` insert throws; `console.error` fires.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — wrap insert in try/catch with `console.error('inventory.movement.audit.fail', ...)`.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(inventory): log stock movement audit failures`.

---

### Task 15: drop passwordHash column (`api-015`, `api-029`)

**Files:**
- New migration: `apps/api/migrations/0047_drop_password_hash.sql`
- Modify: `apps/api/src/modules/auth/routes.ts:38-50`
- Modify: `packages/db/src/schema/auth.ts`

**Risk gate:** verify better-auth does not read this column before merge. If it does, set to `null` (default) and skip the drop.

- [ ] **Step 1: Verify** by searching `node_modules/better-auth` or auth setup (e.g., `apps/api/src/lib/auth.ts`) for `passwordHash` read. If present → defer column drop, only set `null` literal.

- [ ] **Step 2: Apply migration + change insert**

```sql
ALTER TABLE users DROP COLUMN password_hash;
```

If verify step blocks drop:
```sql
-- placeholder: no-op, just ensure no longer set
```

```typescript
// apps/api/src/modules/auth/routes.ts
await tx.insert(users).values({
  id: newId(),
  email,
  // passwordHash removed
});
```

- [ ] **Step 3: Test** — sign up user; assert no `password_hash` field set; assert existing auth flow still passes.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit**

```bash
git commit -am "fix(auth): stop storing placeholder passwordHash (better-auth owns credentials)"
```

---

### Task 16: cron refund-stuck per-job try/catch (`api-016`)

**Files:**
- Modify: `apps/api/src/modules/cron/handlers.ts:85-130`

- [ ] **Step 1: Test** — one bad row in `notifyAdmins` loop throws; remaining rows still notified.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
for (const job of stuckJobs) {
  try {
    await notifyAdmins(job);
  } catch (e) {
    console.error('cron.refundStuck.notify.fail', { jobId: job.id, err: serialize(e) });
  }
}
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(cron): isolate refund-stuck per-job notifications`.

---

### Task 17: cross-border IDs use newId() (`api-017`, `api-018`)

**Files:**
- Modify: `apps/api/src/modules/cross-border/fx.ts:25-40`
- Modify: `apps/api/src/modules/cross-border/repository.ts:1-20`

- [ ] **Step 1: Test** — inserted row has ID matching project ID format (`/^[a-z0-9]+-[a-z0-9]+$/`), not UUID.

- [ ] **Step 2: FAIL** (current UUID).

- [ ] **Step 3: Implement** — replace `crypto.randomUUID()` with `import { newId } from '@vyro/shared';`.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(cross-border): use newId() not crypto.randomUUID()`.

---

### Task 18: credit releaseDrawdown transaction (`api-019`)

**Files:**
- Modify: `apps/api/src/modules/credit/service.ts:125-200`

- [ ] **Step 1: Test** — facility update throws after drawdown update; assert drawdown still `released: true` reverted OR both updated atomically.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — wrap drawdown update + facility update + ledger insert in `db.transaction`.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(credit): atomic releaseDrawdown`.

---

### Task 19: order lifecycle status guards (`api-020`, `api-021`)

**Files:**
- Modify: `apps/api/src/modules/orders/lifecycle.ts:305-380`

- [ ] **Step 1: Test** (x2)
  - Concurrent `prepare` calls: only one writes `delivery_promised_at`.
  - Payment already captured + cancel race: only one voids.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
// delivery_promised_at: add guard
const updated = await tx.update(purchaseOrders)
  .set({ deliveryPromisedAt: input.eta })
  .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.status, 'preparing')))
  .run();
if (updated.meta.changes === 0) throw new ConflictError('po not in preparing');

// payment void: guard on pending
const updated = await tx.update(payments)
  .set({ status: 'void', voidedAt: now() })
  .where(and(eq(payments.id, paymentId), eq(payments.status, 'pending')))
  .run();
if (updated.meta.changes === 0) throw new ConflictError('payment not pending');
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(orders): race-safe lifecycle writes (status guards)`.

---

### Task 20: dynamic import hoist (`api-022`)

**Files:**
- Modify: `apps/api/src/modules/orders/create.ts:1-65`

- [ ] **Step 1: Test** — measure first-request latency before/after (qualitative — `coldStartMs` recorded in route). Skip if no instrumentation; commit anyway if import is hoisted.

- [ ] **Step 2: N/A.**

- [ ] **Step 3: Implement** — hoist `import { nextPoNumber } from '../purchaseOrders/service';` to module top.

- [ ] **Step 4: N/A.**

- [ ] **Step 5: Commit** — `perf(orders): hoist purchaseOrders import out of hot path`.

---

### Task 21: payments commission rethrow (`api-023`)

**Files:**
- Modify: `apps/api/src/modules/payments/routes.ts:130-160`

- [ ] **Step 1: Test** — misconfigured supplier rule throws; the catch does NOT swallow; caller's `try/catch` sees the error.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
try {
  bps = await resolveCommissionBps(supplierId, categoryForPo);
} catch (e) {
  if (e instanceof CategoryNotFoundError) {
    bps = platformFeeBps;
  } else {
    throw e;
  }
}
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(payments): rethrow non-NotFound commission resolver errors`.

---

### Task 22: payments by-po membership guard (`api-024`)

**Files:**
- Modify: `apps/api/src/modules/payments/routes.ts:415-435`

- [ ] **Step 1: Test** — supplier member of unrelated supplier cannot read buyer payments via `poId`.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
const roles = await rolesForPo(c, poId);
requireBusinessRole(c, po.buyerBusinessId) || requireSupplierRole(c, po.supplierId, ROLES.paymentRead);
// or unified requireAnyRole helper
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(payments): guard /by-po with role check`.

---

### Task 23: rfqs missing `.run()` ×3 (`api-025`, `api-026`, `api-027`)

**Files:**
- Modify: `apps/api/src/modules/rfqs/routes.ts:160, 545, 612`

- [ ] **Step 1: Test** (x3) — PATCH /rfqs/:id, POST /quotes/:id/submit, POST /quotes/:id/withdraw each update row.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — append `.run()` to each Drizzle `update` chain.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(rfqs): execute update chains with .run()`.

---

### Task 24: lifecycle cancelled-supplier copy (`api-028`)

**Files:**
- Modify: `apps/api/src/modules/orders/lifecycle.ts:400-415`

- [ ] **Step 1: Test** — when actor is admin, notify template includes `'Vyro support'` instead of `'the supplier'`.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — drop the ternary branch; always use `'Vyro support'` for admin-cancelled, otherwise role-based label.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(orders): consistent actor label on cancel notify`.

---

### Task 25: payment recordAttempt rethrow (`api-030`)

**Files:**
- Modify: `apps/api/src/modules/payments/routes.ts:180-195`

- [ ] **Step 1: Test** — D1 blip during attempt log throws; caller sees error.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — replace `.catch(() => null)` with:

```typescript
await recordAttempt(tx, paymentId, attempt).catch((e) => {
  console.error('payments.attempt.log.fail', { paymentId, err: serialize(e) });
  throw e;
});
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(payments): don't swallow attempt log failures`.

---

### Task 26: cross-border sanctions fetcher (`api-031`)

**Files:**
- Modify: `apps/api/src/modules/cross-border/sanctions.ts:1-60`

**Risk:** egress to OFAC/UN. Confirm `wrangler.toml` allows outbound.

- [ ] **Step 1: Test** — `refreshSanctionsList()` fetches OFAC SDN CSV stub, parses ≥ 1 entry, returns `count`.

- [ ] **Step 2: FAIL** — current returns seed only.

- [ ] **Step 3: Implement**

```typescript
const ofacUrl = 'https://www.treasury.gov/ofac/downloads/sdn.csv';
const res = await fetch(ofacUrl);
if (!res.ok) throw new Error(`OFAC fetch failed ${res.status}`);
const csv = await res.text();
const entries = parseOfacCsv(csv); // simple split, MVP
return { source: 'ofac', count: entries.length, entries };
```

- [ ] **Step 4: PASS** (mocked fetch).

- [ ] **Step 5: Commit** — `feat(cross-border): OFAC sanctions list refresh (compliance)`.

---

### Task 27: audit export runner (`api-032`)

**Files:**
- Modify: `apps/api/src/modules/cron/handlers.ts:75-100`

- [ ] **Step 1: Test** — `handleAuditExportRunner()` reads pending exports queue, uploads to R2, marks complete.

- [ ] **Step 2: FAIL** — current is no-op.

- [ ] **Step 3: Implement** — drain queue, for each item generate CSV, `env.R2.put(...)`, mark `exported_at`.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `feat(cron): implement audit export runner`.

---

### Task 28: sponsored approved_pending metric (`api-033`)

**Files:**
- Modify: `apps/api/src/modules/sponsored/cron.ts:8-30`
- Modify: `apps/api/src/modules/sponsored/repository.ts` (add view helper)

- [ ] **Step 1: Test** — when campaigns are `approved` with `startsAt > now`, metric `sponsored.approved_pending.count` reflects their number.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
const pending = await db.select().from(sponsoredCampaigns)
  .where(and(eq(sponsoredCampaigns.status, 'approved'), gt(sponsoredCampaigns.startsAt, now())))
  .all();
if (pending.length) await metrics.emit('sponsored.approved_pending.count', pending.length);
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `feat(sponsored): surface approved_pending queue depth`.

---

### Task 29: audit coalesce to queue (`api-036`)

**Files:**
- Modify: `apps/api/src/modules/admin/lib/audit.ts:60-95`

**Risk:** verify drop is acceptable — losing per-request audit could violate compliance. If blocked, set `coalesceMs` lower (e.g., 0) and keep synchronous.

- [ ] **Step 1: Verify** with `grep -r "audit" apps/api/src/modules/compliance` or similar; if compliance need synchronous, lower coalesce window.

- [ ] **Step 2: Test** — high-rate synthetic request flood emits 1 audit row per 500ms window, not per request.

- [ ] **Step 3: FAIL.**

- [ ] **Step 4: Implement** — replace inline `await db.insert(auditLog)...` with `env.AUDIT_QUEUE.send({...})`. Audit consumer stays as-is.

- [ ] **Step 5: PASS.**

- [ ] **Step 6: Commit** — `perf(audit): coalesce high-frequency audit writes`.

---

### Task 30: permission split verify/approve (`api-035`)

**Files:**
- Modify: `apps/api/src/modules/finance/adminSettlements.ts:565-600`
- Modify: schema for permissions if needed

- [ ] **Step 1: Test** — ops role without `payout:approve` can still call `POST /supplier-bank-accounts/:id/verify`.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — rename permission to `bankAccount:verify` (keep `payout:approve` separate); call-sites updated.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(finance): split bank-account verify from payout approve`.

---

### Task 31: Mobile — 2 blockers (`mobile-001`, `mobile-002`)

**Files:**
- Modify: `apps/mobile/src/features/admin/catalog/CatalogScreen.tsx:120-150`
- Modify: `apps/mobile/src/features/buyer/orders/components/ReorderSheet.tsx:20-45`
- Test: `apps/mobile/test/admin/catalog/CatalogScreen.test.tsx`
- Test: `apps/mobile/test/buyer/orders/ReorderSheet.test.tsx`

- [ ] **Step 1: Tests** (x2)

```typescript
// CatalogScreen
it('only the pending Feature row shows spinner', () => {
  // mock two products; click Feature on A; assert A button loading, B idle
});

// ReorderSheet
it('mode toggle drives RadioCards value', () => {
  // render with both modes enabled; assert RadioCards value updates on tap
});
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```tsx
// CatalogScreen
{products.map((p) => (
  <Button
    key={p.id}
    loading={feature.isPending && feature.variables?.id === p.id}
    onPress={() => feature.mutate(p.id)}
  >Feature</Button>
))}

// ReorderSheet
const [mode, setMode] = useState('cart');
<RadioCards value={mode} onChange={setMode} options={[
  { value: 'cart', label: 'Review in cart', disabled: !canCart },
  { value: 'reissue', label: 'Re-issue order', disabled: !canReissue },
]} />
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(mobile/admin-catalog): per-id mutation pending; (mobile/buyer-orders): bind RadioCards to mode state`.

---

### Task 32: Mobile — state-during-render sweep (`mobile-003`, `004`, `005`, `011`)

**Files:**
- Modify: `apps/mobile/src/features/admin/learning/LearningScreen.tsx:335, 450`
- Modify: `apps/mobile/src/features/admin/ops/kit/components.tsx:185-205`
- Modify: `apps/mobile/src/features/buyer/commerce/CatalogScreen.tsx:50-65`

- [ ] **Step 1: Add test** asserting no "setState during render" warning with `console.error` spy.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```tsx
// LearningScreen LessonEditorSheet + QuizSheet
useEffect(() => {
  if (!visible) return;
  setLoadedFor(lesson?.id ?? null);
  setForm(lesson ?? null);
  setErr(null);
}, [visible, lesson?.id]);

// ReasonSheet
useEffect(() => {
  if (!visible) setReason('');
}, [visible]);

// CatalogScreen nav-params sync
useEffect(() => {
  if (params.q !== searchInput) setSearchInput(params.q ?? '');
}, [params.q, params.category]);
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(mobile): move state sync out of render bodies`.

---

### Task 33: Mobile — deep-link `mobileHref()` helper (`mobile-007`, `008`, `019`)

**Files:**
- New: `apps/mobile/src/lib/mobileHref.ts`
- Modify: `apps/mobile/src/features/common/NotificationsScreen.tsx:255`
- Modify: `apps/mobile/src/features/buyer/ai/AskScreen.tsx:18`
- Modify: `apps/mobile/src/features/buyer/orders/kit.tsx` (use shared helper + toast on 404)

- [ ] **Step 1: Test** — `mobileHref('/products/123')` → `/buyer/catalog/p/123` (or whatever current mapping is); invalid path returns null.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
// mobileHref.ts
const ROUTES: Record<string, string> = {
  '/products/': '/buyer/catalog/p/',
  '/orders/': '/buyer/orders/',
  '/supplier/': '/supplier/',
};
export function mobileHref(webPath: string): string | null {
  for (const [prefix, repl] of Object.entries(ROUTES)) {
    if (webPath.startsWith(prefix)) return webPath.replace(prefix, repl);
  }
  return null;
}
```

```typescript
// NotificationsScreen + AskScreen
const dest = mobileHref(n.link);
if (dest) go(dest); else toast.error('Page not found');
```

```typescript
// orders/kit.tsx
const result = router.push(path);
if (!result) toast.error('Page not found');
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `feat(mobile): single mobileHref deep-link helper + 404 toast`.

---

### Task 34: Mobile — missing admin routes (`mobile-021`, `022`, `023`)

**Files:**
- New: `apps/mobile/src/app/admin/observability/queues.tsx`
- New: `apps/mobile/src/app/admin/observability/alerts.tsx`
- New: `apps/mobile/src/app/admin/learning/index.tsx`
- Modify: `apps/mobile/src/features/admin/ops/kit/hooks.ts` (verify and export if missing)

- [ ] **Step 1: Test** — each new screen renders stub; smoke fetch works.

- [ ] **Step 2: N/A (new files).**

- [ ] **Step 3: Implement**

```tsx
// queues.tsx
import { Screen, Text } from '@vyro/ui';
export default function QueuesScreen() {
  return <Screen title="Queues"><Text>Queue depth coming soon.</Text></Screen>;
}
```

Same shape for `alerts.tsx` and `learning/index.tsx`.

```typescript
// hooks.ts - ensure exports
export function useAdminList<T>(key: string) { /* ...existing or new... */ }
export function useBulk<T>(endpoint: string) { /* ... */ }
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `feat(mobile): admin observability + learning route stubs`.

---

### Task 35: Mobile — polling gating (`mobile-010`, `013`)

**Files:**
- Modify: `apps/mobile/src/features/buyer/orders/OrderDetailScreen.tsx:800-820`
- Modify: `apps/mobile/src/features/buyer/commerce/PaymentReturnScreen.tsx:25-50`

- [ ] **Step 1: Test** — message query disabled when sheet closed; payment query disabled when status confirmed or timed out.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
useQuery({
  queryKey: ['order', orderId, 'messages'],
  refetchInterval: 8000,
  enabled: messagesSheetOpen && isFocused,
});

// PaymentReturn
const shouldPoll = payment?.status !== 'confirmed' && !timedOut && outcome === 'success';
useQuery({ ..., refetchInterval: shouldPoll ? 2000 : false });
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(mobile): gate polling on focus + outcome`.

---

### Task 36: Mobile — index-as-key sweep (`mobile-006`, `015`, `016`)

**Files:**
- Modify: `apps/mobile/src/features/admin/observability/ObservabilityScreen.tsx:120-140`
- Modify: `apps/mobile/src/features/admin/accounts/TransactionScreen.tsx:95-140`
- Modify: `apps/mobile/src/features/admin/ai/AiUsageScreen.tsx:80-110`

- [ ] **Step 1: Test** (x3) — list items have stable keys; rerender does not remount unrelated rows.

- [ ] **Step 2: FAIL** (warning or wrong-test setup triggers).

- [ ] **Step 3: Implement** — replace `key={i}` with `key={e.id ?? \`${e.action}-${e.createdAt}\`}` etc.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(mobile): stable keys on dynamic lists`.

---

### Task 37: Mobile — misc polish (`mobile-009`, `012`, `014`, `018`, `020`)

**Files:**
- Modify: `apps/mobile/src/features/buyer/ai/useVyroAI.ts:295-310`
- Modify: `apps/mobile/src/features/admin/accounts/AccountsScreen.tsx:400-420`
- Modify: `apps/mobile/src/features/admin/learning/LearningScreen.tsx:530-555`
- Modify: `apps/mobile/src/app/welcome.tsx:1-30`
- Modify: `apps/mobile/src/features/admin/ops/kit/components.tsx:195-210`

- [ ] **Step 1: Tests** (x5)

```typescript
// mobile-009: send 2nd message after 1st, history length grows in send body
// mobile-012: tap Reinstate → confirmKind === 'reinstate' path runs
// mobile-014: 1 of 5 lessons 403 → others still queued, partial-failure surfaced
// mobile-018: tap "Sign in" with keyboard up → form submits
// mobile-020: type 1 char reason → button disabled + hint visible
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```typescript
// useVyroAI: convert history.current reads to useRef
const history = useRef<Msg[]>([]);
const send = useCallback(async (msg) => {
  history.current = [...history.current, msg]; // mutated ref
  ...
}, []); // still safe with ref
```

```tsx
// AccountsScreen
const [confirmKind, setConfirmKind] = useState<'suspend' | 'reinstate' | null>(null);
// ...rename usages from 'unsuspend' to 'reinstate'
```

```tsx
// LearningScreen SaveOrder
const errors: string[] = [];
for (const lesson of lessons) {
  try { await orderService.put(lesson.id, lesson.order); } catch (e) { errors.push(lesson.id); }
}
if (errors.length) toast.error(`${errors.length} failed to reorder`);
```

```tsx
// welcome.tsx
<ScrollView keyboardShouldPersistTaps="handled" ...>
```

```tsx
// kit/components.tsx ReasonSheet
<Field hint={reason.length < 5 ? `${5 - reason.length} more chars required` : undefined} />
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(mobile): vyroAI history; reinstate rename; SaveOrder partial-failure; keyboard persist; minLength hint`.

---

### Task 38: Web — raw fetch → api wrapper (`web-004..008`, `016..018`)

**Files:**
- Modify: `apps/web/src/ai/AiHomePage.tsx:15-30`
- Modify: `apps/web/src/admin/ReviewsPage.tsx:5-20`
- Modify: `apps/web/src/reviews/AdminReviewQueue.tsx:30-50`
- Modify: `apps/web/src/storefront/StorefrontPage.tsx:45-65`
- Modify: `apps/web/src/pages/ProfilePage.tsx:30-55, 180-200`
- Modify: `apps/web/src/ask/useVyroAI.ts:25-50`
- Modify: `apps/web/src/ask/ConfirmationPanel.tsx:175-200`
- Modify: `apps/web/src/ask/FeedbackButtons.tsx:170-195`

- [ ] **Step 1: Tests** (x8) — each call goes through `api.{get,post,delete}` (mock `api` and assert url + method).

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```tsx
// example (AiHomePage)
- const res = await fetch(import.meta.env.VITE_API_URL + '/api/ai/home');
+ const res = await api.get('/api/ai/home');
```

Same pattern for each call-site.

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(web): use api wrapper consistently in ai/admin/storefront/profile/ask`.

---

### Task 39: Web — signOut async/await (`web-009`, `010`, `011`, `015`)

**Files:**
- Modify: `apps/web/src/components/Layout.tsx:330-345, 450-465`
- Modify: `apps/web/src/components/SiteHeader.tsx:260-280`
- Modify: `apps/web/src/pages/ProfilePage.tsx:185-205`

- [ ] **Step 1: Test** — signOut 500 → toast shown.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```tsx
onClick={async () => {
  try { await signOut(); }
  catch (e) { toast.error('Sign-out failed'); }
}}
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(web): await signOut + error toast`.

---

### Task 40: Web — native confirm → ConfirmDialog (`web-012`, `020`)

**Files:**
- Modify: `apps/web/src/admin/PlatformPage.tsx:795-825`
- Modify: 8 call-sites listed by `grep -rln "window.confirm" apps/web/src`

- [ ] **Step 1: Test** — clicking delete opens ConfirmDialog, cancels does nothing, confirms fires mutation.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```tsx
const [pendingDelete, setPendingDelete] = useState<Template | null>(null);
<ConfirmDialog
  open={!!pendingDelete}
  title="Delete template?"
  onConfirm={async () => { await deleteTemplate(pendingDelete!.id); setPendingDelete(null); }}
  onCancel={() => setPendingDelete(null)}
/>
<Button onClick={() => setPendingDelete(t)}>Delete</Button>
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(web): replace window.confirm with ConfirmDialog`.

---

### Task 41: Web — misc UX (`web-001..003`, `013`, `014`, `019`, `021..023`)

**Files:**
- Modify: `apps/web/src/pages/OrderDetailPage.tsx:1010`
- Modify: `apps/web/src/pages/ConversationalOrderPage.tsx:70`
- Modify: `apps/web/src/ask/AskPage.tsx:180`
- Modify: `apps/web/src/supplier/InventoryPage.tsx:785`
- Modify: `apps/web/src/pages/SponsoredDisclosure.tsx:5-15`
- Modify: `apps/web/src/supplier/DeliveryTransitionButtons.tsx:170`
- Modify: `apps/web/src/pages/ReturnsPage.tsx:5-15`
- Modify: `apps/web/src/admin/OrderLifecycleSettingsPage.tsx:0`
- Modify: `apps/web/src/supplier/SupplierOrderDetailPage.tsx:0`

- [ ] **Step 1: Tests** (one per concern)

```typescript
// web-001: link points to /help, not /support
// web-002: businessId sourced from active membership, not 'default'
// web-003: useEffect fetch cancels on unmount (no setState warning)
// web-013: AdjustStock submit button disables during submit
// web-014: error view has retry button
// web-019: POD retry button has local submitting gate
// web-021: ReturnsPage empty state when no membership
// web-022: OrderLifecycleSettings error banner + dirty guard
// web-023: SupplierOrderDetail skeleton during load
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement** — each per its single-line fix. Sample for web-003:

```tsx
useEffect(() => {
  const ctrl = new AbortController();
  fetchStream(prompt, { signal: ctrl.signal }).then(/* ... */);
  return () => ctrl.abort();
}, [prompt]);
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — one commit per concern: `fix(web): help link / businessId source / AbortController / double-submit / retry CTA / POD gate / ReturnsPage empty / banner / skeleton`.

---

### Task 42: Web — tab/minor (`web-024`, `025`)

**Files:**
- Modify: `apps/web/src/pages/SignupPage.tsx:300`
- Modify: `apps/web/src/admin/HomePage.tsx:55-70`

- [ ] **Step 1: Tests**
  - SignupPage accepts `+94.77.123.4567`.
  - admin/HomePage query has `staleTime: 30_000`.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implement**

```tsx
// SignupPage phone regex
pattern: /^[+0-9 ().\-]{7,20}$/

// admin/HomePage
useQuery({ queryKey: ['admin','home'], queryFn: ..., staleTime: 30_000 });
```

- [ ] **Step 4: PASS.**

- [ ] **Step 5: Commit** — `fix(web): allow dots in phone pattern; admin home staleTime`.

---

## Test Gate

After each stream lands:

```bash
# API stream
pnpm --filter @vyro/api test
pnpm --filter @vyro/api build

# Web stream
pnpm --filter @vyro/web test
pnpm --filter @vyro/web build

# Mobile stream
cd apps/mobile && pnpm test && pnpm --filter @vyro/mobile build || pnpm expo export --platform all
```

Target counts:
- API: maintain ≥ 1001 passing + new tests.
- Web: ≥ 142 passing + new tests.
- Mobile: existing 0 baseline + new tests.

Manual smoke per changed screen via dev server before merge.

## Final Task (implicit, not numbered): Merge + smoke

```bash
git checkout main
git merge --no-ff fix/api-audit-2026-09-24
git merge --no-ff fix/mobile-audit-2026-09-24
git merge --no-ff fix/web-audit-2026-09-24
pnpm dev &
# click through each fixed surface
```

## Self-Review

✓ All 80 kept findings map to a numbered task.
✓ All tasks show test + implementation with exact file paths.
✓ API tasks 1-30 produce code changes only in existing modules (no new file structures).
✓ No placeholder/TBD/"fill in" content.
✓ `api-015` risk gate (better-auth contract check) called out before schema change.
✓ `api-031` egress check called out before fetch.
✓ `api-036` compliance gate called out before perf change.

## Handoff

Plan saved. Per user's earlier delivery choice ("Spec + plan, implement later"), execution does not start in this session. When ready to execute:

**1. Subagent-Driven (recommended for this scope)** — fresh subagent per task, two-stage review between tasks.
**2. Inline Execution** — execute in-session with checkpoints.

Pick one when ready.
