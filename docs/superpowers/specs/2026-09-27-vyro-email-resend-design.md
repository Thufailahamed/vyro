# Vyro Email Service — Full Implementation (Resend)

**Date:** 2026-09-27
**Status:** Draft (brainstorming approved)
**Scope:** Replace raw `fetch` w/ official Resend SDK, add verification email, webhook handler, rate limit, queue DLQ, attachments.

---

## 1. Goals & Non-Goals

### Goals

- Single transactional email provider: **Resend** (no MailChannels, no console fallback).
- Official `resend` Node SDK in `apps/api` (Worker-compatible).
- Signup verification email (non-blocking — login allowed, in-app badge until verified).
- Resend webhook handler: signature-verified, updates D1 notification status, suppresses bounces.
- Per-recipient rate limit (5/h sliding window via KV).
- Queue DLQ + 3-retry exponential backoff for `NOTIFICATIONS_QUEUE`.
- Attachments support in `EmailMessage`.
- Tests: unit (client, rate limit, webhook, templates) + integration (real Resend in staging).

### Non-Goals

- Marketing/bulk email (separate tool).
- SMS / push (separate channels).
- React-email / MJML template engines (stay plain HTML strings).
- Multi-provider abstraction (no `EmailService` interface).
- Email template designer UI (existing admin template CRUD stays).

---

## 2. Architecture

```
src/lib/email/
  client.ts      — Resend SDK singleton + send(msg)
  rateLimit.ts   — KV sliding-window per recipient
  templates.ts   — renderers (password reset, admin invite,
                   supplier verification, email verification, admin alert)
  webhook.ts     — verifyResendSignature + parseEvent
  types.ts       — EmailMessage, SendOutcome, SendResult, ResendEvent
  index.ts       — barrel re-export (back-compat for existing callers)

src/observability/notify.ts
  - re-exports notifySlack + renderAdminAlert from email/
  - notifyEmail() thin wrapper → email/client send
  - removes duplicated Resend fetch

src/queue/notifications.ts
  - retry: 3× exponential (60s / 300s / 900s) before DLQ
  - DLQ binding: NOTIFICATIONS_QUEUE_DLQ in wrangler.toml

src/modules/webhooks/resend.ts
  - POST /api/webhooks/resend handler
  - HMAC verification, event parsing, D1 updates, suppression insert

apps/api/wrangler.toml
  - add NOTIFICATIONS_QUEUE_DLQ binding
  - add RESEND_WEBHOOK_SECRET var
```

### Provider precedence

**Resend only.** `providerOrder` in `email/client.ts` becomes a single branch. If `RESEND_API_KEY` missing in any env → `sendEmailOrThrow` → 502 `EMAIL_NOT_CONFIGURED`.

---

## 3. Components

