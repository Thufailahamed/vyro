# RFQ & Supplier Quotation — Gap-Closure Design

Date: 2026-09-10
Status: Draft for review
Owner: RFQ module owner

## Goal

Close remaining gaps in VYRO's RFQ system so every section of the original spec
becomes operational, end-to-end, on top of the existing scaffolding. No schema
break. No new payment/auth/notification architecture. No rewrites of working
code. Surgical additions only.

## Background

Working tree already contains:

- DB: 13 RFQ tables + migration `0025_rfq_system.sql`
- Shared: `RfqStatus`, `QuoteStatus`, `RFQ_TRANSITIONS`, `QUOTE_TRANSITIONS`,
  `RFQ_AUDIT_ACTIONS`, `canTransitionRfq`, `canTransitionQuote`
- Validation: `createRfqSchema`, `updateRfqSchema`, `submitQuoteSchema`,
  `counterOfferSchema`, `rfqMessageSchema`, `awardQuoteSchema`,
  `rfqThresholdsSchema`, `createTemplateSchema`
- API service (`apps/api/src/modules/rfqs/service.ts`, 765 lines):
  create, createFromCart, publish, invite, markViewed, submitQuote,
  updateQuoteDraft, counter, respondCounter, requestRevision, award,
  convertToOrder, cancel, close, reopen, expireDue, compare,
  analyticsBusiness, analyticsSupplier, discoverSuppliers, sendMessage,
  addDocument, saveTemplate, createFromTemplate, aiSummary,
  suggestNegotiation, thresholds, qualifies, computeQuoteTotals,
  resolveOfferForQuoteLine
- Routes (28 endpoints) mounted at `/api/rfqs` in `apps/api/src/index.ts`
- AI intents (`apps/api/src/modules/ai/intents/rfq.ts`):
  `create_rfq`, `compare_quotes` — registered in `catalog.ts`
- `expireDue` invoked from `worker.ts` cron tick
- `purchaseOrders` schema carries `rfqId` + `quoteId`; PO snapshots the
  agreed unit price; `resolveOfferForQuoteLine` enforces the price lock
- Platform settings: `rfqValueThresholdCents` (default 100000),
  `rfqQuantityThreshold` (default 500)
- Notifications: 12 RFQ-specific notification types + categories
- Unit tests (`apps/api/test/rfq.test.ts`): validation + landed cost math +
  state machine
- E2E test (`apps/api/e2e-rfq.ts`): real SQLite, 3 suppliers, partial +
  alternative + tiers, counter, award, PO conversion with price lock
- Web pages:
  `RfqsPage`, `RfqCreatePage` (incl. `from-cart` mode + templates hook),
  `RfqDetailPage` (award + counter + AI summary + messages),
  `RfqComparePage` (server-side landed cost + split optimization),
  `admin/RfqsPage`, `supplier/QuoteRequestsPage`,
  `supplier/SupplierQuoteDetailPage`
- `BulkQuoteCta` mounted in `CartPage.tsx`
- `App.tsx` routes for business + admin + supplier wired

## Gaps to close

1. **Templates UI** — `useRfqTemplates` hook exists; no save / browse / load UI
2. **Document upload UX** — backend accepts `{ r2Key, fileName, mimeType,
   sizeBytes }`; no client-side file picker + R2 upload
3. **Supplier discovery UX** — backend `/suppliers/discover` exists; not wired
4. **AI breadth** — spec calls for invite / negotiate / recommend / status;
   only `create_rfq` + `compare_quotes` exist
5. **Settings admin for thresholds** — column exists in
   `platform_settings`; no admin UI to tune
6. **Recurring RFQ** — `rfqs.recurrenceRule` column exists; no UI; no manual
   scheduler entry
7. **Mobile audit** — 5 main screens (list, create, detail, compare,
   supplier list); responsive polish
8. **Verification** — typecheck, lint, vitest, e2e, build — never run end to
   end on the current tree

