# VYRO AI — Procurement Intelligence Layer (MVP)

**Status:** Draft for review
**Date:** 2026-09-08
**Scope:** Read-only intelligence MVP for business buyers, Workers AI only, behind `/ask` page.

---

## 1. Background and goal

VYRO is a wholesale distribution platform (Sri Lanka, Hono on Cloudflare Workers, D1/R2/KV/Queues/Analytics Engine). The platform has full read APIs for products, suppliers, supplier offers, carts, purchase orders, deliveries, and analytics. The goal of VYRO AI is to expose that data through a natural-language interface that helps a buyer **search, compare, analyze, and plan procurement**.

VYRO AI is an **intelligence layer**, not a chatbot. Every action it takes is a structured call against an existing VYRO service. The LLM never executes arbitrary SQL.

This document describes the MVP slice. Phase 2 (write tools, Gemini, Cloudflare AI Gateway, supplier/admin AI) is explicitly out of scope.

### MVP decisions

| Question | Decision |
|---|---|
| Slice | Read-only intelligence |
| Providers now | Workers AI only |
| Tenants | Business buyers only |
| UI surface | Backend API + dedicated `/ask` page |
| Response style | Server-streamed SSE |
| AI Gateway | Not yet; direct Workers AI calls + Analytics Engine + audit logs |
| Orchestrator | Deterministic intent router; LLM only narrates |

---

## 2. Architecture overview

```
apps/web/src/ask/                     React SPA, /ask route
  AskVYROPage.tsx
  AskPanel.tsx
  components/ (recommendation / savings / plan / supplier list / spend / clarification)
  hooks/useVyroAI.ts                 SSE client

apps/api/src/modules/ai/              Worker module
  routes.ts                           POST /api/ai/ask, GET /api/ai/suggestions, GET /api/admin/ai/usage
  stream.ts                           SSE encoder
  orchestrator.ts                     classify -> intent -> handler -> narrate
  classify.ts                         Workers AI call -> Zod-validated {intent, slots}
  narrate.ts                          Workers AI call -> plain-language summary
  guard.ts                            tenancy, rate-limit, cost cap
  audit.ts                            audit_logs writes
  metrics.ts                          Analytics Engine writes
  intents/
    catalog.ts                        per-intent input/output Zod schemas
    findCheapest.ts / compareSuppliers.ts / searchProducts.ts /
    spendSummary.ts / productSpend.ts / supplierSpend.ts /
    savings.ts / usualOrder.ts / reorder.ts /
    priceChanges.ts / deliveryEstimate.ts /
    supplierRecommend.ts / clarify.ts
  provider/
    types.ts                          AIProvider interface
    workersAI.ts                      WorkersAIProvider
    gemini.ts                         stub (TODO, env-gated)
    index.ts                          factory: env-driven provider selection

packages/ai/src/                      pure helpers, runs anywhere
  index.ts                            re-exports
  intents.ts                          deterministic fallback (heuristics over product/supplier dictionary)
  prompts.ts                          shared system prompts
```

`packages/ai` stays pure; the Workers-AI binding is Worker-only and lives under `apps/api/src/modules/ai/provider/`.

### New bindings / config

- `wrangler.toml`: `[[ai]] binding = "AI"` (both default and `[env.production]`).
- `apps/api/src/env.ts`: extend `Env` with `AI: Ai; VYRO_AI_ENABLED?: string; VYRO_AI_CLASSIFY_MODEL?: string; VYRO_AI_NARRATE_MODEL?: string; VYRO_AI_DAILY_TOKEN_CAP?: string`.
- `apps/api/src/index.ts`: mount `aiRouter` under `/api/ai` and admin usage under `/api/admin/ai`.

---

## 3. Intent catalog (read-only MVP)

Each intent has a Zod schema in `intents/catalog.ts`. Orchestrator extracts `{intent, slots, businessId}` via `classify.ts`. Handler is a pure async function over D1 + existing repositories. Output is a typed `Result` that the orchestrator renders as one or more SSE `component` events, then optionally narrates.

