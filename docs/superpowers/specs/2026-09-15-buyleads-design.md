# Vyro BuyLeads — Design

**Date:** 2026-09-15
**Status:** Draft (awaiting user review)
**Scope:** Quick-win #5 from competitor audit (`2026-09-15-competitor-audit.md`). IndiaMART BuyLeads model. Daily email digest of new RFQs matched to supplier-subscribed categories.

## Goals

- Hand suppliers a daily "inbound leads" feed without per-RFQ buyer outreach.
- Lift supplier-side RFQ-to-quote conversion.
- Zero new buyer-facing surface.

## Non-goals

- Per-supplier lead caps / paid tiers (unlimited free).
- In-app feed (email only).
- Per-RFQ dedup across digests.
- Real-time push (daily batch only).
- Mobile push notifications.
- Buyer opt-in (this is supplier-side).
- Buyer-facing "post your requirement" form change (existing RFQ creation flow unchanged).
- Smart ranking / scoring (recency only).

## Decisions (locked from brainstorm)

| Question | Decision |
| --- | --- |
| Surface | Daily email digest |
| Matching algo | Supplier category subscription (opt-in category IDs) |
| Free tier | Unlimited free for all suppliers |
| Direct invite inclusion | Include all matched RFQs |
| Subscription UX | New settings tab, multi-select + on/off toggle |
| Digest cap | Top 10, ranked by recency |
| Send time | 07:00 Asia/Colombo daily |
| Dedup | None (RFQs repeat across days) |
| Email template | New key `BUYLEADS_DIGEST` in `email_templates` |
| Send mechanism | `NOTIFICATIONS_QUEUE` (async, retryable) |
| Feature flag | `BUYLEADS_ENABLED` 3-phase rollout |
| Tests | Vitest unit + integration |

## Architecture

```
                          ┌────────────────────────────────────┐
cron @ 07:00 Colombo ───►│ buyLeads.runDailyDigest(env)        │
                          │   1. enabledSubscriptions(d1)      │
                          │   2. for each supplier:            │
                          │      a. deriveCategoryIds(d1, rfq) │
                          │         via rfq_items.productId →  │
                          │         products.categoryId        │
                          │      b. intersect w/ sub categoryIds│
                          │      c. top 10 by created_at DESC  │
                          │      d. buildDigestPayload(...)    │
                          │      e. queue.send(email job)      │
                          └────────────────────────────────────┘
                                        │
                                        ▼
                          ┌────────────────────────────────────┐
supplier settings page ─►│ GET/PUT /api/supplier/buyleads/subs │
                          │   body: { enabled, categoryIds }   │
                          │   persists to supplier_buy_lead_   │
                          │   subscriptions                    │
                          └────────────────────────────────────┘
```

### Module boundary

- **NEW** `apps/api/src/modules/buyLeads/` — subscription model + matcher + digest builder + cron handler.
- **NEW** `apps/api/src/modules/buyLeads/routes.ts` — supplier-side subscription CRUD (1 endpoint).
- **MODIFY** `apps/api/src/modules/admin/platform/cronRoutes.ts` (or equivalent) — register `buyLeads.runDailyDigest` as a scheduled job at 07:00 Colombo.
- Reuse `NOTIFICATIONS_QUEUE` for outbound email. Reuse existing `email_templates` table for `BUYLEADS_DIGEST`.
- Web: new settings page (Task 10-11 in plan).

### Files touched

**API:**
- NEW `packages/db/migrations/00XX_buy_leads.sql` — `supplier_buy_lead_subscriptions` table.
- NEW `packages/db/src/schema/buyLeads.ts` — Drizzle table.
- NEW `apps/api/src/modules/buyLeads/repository.ts` — subscriptions + new RFQs query.
- NEW `apps/api/src/modules/buyLeads/matcher.ts` — pure function: subscriptions ∩ new RFQs ∩ top 10.
- NEW `apps/api/src/modules/buyLeads/service.ts` — `runDailyDigest`, `getMySubscriptions`, `updateMySubscriptions`.
- NEW `apps/api/src/modules/buyLeads/routes.ts` — `GET/PUT /api/supplier/buyleads/subs`.
- NEW `apps/api/src/modules/buyLeads/cronHandler.ts` — wired to existing cron infra.
- NEW `apps/api/src/modules/buyLeads/index.ts` — Hono composition.
- MODIFY `apps/api/src/index.ts` — register `buyLeadsRouter`.
- MODIFY `apps/api/src/modules/admin/observability/cronRoutes.ts` (or wherever cron jobs are registered) — add `buyLeads` job.