## Decisions

| Decision | Choice |
|---|---|
| Scope | Close all gaps + verify |
| Recurring RFQ | Data model + manual "Create next instance" + cron entry; no auto-scheduler |
| Document upload | Reuse `POST /documents/upload-direct` for the file; RFQ endpoint stores metadata only |
| AI intents | Four new intents (invite / negotiate / recommend / status); all grounded |
| Settings admin | Reuse `apps/api/src/modules/settings` module; add `rfq_thresholds` section |
| Mobile audit | Tailwind responsive + key screens only; no full mobile-first rebuild |
| Verification | Full pipeline (tsc + vitest + e2e-rfq + turbo lint + turbo build) |

## Architecture (unchanged from existing)

```
apps/api/src/modules/rfqs/
  routes.ts       — 28 endpoints, mounted at /api/rfqs
  service.ts      — all business logic + state transitions + notifications
  repository.ts   — DB queries
apps/api/src/modules/ai/intents/
  rfq.ts          — create_rfq + compare_quotes   (existing)
  rfqSuggest.ts   — invite_suppliers + negotiate + recommend + status  (new)
apps/web/src/
  pages/Rfq*.tsx              business portal
  supplier/Quote*.tsx         supplier portal
  admin/RfqsPage.tsx          admin portal
  components/BulkQuoteCta.tsx cart + product CTA
  components/RfqTemplatesPanel.tsx       (new)
  components/RfqDocsUpload.tsx          (new)
  components/RfqSupplierDiscovery.tsx   (new)
```

Boundary:

- State machine in `packages/shared/src/constants/rfqStatus.ts`
- Validation in `packages/validation/src/rfq.ts`
- Service owns every write (no write in routes)
- Routes: auth check → parse → service call → JSON

No schema changes.

## State machine (unchanged)

```
RFQ:  draft → open → quoting → quotes_received → under_review → awarded
                                                        → converted_to_order → closed
      branches: cancelled, expired (→ reopen), closed

Quote: draft → submitted → { under_review | negotiating }
                          → { accepted (terminal) | rejected (terminal)
                              | expired → submitted | withdrawn → submitted
                              | superseded (terminal) }
```

Concurrency:

- Award uses `UPDATE rfqs SET status='awarded' WHERE id=? AND status IN
  (open, quoting, quotes_received, under_review)`; the `meta.changes === 0`
  path throws 409.
- `convertToOrder` checks `rfq.convertedPoId IS NULL`; re-entry throws 409.

## New AI intents

| Intent | Slot(s) | Backend call | Output |
|---|---|---|---|
| `rfq_invite_suppliers` | rfqId | `rfqService.discoverSuppliers` | scored supplier list + "Invite selected" action |
| `rfq_negotiate` | rfqId, quoteId, targetTotalCents | `rfqService.suggestNegotiation` | draft message + "Send counter" action |
| `rfq_recommend_quote` | rfqId | `rfqService.aiSummary` | recommendation + bestQuoteId |
| `rfq_status` | rfqId | RFQ row + `/events` | timeline + current status |

All four return a `recommendation_card` component. None of them POST. The web
chat UI shows the card with a confirm button; the user explicitly presses it.

Register in `apps/api/src/modules/ai/intents/catalog.ts` next to existing
`create_rfq` and `compare_quotes`.

## Templates UX

`apps/web/src/components/RfqTemplatesPanel.tsx`:

- Collapsible panel on `RfqCreatePage`
- "Load template" dropdown → `GET /rfqs/templates/list?businessId=…`
- On select: fetch items via `GET /rfqs/templates/:id`, populate form
- "Save as template" button → modal with name + description + optional
  recurrence (`none` / `monthly` / `custom` cron string) → `POST /rfqs/templates`
- "Create next instance" action on each template row → `POST /rfqs/templates/:id/create`
- Recurrence is stored on the template row but no auto-scheduler runs

## Document upload UX

