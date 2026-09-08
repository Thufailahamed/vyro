# VYRO AI — Security model

VYRO AI sits between the user prompt and deterministic code over the
caller's tenant data. The threat model and mitigations below apply to every
code path that crosses that boundary.

## Principles

The non-negotiables, copied verbatim from the spec:

- "AI must never bypass: Authentication, Authorization, Tenant isolation,
  Business rules, Confirmation requirements"
- "Server session wins, never trusted from client payload"
- "AI interprets and reasons. Backend calculates and enforces"
- "Do NOT automatically retrain production models from unvalidated feedback"

In practice: every intent handler receives `businessId` from the server
session, never from the prompt or context. Every repository call carries
that `businessId` as a filter. Every write path requires an explicit
confirmation round-trip — the model produces a plan, the backend persists
after the user clicks.

## Threat model

### 1. Prompt injection

Adversarial prompt tries to override system instructions, exfiltrate data,
or steer the model into tool misuse.

Mitigations:

- `assertPromptSafe(prompt)` in `apps/api/src/modules/ai/guard.ts` rejects
  emails (PII), oversize input (`PROMPT_MAX = 800`), and a regex blocklist
  of instruction-override phrases.
- `assertNoAdversarialUnicode` blocks zero-width joiners, bidi overrides,
  line / paragraph separators.
- Output is filtered for the same phrases before reaching the client.

Tests: `apps/api/test/ai/security/promptInjection.test.ts`,
`apps/api/test/ai/security/unicodeSmuggle.test.ts`.

### 2. Cross-tenant data leakage

Adversary (or buggy code) lets one tenant's data surface in another's
response.

Mitigations:

- Every repository method takes `businessId` and filters at the SQL level.
- The session-derived `businessId` is the only one honoured; client
  payloads that include `businessId` are ignored or overwritten.
- Mock repos are exercised in tests to confirm filters survive refactors.

Tests: `apps/api/test/ai/security/crossTenant.test.ts`,
`apps/api/test/ai/tenancy.test.ts`.

### 3. Tool escalation

Lower-privileged role triggers a write intent (e.g. viewer issues an order).

Mitigations:

- `INTENT_ALLOWLIST_BY_ROLE` in `packages/ai/src/intents.ts` — viewer is
  restricted to read-only intents; member and admin can invoke any intent.
- The HTTP route maps business roles to AI roles before the orchestrator
  sees them; the orchestrator rejects un-allowed intents and emits a
  forbidden error event.

Tests: `apps/api/test/ai/security/toolEscalation.test.ts`,
`apps/api/test/ai/intent-allowlist.test.ts`.

### 4. Unicode smuggling

Adversary uses invisible / bidi characters to disguise intent slots or
bypass the regex layer.

Mitigations:

- `assertNoAdversarialUnicode` blocks U+200B-U+200F, U+202A-U+202E,
  U+2060-U+2069, U+FEFF, U+2028, U+2029.
- Sanitization in `sanitizeProductName` strips control characters and
  HTML-ish tags before any name is persisted or echoed in a prompt.

Tests: `apps/api/test/ai/security/unicodeSmuggle.test.ts`,
`apps/api/test/ai/security/maliciousContent.test.ts`.

### 5. Malicious content storage

User-entered product names, supplier names, or pasted documents contain
control sequences or markup that survive into logs and other tenants'
prompts.

Mitigations:

- `sanitizeProductName` in `apps/api/src/modules/ai/context.ts` strips
  control characters and tags before they are written.
- Cost / budget helpers aggregate per business, so a poisoned metric cannot
  bleed into another tenant's spend reporting.

Tests: `apps/api/test/ai/security/maliciousContent.test.ts`.

### 6. Cost attacks

Adversary hammers the API to rack up model spend.

Mitigations:

- Per-user sliding-window `costCap` (`TOKEN_BUDGET_PER_MIN`).
- Per-business daily budget `assertDailyBudget` (`VYRO_AI_DAILY_BUDGET_USD`,
  default $5.00): soft-warn at 80%, hard-stop at 100%.
- KV-backed route rate limiter (per user, 30 req/min).

Tests: `apps/api/test/ai/phase7/costGuard.test.ts`.

## What is explicitly NOT protected

- The model itself can still produce plausible-but-wrong answers. The
  eval suite (`pnpm eval:ai`) measures intent and slot accuracy offline;
  live users see the same content and may correct it via the feedback
  channel.
- The security model does not defend against an attacker who has compromised
  a user session. Standard auth / session handling lives outside this
  document.

## Reporting a new attack

If you find a prompt that bypasses the suite, do NOT ship the bypass into
production. Open a PR that:

1. Adds the attack prompt to `apps/api/test/ai/security/`.
2. Verifies the new test fails on `main`.
3. Adds the mitigation (helper in `guard.ts` or `context.ts`).
4. Confirms the full security suite passes.

The goal is to make every successful attack a permanent regression in the
test suite.
