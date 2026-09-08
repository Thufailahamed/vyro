# VYRO AI Deep Refinement & Production Hardening

**Date:** 2026-09-08
**Status:** Approved
**Approach:** 4-PR phased rollout, backward-compatible additive changes

## Context

The first-pass VYRO AI implementation ships a 13-intent structured orchestrator over real Drizzle DB queries, a working Gemini + Workers AI router, custom KV rate limiter, prompt-injection defenses, tenant isolation tests, premium UI components with source citations, and a deterministic-by-default narration pipeline. Per-request LLM cost is already minimised (exactly one classify call, deterministic handlers, deterministic narration).

This refinement moves VYRO AI from "AI feature implemented" to "VYRO's intelligence layer" by closing 10 remaining gaps:

1. Classifier-issued intent names execute unchecked → role-based intent allowlist
2. Provider token counts are captured but dropped → propagated to audit + metrics + admin endpoint
3. `tool_call` / `tool_result` SSE frames parsed but unrendered → tool activity timeline
4. Recommendations → action chips → cart, no confirmation step → confirmation panel + confirm endpoint
5. Test coverage gaps (malicious provider, unicode injection, scenarios 7-12, tenancy on repos)
6. Hardcoded `/suggestions` (5 strings) → real personalised suggestions
7. Dead code (`stub` in `catalog.ts:33`), unused `as any` in `/usage`
8. Personalisation surface — cadence hints not surfaced
9. UI parity gap — AskPage weaker than OrdersPage/NotificationsPage header pattern
10. Observability gaps — admin endpoint missing token totals, p95, tool failure rate

## Scope

### PR0 — Security + Cost Realism + Dead Code (foundation)

**Files touched:**
- `apps/api/src/modules/ai/intents/catalog.ts` — delete unused `stub` constant
- `apps/api/src/modules/ai/classify.ts` — return `{ result, tokensIn, tokensOut }` instead of bare `ClassifyResult`
- `apps/api/src/modules/ai/orchestrator.ts` — propagate tokens to `recordAiMetric` + `writeAiAudit`; add intent allowlist gate
- `apps/api/src/modules/ai/guard.ts` — `costCap()` accepts actual `tokensIn + tokensOut` (defaults to flat 200 when unknown); add `INTENT_FORBIDDEN` error code
- `apps/api/src/modules/ai/audit.ts` — `buildAiAuditRow` accepts `tokensIn/tokensOut`
- `apps/api/src/modules/ai/metrics.ts` — already accepts both fields; verify shape
- `apps/api/src/modules/ai/routes.ts` — `/suggestions` returns real data from `AiRepos` (most-purchased products, top intents 30d); `/usage` aggregates add `tokenTotals`
- `packages/ai/src/intents.ts` — export `INTENT_ALLOWLIST_BY_ROLE` map; `writeableIntents` for members/admins; `readOnlyIntents` for viewers
- `apps/api/test/ai/intent-allowlist.test.ts` — new
- `apps/api/test/ai/classify.tokens.test.ts` — new (verifies propagation)
- `apps/api/test/ai/scenarios.test.ts` — extend with malicious-provider case

**Acceptance:**
- Dead `stub` removed
- Tokens in audit row non-null when provider reports them
- `/api/ai/ask` with viewer role + `intents.savings` body → 403 `INTENT_FORBIDDEN`
- `/api/ai/suggestions` returns user's top 3 purchased products + 3 most-asked intents

### PR1 — Conversation UX (the meat)

**Files touched:**
- `apps/web/src/ask/hooks/useVyroAI.ts` — render `tool_call` as timeline entries; render `tool_result` as inline summaries
- `apps/web/src/ask/components/index.tsx` — new `ToolTimeline` component; new `ConfirmationPanel` component; new `OrderPreviewCard`
- `apps/web/src/ask/AskPage.tsx` — wire `ConfirmationPanel` (Edit / Confirm / Cancel); tool timeline above components
- `apps/api/src/modules/ai/orchestrator.ts` — emit `confirmation_card` when user confirms a recommendation; route to `POST /api/ai/confirm`
- `apps/api/src/modules/ai/routes.ts` — new `POST /api/ai/confirm` (RBAC-gated, idempotency-key); calls existing order draft pipeline
- `apps/api/src/modules/ai/intents/usualOrder.ts` — surface cadence hint from `listRecentPoItems`
- `apps/api/src/modules/ai/intents/catalog.ts` — new `confirm_recommendation` intent (write-action, admin/member only)
- `packages/ai/src/intents.ts` — add `confirm_recommendation` to enum + allowlist; add `applyConversationContext` rule for "the cheapest one" → previous turn recommendation
- `packages/ai/src/prompts.ts` — clarify prompt: confirmation flow rules
- `apps/api/test/ai/confirmation.test.ts` — new
- `apps/api/test/ai/refinement.test.ts` — extend with cadence hint assertion
- `apps/web/src/ask/components/__tests__/ToolTimeline.test.tsx` — new