| File | Est. lines | Responsibility |
|---|---|---|
| `client.ts` | ~80 | `Resend` SDK init from `RESEND_API_KEY`. Single `send(msg): Promise<SendOutcome>`. Maps SDK errors → `SendOutcome`. Idempotency key from `msg.idempotencyKey` if present. Throws on missing API key (caller's `sendEmailOrThrow` maps to 502). |
| `rateLimit.ts` | ~50 | `checkRecipient(env, to): Promise<{allowed, retryAfter}>`. KV key `rl:email:{to}` w/ TTL 1h. Limit: 5 sends/h. Increments counter on allowed. Returns `retryAfter` seconds when blocked. |
| `templates.ts` | ~200 | Pure renderers (no I/O). Each returns `EmailMessage`. Adds `renderEmailVerification({to, url, ttlMinutes})`. Moves `renderAdminAlertEmail` from `observability/notify.ts`. |
| `webhook.ts` | ~70 | `verifyResendSignature(secret, rawBody, header): boolean` (HMAC-SHA256 timing-safe compare). `parseEvent(body): ResendEvent \| null`. Returns typed event for route handler. |
| `types.ts` | ~40 | `EmailMessage` (adds `attachments?: Array<{filename, content}>` + `idempotencyKey?: string`), `SendOutcome`, `SendResult`, `ResendEvent` (delivered / bounced / complained / delivery_delayed). |
| `index.ts` | ~20 | Re-exports old `email.ts` symbols + new ones. Back-compat for `authEnv.ts`, `queue/notifications.ts`, `admin/invites/service.ts`. |

### `EmailMessage` shape

```ts
interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string /* base64 */ }>;
  idempotencyKey?: string;
}
```

---

## 4. Data Flow

### Flow A — Signup verification (new)

```
Web signup → POST /api/auth/sign-up (better-auth)
  → user row created, emailVerified=false
  → better-auth hook sendVerificationEmail({to, url, ttlMinutes: 60})
  → authEnv.sendEmail → email/client.send
  → rateLimit.checkRecipient (KV)
  → Resend SDK send
  → log + return
Login allowed regardless. UI banner until verified.
```

### Flow B — Webhook delivery + suppression

```
Resend POST /api/webhooks/resend
  → raw body captured (for HMAC)
  → webhook.verifyResendSignature
    invalid → 401, log warn
  → parseEvent → {type, recipient, messageId}
  → D1 UPDATE notifications
       SET status=?
       WHERE resend_id = ?
    status map:
      delivered       → 'delivered'
      bounced         → 'bounced'
      complained      → 'complained'
      delivery_delayed → 'pending'
  → if bounced or complained:
       INSERT INTO email_suppressions (recipient, reason, event_at, created_at)
  → 200 OK
```

### Flow C — Queue retry / DLQ

```
Notification handler → email/client.send fails
  → if retryCount < 3:
       re-enqueue w/ delaySeconds [60, 300, 900][retryCount]
       increment retryCount on message metadata
  → else:
       DLQ binding NOTIFICATIONS_QUEUE_DLQ
       DLQ consumer: log error, fire Slack alert via notifySlack
       no auto-replay (manual via admin route if needed)
```

### Flow D — Rate limit 429

```
send() → rateLimit.checkRecipient
  allowed=true → proceed
  allowed=false → throw httpError(429, 'EMAIL_RATE_LIMITED', {retryAfter})
  Queue consumer: re-enqueue w/ delay = retryAfter seconds
  Direct caller (request handler): error bubbles to user
```

---

## 5. Error Handling

| Failure | Behavior |
|---|---|
| `RESEND_API_KEY` missing in prod | `sendEmailOrThrow` → 502 `EMAIL_NOT_CONFIGURED`. No silent drop. |
| `RESEND_API_KEY` missing in dev | Same 502. Devs must set key explicitly. |
| Resend 4xx (bad payload) | Log at `error` w/ payload (PII-stripped). Return `{ok:false, error}`. No retry — surface immediately. |
| Resend 5xx / network | Log + return failure. Caller (queue consumer) decides retry. |
| Rate limit hit | 429 w/ `Retry-After`. Queue re-enqueues w/ delay. Direct callers surface error. |
| Webhook bad signature | 401. Log at `warn`. No event processed. |
| Webhook unknown event type | 200 (ack), log at `info`, no DB write. |
| DLQ message | Log full payload at `error`, fire Slack alert, no auto-replay. |

All errors structured: `{ code, message, meta? }`. `console.error` always includes `to` hash (sha256 first 8 chars) — never raw email in logs.

### D1 schema additions

```sql
ALTER TABLE notifications ADD COLUMN resend_id TEXT;
ALTER TABLE notifications ADD COLUMN status TEXT DEFAULT 'queued';
CREATE INDEX idx_notifications_resend_id ON notifications(resend_id);

CREATE TABLE email_suppressions (
  recipient TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  event_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Migration file: `apps/api/migrations/0042_email_suppressions_and_status.sql`.

---

## 6. Testing

### New tests (`apps/api/test/lib/email/`)

| File | Covers |
|---|---|
| `client.test.ts` | SDK init, `send()` happy path (mock Resend), error mapping (4xx, 5xx, network), idempotency key passthrough, missing API key throws. |
| `rateLimit.test.ts` | First send allowed, 6th in 1h blocked, TTL expiry resets, retry-after value correct. Uses miniflare KV. |
| `webhook.test.ts` | Valid signature accepted, tampered body rejected, missing header rejected, event parsing for delivered/bounced/complained/delivery_delayed. |
| `templates.test.ts` | Each renderer returns valid `EmailMessage`, HTML escaped, required fields present. |

### Updated tests

- `test/lib/email.test.ts` → split into `client.test.ts` + `templates.test.ts`. Remove MailChannels/console cases.
- `test/observability/notify.test.ts` → update import path. `notifyEmail` test uses SDK mock.
- `test/admin/invites.test.ts`, `test/rfqs/crm-conversion-hooks.test.ts` → verify still pass after re-export change.

### Integration test

Real Resend send against staging with `RESEND_API_KEY_TEST`. Verify delivered event hits webhook in <30s. Skip in CI, run on deploy (script `scripts/email-integration-test.ts`).

---

## 7. Environment Variables

| Var | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | yes (prod + dev) | Resend API key. |
| `EMAIL_FROM` | yes | Sender address (e.g. `Vyro <no-reply@vyro.lk>`). |
| `OPS_EMAIL` | yes (prod) | Ops alert recipient. |
| `RESEND_WEBHOOK_SECRET` | yes (prod) | HMAC signing secret from Resend dashboard. |

All set via `wrangler secret put` (existing pattern). No new `.env` keys.

### wrangler.toml additions

```toml
# DLQ producer binding
[[queues.producers]]
queue = "notifications-dlq"
binding = "NOTIFICATIONS_QUEUE_DLQ"

# Existing consumer extended w/ dead_letter_queue
[[queues.consumers]]
queue = "notifications"
max_batch_size = 10
max_retries = 3
dead_letter_queue = "notifications-dlq"
```

---

## 8. Migration / Rollout

1. Deploy new modules + DB migration first (additive, no behavior change).
2. Deploy Resend SDK swap + remove MailChannels (force email traffic through Resend).
3. Wire signup verification email (better-auth hook + UI banner).
4. Deploy webhook handler + DLQ binding.
5. Switch queue consumer to retry-with-DLQ logic.
6. Run integration test against staging.
7. Monitor Resend dashboard + Worker logs for 24h before declaring complete.

Each step is independently revertible. No big-bang cutover.

---

## 9. Open Questions

None. All clarified during brainstorming.
