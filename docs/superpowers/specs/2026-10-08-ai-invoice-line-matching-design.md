# AI-Assisted Invoice Line Matching — Design

Date: 2026-10-08  
Status: Approved (pending spec review)  
Workstream: Doc intelligence v2, phase B

## Goal

Improve 3-way reconciliation when OCR descriptions are abbreviated, noisy, or
misspelled. Keep the existing deterministic matcher as the default; use a
cheap Workers AI model through Cloudflare AI Gateway only to resolve invoice
lines that the deterministic pass leaves unmatched.

## Non-goals

- Replacing the deterministic matcher with an LLM.
- Creating or modifying catalog products, purchase orders, invoice totals, or
  invoice line values from model output.
- Auto-submitting supplier claims or changing payment state.
- AI matching for manually supplied invoice data; phase B applies only when
  reconciliation is based on a stored `invoiceUploadId`.
- Automatic use of low-confidence matches.

## Matching behavior

1. `runThreeWayReconciliation` loads the existing PO, delivery, and invoice
   data exactly as today.
2. A shared pure deterministic matching pass runs first and reserves
   unambiguous one-to-one invoice/PO item pairs using the existing token
   Jaccard threshold.
3. If all invoice lines are resolved, skip Workers AI entirely.
4. If unresolved lines remain, and the upload is PO-linked and AI matching is
   enabled, send the remaining invoice descriptions and remaining PO items to
   one Workers AI call. The model may return only a provided `poItemId` or
   `null` for each unresolved invoice line.
5. The API validates every result against the supplied candidate set and
   enforces one-to-one assignments. Unknown, duplicate, omitted, or malformed
   matches are rejected and remain unmatched.
6. Automatically apply an AI match only when its confidence is at least
   `0.95` and its margin over the model's second-choice confidence is at least
   `0.15`. These initial thresholds are code constants validated against the
   golden fixtures; threshold configuration is deferred until the eval data
   shows a need for operator tuning.
7. Below-threshold candidates remain unmatched and are attached to the
   corresponding reconciliation line as an `aiSuggestion` for buyer review.
8. The existing three-way reconciler compares quantities and prices only
   after item identity is resolved. Model output never changes quantity,
   unit, or price.

The shared pure matcher owns deterministic pairing and consumes validated AI
overrides/suggestions so that item reservation and discrepancy calculation
remain a single implementation. It exposes a deterministic match plan for
the API layer rather than duplicating tokenization/Jaccard logic.

## Model request and result contracts

One request per reconciliation at most. Input is JSON containing:

- unresolved invoice line index, description, and unit (if available);
- remaining candidate PO item IDs, product-name snapshots, and units;
- instructions to match product identity only, ignore price/quantity while
  matching, and return `null` when uncertain.

Expected strict JSON response:

```json
{
  "matches": [
    {
      "invoiceItemIndex": 3,
      "poItemId": "existing-po-item-id-or-null",
      "confidence": 0.97,
      "alternativeConfidence": 0.18,
      "reason": "Abbreviation and pack size identify the same product."
    }
  ]
}
```

The API checks that indices belong to unresolved invoice lines, IDs belong to
remaining PO candidates, confidence values are finite and in `[0,1]`, reason
is trimmed/capped to 160 characters, and no PO ID is used twice. A malformed
model response causes a deterministic-only result.

## Result contract and buyer review

Extend `ReconciliationLine` with optional metadata:

- `matchSource?: 'deterministic' | 'ai'`;
- `matchConfidence?: number` (for AI-applied matches);
- `matchExplanation?: string` (for AI-applied matches);
- `aiSuggestion?: { poItemId: string; productName: string; confidence: number; reason: string }`
  (for below-threshold candidates that remain unmatched).

The order-page reconciliation card:

- labels AI-applied matches and shows their confidence + short explanation;
- shows a below-threshold candidate as a suggestion beside the unmatched
  discrepancy, without treating it as a match;
- links to the uploaded invoice review page when a suggestion needs correction.

The existing invoice review route already saves corrected line items and
re-runs reconciliation; no new confirm/accept endpoint is needed.

## Cost, configuration, and failure handling

- `VYRO_AI_RECONCILE_MATCHING` gates this feature and defaults to `false`.
- `VYRO_AI_RECONCILE_MODEL` defaults to the same inexpensive text model used
  for header mapping (`@cf/zai-org/glm-5.3-flash`); operators can change it
  without a code deploy.
- Calls use `env.AI.run` with the configured AI Gateway ID (`VYRO_AI_GATEWAY`)
  and JSON response mode.
- Skip model calls for manual `invoiceData`, no unresolved lines, disabled
  feature, missing AI binding, too many unresolved lines (>50), or a request
  larger than the prompt budget (12,000 characters after serialization).
- A timeout, provider error, invalid JSON, or invalid candidate ID falls back
  to the deterministic result and does not fail reconciliation.
- Log only model, latency, call outcome, and count of resolved/suggested
  lines; do not persist prompts or raw provider responses.

## Evaluation and tests

- Add labeled pure fixtures for common Sri Lankan wholesale OCR noise:
  abbreviations, punctuation/spacing loss, unit synonyms, typos, different
  pack sizes, and ambiguous same-brand products.
- Assert deterministic matches cause zero model calls.
- Assert high-confidence exact-candidate results are applied once and retain
  quantity/price variance detection.
- Assert low-confidence, tied, duplicate-ID, out-of-candidate, malformed, and
  throwing-model outputs never become applied matches.
- Assert the feature switch off and manual `invoiceData` paths remain
  deterministic-only.
- Web static markup tests cover AI source/confidence/reason, low-confidence
  suggestion, and invoice-review link.
- Tests stub Workers AI; never call a live model in CI.

## Constraints

- No new dependencies.
- Keep existing one-to-one matching semantics and all PO/invoice money fields
  unchanged.
- The feature is initially disabled; enable only after the labeled fixtures
  demonstrate that automatic-match cases are correct and ambiguous examples
  remain suggestions.
