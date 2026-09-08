# VYRO AI Phase 1 — Deterministic Intelligence Layer

**Status:** Approved design (brainstormed 2026-09-08)
**Date:** 2026-09-08
**Scope:** Phase 1 of Advanced Intelligence Upgrade — analytics engines + AI Home, pull on-demand, no cron/push.

## 1. Background and goal

Existing VYRO AI (audited): 13 read-only intents over real Drizzle repos, single classify call + deterministic narration default, WorkersAI + Gemini task routing (`providerForTask`), intent allowlist by role, KV rate limit + `costCap`, `/ask` SSE + `/confirm` draft-PO + personalized `/suggestions`, premium `AskPage` with `ToolTimeline` + `ConfirmationPanel`.

Phase 1 adds the highest-value upgrade sections without new infra: price watch (§9), anomaly (§10), supplier intelligence (§11, PO-lifecycle only per user choice), procurement health (§13), concentration (§14), forecast (§15), category intel (§16), insights feed (§17), plus AI Home (§2 pull variant). Copilot UX, planner/budget, why/simulate, invoice OCR, voice/WhatsApp, Gateway remain later phases.

Value test (§41): every feature must save time/money/effort or improve decisions. All Phase 1 features are backend-calculated numbers with evidence + action.

## 2. Architecture

```
packages/ai/src/analytics/        pure, zero IO, unit-testable
  priceWatch.ts                   avg-7d vs prior-21d, ±5%, ≥2 buys/window
  anomaly.ts                      cheapest offer vs median(last 20 buys), >125% flag
  supplierIntel.ts                accept/reject/cancel/fulfil rates, badges, overall 0.4/0.4/0.2
  health.ts                       100 minus concentration/savings/reliability/consistency (consistency penalty when order-gap CV > 0.5)
  forecast.ts                     3-month MA + trend + low/high range
  category.ts                     spend grouped by products.categoryId join
  insights.ts                     merge + rank (savings > reorder > price > supplier > budget)

apps/api/src/modules/ai/
  intents/                        7 thin handlers reusing AiRepos + HANDLERS map:
    priceWatch.ts, priceAnomaly.ts, supplierIntel.ts,
    procurementHealth.ts, spendForecast.ts, categoryIntel.ts, insightsFeed.ts
  intents/repos.ts + drizzleRepos.ts  6 new read queries (below)
  routes.ts                       + GET /api/ai/home, GET /api/ai/insights (RBAC business role)
  orchestrator.ts                 unchanged flow, 7 new STAGES entries
  guard/audit/metrics/cost.ts     unchanged (prompt cap, rate limit, costCap, no prompt storage)

apps/web/src/ai/
  AiHomePage.tsx                  /ai route, pull on-demand, parallel fetch
  components/                     reuses AskPage editorial cards (Recommendation/Savings/Plan/Supplier/Spend)
```

No migration (uses `audit_logs` index 0018). No Gateway. No cron/queue. `packages/ai` stays pure; Workers-AI binding stays Worker-only.

## 3. New repository queries (all tenant-filtered by businessId)

1. `priceWindows({businessId, productId, recentMs, priorMs})` — avg unit price + count per window from PO items.
2. `lastBuyPrices({businessId, productId, limit:20})` — ordered unit prices for median.
3. `supplierLifecycle({businessId, supplierId?, sinceMs})` — counts by PO status + accepted/rejected/cancelled/delivered timestamps.
4. `categorySpend({businessId, sinceMs})` — sum by `categories.name` via `products.categoryId` join.
5. `monthlySpend({businessId, months:6})` — totals for forecast MA + trend.
6. `concentration({businessId, sinceMs:90d})` — share per supplier.

All use existing indexes (`po_business_status_idx`, `po_supplier_status_idx`); chunked `IN` where needed (≤50 per chunk, D1-safe).

## 4. Intents, slots, components

