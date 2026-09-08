# VYRO AI Roadmap — Phase Briefs (Phases 4-7)

> **Companion to:** `2026-09-08-vyro-ai-copilot.md` (Phase 2, executed) and `2026-09-08-vyro-ai-proactive-intel.md` (Phase 3, TDD-ready).
>
> Each phase below is a brief. Full TDD expansion happens in a separate session when the phase is picked for execution. File paths + key interfaces are pinned so each phase can be promoted to a stand-alone `superpowers:writing-plans` plan in one pass.

**Audit baseline (verified):** 20 intents live (`packages/ai/src/intents.ts`), 7 analytics engines (`packages/ai/src/analytics/`), `AiHomePage` + `/api/ai/home` shipped, SSE orchestrator + role allowlist + cost cap + audit in place. Notifications + editorial design system complete. **No viewer DB role** (AI role type only). **No price_history table** (PO-item snapshots only). **No document OCR/R2 pipeline**.

---

## Phase 4 — Smart Search, Product Matching, Feedback Loop, Inline Cart Enhancement

**Goal:** Convert natural-language product search into structured filters; strengthen cross-supplier product matching; capture user feedback for offline evaluation; upgrade cart hints to per-line inline suggestions.

**Builds on:** Phase 2 (page context, cart hints), Phase 3 (WHY, simulator).

### Task 4.1 — NL → filter parser (pure)

**Files:**
- Create: `packages/ai/src/refinement/nlFilters.ts`
- Test: `packages/ai/src/refinement/nlFilters.test.ts`

**Interface:**
```ts
export interface ParsedFilters { query?: string; priceMaxCents?: number; availableWithinDays?: number; categorySlug?: string; brand?: string; supplierName?: string; sort?: 'price_asc' | 'lead_asc' | 'recommended' }
export function parseNlFilters(prompt: string): ParsedFilters
```

Heuristics:
- `under Rs.?\s?([\d,]+)` → priceMaxCents = parseInt(stripCommas) × 100
- `(tomorrow|today|in\s+\d+\s*(?:hour|day|hr|d)s?)` → availableWithinDays
- `(cheap|cheapest|lowest)` → sort='price_asc'
- `(fast|quick|asap|urgent)` → sort='lead_asc'
- `(bakery|restaurant|cafe|kitchen)` → categorySlug mapping table

### Task 4.2 — Search handler consumes filters

**Files:**
- Modify: `apps/api/src/modules/ai/intents/searchProducts.ts`
- Modify: `apps/api/src/modules/ai/intents/drizzleRepos.ts` (add `searchProductsFiltered(filters)`)

Call `parseNlFilters(prompt)` first, strip matched phrases from prompt, pass remaining as `query`. Server applies DB filters; never trust client prices.

### Task 4.3 — Cross-supplier product matching upgrade

**Files:**
- Modify: `apps/api/src/modules/ai/intents/productMatch.ts`
- Test: `apps/api/test/ai/phase4/productMatch.test.ts`

Add token-Jaccard scoring on top of existing exact→fuzzy→clarify. Keep clarification fallback when best score < threshold (e.g. 0.4). Never auto-merge products.

### Task 4.4 — Feedback endpoint

**Files:**
- Create: `apps/api/src/modules/ai/routes.ts` (POST `/api/ai/feedback`)
- Modify: `apps/api/src/modules/ai/audit.ts` (extend metadata with feedback payload)
- Modify: `apps/web/src/ask/AskPage.tsx` + new `FeedbackButtons.tsx` (👍/👎 + reason dropdown)
- Test: `apps/api/test/ai/phase4/feedback.test.ts`

Schema (strict):
```ts
{ requestId: string().min(1).max(80); helpful: boolean; reason?: enum(['wrong_product','wrong_supplier','price_incorrect','not_relevant','other']) }
```

Writes audit row `action='ai.feedback'`. RBAC same as `/ask`. No retraining trigger — feedback is captured for offline eval only.