**Tests:**
- NEW `apps/api/test/buyLeads/matcher.test.ts` — unit tests for category match.
- NEW `apps/api/test/buyLeads/service.test.ts` — subscription CRUD + digest selection.
- NEW `apps/api/test/buyLeads/digest-integration.test.ts` — full cron run end-to-end.

**Web:**
- NEW `apps/web/src/supplier/BuyLeadsSettingsPage.tsx` — settings tab page.
- MODIFY `apps/web/src/supplier/Settings.tsx` or supplier nav — link to BuyLeads settings.

## Data Model

### `supplier_buy_lead_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | UUID |
| `supplier_id` | text NOT NULL FK suppliers | |
| `enabled` | integer NOT NULL DEFAULT 1 | boolean |
| `category_ids_json` | text NOT NULL DEFAULT '[]' | JSON array of category IDs (multi-select) |
| `created_at` | integer NOT NULL | unix epoch ms |
| `updated_at` | integer NOT NULL | |

Unique index: `(supplier_id)`. One row per supplier (overwrite on update).

## API surface

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/api/supplier/buyleads/subs` | session + supplier role | — | `{ enabled, categoryIds: string[] }` |
| PUT | `/api/supplier/buyleads/subs` | session + supplier role | `{ enabled: boolean, categoryIds: string[] }` | `{ enabled, categoryIds }` |

`PUT` upserts a single row per `supplierId` (one subscription record per supplier, not many). `supplierId` taken from `?supplierId=` query param + `requireSupplierRole(ctx, supplierId, ['owner','sales','operations'])` (mirrors `repeatOffers/supplierRoutes.ts`).

## Cron handler

```ts
async function runDailyDigest(env: Env, d1: D1Database): Promise<{ suppliersEmailed: number; rfqsSent: number }> {
  if (!(await isFeatureEnabled(d1, 'BUYLEADS_ENABLED'))) {
    return { suppliersEmailed: 0, rfqsSent: 0 };
  }
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const subs = await repo.enabledSubscriptions(d1);
  let suppliersEmailed = 0;
  let rfqsSent = 0;
  for (const sub of subs) {
    const matches = await matcher.topMatchesForSupplier(d1, sub.supplierId, since, 10);
    if (matches.length === 0) continue;
    const job = await buildDigestEmail(env, sub, matches);
    await env.NOTIFICATIONS_QUEUE.send(job);
    suppliersEmailed++;
    rfqsSent += matches.length;
  }
  return { suppliersEmailed, rfqsSent };
}
```

## Matcher

```ts
async function topMatchesForSupplier(
  d1: D1Database,
  supplierId: string,
  since: number,
  limit: number,
): Promise<RfqMatch[]> {
  const sub = await repo.getSubscription(d1, supplierId);
  if (!sub?.enabled || sub.categoryIds.length === 0) return [];
  return repo.newRfqsMatchingCategories(d1, sub.categoryIds, since, limit);
}
```

`newRfqsMatchingCategories` selects from `rfqs` joined to `rfq_items` + `products`:
- `rfqs.status = 'open'`
- `rfqs.created_at >= since`
- `rfqs.published_at IS NOT NULL`
- At least one of its `rfq_items.productId → products.categoryId` ∈ sub.categoryIds
- Group by rfq, ordered by `rfqs.created_at DESC`, limit 10

NOTE: `rfqs` has no `categoryId` column. Category set is derived from the union of all line items' product categories. An RFQ spanning multiple categories matches all subs in any of those. Acceptable for MVP — buyers typically single-category per RFQ.

## Email payload

Built directly in `runDailyDigest` (cron handler). Subject: `${count} new RFQs matching your categories`. Body: pre-rendered HTML with matched RFQ list + link to `/supplier/rfqs/${id}` for each. Sent via `env.NOTIFICATIONS_QUEUE.send({ kind: 'buyleads_digest', recipientUserId, recipientEmail, subject, body, link })`.

NOTE: existing `email_templates` config section is NOT read by the queue consumer (`queue/notifications.ts` hardcodes supplier-event copy). Plan implements a new queue message `kind: 'buyleads_digest'` in the consumer handler that uses the pre-rendered subject/body from the cron job. Future: generalise consumer to read templates.

## Email template

Subject template: `{{count}} new RFQs matching your categories`. Body: list of matched RFQs with title, category, qty, budget, link to `/supplier/rfqs/{{id}}`. Built in `runDailyDigest` cron handler; passed via queue payload. Admin override deferred (DB template config is not currently read by consumer).

## UI surfaces

### `BuyLeadsSettingsPage`

- Top: master on/off toggle (`enabled`).
- Body: multi-select of all categories (loaded from `/api/categories`). Selected = `categoryIds`.
- "Save" button → `PUT /api/supplier/buyleads/subs`.

Linked from supplier Settings nav.

## Feature flag

`BUYLEADS_ENABLED` in D1 `feature_flags` section. Default `false`.

| Phase | Audience | Trigger |
|---|---|---|
| 1 | Vyro internal team only | Manual flag flip |
| 2 | 10% of suppliers, opt-in via email | Random sample + explicit opt-in |
| 3 | All suppliers | One-shot flip |

Flag gates:
- Cron handler returns no-op if off.
- `GET/PUT /api/supplier/buyleads/subs` returns 404 if off.

## Tests

### Unit (`apps/api/test/buyLeads/matcher.test.ts`)

- `topMatchesForSupplier` returns empty when subscription disabled.
- `topMatchesForSupplier` returns empty when no category IDs.
- `topMatchesForSupplier` excludes RFQs older than 24h.
- `topMatchesForSupplier` excludes RFQs whose category not in subscription.
- `topMatchesForSupplier` returns top 10 ordered by created_at DESC.
- `topMatchesForSupplier` does not filter out RFQs already invited to this supplier (per locked decision).

### Unit (`apps/api/test/buyLeads/service.test.ts`)

- `getMySubscriptions` returns default `{ enabled: false, categoryIds: [] }` when no row exists.
- `updateMySubscriptions` upserts one row per supplierId.
- `runDailyDigest` no-ops when flag off.

### Integration (`apps/api/test/buyLeads/digest-integration.test.ts`)

- Seed: 2 suppliers (supA subscribed to cat1, supB subscribed to cat2); 3 new RFQs (2 in cat1, 1 in cat2).
- Run digest. Expect: supA receives 1 email referencing 2 RFQs; supB receives 1 email referencing 1 RFQ.
- Validate email job payloads (subject, recipient, RFQ list).

## Error handling

- Subscription fetch errors: log, skip supplier, continue.
- Match query errors: log, skip supplier, continue.
- Email queue send errors: retry via queue (existing infra).
- Cron handler never throws — returns metrics even on partial failure.

## Future work

Deferred from MVP per brainstorm:

- Per-supplier lead caps / paid tiers.
- In-app feed (`/supplier/buyleads` tab) listing all matches without email.
- Real-time push when new RFQ matches.
- Smart ranking (buyer history, supplier's win rate, recency of similar quotes).
- Per-RFQ dedup (suppress repeat matches across days).
- A/B test digest subject lines / send times.
- Per-category frequency preference (daily vs weekly).
- Mobile push.
- Buyer-side "request quotes from suppliers subscribed to X" (reverse: buyer picks categories → RFQ fans out to all subs).

## Handoff

After spec approval, invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-09-15-buyleads.md`.

Related:
- Audit: `docs/superpowers/specs/2026-09-15-competitor-audit.md` (quick-win #5).
- Pattern reference: `apps/api/src/modules/repeatOffers/` (just shipped — new module + flag + cron shape).
- Pattern reference: existing `cronRoutes.ts` for job registration.
- Pattern reference: existing `NOTIFICATIONS_QUEUE` for outbound email.
- Pattern reference: `email_templates` table + `/admin/platform/email-templates` UI.
