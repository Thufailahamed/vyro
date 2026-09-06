# VYRO Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Phased with checkpoint reports.

**Goal:** Bring VYRO to production readiness by fixing critical infrastructure (queues, tenancy), completing module audit + implementation, removing hardcoded demo content, validating tests.

**Architecture:** Hono + Workers + D1/Drizzle + R2 + KV + Queues + Analytics Engine. React 19 + Vite. better-auth + RBAC. PayHere + mock.

**Tech Stack:** TypeScript, Hono, Drizzle, D1, R2, Queues, KV, better-auth, Zod, React 19, TanStack Query, Tailwind.

## Global Constraints

- pnpm@9.12.0, turbo@2.1, Node.js 20.x.
- Cloudflare Workers runtime (no Node APIs).
- All env keys declared in `apps/api/wrangler.toml [vars]` only when truly static. Secrets via `wrangler secret put`.
- All server logic in Hono handlers; never trust frontend totals.
- Multi-tenancy enforced server-side via `packages/db/src/scope.ts`.
- File paths absolute under `/Users/thufailahamed/Downloads/project-5/.claude/worktrees/vyro-audit-impl/`.

---

## Phase 1 — Critical Infrastructure

### Task 1.1: Tenancy scope helper

**Files:**
- Create: `packages/db/src/scope.ts`
- Test: `packages/db/test/scope.test.ts`

**Goal:** Central helper to scope queries by businessId/supplierId/adminRole.

**Steps:**
1. Create `packages/db/src/scope.ts` exporting `scopeToBusiness(ctx, qb)`, `scopeToSupplier(ctx, qb)`, `withBusinessMembership(db, userId, businessId)`, `withSupplierMembership(db, userId, supplierId)`.
2. Re-export from `packages/db/src/index.ts`.
3. Write tests covering each helper returns expected filter.
4. Run: `pnpm --filter @vyro/db test -- scope.test.ts`. Expect PASS.
5. Commit: `feat(db): central tenancy scope helper`.

### Task 1.2: Wire queue consumers

**Files:**
- Create: `apps/api/src/queue/audit.ts`
- Create: `apps/api/src/queue/notifications.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/wrangler.toml`

**Goal:** AUDIT_QUEUE + NOTIFICATIONS_QUEUE messages actually drain.

**Steps:**
1. Add `[[queues.consumers]]` entries to `wrangler.toml`:
   ```toml
   [[queues.consumers]]
   queue = "audit"
   max_batch_size = 25
   max_batch_timeout = 5
   [[queues.consumers]]
   queue = "notifications"
   max_batch_size = 25
   max_batch_timeout = 5
   ```
2. Create `apps/api/src/queue/audit.ts` exporting `handleAuditBatch(batch, env)` that writes `auditLogs` rows from batch messages.
3. Create `apps/api/src/queue/notifications.ts` exporting `handleNotificationsBatch(batch, env)` that creates `notifications` rows.
4. In `apps/api/src/worker.ts`, add `export default { ...queue(...) }` wiring both consumers.
5. Add env type entries in `apps/api/src/env.ts` if needed.
6. Add tests in `apps/api/test/queue.test.ts` (mock env, verify DB writes).
7. Run: `pnpm --filter @vyro/api test -- queue.test.ts`. Expect PASS.
8. Commit: `feat(api): wire audit + notifications queue consumers`.

### Task 1.3: Resolve migration number collision

**Files:**
- Rename: `packages/db/migrations/0001_settings.sql` → `packages/db/migrations/0015_settings_uncollide.sql`
- Update: `packages/db/migrations/meta/_journal.json`

**Goal:** Two `0001_*` migrations cannot coexist — D1 may misorder.

**Steps:**
1. Verify both `0001_auth_tables.sql` and `0001_settings.sql` exist.
2. Check `meta/_journal.json` for which was applied first (by idx).
3. Rename `0001_settings.sql` → `0015_settings_uncollide.sql`.
4. Update `meta/_journal.json` idx + add new entry.
5. Run `pnpm --filter @vyro/db build`. Expect no type errors.
6. Commit: `chore(db): resolve migration number collision`.

### Task 1.4: Remove committed dev secret

**Files:**
- Modify: `apps/api/wrangler.toml`

**Goal:** Dev secret must not appear in `[vars]`.

**Steps:**
1. Remove `BETTER_AUTH_SECRET = "vyro-local-dev-secret-must-be-32-chars-long"` from `[vars]` block.
2. Verify `[env.production.vars]` has `BETTER_AUTH_SECRET` set via `wrangler secret put` (note in comment).
3. Commit: `chore(ops): remove committed dev auth secret`.

