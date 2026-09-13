# VYRO Credit — Trade Credit Ledger Design

Date: 2026-09-13
Status: Draft (pending user review)
Scope: buyer trade credit — facilities, Net 14/30 checkout on terms, repayments, overdue handling, admin override, buyer `/credit` surface.

## Goal

Make the footer `VYRO Credit` entry a working product: eligible businesses can check out on Net 14 / Net 30 terms against a credit limit, track drawdowns and due dates, repay via existing payment rails, and be blocked when overdue. Admins can adjust limits and suspend/resume facilities. Every movement is ledger-auditable.

## Non-goals

- No separate credit application form v1 (eligibility is rule-based + admin override per user decision).
- No interest or late fees v1 (overdue blocks new draws; fees deferred).
- No supplier-funded credit v1 (platform-granted buyer limits only).
- No multi-currency (LKR only, matching payments stack).
- No automated collections / dunning emails v1 (in-app + notifications flags only).

## Current state (verified 2026-09-13)

- Footer `VYRO Credit` in `apps/web/src/components/Layout.tsx` `MarketingFooter` was plain `<li>` text; fixed to `<Link to="/about">` as interim.
- `AboutPage` (`MarketingPages.tsx:339-349`) shows the 4-movement strip with `VYRO Credit state=idle hint=Next` — no backend behind it.
- `CheckoutPage` redesign mock references `Pay on terms / Net 30, eligible after 3 orders` but no implementation exists.
- `RfqCreatePage` has a `30-day credit` quick tag (free text, not enforced).
- Existing `credit`/`debit` strings in the codebase refer to ledger direction, not trade credit.
- Reusable foundations: `apps/api/src/modules/ledger/writer.ts` (`writeLedgerEntry`, `computeBalance`), `ledger_entries` table, payments + PayHere + offline methods, `/accounts` buyer ledger UI, admin Money/Finance surface, cron pattern in `apps/api/src/cron/`.

## Architecture

```
packages/db/src/schema/
├── creditFacilities.ts   (NEW)
└── creditDrawdowns.ts    (NEW)

packages/validation/src/
└── credit.ts             (NEW: zod schemas)

apps/api/src/modules/credit/
├── service.ts            (eligibility, draw, repay, overdue sweep helpers)
├── repository.ts         (facility + drawdown queries)
└── routes.ts             (buyer + admin endpoints)

apps/web/src/pages/
├── CreditPage.tsx        (NEW: /credit buyer surface)
├── AccountsPage.tsx      (MOD: Credit tab)
└── CheckoutPage.tsx      (MOD: paymentMethod=credit + terms selector)

apps/web/src/components/
└── Layout.tsx            (MOD: footer VYRO Credit → /credit)

apps/api/src/cron/
└── creditOverdue.ts      (NEW: nightly sweep, wired into existing handlers)
```

All credit state changes write through `writeLedgerEntry` inside the same DB transaction as the domain write (same layered-write-order rule as payments spec §Layered write order).

Ledger mapping: `accountType=business`, `accountId=businessId`, `refType=adjustment`, `category=CREDIT` on draw, `category=DEBIT` on repay, `entityType=credit_drawdown`, `entityId=drawdownId`, `description` capped at 500 chars per writer contract.

## Schema

```ts
credit_facilities {
  businessId text PK → businesses.id
  limitCents integer not null          // e.g. default 10_000_000 (Rs. 100,000)
  usedCents integer not null default 0
  status text enum[active, suspended, closed] not null default active
  defaultTerms text enum[net14, net30] not null default net30
  autoGranted integer (boolean) not null default 0
  createdAt integer not null
  updatedAt integer not null
  index (status)
}

credit_drawdowns {
  id text PK
  businessId text not null → businesses.id
  purchaseOrderId text not null unique → purchase_orders.id
  amountCents integer not null
  repaidCents integer not null default 0
  terms text enum[net14, net30] not null
  dueAt integer not null
  status text enum[active, repaid, overdue] not null default active
  repaidAt integer nullable
  createdAt integer not null
  updatedAt integer not null
  index (businessId, status, dueAt)
}
```

Invariants enforced in service layer + checked in tests:
- `0 <= usedCents <= limitCents` always; admin cannot set `limitCents < usedCents`.
- One drawdown per purchase order (`purchaseOrderId` unique).
- `amountCents > 0`; `dueAt = createdAt + 14/30 days` computed server-side from `terms` (client value is advisory only).
- Repayment decrements `usedCents` by repaid amount, never below zero; partial repayments increment `repaidCents` and keep `status=active` until `repaidCents >= amountCents`.

## Eligibility (auto + admin override)

Auto-grant rule (server-side, evaluated on checkout eligibility check and on PO paid webhook):
- Business exists with at least one verified member, AND
- `count(purchase_orders WHERE businessId AND status IN (delivered, completed) AND paid via non-credit methods) >= 3`, AND
- No drawdown with `status=overdue`, AND
- No facility with `status=suspended|closed`.

When all hold and no facility exists, auto-create with `limitCents=10_000_000` (Rs. 100,000), `defaultTerms=net30`, `autoGranted=1`.

Admin override (requires `credit:manage` permission, audit-logged via existing admin audit log):
- `POST /api/admin/credit/facilities` upsert limit/terms/status for any business.
- `PATCH /api/admin/credit/facilities/:businessId` adjust `limitCents`, `defaultTerms`, `status`.
- Suspend blocks new draws immediately; existing drawdowns keep their due dates.

## Data flow