| Intent | Slots | Component |
|---|---|---|
| `price_watch` | `{productName?, period?}` | `spend_summary_card` (movers list with % + evidence counts) |
| `price_anomaly` | `{productName}` | `recommendation_card` (neutral "Unusual price" + range + alternatives) |
| `supplier_intel` | `{supplierName?, productName?, optimizeFor?}` | `supplier_list_card` (badges: most reliable / best price / fastest / best overall + metric table) |
| `procurement_health` | `{}` | `spend_summary_card` (score 0-100 + 4 subscores + explanations) |
| `spend_forecast` | `{period? default month}` | `spend_summary_card` (history + prediction + range + top contributors, labelled) |
| `category_intel` | `{}` | `spend_summary_card` (top category, fastest growing, savings opp) |
| `insights_feed` | `{limit?}` | merged list (each: evidence + explanation + action href) |

Extend `INTENT_NAMES`, `Slots` (add `limit?`), `STAGES`, `HANDLERS`, `INTENT_ALLOWLIST_BY_ROLE` (all 7 readable by viewer; no write actions). Heuristic regexes extended (`price_watch`, `health`, `forecast`, `insight` keywords); multi-product fan-out reused.

## 5. AI Home (`/ai`, pull on-demand)

Parallel `GET /api/ai/home` returns `{reorderDue[3], savingsTotal, topMoves[4], health, forecastSnippet}`. Each card: evidence line, explanation line, action (`view_search`/`view_supplier`/`view_orders`/`view_analytics` hrefs, existing enum). Empty states with starter prompts. Reuses `<PageHeader>` + editorial cards, premium typography, no ChatGPT look. Loading skeletons per card; per-card failure degrades (other cards still render).

## 6. Security, cost, errors

- Same `guard.ts`: prompt cap 800, KV rate limit 30/min, `costCap` flat-200 fallback, `INTENT_FORBIDDEN` for role violations.
- Tenant isolation at SQL layer (`eq(purchaseOrders.businessId, businessId)`); model never sees other tenant data; `businessId` server-controlled.
- Neutral anomaly language ("significantly above your recent range"), never "overcharging". No unsupported accusations for supplier signals (show supporting counts).
- Zero extra LLM calls: classify only, deterministic `summarizeResult` default; LLM narrate opt-in unchanged.
- Audit: no raw prompts; rows include intent/provider/model/latency/tokens/ok/errorCode. SSE `tool_result ok:false` per-tool, `error` only for unrecoverable.

## 7. Tests

- `packages/ai/src/analytics/*.test.ts` — pure formula tests (thresholds, medians, weights, ranges).
- `apps/api/test/ai/intel/*.test.ts` — D1 fixtures per intent (7 files), seeded POs/offers/deliveries.
- Extend `scenarios.test.ts` (new intents), `tenancy.toolResult.test.ts` (2-business isolation on new repos), injection tests on new slots.
- Frontend: `AiHomePage.test.tsx` (cards render, per-card error, empty state).
- DoD: `pnpm typecheck` clean, `pnpm test` green, 7 intents grounded on fixture, `pnpm build` succeeds.

## 8. Rollout

1. Land analytics lib + repos + intents + endpoints behind `VYRO_AI_ENABLED`.
2. Add `/ai` route + nav entry.
3. Smoke: reorder/savings/moves/health on seeded business.
4. Later phases (separate specs): copilot UX + planner/budget, why/simulate, invoice OCR, Gateway, proactive push.

## 9. Out of scope (explicit)

Command bar (§3), context-aware (§4), copilot steps (§5), planner (§6), budget mode (§7), smart alternatives (§8 beyond anomaly alternatives), expense categorization (§19), history chat beyond spend intents (§20), why-mode (§21), simulator/what-if (§22-23), cart assistant (§24), smart search NL (§25), product matching embeddings (§26), feedback loop (§27), memory (§29), proactive push (§30), notification center (§31), voice/WhatsApp (§32-33), admin AI analytics (§34), eval framework (§35), Gateway (§36), invoice OCR (§18).
