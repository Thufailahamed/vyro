# VYRO Production Readiness — Audit + Implementation

**Date:** 2026-09-06
**Owner:** VYRO engineering
**Scope:** End-to-end audit of VYRO MVP. Fix gaps, complete stubs, wire infrastructure, harden tenancy, remove hardcoded demo content. Production-ready exit.

## Goals

1. Every planned MVP feature genuinely working end-to-end.
2. Cloudflare infrastructure fully wired (queues have consumers).
3. Multi-tenancy enforced via central helper.
4. No hardcoded demo content on production pages.
5. Tests pass; typecheck/lint/build green.

## Non-Goals

- Swap infrastructure (Cloudflare stack stays).
- Build proprietary wallet (PayHere stays).
- Build logistics marketplace (manual delivery).
- Implement AI features (placeholder stays).
- Live deploy to production.

## Architecture (no changes)

- **Frontend:** React 19 + Vite + RR7 + Tailwind + TanStack Query (apps/web).
- **Backend:** Hono + Cloudflare Workers (apps/api).
- **DB:** D1 + Drizzle ORM (packages/db).
- **Storage:** R2 bucket `vyro-products` (products/images).
- **Queues:** AUDIT_QUEUE + NOTIFICATIONS_QUEUE (producers declared, consumers to wire).
- **Cache:** KV namespace `CACHE` (rate limit).
- **Auth:** better-auth + RBAC (packages/auth).
- **Payments:** PayHere + mock (packages/payments).
- **Validation:** Zod (packages/validation).
- **Admin SPA:** lives in apps/web/src/admin/* (no separate app).

## File Structure (planned changes)

### New files
- `apps/api/src/queue/audit.ts` — AUDIT_QUEUE consumer.
- `apps/api/src/queue/notifications.ts` — NOTIFICATIONS_QUEUE consumer.
- `packages/db/src/scope.ts` — `scopeToBusiness`, `scopeToSupplier`, `scopeToAdmin` helpers.
- `apps/api/.dev.vars.example` — local dev env template.
- `packages/db/migrations/0015_settings_uncollide.sql` — rename of collided 0001_settings.sql.
- `apps/api/test/tenancy-scope.test.ts` — tests for tenancy helpers.

### Modified files
- `apps/api/wrangler.toml` — remove committed dev secret.
- `apps/api/src/worker.ts` — register queue consumers.
- `apps/api/src/modules/{cart,purchaseOrders,payments,accounts,invoices,suppliers,supplierProducts}/repository.ts` — apply scope helpers.
- `apps/web/src/pages/MarketingPages.tsx` — flag-gate demo content.
- `apps/web/src/pages/{Business,Supplier}OnboardingPage.tsx` — replace Unsplash with empty/seeded state.
- Migrations: rename `0001_settings.sql` → `0015_settings.sql` (resolve numeric collision).

## Implementation Phases

### Phase 1 — Critical infrastructure
- Wire queue consumers.
- Add `packages/db/src/scope.ts` helper.
- Refactor top-5 highest-risk repos to use helper.
- Remove committed dev secret.
- Commit `.dev.vars.example` + `.env.example`.
- Resolve migration number collision.
- Test: tenancy helper unit tests.

### Phase 2 — Module audit + completion
For each module below: audit, document gaps, fix, test.
- **auth** — signup/login/logout/2FA/reset/membership.
- **businesses** — onboarding + member mgmt.
- **suppliers** — onboarding + supplier product creation.
- **products + supplierProducts** — global vs supplier offer separation.
- **search** — real DB queries + comparison.
- **cart + checkout** — server totals, multi-PO.
- **purchaseOrders** — state machine validation.
- **deliveries** — lifecycle.
- **payments** — PayHere + idempotency.
- **notifications** — consumer wires to DB.
- **analytics** — replace hardcoded aggregates.

### Phase 3 — Remove hardcoded demo content
- `MarketingPages.tsx`: gate demo content under `VITE_DEMO_CONTENT=1` flag.
- `BusinessOnboardingPage.tsx` + `SupplierOnboardingPage.tsx`: drop Unsplash links, use empty state with image upload.

### Phase 4 — Error/loading/empty states
- Audit every page; ensure triples present.

### Phase 5 — Validation
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.
- Fix regressions.

### Phase 6 — Report
- COMPLETED / FIXED / SECURITY / TESTS / REMAINING.

## Acceptance Criteria

- All 182 handlers pass auth + tenancy + validation.
- Queues have live consumers.
- No `// TODO` in production paths.
- No hardcoded demo content outside flag-gated section.
- Central tenancy helper applied to all high-risk repos.
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` all green.

## Risks

- Live D1/R2 not available — tests use `@cloudflare/vitest-pool-workers` with miniflare.
- Migration number collision fix requires migration table update.
- Queue consumers need retry/error handling to not lose messages.

## Out of Scope

- Live production deploy.
- AI feature implementation.
- Logistics marketplace.
- Proprietary wallet.