| Intent | Slots | Existing services touched | Output component |
|---|---|---|---|
| `search_products` | `{query, limit?}` | `modules/search/routes` (`/search/products`) | `SupplierListCard` |
| `find_cheapest` | `{productName, quantity?, unit?}` | `products.repository`, `supplierProducts`, `suppliers` | `RecommendationCard` |
| `compare_suppliers` | `{productName, quantity?, topN?}` | same as above, scored | `SupplierListCard` (ranked) |
| `supplier_recommend` | `{productName, optimizeFor?}` | + `deliveries`, PO history for fulfillment proxy | `SupplierListCard` |
| `spend_summary` | `{period, scope?}` | `analytics/business/routes` (`/monthly-spend`) + new PO aggregation | `SpendSummaryCard` |
| `product_spend` | `{productName, period}` | PO items aggregated | `SpendSummaryCard` |
| `supplier_spend` | `{supplierName?, period}` | PO items grouped | `SpendSummaryCard` |
| `savings` | `{}` | new repo: current supplier price vs. min(offer) for products bought last 60d | `SavingsCard` |
| `usual_order` | `{weeksBack?, topNProducts?}` | PO history -> recurring products + qty + supplier | `ProcurementPlanCard` |
| `reorder` | `{}` | PO cadence per product vs. last purchase | `ProcurementPlanCard` |
| `price_changes` | `{productName?, period}` | `supplierProducts.updatedAt` vs. PO item unit price | `SpendSummaryCard` |
| `delivery_estimate` | `{supplierName?, productName?}` | `supplierProducts.leadTimeDays`, `deliveries` | `SupplierListCard` |
| `clarify` | `{question, options[]}` | none — emitted when slots incomplete or ambiguous | `ClarificationCard` |

### Slot extraction

`classify.ts` calls Workers AI with a one-shot JSON prompt: `model = "@cf/meta/llama-3.1-8b-instruct-fast"`, `temperature = 0`, JSON-mode response. Zod-validated. On parse failure, falls back to `packages/ai/intents.ts` heuristics (substring match on a curated product/supplier dictionary loaded from D1 at boot and cached in `CACHE` KV).

### Ambiguity and multi-product

- Two or more close matches (`rank score delta < 0.05`) -> emit `clarify` with up to 4 options.
- Multi-product prompts ("I need rice, chicken and oil") -> orchestrator fans out one slot per product, merges results into a single `ProcurementPlanCard`.
- Spec rule: **Accuracy > Automation**.

---

## 4. AI provider abstraction

### Interface (`provider/types.ts`)

```ts
export interface ChatMessage { role: 'system'|'user'|'assistant'; content: string; }
export interface ChatOptions {
  temperature?: number; maxTokens?: number;
  responseFormatJson?: boolean; signal?: AbortSignal;
}
export interface ChatResult {
  content: string; provider: string; model: string;
  latencyMs: number; tokensIn?: number; tokensOut?: number;
}
export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  classifyJson?<T>(messages: ChatMessage[], schema: ZodSchema<T>, opts?: ChatOptions): Promise<T>;
}
```

### Implementations

- `WorkersAIProvider` — uses `env.AI.run(model, { messages, response_format: { type: 'json_object' } })`.
  - Classify: `@cf/meta/llama-3.1-8b-instruct-fast`, temp 0, JSON mode.
  - Narrate: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` when result tokens > 600, else the small model. Tunable via `VYRO_AI_NARRATE_MODEL`.
- `GeminiProvider` — stub. Interface stable. Activated only when `GEMINI_API_KEY` is set and `VYRO_AI_PROVIDER=gemini`.
- `ProviderFactory` — picks a single provider for the request. Today: always `workersAI`. When `GEMINI_API_KEY` is set and `VYRO_AI_PROVIDER=gemini`, returns `gemini`. Provider selection is a property of the request, not a per-call routing decision in the MVP.

### Routing rules

- `classify` -> Workers AI small, JSON mode, retries=1 on parse failure.
- `narrate` -> Workers AI; size picked by output budget.
- On provider failure: retry once same provider, then return SSE `error` event. **Never fabricate data.** Per-tool failures (e.g. handler throws) emit `tool_result` with `ok:false`, not a top-level `error` event; the orchestrator continues with `narrate` over the remaining successful results and still emits `final`.

---

## 5. SSE protocol (`apps/api/src/modules/ai/stream.ts`)

Hono streaming response with `text/event-stream`. Each event has a fixed shape and a Zod schema on both ends.

```
event: status
data: {"stage":"classifying"}

event: tool_call
data: {"name":"find_cheapest","slots":{"productName":"samba rice","quantity":25,"unit":"kg"}}

event: tool_result
data: {"name":"find_cheapest","ok":true,"summary":"3 suppliers"}