### Task 4.5 — Inline cart enhancements

**Files:**
- Modify: `apps/api/src/modules/ai/cartHints.ts` (extend `buildCartHints` to also expose per-line suggestions)
- Modify: `apps/web/src/pages/CartPage.tsx` (render suggestion row inside each supplier group, not just top banner)

Per-line: `{ kind:'switch_save', lineId, savingCents, alternativeSupplierName }`. Same dismiss keys; never block checkout.

### Task 4.6 — Smart search UI affordance

**Files:**
- Modify: `apps/web/src/pages/SearchPage.tsx` (parse URL `q=` as NL prompt, run `parseNlFilters` client-side for chip display)
- Test: `apps/web/test/searchNl.test.ts`

### Task 4.7 — Verification

Run `pnpm typecheck && pnpm test && pnpm build`. Smoke: feedback writes audit; search "cheap rice under Rs. 20,000" returns ≤ Rs. 20,000 offers with `price_asc` sort; cart page shows per-line save chips; product match merges obvious dupes, asks when uncertain.

---

## Phase 5 — Document Intelligence (Invoice OCR + Categorization)

**Goal:** Buyers upload invoice images/PDFs → R2 → Queue → OCR → human review → categorized line items → D1. Auto-classify spending into Food/Packaging/Cleaning/Office/Equipment/Other using deterministic category rules; allow correction; use corrections as feedback signal.

**Builds on:** Notifications (for upload status), Phase 4 feedback pattern.

### Task 5.1 — Schema migration

**Files:**
- Create: `packages/db/migrations/0019_documents.sql` (+ `.down.sql`)
- Create: `packages/db/src/schema/invoiceUploads.ts`
- Create: `packages/db/src/schema/invoiceLineItems.ts`
- Create: `packages/db/src/schema/categoryMappings.ts`
- Modify: `packages/db/src/schema/index.ts` (re-export)

Tables:
- `invoice_uploads(id, businessId, supplierId?, status enum('pending'|'processing'|'ready'|'reviewed'|'failed'), r2Key, mimeType, originalFilename, ocrProvider, ocrConfidence, rawExtractionJson, createdAt, reviewedAt)`
- `invoice_line_items(id, uploadId, lineNumber, description, quantity?, unit?, unitPriceCents?, totalCents?, categorySlug?, categorySource enum('rule'|'default'|'manual'), productId?)`
- `category_mappings(id, businessId|null, matchPattern, categorySlug, priority)` — global defaults seeded; per-business overrides win.

All scoped via `eq(invoice_uploads.businessId, businessId)`. RLS-via-route.

### Task 5.2 — R2 + Queue bindings

**Files:**
- Modify: `apps/api/wrangler.toml` (add `[[r2_buckets]] INVOICES`, `[[queues.producers]] INVOICES_QUEUE`, `[[queues.consumers]] INVOICES_QUEUE`)
- Modify: `apps/api/src/env.ts` (`INVOICES: R2Bucket`, `INVOICES_QUEUE: Queue`)

### Task 5.3 — Upload route (presign or direct)

**Files:**
- Create: `apps/api/src/modules/documents/repository.ts`
- Create: `apps/api/src/modules/documents/routes.ts` (POST `/api/documents/upload-url`, POST `/api/documents/upload-direct`, GET `/api/documents`, GET `/api/documents/:id`, POST `/api/documents/:id/review`)
- Test: `apps/api/test/documents/upload.test.ts`

Presign flow: server returns PUT URL + `r2Key`; client uploads; client POSTs `{r2Key}` → server enqueues. Direct flow accepts `multipart/form-data`, writes R2 directly. Owner/manager only.

### Task 5.4 — Queue consumer + OCR worker

**Files:**
- Create: `apps/api/src/queue/invoiceOcr.ts`
- Create: `apps/api/src/modules/documents/ocrWorker.ts`

