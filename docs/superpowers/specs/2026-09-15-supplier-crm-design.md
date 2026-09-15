# Vyro Supplier Lead Manager / CRM — Design

**Date:** 2026-09-15
**Status:** Draft (awaiting user review)
**Scope:** First growth-initiative spec from the competitor audit (audit `2026-09-15-competitor-audit.md`, quick-win #2). Supplier-side Lead Manager / CRM for inbound RFQ invitations. Other roadmap items (Lens, Repeat Offer, BuyLeads, reviews, trust badges, promotions, saved carts, subscriptions, recommendations, sponsored, WhatsApp commerce) are tracked separately and out of scope.

## Goals

- Give suppliers a single inbox + workflow for every RFQ they were invited to.
- Track conversion (invitation → quote → order → order value) automatically without supplier self-report.
- Lift supplier-side conversion rate on Vyro by reducing lead decay (untouched invitations).

## Non-goals

- Multi-tag per lead or supplier-defined custom tags.
- Multi-user supplier teams (single user per supplier at MVP).
- Bulk actions (bulk-tag, bulk-status).
- AI-suggested tag.
- Webhook notifications on conversion milestones.
- CRM for buyer-initiated direct messages (separate feature).
- Full-text search across RFQ body + notes.
- Cross-supplier aggregation of the same RFQ (per-supplier view only).

## Decisions (locked from brainstorm)

| Question | Decision |
| --- | --- |
| Inbox scope | RFQ invitations only (rfq_suppliers rows where the supplier was invited). No quote replies, no buyer messages. |
| Unit of CRM | One row per (rfq, supplier) — i.e. `rfq_suppliers` table, not `rfqs` |
| Tags | Fixed 3-value enum: Hot / Warm / Cold |
| Notes | Free-text per lead, ≤1000 chars, append-only with timestamps |
| Conversion | Auto-tracked from `supplier_quotes.status` (any 'submitted') + `purchaseOrders` with matching rfqId + supplierId |
| Multi-user | Single user per supplier at MVP |
| Inbox filters | Tag + conversion_status + date range (server-side) |
| Module placement | Extend `rfqs/` module (no new module) |
| Data model | Add columns on `rfq_suppliers` + new `rfq_supplier_notes` table |
| Feature flag | `LEAD_MANAGER_ENABLED` with 3-phase rollout |
| Tests | Vitest service + routes unit + e2e smoke |

## Architecture

```
                          ┌──────────────────────────────────┐
buyer.createRfq ─────────►│ rfqs.inviteSupplier (existing)    │
                          └─────────────┬────────────────────┘
                                        │ inserts rfq_suppliers row
                                        ▼
                          ┌──────────────────────────────────┐
supplier portal ─────────►│ rfqs.crmList (NEW)                │  ◄── filter: tag / status / date
                          │ rfqs.crmGet (NEW)                 │  ◄── rfq + tag + notes + conversion
                          │ rfqs.crmSetTag (NEW)              │  ◄── PATCH /tag
                          │ rfqs.crmSetStatus (NEW)          │  ◄── PATCH /status (supplier)
                          │ rfqs.crmAddNote (NEW)             │  ◄── POST /notes
                          │ rfqs.crmListNotes (NEW)           │  ◄── GET /notes
                          │ rfqs.crmSummary (NEW)             │  ◄── counts per tag/status
                          └─────────────┬────────────────────┘
                                        │
                                        ▼
                          ┌──────────────────────────────────┐
supplier_quotes.submit ──►│ rfqs.markQuoted (NEW)             │  ◄── sets conversion_status='quoted', quoted_at
purchaseOrders.create ───►│ rfqs.markOrdered (NEW)            │  ◄── sets conversion_status='won', order_id, order_value_cents
                          └──────────────────────────────────┘
```

### Module boundary

- **EXTEND** `apps/api/src/modules/rfqs/`. Add new files: `crm.ts` (service helpers), `crmRepository.ts`, `crmRoutes.ts`. Modify `schema.ts` + `repository.ts` to read/write new columns on `rfq_suppliers`.
- `rfqs/` service calls into the same module for conversion hooks (`markQuoted`, `markOrdered`). No new cross-module coupling.
- `purchaseOrders/` calls `rfqs.markOrdered(rfqId, supplierId, orderId, orderValueCents)` after order creation, scoped by `purchaseOrders.rfqId + purchaseOrders.supplierId`.
- `supplier_quotes/` (existing module under `rfqs/`) calls `markQuoted(rfqSupplierId)` from the existing quote-submit flow.
- Supplier portal consumes `rfqs/` service directly via existing supplier-shell auth.

### Files touched

**API:**
- NEW `apps/api/src/modules/rfqs/crmRepository.ts` — tag/status/notes queries + filter builder.
- NEW `apps/api/src/modules/rfqs/crm.ts` — service functions (`crmList`, `crmGet`, `crmSetTag`, `crmSetStatus`, `crmAddNote`, `crmListNotes`, `crmSummary`, `markQuoted`, `markOrdered`).
- NEW `apps/api/src/modules/rfqs/crmRoutes.ts` — 7 endpoints under `/api/supplier/crm/*`.
- MODIFY `apps/api/src/modules/rfqs/schema.ts` — add `tag`, `conversion_status`, `quoted_at`, `order_id`, `order_value_cents` columns on `rfqSuppliers`.
- MODIFY `apps/api/src/modules/rfqs/repository.ts` — expose new columns on read paths.
- MODIFY `apps/api/src/modules/rfqs/service.ts` — call `markQuoted` from existing quote-submit flow.
- MODIFY `apps/api/src/modules/rfqs/index.ts` — register `crmRoutes`.
- MODIFY `apps/api/src/modules/purchaseOrders/service.ts` — call `markOrdered` from `createOrder`.
- NEW D1 migration `packages/db/migrations/<ts>_supplier_crm.sql` — adds columns + `rfq_supplier_notes` table.
- MODIFY `packages/db/src/schema/rfqs.ts` — add columns on `rfqSuppliers` export.
- NEW `packages/db/src/schema/rfqSupplierNotes.ts`.
- NEW `packages/validation/src/rfqCrm.ts` — Zod for filter / tag / status / note bodies.
- MODIFY `apps/api/src/lib/flags.ts` — add `LEAD_MANAGER_ENABLED`.
- MODIFY `apps/api/wrangler.toml` — flag default off.

**Tests:**
- NEW `apps/api/test/rfqs/crmService.test.ts`.
- NEW `apps/api/test/rfqs/crmRoutes.test.ts`.
- NEW `apps/api/test/rfqs/conversionHooks.test.ts`.

**Web (supplier portal):**
- NEW `apps/web/src/supplier/LeadsPage.tsx` — inbox with filter chips + table.
- NEW `apps/web/src/supplier/LeadDetailDrawer.tsx` — slide-out with notes + tag + status.
- NEW `apps/web/src/supplier/TagPicker.tsx` — Hot/Warm/Cold selector.
- NEW `apps/web/src/supplier/ConversionBadge.tsx` — won/lost/quoted badge.
- NEW `apps/web/src/supplier/NotesPanel.tsx` — append-only notes list + composer.
- NEW `apps/web/src/supplier/LeadsSummaryCard.tsx` — dashboard tile (counts per tag + status).
- NEW `apps/web/src/supplier/useLeadManager.ts` — hooks: `useLeadsInbox`, `useLead`, `useLeadNotes`, `useLeadsSummary`, `useSetTag`, `useSetStatus`, `useAddNote`.
- MODIFY `apps/web/src/supplier/SupplierQuoteDetailPage.tsx` — embed `TagPicker` + `NotesPanel` + `ConversionBadge`.
- MODIFY `apps/web/src/supplier/DashboardPage.tsx` — embed `LeadsSummaryCard`.
- MODIFY `apps/web/src/supplier/Shell.tsx` — add "Leads" top-nav entry (gated by flag).

## Data Model

### `rfq_suppliers` (existing, modified)

| Column | Type | Notes |
| --- | --- | --- |
| `tag` | text NULL | enum: `hot` \| `warm` \| `cold` (CHECK) |
| `conversion_status` | text NULL | enum: `new` \| `contacted` \| `quoted` \| `won` \| `lost` (CHECK); defaults to `new` for new rows once lead-manager flag is on for the supplier |
| `quoted_at` | integer (timestamp) NULL | set by `markQuoted` |
| `order_id` | text NULL FK → `purchase_orders.id` | set by `markOrdered` |
| `order_value_cents` | integer NULL | set by `markOrdered` |

### `rfq_supplier_notes` (new)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `rfq_supplier_id` | text FK | references `rfq_suppliers.id` |
| `body` | text | ≤1000 chars (CHECK) |
| `created_by` | text FK | references `users.id` (supplier user) |
| `created_at` | integer (timestamp) | default `now()` |

INDEX `(rfq_supplier_id, created_at DESC)` — supports note list queries.

### Indexes (added)

- `rfq_suppliers (supplier_id, tag, invited_at DESC)` — supports `tag`-filtered inbox.
- `rfq_suppliers (supplier_id, conversion_status, invited_at DESC)` — supports `conversion_status`-filtered inbox.

## API surface

All endpoints under `/api/supplier/crm/*`. All supplier-scoped via existing `requireSupplier` middleware.

| Method | Path | Body / Query | Returns |
| --- | --- | --- | --- |
| GET | `/api/supplier/crm/leads` | `?tag=&status=&from=&to=&cursor=&limit=` | `{ leads: [...], nextCursor }` |
| GET | `/api/supplier/crm/leads/:id` | — | `{ lead, rfq, tag, status, notes: [...], conversion: {...} }` |
| PATCH | `/api/supplier/crm/leads/:id/tag` | `{ tag: 'hot'\|'warm'\|'cold'\|null }` | `{ tag }` |
| PATCH | `/api/supplier/crm/leads/:id/status` | `{ status: 'new'\|'contacted'\|'quoted'\|'won'\|'lost' }` | `{ status }` |
| POST | `/api/supplier/crm/leads/:id/notes` | `{ body: string≤1000 }` | `{ note }` |
| GET | `/api/supplier/crm/leads/:id/notes` | `?cursor=&limit=` | `{ notes: [...], nextCursor }` |
| GET | `/api/supplier/crm/summary` | — | `{ byTag: {hot, warm, cold, untagged}, byStatus: {new, contacted, quoted, won, lost}, totals: { leads, conversionRate } }` |

### Internal service hooks (not exposed via HTTP)

- `rfqs.markQuoted(rfqSupplierId)` — called from `rfqs.sendQuote`. Sets `conversion_status='quoted'`, `quoted_at=now()`. Idempotent.
- `rfqs.markOrdered(rfqId, supplierId, orderId, orderValueCents)` — called from `purchaseOrders.createOrder`. Resolves `rfq_suppliers` row by `(rfqId, supplierId)`. Sets `conversion_status='won'`, `order_id`, `order_value_cents`. Idempotent. Skips silently if no matching `rfq_suppliers` row exists.

### Authorization

- All `/api/supplier/crm/*` endpoints resolve the lead via `rfq_suppliers.id` and check `supplier_id` against the session. 403 on mismatch.
- `requireSupplier` middleware (existing) guards the prefix.
- Notes: `created_by` = current user; no edit/delete at MVP (append-only).

## UI surfaces

### 1. `LeadsPage` (new top-nav entry under `SupplierShell`)

- Filter chip row: Tag (All/Hot/Warm/Cold), Status (All/New/Contacted/Quoted/Won/Lost), Date range picker.
- Table columns: Buyer business, Product requested (from joined rfq_items), RFQ date, Tag (badge), Status (badge), Last note preview, Actions (open detail drawer).
- Pagination via cursor.
- Empty state: copy explaining how to receive RFQ invitations.

### 2. `SupplierQuoteDetailPage` (existing, modified)

Add inline `TagPicker` + `NotesPanel` + `ConversionBadge` block above the existing quote-response form. Page already knows the `rfq_suppliers.id` from the supplier-quote join.

### 3. Supplier `DashboardPage` (existing, modified)

Add `LeadsSummaryCard` tile: counts per tag, conversion rate, "Hot leads needing action" shortcut.

## Feature flag

`LEAD_MANAGER_ENABLED` in `apps/api/src/lib/flags.ts`. Default `false`.

| Phase | Audience | Trigger |
| --- | --- | --- |
| 1 | Vyro internal team only | Manual flag flip in `wrangler.toml` |
| 2 | 10% of suppliers, opt-in via email | Random sample + explicit opt-in |
| 3 | All suppliers | One-shot flip |

Flag gates both `/api/supplier/crm/*` (HTTP 404 if off) and the supplier-shell nav entry (hidden if off). Same flag on web side via existing `useFlag` hook.

## Tests

### Unit (`apps/api/test/rfqs/crmService.test.ts`)

- `crmList` returns supplier-scoped leads with cursor pagination.
- `crmList` filters by tag/status/date range independently and combined.
- `crmSetTag` rejects `bad` enum with 400.
- `crmSetTag(null)` clears tag.
- `crmSetStatus` rejects out-of-enum transition (e.g. `won` → `new`); allow `won`/`lost` as terminal.
- `crmAddNote` rejects body > 1000 chars; trims; rejects empty body.
- `crmSummary` aggregates correctly across mixed leads.

### Routes (`apps/api/test/rfqs/crmRoutes.test.ts`)

- GET `/api/supplier/crm/leads` requires supplier session (401 anon, 403 wrong supplier).
- PATCH `/tag` accepts all valid values; 400 on bad; 403 on other supplier's lead.
- POST `/notes` returns 201 + note body; 400 on empty/oversize.
- GET `/summary` returns aggregate counts.

### Conversion hooks (`apps/api/test/rfqs/conversionHooks.test.ts`)

- `sendQuote` → `markQuoted` sets `conversion_status='quoted'` + `quoted_at` on the matching `rfq_suppliers` row.
- Calling `markQuoted` twice is idempotent.
- `createOrder` from RFQ → `markOrdered(rfqId, supplierId, ...)` sets `conversion_status='won'` + `order_id` + `order_value_cents` on the matching `rfq_suppliers` row.
- Order from non-RFQ path doesn't trigger `markOrdered`.
- Multiple suppliers invited to the same RFQ: only the winning supplier's `rfq_suppliers` row gets `markOrdered`; others stay untouched.

### Smoke e2e (`scripts/e2e/crm.md`)

Walk: supplier login → flag on → buyer creates RFQ inviting 2 suppliers → supplier A opens inbox → filters by `Hot` → opens lead → adds note → sets tag → submits quote → buyer accepts A's quote → order placed → supplier A returns to inbox → lead now shows `Won` + `order_value_cents`. Supplier B's lead shows `Lost` only if buyer awards a different quote (out of scope here; left for downstream).

## Error handling

- All write endpoints return `errorEnvelope` shape (existing).
- 400 on bad enum / oversize body.
- 401 on anon.
- 403 on supplier-side mismatch.
- 404 on missing lead.
- 409 on terminal-status write (`won`/`lost` cannot be transitioned back to non-terminal).

## Future work

Deferred from MVP per brainstorm:

- Multi-tag per lead (current: single enum).
- Supplier-defined custom tag labels.
- Structured per-lead checklist (called / messaged / quoted / follow-up).
- Full-text search across RFQ body + notes.
- Bulk actions (bulk-tag, bulk-status update).
- Multi-user supplier team attribution on notes/tags.
- AI-suggested tag (auto-classify based on RFQ body sentiment + recency).
- Notes edit/delete (currently append-only).
- Webhook notifications on conversion milestones (RFQ quoted, RFQ won).
- Gmail / Outlook contact sync.
- CSV export of inbox.
- Per-lead timeline view (status changes + notes + quotes + orders in one feed).
- Auto-Lost when the same RFQ is awarded to a competing supplier (out of scope for MVP; left for downstream).

## Handoff

After spec approval, invoke `writing-plans` skill to produce `docs/superpowers/plans/2026-09-15-supplier-crm.md`. Plan executes TDD against the test list above.

Related:
- Audit: `docs/superpowers/specs/2026-09-15-competitor-audit.md` (this audit informed quick-win #2).
- Pattern reference: `apps/api/src/modules/credit/` (mirror for module shape).
- Pattern reference: `docs/superpowers/specs/2026-09-13-supplier-reviews-design.md` (mirror for spec structure + 3-phase flag pattern).
- Roadmap memory: `vyro-roadmap.md`.