# VYRO AI — Evaluation

## Where the golden dataset lives

`packages/ai/eval/golden.ts` holds a hand-curated set of `GoldenEntry`
records. Each entry pins one real small-business buyer prompt to its expected
intent and the slot keys that should be extracted. Coverage spans every entry
in `INTENT_NAMES` (currently 24 intents).

Adding a new entry is a single object literal — `{ prompt, expectedIntent,
expectedSlotKeys }`. Optional fields: `expectedEvidenceLabels`,
`mustNotMention`.

## How scoring works

`packages/ai/eval/scoring.ts` exports `runEval(classify, entries)` which
yields a `ScoreReport`:

- `intentAccuracy` — fraction of prompts whose returned intent matches the
  golden entry.
- `slotAccuracy` — fraction of expected slot keys that were extracted.
- `hallucinationRate` — fraction of entries that contained any of the
  `mustNotMention` strings in the classifier output.
- `byIntent` — per-intent hit counts.
- `failures` — concrete prompt → actual-intent (+ missing slots) entries.

`formatMarkdown(report)` turns it into a markdown table that humans can read
in a PR.

## How to run locally

```
pnpm eval:ai
```

Writes `docs/superpowers/evals/<YYYY-MM-DD>.md`. The CI workflow
`.github/workflows/ai-eval.yml` runs the same script on every PR touching AI
code and uploads the report as a build artifact.

## When to update the routing policy

`packages/ai/src/provider/routingPolicy.ts` exposes
`DEFAULT_ROUTING_POLICY` — a small data structure listing intents whose
narration benefits from a stronger model. Edit the list when:

- New intents are added that need richer narration.
- Existing intents move from structured to free-form output.
- Cost telemetry shows we are overspending on simple narration.

The provider module consumes the policy through
`resolveRoutingPolicy(env)`. Operators can also override the complex-intent
list at runtime via `VYRO_AI_COMPLEX_INTENTS` (comma-separated) without
redeploying code.

## Threshold conventions

The eval report itself is informational — there are no hard gate thresholds
yet. Suggested action thresholds (for human review, not auto-fail):

| Metric | Watch | Investigate | Likely regress |
| --- | --- | --- | --- |
| Intent accuracy | < 95% | < 90% | < 80% |
| Slot accuracy | < 90% | < 85% | < 75% |
| Hallucination rate | > 1% | > 5% | > 10% |

## Adding a new intent

1. Add the name to `INTENT_NAMES` in `packages/ai/src/schemas.ts`.
2. Register a handler in `packages/ai/src/intents.ts`.
3. Add at least three golden entries (`packages/ai/eval/golden.ts`) covering
   typical phrasing, terse phrasing, and a negative case.
4. Re-run `pnpm eval:ai` and confirm intent accuracy stays at the watch level
   or above.

## What the runner does NOT do

- It does not auto-promote a changed routing policy to production.
- It does not retrain or persist anything.
- It does not modify the live model — the `runMockEval` default uses a
  gold-matching mock; replace with `runEval(yourClassifier, GOLDEN)` for
  real-model runs.