Default provider: **Cloudflare Workers AI vision model** (text + structure extraction). If unavailable, fall back to deterministic stub returning `{supplier: null, invoiceNumber: null, date: null, items: [], confidence: 0}` — UI shows "Manual entry required" and lets user fill the form. Confidence < 0.6 routes to manual review. All extracted data **never trusted**; review page is mandatory.

### Task 5.5 — Review page UI

**Files:**
- Create: `apps/web/src/pages/InvoiceUploadPage.tsx` (`/invoices/upload`)
- Create: `apps/web/src/pages/InvoiceReviewPage.tsx` (`/invoices/:id/review`)
- Create: `apps/web/src/pages/InvoiceListPage.tsx` (`/invoices`)
- Test: `apps/web/test/invoiceReview.test.tsx`

Editorial form: extract table (editable rows), supplier/invoice number/date headers, category dropdown per line, "Save & categorize" CTA. Use existing Surface/MetricNumber/vyro-kicker.

### Task 5.6 — Categorization rule engine

**Files:**
- Create: `packages/ai/src/analytics/categorize.ts` (`categorizeItems(items, mappings) → itemsWithCategory`)
- Test: `packages/ai/src/analytics/categorize.test.ts`

Pure function. Rules: case-insensitive substring match → categorySlug. First match wins (priority order). Default = 'other'. Confidence surfaced as `categorySource='rule'|'default'`. Manual edits flip to `'manual'` and **insert as new mapping** with `businessId` scope.

### Task 5.7 — Intent: `categorize_expenses`

**Files:**
- Modify: `packages/ai/src/intents.ts` (new intent + allowlist admin/member)
- Create: `apps/api/src/modules/ai/intents/categorizeExpenses.ts`
- Modify: `apps/api/src/modules/ai/intents/drizzleRepos.ts` (`expenseCategoryBreakdown`)
- Modify: `apps/api/src/modules/ai/intents/catalog.ts` (HANDLERS + STAGES)

Triggers: "categorize my spending", "what did I spend on food this month". Emits `spend_summary_card` enriched with category breakdown.

### Task 5.8 — Verification

Run `pnpm typecheck && pnpm test && pnpm build`. Smoke: upload PDF → queue processes → review page shows extracted lines → save → categorisation aggregates appear on `/api/ai/insights`. Migration up + down clean.

---

## Phase 6 — AI Memory + Scheduled Proactive Alerts

**Goal:** Persist AI-relevant user/business preferences; recompute insights daily via cron trigger; emit notifications when thresholds crossed; integrate with existing notification center as a dedicated `source='ai'` channel.

**Builds on:** Notifications module (already wired), Phase 3 home payload, Phase 4 feedback storage.

### Task 6.1 — Schema migration

**Files:**
- Create: `packages/db/migrations/0020_ai_memory.sql`
- Create: `packages/db/src/schema/aiMemory.ts`
- Modify: `packages/db/src/schema/index.ts`

Tables:
- `ai_preferences(id, userId|null, businessId|null, kind enum('preferred_supplier'|'frequently_ordered'|'procurement_default'), key, valueJson, source enum('user'|'inferred'), confidence, createdAt, updatedAt)`
- `ai_insight_events(id, businessId, kind, payloadJson, dispatchedAt, status enum('pending'|'sent'|'dismissed'|'acted'))`

Unique index on `(businessId, kind, key)` for prefs.

### Task 6.2 — Preference service

**Files:**
- Create: `apps/api/src/modules/ai/memory.ts` (`getPreferences`, `setPreference`, `recordCorrection`)
- Test: `apps/api/test/ai/phase6/memory.test.ts`

Distinguish `source='user'` (explicit) vs `'inferred'` (derived from PO history). Inference happens during handler execution; never auto-promoted to user without `confidence ≥ 0.85` AND ≥5 occurrences.

### Task 6.3 — Scheduled insights worker

**Files:**
- Modify: `apps/api/wrangler.toml` (`[triggers] crons = ["17 7 * * *"]`)
- Create: `apps/api/src/scheduled/aiInsights.ts` (default export with `scheduled(event, env, ctx)`)