`apps/web/src/components/RfqDocsUpload.tsx`:

- File picker (PDF / PNG / JPEG / WEBP / XLSX / XLS / CSV; ≤ 10 MB)
- Submit: `POST /api/documents/upload-direct` (multipart) → returns `r2Key`
- Then: `POST /api/rfqs/:id/documents` with `{ r2Key, fileName, mimeType,
  sizeBytes, kind }`
- Mount on `RfqDetailPage` (business side) and `SupplierQuoteDetailPage`
  (supplier side, tied to quoteId)

No backend endpoint change.

## Supplier discovery UX

`apps/web/src/components/RfqSupplierDiscovery.tsx`:

- Shown on `RfqDetailPage` when status ∈ {`draft`, `open`, `quoting`,
  `quotes_received`, `under_review`}
- Calls `GET /api/rfqs/:id/suppliers/discover`
- Renders ranked list (supplier name, coverage %, district, "Invite" button)
- Bulk select → `POST /api/rfqs/:id/invite { supplierIds: [...] }`

## Settings admin

`apps/api/src/modules/settings/defaults.ts`: add a `rfq_thresholds` section
with two keys: `valueThresholdCents`, `quantityThreshold`. Read by
`rfqService.thresholds()`. Edit through existing admin settings UI — no new
route.

## Mobile audit

Five screens:

- `RfqsPage` — KPI strip stacks to `grid-cols-2 sm:grid-cols-5`; card grid
  collapses to single column on `<md`
- `RfqCreatePage` — `md:grid-cols-2` blocks become single column on `<md`;
  products grid becomes single column
- `RfqDetailPage` — `lg:grid-cols-3` becomes single column on `<md`; quote
  cards stack; counter form uses full-width inputs
- `RfqComparePage` — `<md`: hide the wide table, render per-quote cards
- `supplier/QuoteRequestsPage` — same KPI / card collapse rules

Touch targets ≥ 44 px on every action button.

## Verification

Run from repo root:

1. `pnpm -F @vyro/api exec tsc --noEmit` — API typecheck
2. `pnpm -F @vyro/web exec tsc --noEmit` — web typecheck
3. `pnpm -F @vyro/api exec vitest run` — RFQ unit tests
4. `pnpm -F @vyro/api exec node_modules/.bin/tsx e2e-rfq.ts` — real-SQLite E2E
5. `pnpm turbo run lint` — workspace lint
6. `pnpm turbo run build` — production build

Fix every failure before declaring done.

## Implementation order

1. Templates panel + service hook — small, isolated
2. Docs upload component — reuses existing endpoint
3. Supplier discovery component
4. Settings admin section
5. Four new AI intents
6. Recurrence UI on templates
7. Mobile audit
8. Verification pipeline (full)

Each step lands as a focused commit. Re-run `vitest` + `e2e-rfq.ts` after
each step to catch regressions early.

## Out of scope (explicit)

- Automated recurring-RFQ scheduler (cron-driven auto-creation)
- Payment-side changes (PO uses existing PayHere flow)
- New notification channels (uses existing dispatcher)
- Multi-language / RTL
- Mobile-first redesign of every screen

## Risks

- **Type drift** between drizzle schema and runtime: covered by tsc + e2e
- **Concurrency regressions** on award / convertToOrder: covered by e2e
- **Threshold default drift** when settings row missing: service already
  falls back to `100000` / `500` — keep that fallback
- **AI intent regressions** in catalog registration: covered by vitest in
  the existing intents suite (re-run after adding)

## Acceptance

- `pnpm turbo run lint` green
- `pnpm turbo run build` green
- `vitest run` green, including RFQ suite
- `tsx e2e-rfq.ts` prints `E2E PASS: RFQ-… -> 3 quotes -> …`
- Manual smoke: create RFQ from cart, supplier submits quote with tier +
  alternative, business counters, supplier accepts, business awards, PO
  created with locked prices
