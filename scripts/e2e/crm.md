# Supplier CRM E2E Smoke

## Pre-reqs

- `pnpm dev` from `apps/api/` (port 8787 by default)
- `pnpm dev` from `apps/web/`
- D1 `feature_flags` config section: `LEAD_MANAGER_ENABLED = true`
- Supplier owner / sales / operations accounts seeded
- At least one RFQ published and one supplier invited to it

## Walk

1. **Setup.** Sign in as supplier owner. Visit `/supplier/leads`. Confirm the summary cards (Hot / Warm / Cold / Won / Conversion) render above the inbox. The list should be empty until RFQs are invited.
2. **Lead appears.** From a separate buyer account, invite the supplier to an RFQ (status `open`, published). Refresh `/supplier/leads`. A new row appears with the `untracked` conversion badge and `Invited <timestamp>`.
3. **Tag a lead.** Click the row. Drawer opens. Under **Tag**, click `hot`. The row badge updates; refresh-persistent. Click `hot` again to toggle off.
4. **Mark contacted.** In the drawer, under **Conversion status**, click `contacted`. Toast: "Status → contacted". The row badge updates. Status pill in the drawer header updates.
5. **Submit a quote.** Click "Open in Quote detail" (or visit `/supplier/quotes/:rfqId`). Submit any quote. After success, return to the drawer — conversion badge has flipped to `quoted` and `Quoted <timestamp>` is populated (this is the markQuoted hook wired in `apps/api/src/modules/rfqs/service.ts:submitQuote`).
6. **Notes.** Add a note via the drawer's `NotesPanel` (≤1000 chars, trimmed). Note appears at top of the feed with author + timestamp. Refresh — persists.
7. **Filter.** Back on `/supplier/leads`. Use the Tag chip group to filter to `warm`. Confirm only tagged-warm rows show. Use Status chip group to filter to `quoted`. Combinations stack. "clear filters" link resets both.
8. **Terminal state.** Set a lead to `won`. Try to flip it back to `contacted`. Expect 409 `CONFLICT` from the API; the UI surfaces the toast "lead is in terminal state…". The hook setOrdered also writes `won` + order id + order value cents — the row reflects that once an order exists (no checkout hook yet, see `apps/api/src/modules/purchaseOrders/service.ts` TODO at the insertPo call site).

## Negative cases

- **Flag off.** Set `LEAD_MANAGER_ENABLED = false`.
  - All `/api/supplier/crm/*` routes → 404 with `feature not enabled`.
  - `/supplier/leads` page renders the friendly "Could not load leads…" message.
  - Shell nav entry is always rendered (we deliberately don't gate it — hidden costs > visible dead links).
- **Wrong role.** A `viewer` member of the supplier hits any CRM endpoint → 403 `FORBIDDEN`. The drawer and page don't render guards themselves because the API is the source of truth.
- **Empty leads.** A supplier with zero invites sees "No leads match these filters." on `/supplier/leads`.
- **Empty notes.** A lead with zero notes shows "No notes yet." in the drawer.
- **Concurrent status update.** Two browser tabs open on the same lead — the second tab's PATCH hits 409 if the first tab already moved the lead to `won`/`lost`.
- **Quote without an invited supplier.** A supplier who was *not* invited to the RFQ tries to open the Quote detail page. CrmLeadCard shows "Lead Manager is not enabled on your platform" (the API returns 404 from the feature-flag gate; the lookup catches the error and falls back).
- **Note >1000 chars.** Save button is disabled while the textarea has >1000 characters; the API rejects with `note cannot exceed 1000 characters` if bypassed.
- **Empty note.** Same — disabled until non-whitespace content exists.

## Hook contract

- `crm.markQuoted(d1, rfqSupplierId)` — fires once per accepted supplier quote. Idempotent at the row level (sets conversion_status='quoted' and quotedAt=now regardless of prior value).
- `crm.markOrdered(d1, rfqId, supplierId, orderId, orderValueCents)` — fires when an RFQ-linked checkout completes. **Currently NOT wired** — purchase_orders.rfq_id is nullable and the checkout flow doesn't pass it. The TODO comment at `apps/api/src/modules/purchaseOrders/service.ts` documents the future wiring. Until that ships, RFQ-sourced orders won't auto-mark `won`; suppliers can still do it manually via the drawer's status picker.

## Data model assumptions

- Lead = `rfq_suppliers` row scoped to `supplier_id`. Joined via `findLeadByRfqAndSupplier`.
- Tag: `hot` | `warm` | `cold` | null. CHECK constraint on the column.
- Conversion status: `new` (default) → `contacted` → `quoted` → `won` / `lost`. `won` and `lost` are terminal — the repository rejects any PATCH that tries to leave a terminal state.
- Notes are append-only — there is no edit/delete endpoint. Soft delete is a future-work item.
- Cursor pagination uses `invitedAt` as the cursor (DESC). `nextCursor` is the last `invitedAt` of the returned page.

## Known limits (per spec)

- No drag-and-drop kanban — list + filters only.
- No bulk tag/status edit.
- No per-tag SLA reminders.
- No email digest for newly invited RFQs (that's BuyLeads).
- No buyer-side mirror — buyers can't see a supplier's tag/status.
- Notes are scoped to a lead (rfq_supplier row), not to a quote version. Re-quoting the same RFQ carries the existing note thread forward.
- No analytics on tag-vs-win correlation (that's a future Intelligence tile).