Logic (deterministic):
1. For each business with active membership, recompute movers/anomalies/reorder/health/savings/concentration via existing repos.
2. Compare to last-sent thresholds: only emit when (a) value exceeds last-seen by >X% OR (b) first occurrence in 7d OR (c) flips from healthy → at-risk.
3. De-duplicate against `ai_insight_events` by `(businessId, kind, payloadHash)`.
4. Fan-out via `notifyBusinessOrg` with `source='ai'` (extend dispatcher — Task 6.4).

Threshold rules table (small, explicit):
- price_drop ≥ 5% over 7d
- price_increase ≥ 10% over 28d
- reorder_due (cadence)
- savings_opportunity (any) ≥ Rs. 5,000
- supplier_signal (delivery/cancellation change ≥ 15%)
- health_score change ≥ 5 points
- concentration_risk enters 'high'

### Task 6.4 — Notification dispatcher extension

**Files:**
- Modify: `apps/api/src/modules/notifications/dispatcher.ts` (`notifyAiInsight(businessId, insight)`)
- Modify: `apps/api/src/modules/notifications/routes.ts` (filter by `source='ai'`)

Insight notification type `'ai.insight'` with payload `{ kind, summary, evidenceUrl }`. Respect user pref `notifyAiInsights` (extend `userSettings` schema with new boolean default true for admin/manager).

### Task 6.5 — User preference UI

**Files:**
- Create: `apps/web/src/pages/AiPreferencesPage.tsx` (`/ai/preferences`)
- Create: `apps/web/src/ai/preferences.tsx` (component)
- Modify: `apps/web/src/ai/AiHomePage.tsx` (link card)
- Test: `apps/web/test/aiPreferences.test.tsx`

List of prefs with source badge (User / Inferred), edit/delete buttons. Cannot edit inferred → must confirm then promote.

### Task 6.6 — AI insights category in NotificationCenter

**Files:**
- Modify: `apps/web/src/pages/NotificationsPage.tsx` (add 'ai' tab + filter chip)
- Modify: `apps/web/src/components/Layout.tsx` (sidebar bell badge counts `source='ai'` separately)

### Task 6.7 — Verification

Smoke: cron fires (manual trigger in test) → insights recorded in `ai_insight_events` → notifications appear in NotificationPage under 'ai' tab. Preference CRUD respects RBAC. Inferred prefs require promotion confirmation.

---

## Phase 7 — Quality Evaluation + Security Hardening

**Goal:** Continuous evaluation of intent accuracy, tool accuracy, hallucination rate, latency, cost. Security test suite covering prompt injection, cross-tenant, tool escalation, malicious descriptions. Model routing refinement driven by eval data.

**Builds on:** Audit logs (already capture provider/model/intent/latency/tokens), Phase 4 feedback, existing security assertions in `guard.ts`.

### Task 7.1 — Golden eval dataset

**Files:**
- Create: `packages/ai/eval/golden.ts` (50+ representative requests across intents)
- Create: `packages/ai/eval/scoring.ts` (intent match + slot match + presence-of-evidence checks)
- Test: `packages/ai/eval/scoring.test.ts`

Each entry: `{ prompt, businessIdFixture, expectedIntent, expectedSlotKeys, expectedEvidenceLabels }`. Drawn from real customer-service seed scenarios; no synthetic nonsense.

### Task 7.2 — Eval runner

**Files:**
- Create: `scripts/eval-ai.ts` (Node entry, runs against local D1 + mock provider)
- Create: `apps/api/src/modules/ai/evalRunner.ts` (in-process runner for CI)
- Modify: `package.json` (`"eval:ai": "tsx scripts/eval-ai.ts"`)

Output: markdown table (intent accuracy %, slot accuracy %, hallucination rate, p50/p95 latency ms, USD cost per 100 requests). Saves to `docs/superpowers/evals/<date>.md`.

### Task 7.3 — Adversarial security suite

