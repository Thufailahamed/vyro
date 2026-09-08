# VYRO AI — Operations Runbook

> Owner: Platform Engineering
> Status: MVP, read-only intelligence
> Spec: `docs/superpowers/specs/2026-09-08-vyro-ai-design.md`
> Plan: `docs/superpowers/plans/2026-09-08-vyro-ai.md`

## What it is
Procurement intelligence for business buyers on VYRO. Buyers ask natural-language questions; VYRO AI classifies the intent, calls existing procurement services via structured adapters, and returns structured components (recommendation cards, savings cards, supplier lists, spend summaries, procurement plans). LLM is the classifier and narrator only — it never touches the database directly.

## Activation

1. Ensure D1 migration `0018_ai_audit_indexes.sql` has been applied (`intent` column on `audit_logs`).
2. Bind `AI` in `wrangler.toml` (Workers AI binding).
3. Set env vars:
   - `VYRO_AI_ENABLED=true` (stays `false` in `env.production` until smoke test passes)
   - `VYRO_AI_CLASSIFY_MODEL=@cf/meta/llama-3.1-8b-instruct-fast`
   - `VYRO_AI_NARRATE_MODEL=@cf/meta/llama-3.3-70b-instruct-fp8-fast`
   - `VYRO_AI_DAILY_TOKEN_CAP=200000`
4. Bind `METRICS` (Analytics Engine) and `CACHE` (KV) for production observability.

## Smoke test (production)

```bash
# 1. Confirm enabled
curl -sS -X POST https://api.vyro.lk/api/ai/ask \
  -H 'cookie: vyro_session=...' \
  -H 'content-type: application/json' \
  -d '{"prompt":"cheapest samba rice"}'
# Expect: SSE stream ending in event: final + recommendation_card

# 2. Admin usage endpoint
curl -sS https://api.vyro.lk/api/admin/ai/usage?days=1 \
  -H 'cookie: vyro_admin=...'
# Expect: { totalRequests, avgLatencyMs, byIntent: [...] }

# 3. Confirm /ask page loads
curl -sS -o /dev/null -w '%{http_code}\n' https://vyro.lk/ask
```

## Cost control

- **Per-minute cap** (per business): derived from `VYRO_AI_DAILY_TOKEN_CAP / 1440`, capped at 10,000/min. Returns `RATE_LIMITED` SSE error if exceeded.
- **Prompt safety**: 800-char max, rejects strings containing email-shaped text (PII heuristic).
- **Audit table**: never stores raw prompt or result content. Stores intent, provider, model, latency, OK, slot keys only.

## Observability

- **Audit log**: `audit_logs.action = 'ai.request'`. Aggregate via `GET /api/admin/ai/usage`.
- **Metrics** (Analytics Engine): `recordAiMetric` writes one row per request. Never throws.
- **Structured errors**: SSE `event: error` with `{code, message}` from the union: `AI_DISABLED | PROMPT_TOO_LONG | INVALID_PROMPT | AI_UNAVAILABLE | HANDLER_FAILED | RATE_LIMITED | INTERNAL`.

## Architecture

```
POST /api/ai/ask
  ↓ session + rate limit (30/min/key)
  ↓ loadDictionary(CACHE) ← 1h KV cache
  ↓ orchestrate()
      ├─ assertPromptSafe (800 chars, no emails)
      ├─ costCap (sliding 60s window per businessId)
      ├─ classify(provider, prompt)        [CLASSIFY model, JSON mode]
      │    └─ fallback: heuristicClassify
      ├─ HANDLERS[intent](ctx, drizzleRepos(env))
      │    └─ Drizzle queries only — never raw SQL, never model SQL
      ├─ narrate(provider, result)         [NARRATE model]
      └─ writeAiAudit(env, row)            [structured only]
         recordAiMetric(env, row)          [never throws]
  ↓ SSE stream: status → tool_call → tool_result → component[] → final
```

## Rollback

1. Set `VYRO_AI_ENABLED=false` in production env. All `/api/ai/ask` calls return 503 `AI_DISABLED`.
2. Existing audit rows remain; new rows stop accumulating.
3. Frontend `/ask` page remains reachable but `useVyroAI.send` returns the AI_DISABLED error envelope.

## Intents

13 intents wired: `search_products | find_cheapest | compare_suppliers | supplier_recommend | spend_summary | product_spend | supplier_spend | savings | usual_order | reorder | price_changes | delivery_estimate | clarify`.

All handlers live in `apps/api/src/modules/ai/intents/` and consume `AiRepos` (adapter pattern). Drizzle production impl at `drizzleRepos.ts`; test mocks at `apps/api/test/ai/helpers/aiFixture.ts`.

## Tenancy

Every handler scopes queries by `businessId`. Cross-tenant isolation verified by `apps/api/test/ai/tenancy.test.ts` (business A cannot see business B's spend totals).

## Adding a new intent

1. Add to `INTENT_NAMES` in `packages/ai/src/schemas.ts`.
2. Add a regex branch in `packages/ai/src/intents.ts` `heuristicClassify`.
3. Implement `apps/api/src/modules/ai/intents/<name>.ts` exporting `(ctx, repos) => HandlerResult`.
4. Register in `catalog.ts` `HANDLERS` map.
5. Add a test in `apps/api/test/ai/intents/<name>.test.ts` using `mockRepos`.

## Files

- API: `apps/api/src/modules/ai/`
- Shared schemas/prompts: `packages/ai/`
- Frontend: `apps/web/src/ask/`
- Tests: `apps/api/test/ai/`, `apps/web/test/aiParser.test.ts`
