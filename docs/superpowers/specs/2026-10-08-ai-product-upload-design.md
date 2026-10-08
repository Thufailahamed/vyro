# AI Product Upload — Design

Date: 2026-10-08
Status: Approved (pending spec review)
Workstream: AI product upload for the supplier portal

## Goal

Suppliers onboarding to Vyro currently hand-key products or fill the strict
17-column CSV import template. Real suppliers have messy sources: photos of
price lists (handwritten or typed), PDFs, wrongly-formatted Excel/CSV files,
and product photos. This feature accepts any of those, uses AI to extract
candidate offer rows, and lets the supplier review and commit them through
the existing, battle-tested import pipeline.

## Non-goals

- Mobile app UI (web supplier portal only; mobile deferred).
- Auto-committing anything without supplier review.
- AI writing to D1 directly — the existing importer stays the only write path.
- Creating catalog products automatically (unmatched rows become admin
  moderation proposals via the existing catalog moderation flow).

## User flow

1. Supplier opens "AI upload" in the supplier portal and uploads one of:
   - a price-list photo or PDF (handwritten or typed)
   - an Excel/CSV price list (any column layout)
   - individual product photos (no prices — rows created priceless)
2. The upload is stored in R2 and a session row is created; work happens
   asynchronously on the queue.
3. When extraction finishes, the supplier sees a staging table: one row per
   extracted offer, with per-row confidence, fuzzy-match target (or "new
   catalog product" proposal), and editable cells.
4. The supplier accepts/edits/rejects rows, then presses Commit.
5. Commit builds a CSV in the existing 17-column import format and calls
   `POST /api/supplier-products/import` (dry-run first, then real). Unmatched
   names are submitted as catalog proposals into the existing admin
   moderation queue; the supplier's offer row is created but stays blocked
   until moderation approves.

## Architecture

```
POST /api/ai/product-uploads          # multipart or JSON {filename,contentType,base64}
  → R2 put (vyro-products, uploads/{businessId}/{uuid})
  → INSERT product_upload_sessions (status=pending)
  → enqueue job (existing queue, mirrors documents/ocrWorker.ts)

Queue consumer (apps/api/src/queue/uploadOcr.ts):
  1. Excel/CSV → deterministic parse via existing CSV engine
     → AI text call maps odd headers to the 17-column schema only
  2. Price-list photo/PDF → Workers AI vision model → raw rows
  3. Product photos → vision classification → product_name + category guess
  4. Normalize to candidate rows, Zod-validate, confidence per row
  5. Fuzzy-match product names to catalog (tokenJaccard)
  6. status=extracted, rows staged in product_upload_rows

GET /api/ai/product-uploads/:id       # session status + staged rows
PATCH /api/ai/product-uploads/:id/rows/:rowId   # edit / accept / reject
POST /api/ai/product-uploads/:id/commit         # dry-run then import
```

## Data model (one migration)

`product_upload_sessions`: id, businessId, supplierId, status
(pending|extracting|extracted|failed|committed), sourceKind
(excel|csv|photo|pdf|productPhoto), r2Key, rowCount, errorMessage, timestamps.

`product_upload_rows`: id, sessionId, rowIndex, rawText, extracted JSON,
confidence, matchType (offer|productId|proposal|none), matchProductId,
proposalCatalogId, decision (accepted|edited|rejected), edited JSON,
timestamps.

Raw model output is retained per row for audit/debug.

## Models, gateway, and cost control

- All AI calls go through Cloudflare AI Gateway: `env.AI.run(model, {
  gateway: { id: VYRO_AI_GATEWAY } })`. Gateway id added to `wrangler.toml`.
- Model IDs configurable via env (`VYRO_AI_UPLOAD_VISION_MODEL`,
  `VYRO_AI_UPLOAD_MAP_MODEL`), defaulting to the cheap class already used by
  the copilot.
- Excel/CSV parsing is deterministic; the model is only asked to map headers
  to the fixed schema (tiny prompts, near-zero cost).
- Caps: 200 rows per upload (same as importer), image size cap, and the
  existing daily token cap + cost tracking + audit trail in
  `apps/api/src/modules/ai`.

## Error handling

- Extraction failure → session status=failed with reason; supplier can retry.
- Confidence < 0.6 → row pre-flagged in the review table (still editable).
- Commit dry-run errors surface per-row messages from the existing importer's
  `ImportRowResult`.

## Testing

- API unit tests for the queue consumer using golden fixtures (messy XLSX,
  photo-prompt stub, PDF); matcher tests; commit-through-import integration
  test.
- Vision model stubbed in tests.
- Eval cases added to `packages/ai/eval` golden set.
- Typecheck + lint per package, as with prior plans.

## Constraints

- No new dependencies.
- Web API calls via the `api` wrapper (`@/lib/api`).
- Follow existing AGENTS.md conventions per package.