**Files:**
- Create: `apps/api/test/ai/security/promptInjection.test.ts`
- Create: `apps/api/test/ai/security/crossTenant.test.ts`
- Create: `apps/api/test/ai/security/toolEscalation.test.ts`
- Create: `apps/api/test/ai/security/unicodeSmuggle.test.ts`
- Create: `apps/api/test/ai/security/maliciousContent.test.ts`

Cases:
- Injection in prompt → bypasses safety assertion → test fails.
- businessId spoofing in payload → server uses session business → test passes only when cross-tenant query is impossible.
- Tool escalation: ask orchestrator to run handler not in allowlist → blocked.
- Malicious product name with control chars → stored escaped, never echoed raw.
- Adversarial Unicode (zero-width, homoglyphs) → `assertNoAdversarialUnicode` catches.
- Excess-length prompt → 400.
- Cross-tenant supplier detail in context → `applyPageContext` rejects unknown name.

### Task 7.4 — Routing refinement

**Files:**
- Modify: `apps/api/src/modules/ai/provider/index.ts` (data-driven thresholds)
- Create: `packages/ai/src/provider/routingPolicy.ts` (pure: `routeFor(intent, promptLen, complexityHint)`)

Replace hardcoded `isComplexIntent` set with policy that reads from latest eval results (which intents score lower on Workers AI → route to Gemini). Default policy mirrors current; CI updates it from eval output.

### Task 7.5 — CI integration

**Files:**
- Create: `.github/workflows/ai-eval.yml` (runs eval + security suite on PR; uploads report)
- Modify: `apps/api/package.json` (`"test:security": "vitest run test/ai/security/"`)

### Task 7.6 — Cost guard refinements

**Files:**
- Modify: `apps/api/src/modules/ai/guard.ts` (`costCap` → per-business daily budget; soft-warn at 80%, hard-stop at 100%)
- Modify: `apps/api/src/modules/ai/cost.ts` (expose `dailyBudgetUsage(businessId)`)

### Task 7.7 — Documentation

**Files:**
- Create: `docs/ai/evaluation.md` (how to read eval report, when to retrain routing)
- Create: `docs/ai/security.md` (threat model + mitigations)

### Task 7.8 — Verification

`pnpm eval:ai` produces report; `pnpm test:security` green; CI workflow runs on PR; eval report committed to `docs/superpowers/evals/`.

---

## Cross-Phase Notes

- **Data ownership:** Every new DB table has explicit `businessId` (or scoped membership) + tenant filter. No `tenantId` shortcut.
- **Audit:** Every state-changing AI endpoint writes an `audit_logs` row with `action` enum (`ai.request` / `ai.feedback` / `ai.preference.write` / `ai.insight.emit`). Slot values never stored.
- **UI:** All new surfaces use the existing editorial system. No new fonts, colours, or motion. `Surface`, `MetricNumber`, `FlowLine`, `vyro-kicker`, `vyro-display`, `num-tabular` are the primitives.
- **Voice/WhatsApp-ready:** All new endpoints are Hono REST returning JSON. No provider-specific logic leaks into handlers. Voice/WhatsApp can call `/api/ai/ask` + `/confirm` directly in a future phase.
- **No retraining:** All model behaviour comes from prompts + deterministic code. No fine-tuning. Eval results tune routing policy only.

## Phase Picking Order (recommended)

1. Execute **Phase 2** (already planned). Brings proactive UX + planner live.
2. Execute **Phase 3** (full TDD plan written). Adds WHY + simulator + home enrichment — biggest user-perceived value for low infra cost.
3. **Phase 4** (brief above). Reuses Phase 2 cart hints; highest "smart" surface area without new infra.
4. **Phase 7** (brief above). Run before Phase 5/6 to harden before adding more surface area.
5. **Phase 6** (brief above). Memory + alerts — needs Phase 3/4 signals.
6. **Phase 5** (brief above). Biggest scope, biggest infra cost. Document OCR is independently valuable; defer until team is comfortable with other phases.