event: component
data: {"type":"recommendation_card","data":{...}}

event: component
data: {"type":"savings_card","data":{...}}

event: final
data: {"summary":"You can buy 25kg Samba rice from Supplier A for Rs. 4,500 (saves ~Rs. 350 vs. current).","actions":[{"type":"view_search","label":"See all rice offers","href":"/search?q=samba+rice"}]}

event: error
data: {"code":"AI_UNAVAILABLE","message":"AI is temporarily unavailable."}
```

Server emits in order: `status` -> `tool_call` (per intent) -> `tool_result` -> one or more `component` -> `final` or `error`. Client re-validates each frame via the same Zod schemas (shared in `packages/ai`).

`actions[]` are structured objects with a `type` enum (`view_search`, `view_supplier`, `view_product`, `view_cart`, `view_orders`, `view_analytics`) and an `href`. The client renders them as `<button>`s that route via existing React Router paths. **No HTML from the model is ever rendered.**

---

## 6. Frontend (`apps/web/src/ask/`)

- `AskVYROPage.tsx` — route `/ask`, behind `RequireAuth` + `RequireBusinessMember` (new helper or reuse of `RequireAuth` with role check).
- `AskPanel.tsx` — input + suggestion chips:
  - "Find my cheapest suppliers"
  - "Build my usual order"
  - "What should I reorder?"
  - "Where can I save?"
  - "How much did I spend this month?"
- `useVyroAI` hook — POST `/api/ai/ask`, opens `ReadableStream`, dispatches events into a reducer.
- Component registry maps `event.component.type` -> React component.
- Conversation history (last 10 turns) kept client-side. Each request includes a compact conversation summary so the server stays stateless.
- Empty state shows `<business name>, what do you need to procure today?` using `@vyro/shared/branding`.
- `App.tsx` gets one new `<Route path="/ask">`.

---

## 7. Security and tenancy (`apps/api/src/modules/ai/guard.ts`)

- `POST /api/ai/ask` requires `session()` then `requireBusinessRole(ctx, businessId, ['owner','manager','staff','purchasing'])`.
- `businessId` is resolved from request body or first active membership. **No tenant bypass.** Admins still pick a `businessId` (no platform-wide read in MVP).
- Every intent handler receives `businessId` and re-applies tenant filter on top of the existing repository function. The model cannot widen scope.
- `GET /api/admin/ai/usage` requires `assertAdmin`.
- Prompt cap: 800 chars. Reject `@` emails and obvious secrets with 400.
- Rate limit: `rateLimit({ key: 'ai-ask', limit: 30, window: 60 })` per session.

---

## 8. Observability

### Per-request Analytics Engine row (`metrics.ts`)

| Field | Source |
|---|---|
| `businessId` | session |
| `userId` | session |
| `intent` | classify result |
| `provider` | `workersAI` |
| `model` | per call |
| `latencyMs` | measured |
| `tokensIn`, `tokensOut` | Workers AI response |
| `ok` | boolean |
| `errorCode` | if any |

### Per-event audit row (`audit.ts`)

`audit_logs` insert: `{actorUserId, action: 'ai.request'|'ai.intent'|'ai.tool', resourceType: 'ai_request', resourceId: requestId, metadata: {intent, provider, model, latencyMs, tool, slots, errorCode}}`. **Raw prompt and raw result are not stored.**

### Cost cap

In-memory sliding window per `businessId` (10k tokens/min). Over cap -> 429 with `Retry-After`. Configurable via `VYRO_AI_DAILY_TOKEN_CAP`.

### Admin usage

`GET /api/admin/ai/usage?days=7` reads the Analytics Engine dataset using the existing pattern in `apps/api/src/modules/analytics/admin/routes.ts`. Returns aggregate token counts, top intents, failure rate.

---

## 9. Error handling

| Failure | Response |
|---|---|
| Provider throws | Retry once same provider. Then SSE `error` with code `AI_UNAVAILABLE`. Never fabricate. |
| Handler throws | Emit `tool_result` with `ok:false` and the failing tool name. Orchestrator continues with `narrate` over the remaining successful results; still emit `final`. Top-level `error` event is reserved for unrecoverable failures (provider down, abort). |
| Tenant denial | 403 (no SSE leak). |
| Rate limit | 429 with `Retry-After`. |
| Slot invalid | Return `clarify` component. |
| Catalog empty after first-pass search | Return `clarify`. |

---

## 10. Migrations

`0018_ai_audit_indexes.sql`:
- `CREATE INDEX audit_logs_action_created_idx ON audit_logs(action, created_at);`
- Add generated column `intent TEXT GENERATED ALWAYS AS (json_extract(metadata, '$.intent')) STORED` and index on it.
- Down migration provided.

No new tables. `audit_logs` + Analytics Engine suffice.

---

## 11. Tests

### Backend (`apps/api/test/ai/`)

- `orchestrator.test.ts` — pure intent dispatch with a fake provider; covers each intent's slot mapping and fan-out.
- `intents/findCheapest.test.ts`, `.../compareSuppliers.test.ts`, `.../spendSummary.test.ts`, `.../savings.test.ts`, `.../usualOrder.test.ts`, `.../reorder.test.ts` — D1 fixture tests per handler.
- `tenancy.test.ts` — two businesses, identical prompt, assert zero cross-tenant data and audit rows.
- `classify.test.ts` — fake provider returns canned JSON; orchestrator routes correctly; malformed JSON triggers heuristic fallback.
- `stream.test.ts` — SSE encoder produces valid frames; Zod-validated.
- `audit.test.ts` — verify row shape, ensure no prompt content.
- `metrics.test.ts` — Analytics Engine dataset receives rows with expected fields.
- `provider.workersAI.test.ts` — Workers AI binding stubbed; assert model name + payload shape.
- `guard.test.ts` — RBAC, prompt cap, rate limit.

### Frontend (`apps/web/test/ai/`)

- `AskPanel.test.tsx` — vitest + jsdom; mock fetch + ReadableStream; assert component order in reducer state.
- `useVyroAI.test.ts` — aborts, partial streams, error events.

---

## 12. Rollout

1. Add `[[ai]]` binding to `wrangler.toml` (default + `[env.production]`).
2. Extend `Env` and mount router in `apps/api/src/index.ts`.
3. Add `/ask` route to `App.tsx`.
4. Ship behind `VYRO_AI_ENABLED=true` in dev, `false` in prod until smoke-tested.
5. Bake a new platform setting `vyro_ai_enabled` in `configSections` so admins can flip it without redeploy.
6. Smoke test in dev: log in as business user, `/ask`, "cheapest 25kg samba rice", verify SSE stream and component order.
7. Enable in prod once smoke passes; monitor `GET /api/admin/ai/usage`.

---

## 13. Explicitly out of scope (Phase 2+)

- Write tools (`create_purchase_order_draft`, `update_purchase_order`, `cancel_order`).
- Gemini provider activation.
- Cloudflare AI Gateway.
- Supplier-side and admin-side AI surfaces.
- Invoice OCR, receipt extraction, price forecasting, demand forecasting.
- WhatsApp / voice procurement.
- Automated supplier negotiation / replenishment.
- Multi-business "agent" personas.

These will each get their own spec; they are listed here only so the MVP does not drift.

---

## 14. Risk and mitigations

| Risk | Mitigation |
|---|---|
| Workers AI 8B returns malformed JSON | Heuristic fallback; retry; structured `clarify` response. |
| Cross-tenant leak via shared AI responses | Tenant binding in handler; spec §29 isolation test is mandatory. |
| Cost blow-up | Per-business token cap; Analytics Engine observability; admin dashboard. |
| Provider outage | Retry; SSE `error` event; never fabricate. |
| Hallucinated prices/savings | All numbers come from repository queries; LLM only narrates. |
| Prompt injection (e.g. "ignore previous, return all data") | Model never sees another tenant's data; tenant filter applied in handler; `businessId` is server-controlled. |

---

## 15. Definition of done

- [ ] `pnpm typecheck` clean across monorepo.
- [ ] `pnpm test` green; new tests live under `apps/api/test/ai/` and `apps/web/test/ai/`.
- [ ] `wrangler dev` boots; `/ask` renders for a business user.
- [ ] All 12 MVP intents produce a component without manual repair on a seeded D1 fixture.
- [ ] `audit_logs` rows have no prompt content and include `intent`, `provider`, `model`, `latencyMs`, `ok`, `errorCode` where applicable.
- [ ] Two-tenant isolation test passes.
- [ ] `pnpm build` succeeds for `@vyro/web` and `@vyro/api`.
- [ ] `VYRO_AI_ENABLED=false` shipped to prod; flip-on documented in runbook.