### Checkout on credit
1. Buyer selects `paymentMethod=credit`, `terms=net14|net30` in `CheckoutPage` (option disabled with explanation when ineligible).
2. `POST /api/purchase-orders/checkout { businessId, paymentMethod: 'credit', creditTerms }`:
   - Load facility; 403 `credit_not_eligible` when missing/suspended/closed.
   - 403 `credit_overdue_blocked` when any overdue drawdown exists.
   - 402 `credit_limit_exceeded` when `usedCents + cartTotal > limitCents`.
   - Create POs in existing checkout transaction; per PO insert `credit_drawdowns` with server-computed `dueAt`.
   - `usedCents += cartTotal`; `writeLedgerEntry` CREDIT per drawdown.
   - Commit atomically; any failure rolls back POs + drawdowns + ledger.
3. Buyer lands on `/orders`; `/credit` shows new active drawdowns with due countdowns.

### Repayment
1. From `/credit` or `/accounts?tab=credit`, buyer picks drawdown(s) and pays via existing PayHere online or recorded offline method.
2. `POST /api/credit/drawdowns/:id/repay { amountCents, paymentId }` validates payment belongs to same business and covers claimed amount.
3. On success: `repaidCents += amount`; when fully covered `status=repaid, repaidAt=now`; `usedCents -= amount`; `writeLedgerEntry` DEBIT.
4. Oldest-due-first applied when a single payment covers multiple drawdowns (`POST /api/credit/repay` bulk variant).

### Overdue sweep
- Nightly cron `creditOverdue.ts`: `UPDATE credit_drawdowns SET status=overdue WHERE status=active AND dueAt < now`.
- Overdue blocks all new credit draws; banner in `/credit`, `/cart`, `/checkout`; notification row via existing notifications dispatcher (`type=credit_overdue`).
- Clearing overdue (full repay) unblocks immediately without waiting for next sweep.

## API

Buyer (all `RequireBusiness`, business membership checked):
- `GET /api/credit/facility?businessId=` → facility + computed `availableCents` + eligibility reason when ineligible.
- `GET /api/credit/drawdowns?businessId=&status=` → list with PO numbers, terms, dueAt, remaining.
- `POST /api/credit/drawdowns/:id/repay`, `POST /api/credit/repay` (bulk oldest-first).

Admin (`RequireAdmin` + `credit:manage`):
- `GET /api/admin/credit/facilities?status=&q=`
- `POST /api/admin/credit/facilities`, `PATCH /api/admin/credit/facilities/:businessId`
- `GET /api/admin/credit/overdue`

Validation (`packages/validation/src/credit.ts`): `businessId`, `terms enum`, `positive amountCents`, `limitCents >= 0`, status enums; server recomputes `dueAt`, never trusts client dates.

## Buyer UI

- `GET /credit` (`CreditPage.tsx`, `RequireBusiness`): limit / used / available hero, eligibility explainer when not yet eligible (progress toward 3 paid orders), active drawdown cards (PO link, terms, due date, overdue badge, repay CTA), history table (repaid), admin-suspended notice state.
- `/accounts?tab=credit`: mirrors available + recent drawdowns, deep-links to `/credit`.
- `CheckoutPage`: `Pay on credit (Net 14 / Net 30)` radio enabled only when `availableCents >= cartTotal`; shows remaining after purchase; terms selector defaults to facility `defaultTerms`.
- Footer `VYRO Credit` retargeted from `/about` to `/credit`.
- Empty/loading/error states reuse `EmptyState` / `ErrorBanner` patterns from `AccountsPage`.

## Admin UI

- Extend Money/Finance surface: facilities table (business, limit, used, available, status, overdue count), adjust-limit dialog (validates `>= used`), suspend/resume buttons with reason prompt, overdue-only filter.
- Every mutation writes admin audit log entry with actor, before/after limit, reason.

## Error handling

| Case | Code | UX |
|---|---|---|
| No facility / suspended / closed | 403 `credit_not_eligible` | Checkout option disabled + `/credit` explainer |
| Overdue exists | 403 `credit_overdue_blocked` | Banner + repay CTA, blocks draw |
| Exceeds limit | 402 `credit_limit_exceeded` | Inline error with available vs total + pay-now fallback |
| Duplicate draw for PO | 409 `credit_drawdown_exists` | Idempotent retry returns existing |
| Limit below used | 422 `credit_limit_below_used` | Admin dialog validation |
| Repay unknown/foreign drawdown | 404/403 | Standard error banner, no state change |

Checkout credit path uses idempotency key (existing payment idempotency pattern) so retries never double-draw.

## Testing

- Unit (`apps/api/test/credit/`): eligibility 0/2/3 paid orders, overdue blocks auto-grant, due-date 14/30 calc, limit math, oldest-first bulk repay, limit-below-used rejected.
- Route tests: draw success, insufficient limit 402, suspended 403, overdue 403, repay flows, admin adjust/suspend/resume + audit.
- Cron test: active past-due → overdue; repaid past-due untouched.
- Web tests: `/credit` states (ineligible / active / overdue / suspended), checkout gating, footer link target.
- Regression: existing `finance/e2e`, `accounts/statement`, `ledger`, `payments` suites stay green; `pnpm --filter @vyro/web typecheck` + `test` clean.

## Rollout

1. Migration + API + validation behind no flag (endpoints return `credit_not_eligible` until rule met — safe default).
2. Web `/credit` + checkout option + footer retarget.
3. Admin controls + cron wiring.
4. Seed staging facility for one test business; verify checkout → drawdown → repay → overdue sweep end to end before announcing.