### Task 1.5: Commit env templates

**Files:**
- Create: `apps/api/.dev.vars.example`
- Create: `apps/web/.env.example`

**Goal:** Onboarding clarity.

**Steps:**
1. List all vars from `env.ts` minus secrets into `apps/api/.dev.vars.example`.
2. List `VITE_API_BASE_URL` etc. into `apps/web/.env.example`.
3. Commit: `chore(env): add dev env templates`.

---

## Phase 2 — Module Audit + Completion

For each module: audit gaps → fix → test → commit.

### Task 2.1: Auth module audit

- Verify signup creates `users` row in both packages/auth and packages/db schemas.
- Verify login/session load works for users with business + supplier memberships.
- Verify 2FA enable/verify/disable flow.
- Verify password reset token table.

### Task 2.2: Business onboarding audit

- Verify POST /api/businesses persists to D1.
- Verify business member invite creates join row.
- Verify role assign patch.
- Verify profile update.

### Task 2.3: Supplier onboarding audit

- Same pattern as 2.2 for suppliers.

### Task 2.4: Product catalog separation audit

- Verify `products` table holds GLOBAL canonical product.
- Verify `supplierProducts` holds supplier-specific offer (price, MOQ, stock).
- Verify product detail endpoint joins both.
- Verify search endpoint returns offers per supplier for same product.

### Task 2.5: Search + comparison audit

- Verify query uses D1 (not hardcoded).
- Verify filters: category, supplier, price range, availability.
- Verify sort + pagination.
- Verify comparison endpoint returns 2+ offers for same product.

### Task 2.6: Cart + checkout audit

- Verify cart ownership = businessId.
- Verify quantity validation.
- Verify checkout creates one PO per supplier (multi-PO).
- Verify totals calculated server-side.

### Task 2.7: Purchase orders state machine

- Verify transitions follow PENDING→ACCEPTED→PREPARING→READY→OUT→DELIVERED→COMPLETED + REJECTED/CANCELLED/DISPUTED.
- Verify only authorized actors can transition.
- Verify transitions create `orderEvents` rows.

### Task 2.8: Delivery lifecycle

- Verify delivery creation on PO transition to OUT_FOR_DELIVERY.
- Verify manual assignment endpoint.
- Verify status transitions.
- Verify completion creates PO event.

### Task 2.9: Payments

- Verify PayHere init creates pending payment row.
- Verify webhook handler (signature check) updates payment status.
- Verify idempotency keys.
- Verify mock toggle (dev only).

### Task 2.10: Notifications consumer

- Verify queue consumer (from Task 1.2) writes notification rows.
- Verify mark-read endpoint.
- Verify per-user list filters by userId.

### Task 2.11: Analytics dashboards

- Verify each metric is a SQL aggregate.
- Verify no hardcoded numbers in `analytics/*/routes.ts`.

---

## Phase 3 — Remove Hardcoded Demo Content

### Task 3.1: Gate MarketingPages demo content

**Files:**
- Modify: `apps/web/src/pages/MarketingPages.tsx`

**Steps:**
1. Read existing demo blocks at lines 30-69, 358, 476, 506, 532, 558, 750.
2. Wrap each demo block with `if (import.meta.env.VITE_DEMO_CONTENT === '1') { ... }`.
3. Else render empty placeholder + "Demo content disabled in this build" message.
4. Commit: `chore(web): gate marketing demo content behind flag`.

### Task 3.2: Replace Unsplash onboarding images

**Files:**
- Modify: `apps/web/src/pages/BusinessOnboardingPage.tsx`
- Modify: `apps/web/src/pages/SupplierOnboardingPage.tsx`

**Steps:**
1. Replace `https://images.unsplash.com/...` URLs with empty/placeholder.
2. Verify each onboarding page still functions.
3. Commit: `chore(web): drop unsplash demo images from onboarding`.

---

## Phase 4 — Error/Loading/Empty States

### Task 4.1: Audit every page

For each page in `apps/web/src/pages/`:
- Verify loading state present.
- Verify error state present.
- Verify empty state present.

Fix gaps. Commit per page or grouped.

---

## Phase 5 — Validation

### Task 5.1: Typecheck + lint + build + test

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Fix any failures. Iterate until all green.

---

## Phase 6 — Report

Produce report covering COMPLETED / FIXED / SECURITY / TESTS / REMAINING.