**Acceptance:**
- Tool timeline renders 3-5 chips above components
- `confirmation_card` shows itemised preview with Edit/Confirm/Cancel
- `POST /api/ai/confirm` with valid intent + idempotency key → returns PO ref + new `confirmation_card` with confirmation state
- Cadence hint visible in `usual_order` output when ≥3 PO items exist

### PR2 — Observability + Test Coverage (production readiness)

**Files touched:**
- `apps/api/src/modules/ai/routes.ts` — `GET /api/admin/ai/usage` adds `tokenTotals { byProvider, byDay }`, `estimatedCostCents { byProvider, byDay }`, `p95LatencyMs`, `toolFailureRate`
- `apps/api/src/env.ts` — add `VYRO_AI_GEMINI_PRICE_INPUT_PER_1K`, `VYRO_AI_GEMINI_PRICE_OUTPUT_PER_1K`, `VYRO_AI_WORKERS_AI_PRICE_INPUT_PER_1K`, `VYRO_AI_WORKERS_AI_PRICE_OUTPUT_PER_1K`
- `apps/api/src/modules/ai/cost.ts` — new (price × token math)
- `apps/api/test/ai/scenarios.test.ts` — extend from 6 to 12 cases
- `apps/api/test/ai/injection.unicode.test.ts` — new
- `apps/api/test/ai/provider.malicious.test.ts` — new
- `apps/api/test/ai/tenancy.toolResult.test.ts` — new
- `apps/api/test/ai/admin.usage.test.ts` — new (token totals, cost math)

**Acceptance:**
- `/api/admin/ai/usage` response contains `tokenTotals` and `estimatedCostCents`
- 12 scenarios pass (covers all 30-objective scenarios from the brief)
- Unicode/homoglyph injection attempts blocked
- Provider returning out-of-schema JSON rejected with `INVALID_RESPONSE`

### PR3 — UI Polish + Admin (last)

**Files touched:**
- `apps/web/src/ask/AskPage.tsx` — adopt `<PageHeader kicker title sub actions />` pattern from `OrdersPage`; add 4-tile metric grid (Today / Avg cost / Success / Latency)
- `apps/web/src/ask/components/index.tsx` — per-turn metadata footer (timestamp + provider/model + intent); copy/regenerate buttons
- `apps/web/src/ask/hooks/useVyroAI.ts` — add `regenerate(turnId)` action
- `apps/web/src/admin/UsagePage.tsx` (or new) — render token totals + cost chart
- Empty state: numbered "How Ask works" 01/02/03 bone tiles mirroring `OrdersPage`

**Acceptance:**
- AskPage header parity with OrdersPage/NotificationsPage
- Per-turn metadata visible
- Regenerate button reissues the same prompt
- Admin sees token totals + estimated cost

## Architecture invariants (preserved across all PRs)

1. One LLM call per request (classify only)
2. Deterministic narration is default; LLM narration opt-in via env
3. Zod-`.strict()` schemas — no silent extras
4. Real Drizzle repos over D1 — no mocks in production
5. AI provider abstraction (`AIProvider` interface)
6. Tenant isolation enforced at SQL layer (`eq(purchaseOrders.businessId, businessId)`)
7. Custom KV rate limiter (already production-grade)

## Out of scope (YAGNI)

- Token-by-token streamed LLM prose (would re-enable LLM cost path)
- Per-user tool allowlist (role-based is sufficient)
- Inventory integration (explicit "not consulted" disclaimer stays for MVP)
- Voice input, file upload (not in 30-objective brief)
- Cross-tenant isolation on `mockRepos` itself (covered by dedicated tenancy tests already)

## Backward compatibility

- `/api/ai/ask` response gains optional `confirmation` field
- `/api/admin/ai/usage` gains optional `tokenTotals`, `estimatedCostCents`, `p95LatencyMs`, `toolFailureRate`
- New `/api/ai/confirm` endpoint is additive
- Schema additions only; no field removals or renames
- `/api/ai/suggestions` shape changes from `{ suggestions: string[] }` to `{ prompts: PromptSeed[] }` — frontend migrated in same PR

## Risks

- **PR0 cost cap behaviour change:** Default flat-200 stays when `tokensIn/tokensOut` are `undefined`; tests assert both paths
- **PR1 confirmation flow:** New write endpoint. Idempotency key required; replays return same PO ref. RBAC: admin or member only
- **PR2 admin endpoint:** Aggregation cost — `audit_logs` may grow large. Bound by `days` query param (default 7, max 90)
- **PR3 regeneration:** Could trigger unexpected spend. Honour `costCap`; show "regenerate" only when under cap