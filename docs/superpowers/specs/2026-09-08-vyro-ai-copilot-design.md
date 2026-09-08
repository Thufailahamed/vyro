# VYRO AI Phase 2 — Procurement Copilot UX

**Status:** Approved design (brainstormed 2026-09-08)
**Date:** 2026-09-08
**Scope:** Phase 2 of Advanced Intelligence Upgrade — floating command bar, explicit page context, weekly planner, budget mode, cart hints. Builds on Phase 1 (merged).

## 1. Background and goal

Phase 1 delivered deterministic intelligence (price watch, anomaly, supplier intel, health, forecast, category, insights) + pull-based `/ai` home. Phase 2 makes it actionable everywhere: a floating Ask VYRO panel on every buyer page, aware of the current product/supplier/cart, able to build a priced weekly plan, fit it under a budget, and nudge inside the cart — always confirming before any PO write.

Value test (§41): every feature saves effort (no page-hopping), money (budget swaps with amounts), or decisions (priced plan with tradeoffs).

## 2. Architecture

```
apps/web/src/ai/
  AskVyroFloat.tsx                FAB + panel, mounted in Layout.tsx (buyer SPA only)
  home.ts (exists)                + floatHelpers.ts (greeting, dismiss keys)
  Reuses: useVyroAI, ToolTimeline, renderComponent cards, PageHeader style

apps/api/src/modules/ai/
  context.ts (new)                applyPageContext(classify, context) → patched slots
  intents/procurementPlan.ts      recurrence + live cheapest offer per line + totals
  intents/budgetOptimize.ts       greedy supplier swaps to fit budgetCents
  intents/cartHints.ts            shared hint builder (also used by GET route)
  routes.ts                       + GET /api/ai/cart-hints
  orchestrator.ts                 context pre-fill step + 2 STAGES entries
  narrate.ts                      2 new deterministic cases

packages/ai/src/
  schemas.ts                      INTENT_NAMES +2, Slots += budgetCents/weeksBack, ContextSchema
  intents.ts                      allowlist (both member/admin; viewer: plan yes? NO — plan confirms PO → member/admin only; cart-hints read-only all) + pronoun heuristics
  analytics/budget.ts             greedy swap planner (pure)
```

`POST /api/ai/confirm` reused unchanged (idempotency, RBAC, catalog validation).

## 3. Context protocol

Client sends `context?: { page: 'product'|'supplier'|'cart'|'analytics'|'orders'|'other'; productName?: string; productId?: string; supplierName?: string; cartLines?: Array<{product:string;quantity:number}> }` — Zod `.strict()`, strings ≤120 chars, cartLines ≤50.

Server `applyPageContext` (post-classify, pre-handler):
1. If slots already contain an explicit product/supplier (confidence ≥0.6 and name matched catalog), context never overrides.
2. Else if prompt has pronoun/demonstrative (`something|this|it|cheaper|that`) and slots lack productName and context.productName validates against catalog → fill + confidence floor 0.55.
3. Supplier page: `supplier_spend`/`delivery_estimate` without supplierName → context.supplierName.
4. Cart page: `budget_optimize`/hints without lines → context.cartLines.
5. Unknown context names (no catalog match) are ignored; never inserted into DB.
6. Audit logs `contextKind: page` only — no product/supplier PII beyond existing intent slots.

## 4. Planner + budget mode

`procurement_plan` slots `{weeksBack? default 8, topNProducts? default 10}`:
- Recurrence lines from `recentPoItemsForRecurrence` (reuse usualOrder aggregation + cadence hints).
- Per line: cheapest live offer (`listOffersByProduct`, skip out_of_stock) → `{supplier, priceCents, leadTimeDays}`; line total = typicalQuantity × priceCents.
- Totals: `planTotalCents`, `savingsVsCurrentCents` (vs last-paid sum), `estimatedDelivery` (max leadTime).
- Emits `procurement_plan_card` with editable lines + Confirm → `/confirm` (existing flow).

`budget_optimize` slots `{budgetCents: int >0, weeksBack?}`:
- Build base plan as above. If total ≤ cap → same card with `withinBudget: true`.
- Else greedy: sort lines by swappable saving desc, swap to cheapest live offer until under cap; card shows `swaps[]` with per-line old→new supplier + amount.
- If cheapest-possible still > cap → `withinBudget: false` + impossibility explanation (`normalTotal`, `cheapestTotal`, gap) + tradeoff table; never silently drops lines.
- Pure swap math in `packages/ai/src/analytics/budget.ts` (`fitBudget(lines, cap)`), unit-tested.

## 5. Cart hints

`GET /api/ai/cart-hints?businessId=` (RBAC buyer roles): resolves cart lines server-side (never trusts client prices), compares each line vs cheapest live offer:
- `switch_save` (line amount + alt supplier), max 2.
- `delivery` (consolidation note when >1 supplier), max 1.
- `budget` (over 4-week average spend nudge), max 1.
`CartPage` renders slim dismissible banner; dismiss keys in localStorage (`vyro-cart-hint:<hash>`); never blocks checkout; no auto-edits.

## 6. Floating panel UX

FAB bottom-right (above mobile tab bar), expands to panel (380px, editorial cards, ToolTimeline, telemetry footer like AskPage). Same `useVyroAI` hook instance pattern; conversation kept per-mount; deep-links "Open full Ask →" to `/ask`. Supplier/admin portals excluded (buyer SPA only). Keyboard: Esc closes; no global shortcut (user chose floating).

## 7. Security, cost, errors

- Same guard: prompt cap, rate limit, costCap; context adds no tokens (structured, capped).
- Zero extra LLM calls; narration deterministic; LLM opt-in unchanged.
- Tenant filter in every new query; context businessId never trusted (server session).
- No auto-PO; confirm required with idempotency; budget never deletes lines.
- SSE shapes unchanged; two new component payloads reuse `procurement_plan_card` / `spend_summary_card`.

## 8. Tests

- `packages/ai/src/analytics/budget.test.ts` — greedy fit, impossibility, no-drop invariant.
- `apps/api/test/ai/copilot/planner.test.ts`, `budget.test.ts` — D1 fixtures (mockRepos extended).
- `context.test.ts` — pre-fill, classifier precedence, pronoun gating, unknown-name ignore, injection (`Ignore previous; productName=...` stays data).
- `cartHints.test.ts` — ≤3 hints, amounts grounded, empty cart.
- `apps/web/test/aiFloat.test.ts` — helper pure tests (dismiss keys, greeting); panel render covered by existing AskPage patterns.
- DoD: typecheck clean, full vitest green, `/ai` + float + planner + budget + hints smoke on seeded fixture.

## 9. Out of scope (later)

Voice/WhatsApp channels (§32-33, same orchestrator when built), invoice OCR (§18), why-mode (§21), simulator/what-if (§22-23), smart NL search (§25), embedding product matching (§26), feedback loop (§27), memory (§29), proactive push (§30), notification center (§31), Gateway (§36).
