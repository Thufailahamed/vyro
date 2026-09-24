# Payments.lk Gateway Migration & Payments/Accounts Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PayHere with payments.lk as the sole online gateway — hosted checkout, HMAC-signed webhooks, real gateway refunds, saved cards — and finish the payments/accounts polish (web + mobile).

**Architecture:** New `PaymentsLkGateway` implementing the existing `GatewayAdapter` interface in `packages/payments` (plain `fetch`, no vendor SDK). New `/api/webhooks/payments-lk` route reuses the `payment_events` dedupe + ledger/earnings machinery, with an exported `applyGatewayPaymentEvent(env, event)` processor reused by the checkout-status poll and saved-card charge paths so money moves through exactly one code path. Refund executor gains a real gateway refund path driven by `refund.completed`/`refund.failed` events. Saved cards are a small new module over a new D1 table.

**Tech Stack:** TypeScript, Hono on Cloudflare Workers, Drizzle ORM on D1 (SQLite), Vitest (node:sqlite D1 shim for router e2e), React 19 web SPA, Expo mobile.

**Spec:** `docs/superpowers/specs/2026-09-24-payments-lk-gateway-design.md`

## Global Constraints

- LKR only; all amounts integer LKR cents; never floats.
- No PAN/CVV ever stored — only provider card id, brand, last4, expiry.
- Every gateway write carries `Idempotency-Key`: `checkout_<paymentId>`, `refund_<refundId>`, `charge_<paymentId>`.
- Confirmation only from verified webhook or server-side checkout read; the redirect is never proof.
- Mock gateway under `ENVIRONMENT=production` must throw `GatewayConfigError` (existing guard preserved).
- `packages/payments` stays Node-free (pure TS crypto; WebCrypto allowed for async paths).
- Internal `payment_events.statusCode` convention: `payment.succeeded`=2, `payment.failed`=-2, `checkout.expired`=0, `refund.completed`=3, `refund.failed`=-3, `card.saved`=4.
- Historical rows keep `provider='payhere'`; all new writes use `'payments_lk'`; old PayHere online refunds stay manual.
- Per-task commit in repo style: `feat(payments): …`, `fix(webhooks): …`, `chore(docs): …`.

---

### Task 1: Gateway kernel — sync HMAC-SHA256, extended types, PaymentsLkGateway

**Files:**
- Modify: `packages/payments/src/hash.ts`, `packages/payments/src/hash.test.ts`
- Modify: `packages/payments/src/types.ts`
- Create: `packages/payments/src/paymentslk.ts`, `packages/payments/src/paymentslk.test.ts`

**Interfaces:**
- Consumes: `GatewayAdapter`/`WebhookEvent` from `./types`.
- Produces: `sha256Hex(message: string): string`, `hmacSha256Sync(secret: string, message: string): string` (lowercase hex, sync/Workers-safe), `timingSafeEqualHex(a: string, b: string): boolean`; `PaymentsLkGateway implements GatewayAdapter` with `provider = 'payments_lk'`, `startCheckout`, `parseWebhook`, `refund`, `verifySignature`, `chargeSavedCard`, `getCheckoutStatus`; helpers `buildPaymentsSignatureHeader(secret, rawBody, timestampSeconds?)` and `verifyPaymentsSignature(secret, rawBody, header, toleranceSeconds = 300)`.

- [ ] **Step 1: Write failing tests for the new hash functions**

Append to `packages/payments/src/hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { md5, sha256Hex, hmacSha256Sync, timingSafeEqualHex } from './hash';

describe('sha256Hex (sync, Workers-safe)', () => {
  it('hashes the empty string per FIPS 180-4', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('hmacSha256Sync', () => {
  it('matches RFC 4231 Test Case 2', () => {
    expect(hmacSha256Sync('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('hashes with a key longer than the 64-byte block', () => {
    expect(hmacSha256Sync('T'.repeat(131), 'larger than block-size key')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('timingSafeEqualHex', () => {
  it('accepts equal hex, rejects mismatched or different-length input', () => {
    const a = 'a'.repeat(64);
    expect(timingSafeEqualHex(a, a)).toBe(true);
    expect(timingSafeEqualHex(a, 'b'.repeat(64))).toBe(false);
    expect(timingSafeEqualHex(a, 'a'.repeat(63))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vyro/payments test`
Expected: FAIL — `sha256Hex`, `hmacSha256Sync`, `timingSafeEqualHex` not exported.

- [ ] **Step 3: Implement sync SHA-256 + HMAC + timing-safe compare**

Append to `packages/payments/src/hash.ts`:

```ts
// ---- Sync SHA-256 + HMAC. GatewayAdapter.verifySignature is synchronous;
// WebCrypto subtle is async-only in Workers, so implement SHA-256 in pure TS
// (same approach as the MD5 above). Big-endian per FIPS 180-4.

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function sha256Digest(input: Uint8Array): Uint8Array {
  const bitLen = input.length * 8;
  const padLen = (((input.length + 9) >>> 6) + 1) << 6;
  const padded = new Uint8Array(padLen);
  padded.set(input);
  padded[input.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
  dv.setUint32(padLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let i = 0; i < padLen; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr32(w[j - 15] as number, 7) ^ rotr32(w[j - 15] as number, 18) ^ ((w[j - 15] as number) >>> 3);
      const s1 = rotr32(w[j - 2] as number, 17) ^ rotr32(w[j - 2] as number, 19) ^ ((w[j - 2] as number) >>> 10);
      w[j] = ((w[j - 16] as number) + s0 + (w[j - 7] as number) + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + (K256[j] as number) + (w[j] as number)) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => ov.setUint32(i * 4, v, false));
  return out;
}

function hexOf(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) {
    s += ((b as number) >>> 4).toString(16);
    s += ((b as number) & 0xf).toString(16);
  }
  return s;
}

export function sha256Hex(input: string): string {
  return hexOf(sha256Digest(new TextEncoder().encode(input)));
}

/** Sync HMAC-SHA256 (RFC 2104). lowercase hex. Works on Workers (no node:crypto). */
export function hmacSha256Sync(secret: string, message: string): string {
  let key = new TextEncoder().encode(secret);
  if (key.length > 64) key = sha256Digest(key);
  const block = new Uint8Array(64);
  block.set(key);
  const inner = new Uint8Array(64);
  const outer = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    inner[i] = (block[i] as number) ^ 0x36;
    outer[i] = (block[i] as number) ^ 0x5c;
  }
  const msg = new TextEncoder().encode(message);
  const innerInput = new Uint8Array(64 + msg.length);
  innerInput.set(inner);
  innerInput.set(msg, 64);
  const innerHash = sha256Digest(innerInput);
  const outerInput = new Uint8Array(96);
  outerInput.set(outer);
  outerInput.set(innerHash, 64);
  return hexOf(sha256Digest(outerInput));
}

/** Length-independent, branch-uniform hex comparison. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.charCodeAt(i) as number) ^ (b.charCodeAt(i) as number);
  }
  return diff === 0;
}
```

- [ ] **Step 4: Run hash tests to verify they pass**

Run: `pnpm --filter @vyro/payments test`
Expected: PASS (all vectors; existing md5 tests untouched).

- [ ] **Step 5: Extend `types.ts`**

Rewrite `packages/payments/src/types.ts`:

```ts
// Gateway adapter interface. Payments.lk + Mock implement this. 'payhere' is a
// historical provider value retained for old DB rows only.

export type GatewayProvider = 'payments_lk' | 'payhere' | 'mock';

export interface StartCheckoutInput {
  paymentId: string;
  purchaseOrderId: string;
  amountCents: number;
  currency: string;
  businessName: string;
  businessEmail: string;
  businessPhone?: string;
  supplierName: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  /** Ask the gateway to offer card saving (payments.lk saveCard). */
  saveCard?: boolean;
}

export interface StartCheckoutResult {
  redirectUrl: string;
  gatewayRef: string;
  expiresAt: number;
}

export type WebhookEventType =
  | 'payment.success'
  | 'payment.pending'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.cancelled'
  | 'payment.chargeback'
  | 'refund.completed'
  | 'refund.failed'
  | 'card.saved'
  | 'unknown';

export interface SavedCardRef {
  id: string;
  brand?: string | undefined;
  last4?: string | undefined;
  expMonth?: number | undefined;
  expYear?: number | undefined;
}

export interface WebhookEvent {
  type: WebhookEventType;
  /** Our reference (payment id) or the gateway checkout id — whatever binds the event. */
  gatewayRef: string;
  paymentId?: string | undefined;
  amountCents?: number | undefined;
  currency?: string | undefined;
  /** Internal dedupe code (see plan Global Constraints), not a vendor code. */
  statusCode?: number | undefined;
  refundId?: string | undefined;
  card?: SavedCardRef | undefined;
  raw: Record<string, unknown>;
}

export interface RefundInput {
  paymentGatewayRef: string;
  refundId: string;
  amountCents: number;
  reason?: string | undefined;
  /** Provider payment id (from a prior success webhook) when known. */
  providerTransactionId?: string | undefined;
}

export interface RefundResult {
  gatewayRefundId: string;
  status: 'completed' | 'pending' | 'failed';
  raw?: Record<string, unknown> | undefined;
}

export interface ChargeSavedCardInput {
  cardId: string;
  amountCents: number;
  description: string;
  /** Our payment id, used as the provider reference. */
  reference: string;
  idempotencyKey: string;
}

export interface ChargeSavedCardResult {
  status: 'succeeded' | 'failed';
  paymentId?: string | undefined;
  error?: string | undefined;
}

export interface CheckoutStatusResult {
  status: 'pending' | 'succeeded' | 'failed' | 'expired';
  paymentId?: string | undefined;
}

export interface GatewayAdapter {
  readonly provider: GatewayProvider;
  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult>;
  parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifySignature(rawBody: string, signature: string | null): boolean;
  chargeSavedCard?(input: ChargeSavedCardInput): Promise<ChargeSavedCardResult>;
  getCheckoutStatus?(gatewayRef: string): Promise<CheckoutStatusResult>;
}
```

- [ ] **Step 6: Create `paymentslk.ts` adapter**

Create `packages/payments/src/paymentslk.ts` with:

1. `PaymentsLkConfig { secretKey: string; webhookSecret: string; apiBaseUrl?: string }` and `export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>` (optional fetch override for unit tests; constructor defaults to global `fetch`).
2. `DEFAULT_API_BASE = 'https://api.payments.lk'`; `base()` strips trailing slashes and honors `cfg.apiBaseUrl`.
3. `paymentsLkStatusCode(vendorType)` → internal dedupe code per Global Constraints (`payment.succeeded`=2, `payment.failed`=-2, `checkout.expired`=0, `refund.completed`=3, `refund.failed`=-3, `card.saved`=4, else `undefined`).
4. `paymentsLkEventToType(vendorType)` → `payment.succeeded→payment.success`, `payment.failed→payment.failed`, `checkout.expired→payment.expired`, `refund.completed→refund.completed`, `refund.failed→refund.failed`, `card.saved→card.saved`, else `'unknown'`.
5. `buildPaymentsSignatureHeader(secret, rawBody, timestampSeconds = Math.floor(Date.now()/1000))` → `t=<ts>,v1=<hmacSha256Sync(secret, ts + "." + rawBody)>`.
6. `verifyPaymentsSignature(secret, rawBody, header, toleranceSeconds = 300)` — parse `t=…,v1=…` (split on first `=`, trim), reject missing/invalid `t`/`v1`, reject when `|now − t| > tolerance`, then timing-safe compare `hmacSha256Sync(secret, t + "." + rawBody)`.
7. Class `PaymentsLkGateway implements GatewayAdapter` (`readonly provider = 'payments_lk' as const`):
   - `startCheckout(input)`: throws `'payments.lk supports LKR only'` when `input.currency !== 'LKR'`; throws `'invalid amountCents'` for non-integer/≤0. POST `${base()}/v1/checkouts` with headers `authorization: Bearer ${secretKey}`, `idempotency-key: checkout_${input.paymentId}`, `content-type: application/json`; body `{ amountCents, description: input.description.slice(0,200), reference: input.paymentId, successUrl: input.returnUrl, cancelUrl: input.cancelUrl }`, plus `saveCard: true` when `input.saveCard`, plus `customer: { email: input.businessEmail, name: input.businessName }` when `businessEmail` set. Parse JSON; on `!res.ok || !json?.url` throw `payments.lk checkout failed (${res.status}): <first 300 chars>`. Return `{ redirectUrl: String(json.url), gatewayRef: String(json.id), expiresAt: Date.now() + 30*60*1000 }`.
   - `parseWebhook(rawBody, signature)`: verify via `this.verifySignature` (throw `'payments.lk webhook signature mismatch'` on failure); `JSON.parse`; tolerant field reads — `data = parsed?.data ?? {}`, `payment = data.payment ?? {}`; `gatewayRef = String(data.reference ?? data.checkoutId ?? payment.id ?? '')`; `paymentId` from `data.id ?? payment.id`; `amountCents` from `data.amountCents ?? payment.amountCents` when numeric; `currency` default `'LKR'`; `refundId` from `data.refund?.id ?? data.refundId`; `card` from `data.card ?? payment.card` mapping `{ id, brand, last4, expMonth, expYear }` (only when `card.id` present); `statusCode: paymentsLkStatusCode(vendorType)`; `raw: parsed`.
   - `refund(input)`: `paymentId = input.providerTransactionId || input.paymentGatewayRef`; POST `${base()}/v1/refunds` with `idempotency-key: refund_${input.refundId}`, body `{ paymentId, amountCents, reason: input.reason || undefined }`. `!res.ok` → `{ gatewayRefundId: json?.id ?? '', status: 'failed', raw: { httpStatus, body: text.slice(0,300) } }`. Map `status`: `'succeeded'` → `'completed'`, `'failed'` → `'failed'`, else `'pending'`; return `{ gatewayRefundId: String(json?.id ?? ''), status, raw: json ?? {} }`.
   - `verifySignature(rawBody, signature)`: try `verifyPaymentsSignature(this.cfg.webhookSecret, rawBody, signature)`, catch → false.
   - `chargeSavedCard(input)`: POST `${base()}/v1/cards/${encodeURIComponent(input.cardId)}/charge` with `idempotency-key: input.idempotencyKey`, body `{ amountCents, description, reference }`. `!res.ok` → `{ status: 'failed', error: text.slice(0,300) }`; `json.status !== 'succeeded'` → `{ status: 'failed', paymentId: json?.id, error: 'charge status ' + (json?.status ?? 'unknown') }`; else `{ status: 'succeeded', paymentId: String(json.id) }`.
   - `getCheckoutStatus(checkoutId)`: GET `${base()}/v1/checkouts/${encodeURIComponent(checkoutId)}` with bearer header. Error/empty → `{ status: 'pending' }`. Map `json.payment?.status ?? json.status`: `'succeeded'` → `{ status: 'succeeded', paymentId: String(json.payment.id) }`, `'failed'`/`'expired'` → `{ status }`, else `{ status: 'pending' }`.

- [ ] **Step 7: Write adapter tests — `packages/payments/src/paymentslk.test.ts`**

Cover, with the stub `fetchImpl` capturing `{ url, init }` and returning canned `Response`s (gateway constructed with `{ secretKey: 'sk_test_123', webhookSecret: 'whsec_test_123', apiBaseUrl: 'https://api.test' }`; `signed(body, ts?)` helper = `buildPaymentsSignatureHeader('whsec_test_123', body, ts)`):

1. Accepts a correctly signed `payment.succeeded` event and maps `gatewayRef`/`paymentId`/`amountCents`/`currency`/`statusCode=2`.
2. Rejects forged signature (`'t=1,v1=00'`, null) with `/signature mismatch/`.
3. Rejects a tampered amount — signature made for the untampered body must fail on the tampered body (HMAC binds exact bytes).
4. Rejects an expired timestamp (3600s old) via `verifySignature`.
5. Maps `payment.failed`, `checkout.expired`, `refund.completed` (with `refundId`, `statusCode=3`), `card.saved` (with `card.id/brand/last4/expMonth/expYear`).
6. `paymentsLkEventToType('something.new')` → `'unknown'`.
7. Checkout call shape: URL `${base}/v1/checkouts`, `authorization: Bearer sk_test_…`, `idempotency-key: checkout_pay_1`, body `amountCents/reference/successUrl/cancelUrl`; `gatewayRef === 'ch_abc'`, `redirectUrl === json.url`.
8. Checkout API error (402) throws `/checkout failed \(402\)/`.
9. Refund call: URL `${base}/v1/refunds`, `idempotency-key: refund_rf_1`, body `{ paymentId: <providerTransactionId>, amountCents, reason: undefined }`; completed → `gatewayRefundId` from response.
10. Refund API failure (404) → `{ status: 'failed' }`.
11. Saved-card charge: URL `${base}/v1/cards/card_1/charge`, `idempotency-key: charge_pay_9`, success → `{ status: 'succeeded', paymentId }`; 402 → `{ status: 'failed', error }`.
12. `getCheckoutStatus`: succeeded reads `{ status: 'succeeded', paymentId }`; failed/expired/pending mapping; non-OK response → pending.

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @vyro/payments test`
Expected: PASS — all paymentslk tests green (existing payhere tests still pass; payhere files removed in Task 2).

- [ ] **Step 9: Commit**

```bash
git add packages/payments
git commit -m "feat(payments): payments.lk REST gateway adapter with HMAC webhooks, refunds, saved cards"
```

---

### Task 2: Resolver switch + mock contract update + delete PayHere

**Files:**
- Modify: `packages/payments/src/mock.ts`, `packages/payments/src/index.ts`, `packages/payments/src/index.test.ts`
- Delete: `packages/payments/src/payhere.ts`, `packages/payments/src/payhere.hash.test.ts`, `packages/payments/src/statusmap.test.ts`
- Modify (tests): `apps/api/test/payments/checkout.test.ts`, `apps/api/test/webhooks/payhere.notify.test.ts` (replaced), `apps/api/test/webhooks/signature.test.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `resolveGateway(env: GatewayEnv)` — selects `payments_lk` when `PAYMENTS_LK_SECRET_KEY` + `PAYMENTS_LK_WEBHOOK_SECRET` set; mock when `PAYMENTS_LK_MOCK=1` or creds missing; throws `GatewayConfigError` in production. `GatewayEnv`: `PAYMENTS_LK_SECRET_KEY`, `PAYMENTS_LK_WEBHOOK_SECRET`, `PAYMENTS_LK_API_URL`, `PAYMENTS_LK_RETURN_URL`, `PAYMENTS_LK_CANCEL_URL`, `PAYMENTS_LK_WEBHOOK_URL`, `PAYMENTS_LK_MOCK`, `PAYMENTS_LK_MOCK_FORCE_FAILURE`, `ENVIRONMENT`. `MockGateway` speaks the payments.lk event/HMAC contract with `MockConfig { secret?, forceFailure?, refundResult?: 'completed'|'pending'|'failed' }`.

- [ ] **Step 1: Rewrite `packages/payments/src/index.ts`**

```ts
import { PaymentsLkGateway, type PaymentsLkConfig } from './paymentslk';
import { MockGateway, type MockConfig } from './mock';
import type { GatewayAdapter, GatewayProvider } from './types';

export * from './types';
export {
  PaymentsLkGateway,
  type PaymentsLkConfig,
  buildPaymentsSignatureHeader,
  verifyPaymentsSignature,
  paymentsLkEventToType,
  paymentsLkStatusCode,
  type FetchLike,
} from './paymentslk';
export { MockGateway, type MockConfig } from './mock';
export { md5, hmacSha256Hex, hmacSha256Sync, sha256Hex, timingSafeEqualHex } from './hash';

export interface GatewayEnv {
  PAYMENTS_LK_SECRET_KEY?: string;
  PAYMENTS_LK_WEBHOOK_SECRET?: string;
  PAYMENTS_LK_API_URL?: string;
  PAYMENTS_LK_RETURN_URL?: string;
  PAYMENTS_LK_CANCEL_URL?: string;
  PAYMENTS_LK_WEBHOOK_URL?: string;
  /** =1 forces the mock gateway (local/staging only). */
  PAYMENTS_LK_MOCK?: string;
  PAYMENTS_LK_MOCK_FORCE_FAILURE?: string;
  /**
   * Environment name. When 'production' and the resolved gateway is mock,
   * `resolveGateway` throws — preventing silent mock usage in prod.
   */
  ENVIRONMENT?: string;
}

export interface ResolvedGateway {
  adapter: GatewayAdapter;
  provider: GatewayProvider;
  isMock: boolean;
}

export class GatewayConfigError extends Error {
  readonly status = 500 as const;
  constructor(message: string) {
    super(message);
    this.name = 'GatewayConfigError';
  }
}

/**
 * Resolve gateway adapter from env. Throws GatewayConfigError when running in
 * production and the mock gateway would be selected — preventing silent
 * money-loss when gateway secrets are missing on a prod deploy.
 *
 * Local + staging may explicitly opt into mock via `PAYMENTS_LK_MOCK=1`.
 */
export function resolveGateway(env: GatewayEnv | undefined): ResolvedGateway {
  const e = env ?? {};
  const forceMock = e.PAYMENTS_LK_MOCK === '1';
  const hasCreds = !!e.PAYMENTS_LK_SECRET_KEY && !!e.PAYMENTS_LK_WEBHOOK_SECRET;
  const wouldUseMock = forceMock || !hasCreds;

  if (wouldUseMock && e.ENVIRONMENT === 'production') {
    throw new GatewayConfigError(
      'PAYMENTS_LK_SECRET_KEY / PAYMENTS_LK_WEBHOOK_SECRET missing in production. ' +
        'Refusing to fall back to mock gateway to prevent silent money loss.',
    );
  }

  if (wouldUseMock) {
    return {
      adapter: new MockGateway({
        secret: e.PAYMENTS_LK_WEBHOOK_SECRET,
        forceFailure: e.PAYMENTS_LK_MOCK_FORCE_FAILURE === '1',
      }),
      provider: 'mock',
      isMock: true,
    };
  }

  const cfg: PaymentsLkConfig = {
    secretKey: e.PAYMENTS_LK_SECRET_KEY!,
    webhookSecret: e.PAYMENTS_LK_WEBHOOK_SECRET!,
    apiBaseUrl: e.PAYMENTS_LK_API_URL,
  };
  return {
    adapter: new PaymentsLkGateway(cfg),
    provider: 'payments_lk',
    isMock: false,
  };
}
```

- [ ] **Step 2: Rewrite `packages/payments/src/mock.ts`**

```ts
import { verifyPaymentsSignature } from './paymentslk';
import type {
  GatewayAdapter,
  StartCheckoutInput,
  StartCheckoutResult,
  WebhookEvent,
  WebhookEventType,
  RefundInput,
  RefundResult,
  ChargeSavedCardInput,
  ChargeSavedCardResult,
  CheckoutStatusResult,
} from './types';

export interface MockConfig {
  /** Webhook signing secret — same t.v1 HMAC contract as payments.lk. */
  secret?: string | undefined;
  /** Fail every success-shaped webhook and refund. */
  forceFailure?: boolean | undefined;
  /** Default 'completed'; 'pending' exercises webhook-driven refund finalization. */
  refundResult?: 'completed' | 'pending' | 'failed' | undefined;
}

export class MockGateway implements GatewayAdapter {
  readonly provider = 'mock' as const;
  constructor(private readonly cfg: MockConfig = {}) {}

  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult> {
    const gatewayRef = `MOCK-${input.purchaseOrderId}-${Date.now()}`;
    return Promise.resolve({
      redirectUrl: `https://mock.vyro.local/checkout/${gatewayRef}`,
      gatewayRef,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
  }

  async parseWebhook(rawBody: string, signature: string | null): Promise<WebhookEvent> {
    let parsed: Record<string, any>;
    try {
      parsed = rawBody.trimStart().startsWith('{')
        ? (JSON.parse(rawBody) as Record<string, any>)
        : Object.fromEntries(new URLSearchParams(rawBody));
    } catch {
      throw new Error('mock webhook: unparseable body');
    }
    const type = (parsed.type as WebhookEventType) ?? 'payment.success';
    if (this.cfg.forceFailure && type === 'payment.success') {
      throw new Error('mock: forced failure');
    }
    if (signature) {
      if (!verifyPaymentsSignature(this.cfg.secret ?? '', rawBody, signature)) {
        throw new Error('mock webhook signature mismatch');
      }
    }
    const data = (parsed.data ?? {}) as Record<string, any>;
    const legacyAmountCents =
      typeof parsed.amount === 'string' ? Math.round(parseFloat(parsed.amount) * 100) : undefined;
    return {
      type,
      gatewayRef: String(data.reference ?? parsed.reference ?? parsed.order_id ?? ''),
      paymentId: data.paymentId ? String(data.paymentId) : parsed.payment_id ? String(parsed.payment_id) : undefined,
      amountCents: typeof data.amountCents === 'number' ? data.amountCents : legacyAmountCents,
      currency: typeof data.currency === 'string' ? data.currency : 'LKR',
      refundId: data.refundId ? String(data.refundId) : undefined,
      raw: parsed,
    };
  }

  refund(input: RefundInput): Promise<RefundResult> {
    if (this.cfg.forceFailure || this.cfg.refundResult === 'failed') {
      return Promise.resolve({ gatewayRefundId: '', status: 'failed', raw: { reason: 'mock-forced-failure' } });
    }
    if (this.cfg.refundResult === 'pending') {
      return Promise.resolve({ gatewayRefundId: `MOCK-RFND-${input.refundId}`, status: 'pending', raw: { input } });
    }
    return Promise.resolve({ gatewayRefundId: `MOCK-RFND-${input.refundId}`, status: 'completed', raw: { input } });
  }

  async chargeSavedCard(input: ChargeSavedCardInput): Promise<ChargeSavedCardResult> {
    if (this.cfg.forceFailure) return { status: 'failed', error: 'mock-forced-failure' };
    return { status: 'succeeded', paymentId: `MOCK-PAY-${Date.now()}` };
  }

  async getCheckoutStatus(_gatewayRef: string): Promise<CheckoutStatusResult> {
    if (this.cfg.forceFailure) return { status: 'failed' };
    return { status: 'pending' };
  }

  verifySignature(rawBody: string, signature: string | null): boolean {
    if (!this.cfg.secret) return signature === null;
    try {
      return verifyPaymentsSignature(this.cfg.secret, rawBody, signature);
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 3: Update `packages/payments/src/index.test.ts`**

Replace the file with tests for:
1. `resolveGateway({ ENVIRONMENT: 'production' })` throws `GatewayConfigError` matching `/silent money loss/`.
2. Local env without creds → mock.
3. `PAYMENTS_LK_MOCK=1` with creds → mock.
4. Both `PAYMENTS_LK_SECRET_KEY` + `PAYMENTS_LK_WEBHOOK_SECRET` in production → `provider === 'payments_lk'`, `adapter instanceof PaymentsLkGateway`, `isMock === false`.
5. `GatewayConfigError.status === 500`.
6. Mock verify: no secret → only null signature accepted; spoof rejected.
7. Mock with secret enforces the t.v1 HMAC contract (`buildPaymentsSignatureHeader` round-trip; wrong/null signature rejected) and `parseWebhook` maps `data.amountCents`/`data.reference`/`data.paymentId`.
8. `forceFailure` → success webhook throws `/forced failure/`, refund → failed.
9. `refundResult: 'pending'` → refund pending.
10. `chargeSavedCard` default → `{ status: 'succeeded', paymentId: /^MOCK-PAY-/ }`.

- [ ] **Step 4: Delete PayHere files**

```bash
git rm packages/payments/src/payhere.ts packages/payments/src/payhere.hash.test.ts packages/payments/src/statusmap.test.ts
```

- [ ] **Step 5: Port `apps/api/test/payments/checkout.test.ts`**

Rewrite to PaymentsLkGateway with a stub fetch (as in Task 1 Step 7's checkout tests) asserting: `gatewayRef === 'ch_abc'`, `redirectUrl === 'https://pay.payments.lk/checkout/ch_abc'`, body `amountCents === 4550000`, `reference === 'pay_abc'`, `successUrl`/`cancelUrl` passthrough; plus non-LKR (`USD`) and non-integer (`10.5`) rejections.

- [ ] **Step 6: Replace `apps/api/test/webhooks/payhere.notify.test.ts` with `apps/api/test/webhooks/paymentslk.notify.test.ts`**

```bash
git rm apps/api/test/webhooks/payhere.notify.test.ts
```

Create `apps/api/test/webhooks/paymentslk.notify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PaymentsLkGateway, buildPaymentsSignatureHeader } from '@vyro/payments';

const SECRET = 'whsec_e2e';

function body(type: string, data: Record<string, unknown>): string {
  return JSON.stringify({ id: 'evt_1', type, data });
}

async function parse(g: PaymentsLkGateway, s: string) {
  return g.parseWebhook(s, buildPaymentsSignatureHeader(SECRET, s));
}

describe('payments.lk notify security', () => {
  it('accepts a correctly signed success event', async () => {
    const raw = body('payment.succeeded', { reference: 'pay_1', amountCents: 10000, id: 'pay_gw_1', currency: 'LKR' });
    const ev = await parse(new PaymentsLkGateway({ secretKey: 'sk_test_x', webhookSecret: SECRET }), raw);
    expect(ev.type).toBe('payment.success');
    expect(ev.gatewayRef).toBe('pay_1');
    expect(ev.amountCents).toBe(10000);
  });

  it('rejects forged signatures', async () => {
    const raw = body('payment.succeeded', { reference: 'pay_1', amountCents: 10000 });
    const g = new PaymentsLkGateway({ secretKey: 'sk_test_x', webhookSecret: SECRET });
    await expect(g.parseWebhook(raw, 't=1,v1=00')).rejects.toThrow(/signature mismatch/);
    expect(g.verifySignature(raw, buildPaymentsSignatureHeader('OTHER', raw))).toBe(false);
  });

  it('signature binds the body bytes (amount tamper rejected)', async () => {
    const raw = body('payment.succeeded', { reference: 'pay_1', amountCents: 10000 });
    const tampered = raw.replace('"amountCents":10000', '"amountCents":100');
    const g = new PaymentsLkGateway({ secretKey: 'sk_test_x', webhookSecret: SECRET });
    expect(g.verifySignature(tampered, buildPaymentsSignatureHeader(SECRET, raw))).toBe(false);
  });

  it('keeps expired distinct from success', async () => {
    const raw = body('checkout.expired', { reference: 'p1' });
    const ev = await parse(new PaymentsLkGateway({ secretKey: 'sk', webhookSecret: SECRET }), raw);
    expect(ev.type).toBe('payment.expired');
  });
});
```

- [ ] **Step 7: Port `apps/api/test/webhooks/signature.test.ts`**

Rewrite the file:

```ts
import { describe, expect, it } from 'vitest';
import { buildPaymentsSignatureHeader, verifyPaymentsSignature, hmacSha256Sync } from '@vyro/payments';

describe('payments.lk signature header format', () => {
  it('is "t=<unix>,v1=<hmac-sha256(t.body)>" and verifies round-trip', () => {
    const secret = 'whsec_doc';
    const raw = '{"type":"payment.succeeded","data":{"reference":"pay_1","amountCents":350000}}';
    const header = buildPaymentsSignatureHeader(secret, raw, 1726400000);
    expect(header).toMatch(/^t=1726400000,v1=[0-9a-f]{64}$/);
    expect(verifyPaymentsSignature(secret, raw, header)).toBe(true);
    const expected = hmacSha256Sync(secret, `1726400000.${raw}`);
    expect(header).toBe(`t=1726400000,v1=${expected}`);
  });

  it('fails verification when the body changes or t drifts outside tolerance', () => {
    const secret = 'whsec_doc';
    const raw = '{"type":"payment.succeeded"}';
    const header = buildPaymentsSignatureHeader(secret, raw);
    expect(verifyPaymentsSignature(secret, raw + ' ', header)).toBe(false);
    const stale = buildPaymentsSignatureHeader(secret, raw, Math.floor(Date.now() / 1000) - 400);
    expect(verifyPaymentsSignature(secret, raw, stale)).toBe(false);
  });
});
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @vyro/payments test && pnpm --filter @vyro/api test test/payments test/webhooks`
Expected: PASS. (`apps/api/src` still names PayHere env vars — replaced in Task 3; the tests above do not depend on those fields.)

- [ ] **Step 9: Commit**

```bash
git add packages/payments apps/api/test
git commit -m "feat(payments)!: switch resolver to payments.lk, rework mock to t.v1 HMAC contract, delete PayHere"
```

---

### Task 3: Env vars + payments.lk webhook route + CSRF + TrustSEAL fix

**Files:**
- Modify: `apps/api/src/env.ts`, `apps/api/src/index.ts`, `apps/api/src/middleware/verifyCsrf.ts`, `apps/api/src/modules/trustSeal/service.ts`, `apps/api/src/modules/webhooks/index.ts`
- Create: `apps/api/src/modules/webhooks/paymentslk.ts`
- Delete: `apps/api/src/modules/webhooks/payhere.ts`
- Create: `apps/api/test/helpers/d1.ts` (shared shim), `apps/api/test/webhooks/paymentslk.webhook.test.ts`
- Modify (test): `apps/api/test/finance/e2e.test.ts` (section C)

**Interfaces:**
- Consumes: `resolveGateway`, `PaymentsLkGateway`, `buildPaymentsSignatureHeader` (Tasks 1-2); `finalizeRefund`, `failRefund` from `../refunds/executor`; `listAttempts`, `completeAttempt`, `recordAttempt` from `../finance/repository`; `ensureAllocationAndEarning`, `recomputeEligibilityForPayment` from `../finance/earnings`; `trustSealRepository.activateFromWebhook`.
- Produces: exported `applyGatewayPaymentEvent(env, event, provider = 'payments_lk')` — idempotent event application (dedupe via `payment_events` unique `(payment_id, status_code, provider_payment_id)`; amount/currency binding for `payment.*` events; ledger writes; attempts; earnings; receipt; notifications; refund finalization; `card.saved` persistence via dynamic import of `../savedCards/repository`). Routes `POST /payments-lk` and `POST /plk-notify`.

- [ ] **Step 1: Update `apps/api/src/env.ts`**

Replace the PayHere env block (currently lines 19-28: `PAYHERE_MERCHANT_ID` … `PAYHERE_MOCK_FORCE_FAILURE`) with:

```ts
  /** payments.lk REST secret key (sk_test_… / sk_live_…). */
  PAYMENTS_LK_SECRET_KEY?: string;
  /** payments.lk webhook signing secret. */
  PAYMENTS_LK_WEBHOOK_SECRET?: string;
  /** Override payments.lk API base (default https://api.payments.lk). */
  PAYMENTS_LK_API_URL?: string;
  /** Override the hosted-checkout return URL. */
  PAYMENTS_LK_RETURN_URL?: string;
  /** Override the hosted-checkout cancel URL. */
  PAYMENTS_LK_CANCEL_URL?: string;
  /** Override the webhook endpoint registered at payments.lk (default /api/webhooks/payments-lk). */
  PAYMENTS_LK_WEBHOOK_URL?: string;
  /** =1 forces the mock gateway (local/staging only). */
  PAYMENTS_LK_MOCK?: string;
  PAYMENTS_LK_MOCK_FORCE_FAILURE?: string;
```

- [ ] **Step 2: Create the shared D1 test helper `apps/api/test/helpers/d1.ts`**

```ts
import { vi } from 'vitest';

const nodeSqlite = vi.hoisted(() => {
  const req = require('node:sqlite') as typeof import('node:sqlite');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const url = require('node:url') as typeof import('node:url');
  return { DatabaseSync: req.DatabaseSync, fs, path, url };
});
type DatabaseSync = InstanceType<typeof nodeSqlite.DatabaseSync>;

export function makeD1(sqlite: DatabaseSync = new nodeSqlite.DatabaseSync(':memory:')): D1Database {
  const wrap = (sqlText: string, bound: unknown[] = []): D1PreparedStatement => {
    const st = {
      bind(...params: unknown[]) { return wrap(sqlText, [...bound, ...params]); },
      first: async (col?: string) => {
        const row = sqlite.prepare(sqlText).get(...bound) as Record<string, unknown> | undefined;
        if (!row) return null;
        return col ? (row[col] ?? null) : row;
      },
      all: async () => ({ results: sqlite.prepare(sqlText).all(...bound), success: true, meta: {} }),
      run: async () => {
        const r = sqlite.prepare(sqlText).run(...bound) as unknown as { changes: unknown; lastInsertRowid: unknown };
        return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
      },
      raw: async () => (sqlite.prepare(sqlText).all(...bound) as Record<string, unknown>[]).map((r) => Object.values(r)),
    };
    return st as unknown as D1PreparedStatement;
  };
  return {
    prepare: (sqlText: string) => wrap(sqlText),
    exec: async (sqlText: string) => { sqlite.exec(sqlText); },
    batch: async (stmts: D1PreparedStatement[]) => {
      const out = [];
      for (const s of stmts) out.push(await (s as unknown as { run(): Promise<unknown> }).run());
      return out as never;
    },
  } as unknown as D1Database;
}

export async function applyMigrations(d1: D1Database): Promise<void> {
  const root = nodeSqlite.path.join(
    nodeSqlite.path.dirname(nodeSqlite.url.fileURLToPath(import.meta.url)),
    '..', '..', '..', '..',
  );
  const migDir = nodeSqlite.path.join(root, 'packages/db/migrations');
  for (const f of nodeSqlite.fs.readdirSync(migDir).filter((x: string) => x.endsWith('.sql')).sort()) {
    d1.exec(nodeSqlite.fs.readFileSync(nodeSqlite.path.join(migDir, f), 'utf8').split('--> statement-breakpoint').join(';'));
  }
}
```

Then refactor `apps/api/test/finance/e2e.test.ts` to import `makeD1`/`applyMigrations` from `../helpers/d1` and delete its local `nodeSqlite` hoisted block, local `makeD1`, and the migration loop in `beforeAll` (keep the session mock + R2 stub local). Re-run `pnpm --filter @vyro/api test test/finance` — must stay green.

- [ ] **Step 3: Create `apps/api/src/modules/webhooks/paymentslk.ts`**

Structure:

```ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { payments as paymentsTable, purchaseOrders, paymentEvents, chargebacks } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { resolveGateway, md5, type WebhookEvent, type GatewayProvider } from '@vyro/payments';
import { newId, NotificationType, TRUST_SEAL_TERM_MS } from '@vyro/shared';
import { writeLedgerEntry } from '../ledger';
import { generateReceiptForPayment } from '../invoices/generate';
import { recordAudit } from '../supplierProducts/repository';
import { httpError } from '../../lib/errors';
import { notifyOrderParties } from '../notifications/dispatcher';

const router = new Hono<{ Bindings: Env }>();

/**
 * payments.lk webhook endpoint. Body is JSON signed with
 * `Payments-Signature: t=<unix>,v1=<hex>` (HMAC-SHA256 over `t + "." + rawBody`,
 * 300s tolerance). Public — no session auth; cryptographic verification +
 * amount/currency binding + payment_events dedupe instead. CSRF-exempt.
 * The raw body text is verified byte-exactly — never parse-then-verify.
 */
async function handlePaymentsLkWebhook(c: Context<{ Bindings: Env }>) {
  const raw = await c.req.text();
  const env = c.env as Env;
  const signature = c.req.header('payments-signature') ?? null;
  const { adapter, provider } = resolveGateway(env);

  await recordAudit(env.DB, {
    actorUserId: null,
    action: 'PAYMENT_NOTIFICATION_RECEIVED',
    resourceType: 'payment',
    resourceId: 'unknown',
    metadata: { provider, bytes: raw.length },
  });

  if (!adapter.verifySignature(raw, signature)) {
    await recordAudit(env.DB, {
      actorUserId: null,
      action: 'PAYMENT_VERIFICATION_FAILED',
      resourceType: 'payment',
      resourceId: 'unknown',
      metadata: { provider, reason: 'bad-payments-signature' },
    });
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid webhook signature');
  }

  let event: WebhookEvent;
  try {
    event = await adapter.parseWebhook(raw, signature);
  } catch {
    throw httpError(400, 'VALIDATION_ERROR', 'Malformed webhook payload');
  }

  if (event.type === 'unknown') {
    return c.json({ ok: true, ignored: (event.raw as any)?.type ?? 'unknown' });
  }

  return c.json(await applyGatewayPaymentEvent(env, event, provider));
}

export async function applyGatewayPaymentEvent(
  env: Env,
  event: WebhookEvent,
  provider: GatewayProvider = 'payments_lk',
): Promise<{ ok: true; ignored?: string; alreadyProcessed?: boolean; trustSeal?: string; refund?: string; card?: string }> {
  // … (see steps below)
}

router.post('/payments-lk', handlePaymentsLkWebhook);
router.post('/plk-notify', handlePaymentsLkWebhook);

export default router;
```

`applyGatewayPaymentEvent` body, in order:

1. **TrustSEAL branch** — `event.gatewayRef.startsWith('ts_')`: only `payment.success` acts; dynamic-import `../trustSeal/repository` and call `trustSealRepository.activateFromWebhook(env.DB, event.gatewayRef, TRUST_SEAL_TERM_MS)`; unknown → `httpError(400, 'VALIDATION_ERROR', 'Unknown TrustSEAL payment')`; audit `TRUSTSEAL_ACTIVATED`; return `{ ok: true, trustSeal: 'activated' }`. Non-success → `{ ok: true, ignored: 'trustseal-non-success' }`.
2. **Refund events** (`refund.completed` | `refund.failed`) — BEFORE any payment-status guard (the parent payment is `confirmed` here). Dynamic-import `refunds` table + `finalizeRefund`/`failRefund` from `../refunds/executor`. Resolve the refund row: by `gatewayRefundId === event.refundId` when present, else the oldest `processing` refund on `paymentId = event.gatewayRef`. Unknown refund → audit `webhook.unknown_refund`, return `{ ok: true, ignored: 'unknown-refund' }`. `refund.completed` → `finalizeRefund(env, refund.id, { gatewayRefundId: event.refundId ?? null, providerReference: event.paymentId ?? null })`, return `{ ok: true, refund: 'completed' }`. `refund.failed` → `failRefund(env, refund.id, 'gateway:refund.failed')`, return `{ ok: true, refund: 'failed' }`.
3. **Payment lookup** — by `paymentsTable.id === event.gatewayRef`, legacy fallback by `paymentsTable.gatewayRef`. Unknown → audit `webhook.unknown_payment`, return `{ ok: true, ignored: 'unknown-payment' }`. Load the PO; missing → `{ ok: true, ignored: 'po-missing' }`.
4. **Amount/currency binding** — only for `event.type.startsWith('payment.')`: `event.amountCents !== payment.amountCents` → audit `PAYMENT_VERIFICATION_FAILED` + `httpError(400, 'VALIDATION_ERROR', 'Webhook amount mismatch')`; same pattern for currency mismatch (`Webhook currency mismatch`).
5. **Event storage** — insert `paymentEvents` `{ id: newId(), paymentId: payment.id, provider, eventType: event.type, providerPaymentId: event.paymentId ?? event.refundId ?? null, statusCode: event.statusCode ?? null, payloadHash: md5(JSON.stringify(event.raw)), receivedAt: now, processedAt: null, processingStatus: 'received' }` — the payload hash is the deterministic hash of the event's raw payload, never card fields. Unique violation (catch) → `{ ok: true, alreadyProcessed: true }`. Audit `PAYMENT_VERIFIED`.
6. **card.saved branch** — before the pending-payment guard (payment may be pending or confirmed). Missing `event.card?.id` → `{ ok: true, ignored: 'card-missing-id' }`; missing `payment.businessId` → `{ ok: true, ignored: 'card-no-business' }`. Dynamic-import `../savedCards/repository` and `savedCardsRepository.upsert(env.DB, { businessId: payment.businessId, paymentsLkCardId: event.card.id, brand: event.card.brand ?? null, last4: event.card.last4 ?? null, expiryMonth: event.card.expMonth ?? null, expiryYear: event.card.expYear ?? null })`; audit `SAVED_CARD_SAVED`; return `{ ok: true, card: 'saved' }`.
7. **Status guard** — `const chargebackOnPaid = event.type === 'payment.chargeback' && payment.status === 'confirmed';` then `if (payment.status !== 'pending' && !chargebackOnPaid) return { ok: true, alreadyProcessed: true };`
8. **`payment.success`** — transaction: payment → `status: 'confirmed', confirmedAt, paidAt, providerTransactionId: providerPaymentId`; ledger credit business `netCents` (`refType: 'payment'`); ledger credit platform `feeCents` when > 0 (`refType: 'fee'`). Then `closeOpenAttempt(env, payment.id, provider, providerPaymentId, 'paid')`; `ensureAllocationAndEarning(env.DB, payment.id, null)` (dynamic import, catch+log); `generateReceiptForPayment` + `INVOICE_AVAILABLE` notify (catch+log, audit `invoice.generate.failed` on receipt failure); `PAYMENT_RECEIVED` notification to both parties (catch+log); audit `PAYMENT_SUCCESS`; return `{ ok: true }`.

   Ledger/notification bodies: **port them from `apps/api/src/modules/webhooks/payhere.ts` BEFORE deleting that file in Step 5 of this task** — the success branch's `writeLedgerEntry` bodies (business credit `netCents` refType `payment`; platform credit `feeCents` refType `fee`) and the `notifyOrderParties` calls (INVOICE_AVAILABLE, PAYMENT_RECEIVED with body `Buyer paid online via payments.lk.`) are copied verbatim, changing only gateway-name copy text. Same for the cancelled/expired, chargeback and failed branches in steps 10-12 below.
9. **`payment.pending`** — audit `webhook.payment.pending`; return `{ ok: true }`.
10. **`payment.expired` | `payment.cancelled`** — update payment to `status: 'cancelled'`, `statusReason: 'gateway:<type>'`, `cancelledAt: now`, `expiredAt` set only for `payment.expired`; `closeOpenAttempt(..., 'cancelled', reason)`; notify buyer (`PAYMENT_FAILED` type, body "Gateway reported the checkout did not complete. You can try again."); audit `PAYMENT_EXPIRED`/`PAYMENT_CANCELLED`; return `{ ok: true }`.
11. **`payment.chargeback`** — update payment `status: 'chargeback'`, `statusReason: 'gateway:payment.chargeback'`; insert `chargebacks` row `{ id: newId(), paymentId, reason: 'payments-lk-dispute', status: 'open', createdAt }` (catch duplicate); `recomputeEligibilityForPayment` (catch+log); audit `PAYMENT_CHARGEBACK`; return `{ ok: true }`.
12. **Default (failed)** — update payment `status: 'failed'`, `statusReason: 'gateway:<type>'`, `failedAt: now`; `closeOpenAttempt(..., 'failed', reason)`; notify buyer (`PAYMENT_FAILED`, "The payment was not completed. Please retry."); audit `PAYMENT_FAILED`; return `{ ok: true }`.

Local helper in the same file:

```ts
async function closeOpenAttempt(
  env: Env,
  paymentId: string,
  provider: GatewayProvider,
  providerPaymentId: string | null,
  outcome: 'paid' | 'failed' | 'cancelled',
  failureReason?: string,
): Promise<void> {
  try {
    const { listAttempts, completeAttempt, recordAttempt } = await import('../finance/repository');
    const attempts = await listAttempts(env.DB, paymentId);
    const open = [...attempts].reverse().find((a: any) => ['initiated', 'processing'].includes(a.status));
    if (open) {
      await completeAttempt(env.DB, open.id, outcome, { providerReference: providerPaymentId, failureReason });
      return;
    }
    const { payments } = await import('@vyro/db/schema');
    const payment = (await getDb(env.DB).select().from(payments).where(eq(payments.id, paymentId)).get()) as any;
    if (!payment) return;
    const created = await recordAttempt(env.DB, {
      paymentId,
      provider,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: 'processing',
      providerReference: providerPaymentId,
      initiatedAt: Date.now(),
    });
    await completeAttempt(env.DB, created.id, outcome, { providerReference: providerPaymentId, failureReason });
  } catch (err) {
    console.error('[paymentslk.webhook] attempt tracking failed', err);
  }
}
```

- [ ] **Step 3: Mount the router and update middleware**

`apps/api/src/modules/webhooks/index.ts`:

```ts
import paymentsLkRouter from './paymentslk';
export default paymentsLkRouter;
```

`apps/api/src/middleware/verifyCsrf.ts` line 6:

```ts
const EXEMPT_EXACT = ['/api/csp-report', '/api/webhooks/payments-lk', '/api/webhooks/plk-notify'];
```

`apps/api/src/index.ts` line 113: delete the `/api/payments/payhere/*` rate-limit line (`/api/webhooks/*` already rate-limits the new path at 30/min).

- [ ] **Step 4: Fix the TrustSEAL notify URL**

`apps/api/src/modules/trustSeal/service.ts` line 53 becomes:

```ts
      notifyUrl: `${notifyBase}/api/webhooks/payments-lk`,
```

- [ ] **Step 5: Delete the old webhook module**

```bash
git rm apps/api/src/modules/webhooks/payhere.ts
```

- [ ] **Step 6: Update the finance e2e mock flow**

In `apps/api/test/finance/e2e.test.ts` section C:

- Webhook URL: `http://localhost/api/webhooks/payments-lk`.
- Body/content-type: `application/json`, body `JSON.stringify({ type: 'payment.success', data: { reference: ids.payC, amountCents: p.body.amountCents, id: 'MOCK-PAY-1', currency: 'LKR' } })`.
- Duplicate-delivery step posts the same body again; still expects `alreadyProcessed: true`.
- The "wrong amount" rejection posts `data.amountCents: 1` with `reference: ids.payC`; expects 400.
- Keep `co.body.provider === 'mock'` (adapter provider in test env).

- [ ] **Step 7: Write route-level webhook tests — `apps/api/test/webhooks/paymentslk.webhook.test.ts`**

Build a Hono app over the real webhooks router against `makeD1`/`applyMigrations`, seeding one user, business type, business, supplier, PO (`totalCents: 10000`) and a pending online payment (`amountCents: 10000, feeCents: 250, netCents: 9750, provider: 'payments_lk'`). Tests:

1. Signed success body (`{ id: 'evt_plk_pay_1', type: 'payment.succeeded', data: { reference: <payId>, amountCents: 10000, id: 'plk_pay_1', currency: 'LKR' } }`) → 200; payment row `confirmed` with `providerTransactionId === 'plk_pay_1'`; exactly 1 `payment_events` row; business ledger credit of `netCents`; platform fee ledger credit of 250.
2. Re-posting the same body → 200 with `alreadyProcessed: true` and still exactly 1 event row (dedupe).
3. Tampered amount (`amountCents: 1`, same reference) → 400, payment status unchanged.
4. Real-gateway signature rejection: set `env.PAYMENTS_LK_SECRET_KEY = 'sk_test_x'` and `env.PAYMENTS_LK_WEBHOOK_SECRET = 'whsec_x'`, post with header `Payments-Signature: t=1,v1=00`, expect 400, then delete both keys (restore mock).
5. `checkout.expired` event on a fresh pending payment → payment `cancelled` with `statusReason: 'gateway:checkout.expired'`.
6. `refund.completed` on a seeded processing refund row (with `gatewayRefundId: 're_gw_1'`) → refund `completed`.
7. `card.saved` on the pending payment with `data.card = { id: 'card_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }` → a `saved_cards` row exists for the business; duplicate delivery stays 1 row. (Card repository is created in Task 6 — if running this task before Task 6, the `card.saved` branch throws; either implement the repository in this task (preferred — copy Task 6 Step 3 early) or defer this assertion to Task 6. Choose: implement `savedCards/repository.ts` in Task 6 Step 3 and write this assertion then.)

Use `signWebhookBody(ts, body)` from `@vyro/payments` — actually the test env resolves the mock gateway WITHOUT a secret, so for mock-signed deliveries no signature header is needed (mock accepts null signature when no secret configured). For the real-gateway test (item 4), sign with `buildPaymentsSignatureHeader('whsec_x', raw)` and expect 200; use the bad header only for the rejection case.

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @vyro/api test test/webhooks test/finance`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api
git commit -m "feat(webhooks): payments.lk signed webhook endpoint with refund + card event handling"
```

---

### Task 4: Provider defaults + checkout-status polling endpoint

**Files:**
- Modify: `apps/api/src/modules/payments/routes.ts` (lines ~177, ~198, checkout handler ~461-565)
- Modify: `packages/db/src/schema/payments.ts` (line 16), `packages/db/src/schema/paymentAttempts.ts` (line 18), `packages/db/src/schema/purchaseOrders.ts` (lines 70-73)
- Modify (test): `apps/api/test/finance/e2e.test.ts`

**Interfaces:**
- Consumes: `resolveGateway` (Task 2), `applyGatewayPaymentEvent` (Task 3), `adapter.getCheckoutStatus?` (Task 1).
- Produces: `POST /api/payments/:id/checkout-status` → `{ status: string, source: 'payment' | 'gateway' | 'unknown' }`; new payment rows `provider='payments_lk'`; `gatewayPayload` = `{ provider, orderId, checkoutId }`.

- [ ] **Step 1: Flip provider defaults in payment creation**

`apps/api/src/modules/payments/routes.ts` — both creation sites (lines ~177 and ~198):

```ts
provider: parsed.data.method === 'online' ? 'payments_lk' : 'manual',
```

- [ ] **Step 2: Update the checkout route env reads + payload**

In the `/:id/checkout` handler:

```ts
  const env = c.env as Env;
  const { adapter, provider } = resolveGateway(env);
  const origin = env.WEB_ORIGIN;
  const notifyUrl = env.PAYMENTS_LK_WEBHOOK_URL ?? `${origin}/api/webhooks/payments-lk`;
  const returnUrl =
    env.PAYMENTS_LK_RETURN_URL ?? `${origin}/orders/${po.id}/payment-success?paymentId=${payment.id}`;
  const cancelUrl =
    env.PAYMENTS_LK_CANCEL_URL ?? `${origin}/orders/${po.id}/payment-cancel?paymentId=${payment.id}`;
```

and in the post-checkout update:

```ts
  await db.update(payments)
    .set({
      gatewayRef: result.gatewayRef,
      gatewayPayload: JSON.stringify({ provider, orderId: payment.id, checkoutId: result.gatewayRef }),
      providerReference: result.gatewayRef,
      updatedAt: Date.now(),
    })
    .where(eq(payments.id, payment.id))
    .run();
```

The response keeps `redirectUrl`, `gatewayRef`, `expiresAt`, `provider: adapter.provider`, `isMock`.

- [ ] **Step 3: Add the checkout-status polling endpoint**

Append before `export default router;` in `apps/api/src/modules/payments/routes.ts`:

```ts
// Late-webhook fallback: confirm payment state from the provider checkout.
// Server truth only — the browser redirect never confirms anything.
router.post('/:id/checkout-status', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const payment = await findPaymentForUpdate(c.env.DB, c.req.param('id'));
  if (!payment) throw httpError(404, 'NOT_FOUND', 'Payment not found');
  if (payment.method !== 'online') {
    throw httpError(400, 'VALIDATION_ERROR', 'Only online payments have gateway status');
  }

  const { po } = await rolesForPo(c.env.DB, payment.purchaseOrderId, ctx.userId, ctx.isAdmin);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!ctx.isAdmin) {
    try {
      await requireBusinessPaymentRole(c.env.DB, po.businessId, ctx.userId);
    } catch {
      throw httpError(403, 'FORBIDDEN', 'Insufficient role');
    }
  }

  if (payment.status !== 'pending') {
    return c.json({ status: payment.status, source: 'payment' });
  }

  const env = c.env as Env;
  const { adapter } = resolveGateway(env);
  if (!payment.gatewayRef || !adapter.getCheckoutStatus) {
    return c.json({ status: 'pending', source: 'unknown' });
  }
  const st = await adapter.getCheckoutStatus(payment.gatewayRef);
  if (st.status === 'succeeded') {
    const { applyGatewayPaymentEvent } = await import('../webhooks/paymentslk');
    await applyGatewayPaymentEvent(env, {
      type: 'payment.success',
      gatewayRef: payment.gatewayRef,
      paymentId: st.paymentId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      raw: { source: 'checkout-status-poll' },
    });
    const fresh = await findPaymentForUpdate(c.env.DB, payment.id);
    return c.json({ status: fresh?.status ?? payment.status, source: 'gateway' });
  }
  return c.json({ status: st.status, source: 'gateway' });
});
```

- [ ] **Step 4: Update the schema defaults**

`packages/db/src/schema/payments.ts` line 16:

```ts
    provider: text('provider').notNull().default('payments_lk'),
```

`packages/db/src/schema/paymentAttempts.ts` line 18:

```ts
    provider: text('provider').notNull().default('payments_lk'),
```

`packages/db/src/schema/purchaseOrders.ts` lines 70-73:

```ts
    // Buyer payment choice at checkout. 'payments_lk' is the current gateway;
    // 'payhere' is a legacy value kept for historical rows; 'wire' is cross-border SWIFT.
    paymentMethod: text('payment_method', { enum: ['payments_lk', 'payhere', 'wire'] }).notNull().default('payments_lk'),
```

Update `apps/api/src/modules/purchaseOrders/service.ts` line 117 type and line 247 write:

```ts
    const created: Array<{ poId: string; direction: 'domestic' | 'export' | 'import'; paymentMethod: 'payments_lk' | 'wire' }> = [];
```

```ts
        paymentMethod: (crossBorder?.direction && crossBorder.direction !== 'domestic') ? 'wire' : 'payments_lk',
```

`apps/api/src/modules/purchaseOrders/repository.ts` line 31 and 40:

```ts
    paymentMethod?: 'payments_lk' | 'payhere' | 'wire';
```

```ts
    paymentMethod ?? (direction && direction !== 'domestic' ? 'wire' : 'payments_lk');
```

- [ ] **Step 5: Update frontend type usages of the PO payment method**

- `apps/web/src/pages/OrderDetailPage.tsx` line 72: `paymentMethod: 'payments_lk' | 'payhere' | 'wire';` (the `=== 'wire'` check at line 841 is untouched).
- `apps/mobile/src/features/buyer/orders/types.ts` line 28: `paymentMethod: 'payments_lk' | 'payhere' | 'wire';`
- `apps/mobile/src/features/buyer/orders/types.ts` line 129 and `apps/mobile/src/features/buyer/commerce/types.ts` line 308 (`paymentMethod: 'wire'`) are untouched.

- [ ] **Step 6: e2e assertion**

In `apps/api/test/finance/e2e.test.ts` section C, after the confirmed-chain assertion add:

```ts
    expect(chain.body.payment.provider).toBe('payments_lk');
```

Run: `pnpm --filter @vyro/api test test/finance`
Expected: PASS.

- [ ] **Step 7: Generate the provider-default migration**

Run: `pnpm --filter @vyro/db exec drizzle-kit generate --name payments_lk_provider`
Expected: new `packages/db/migrations/0050_payments_lk_provider.sql` (SQLite table-recreate for default changes — drizzle-kit emits it; review the generated SQL). Then:

Run: `pnpm --filter @vyro/api db:migrate:local`

- [ ] **Step 8: Commit**

```bash
git add packages/db apps/api
git commit -m "feat(payments): payments_lk provider defaults + checkout-status polling endpoint"
```

---

### Task 5: Gateway refunds wiring + lifecycle tests

**Files:**
- Modify: `apps/api/src/modules/refunds/executor.ts` (lines ~97, ~111, ~147-173, ~189)
- Create (test): `apps/api/test/refunds/gatewayRefund.test.ts`

**Interfaces:**
- Consumes: `executeRefund`, `processViaGateway`, `finalizeRefund`, `failRefund` from `../../src/modules/refunds/executor`; mock adapter `refundResult: 'pending'`; `applyGatewayPaymentEvent` refund branch (Task 3).
- Produces: refunds route through the gateway only when `payment.provider === 'payments_lk'`; pending gateway refunds persist `gatewayRefundId` immediately; `RefundInput.providerTransactionId` passed to the adapter.

- [ ] **Step 1: Update the refund executor**

In `apps/api/src/modules/refunds/executor.ts`:

Eligibility (~line 97):

```ts
  const now = Date.now();
  const id = newId();
  const online = payment.method === 'online' && !!payment.gatewayRef;
  // Only current-generation gateway payments auto-refund through the API.
  // Legacy PayHere rows (provider='payhere') keep the manual admin queue.
  const gatewayEligible = online && payment.provider === 'payments_lk';
  const auto = (input.mode ?? 'auto') === 'auto' && gatewayEligible;
```

Insert `refundMethod` (~line 111):

```ts
        refundMethod: gatewayEligible ? 'gateway' : payment.method,
```

`settleApprovedRefund` (~line 189):

```ts
  if (payment?.method === 'online' && payment.provider === 'payments_lk' && payment.gatewayRef) {
    await db.update(refunds).set({ status: 'processing', updatedAt: Date.now() }).where(eq(refunds.id, refundId)).run();
    return processViaGateway(env, refundId);
  }
```

`processViaGateway` gateway call (~line 155-169):

```ts
    const { adapter } = resolveGateway(env as Env);
    const result = await adapter.refund({
      paymentGatewayRef: payment.gatewayRef,
      refundId: refund.id,
      amountCents: refund.amountCents,
      reason: refund.reason ?? '',
      providerTransactionId: payment.providerTransactionId ?? undefined,
    });
    if (result.status === 'completed') {
      await finalizeRefund(env, refundId, { gatewayRefundId: result.gatewayRefundId ?? null });
      return 'completed';
    }
    if (result.status === 'failed') return failRefund(env, refundId, 'gateway refused refund');
    // pending: the gateway webhook (refund.completed / refund.failed) finalizes.
    await db
      .update(refunds)
      .set({ status: 'processing', gatewayRefundId: result.gatewayRefundId || undefined, updatedAt: Date.now() })
      .where(eq(refunds.id, refundId))
      .run();
    return 'processing';
```

- [ ] **Step 2: Write `apps/api/test/refunds/gatewayRefund.test.ts`**

Setup (pattern from `test/finance/e2e.test.ts` beforeAll, using `makeD1`/`applyMigrations`): users `buyer`; business + supplier + business/supplier memberships; PO (`totalCents: 10000`); two confirmed online payments — `payLk` (`provider: 'payments_lk'`, `gatewayRef: 'ch_lk_1'`, `providerTransactionId: 'plk_pay_1'`) and `payPh` (`provider: 'payhere'`, `gatewayRef: 'ch_ph_1'`). After seeding `payLk`, create its allocation + earning row with `ensureAllocationAndEarning(env.DB, payLk, null)` (import from `../../src/modules/finance/earnings`) so refund deltas have an earning to adjust.

Tests:

1. **Auto gateway refund completes immediately**: `executeRefund(env, { paymentId: payLk, amountCents: 4000, source: 'manual', reason: 'partial shortage', actorUserId: null, idempotencyKey: 'gr-test-1' })` → `status: 'completed'` (mock adapter completes synchronously); refund row `refundMethod: 'gateway'`, `gatewayRefundId: /^MOCK-RFND-/`; a ledger row with `refId === refundId && category === 'REFUND'` exists (ledger table export: `schema.ledgerEntries` mapping `ledger_entries` — confirm the exact export name with a grep of `ledger_entries` in `packages/db/src/schema` before writing the assertion); supplier earning `refundCents` grew by 4000; replaying the same idempotency key returns `reused: true`.
2. **Pending gateway refund finalizes via webhook**: seed a `processing` refund row on `payLk` with `gatewayRefundId: 're_gw_1'`, `amountCents: 2000`, `idempotencyKey: 'gr-test-2'`; call `applyGatewayPaymentEvent(env, { type: 'refund.completed', gatewayRef: payLk, refundId: 're_gw_1', amountCents: 2000, raw: { type: 'refund.completed' } })` → result `refund: 'completed'`; refund row `status === 'completed'`.
3. **refund.failed marks failed**: same seed with `re_gw_2` (`idempotencyKey: 'gr-test-3'`); `refund.failed` event → refund row `status === 'failed'` with `failureReason: 'gateway:refund.failed'`.
4. **Legacy PayHere stays manual**: `executeRefund` on `payPh` → `status: 'requested'` (queued; never auto-sent to a gateway).

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @vyro/api test test/refunds test/finance`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/refunds apps/api/test/refunds
git commit -m "feat(refunds): real payments.lk gateway refunds with webhook-driven completion"
```

---

### Task 6: Saved cards — schema, migration, repository, routes, off-session charge

**Files:**
- Create: `packages/db/src/schema/savedCards.ts`
- Modify: `packages/db/src/schema/index.ts` (export alongside other tables)
- Create migration via drizzle-kit
- Create: `apps/api/src/modules/savedCards/repository.ts`, `apps/api/src/modules/savedCards/routes.ts`
- Modify: `apps/api/src/index.ts` (mount), `apps/api/src/modules/payments/routes.ts` (checkout body)
- Create (test): `apps/api/test/savedCards/savedCards.test.ts`

**Interfaces:**
- Consumes: `applyGatewayPaymentEvent` card.saved branch calls `savedCardsRepository.upsert` (Task 3); `adapter.chargeSavedCard?` (Task 1).
- Produces: `savedCardsRepository.listForBusiness(d1, businessId)`, `.getById(d1, id)`, `.upsert(d1, input)`, `.remove(d1, id, businessId): Promise<boolean>`; routes `GET /api/payments/saved-cards?businessId=…` → `{ cards: [{ id, brand, last4, expiryMonth, expiryYear, createdAt }] }`, `DELETE /api/payments/saved-cards/:id` → `{ ok: true }`; checkout body `{ useSavedCardId?: string }`.

- [ ] **Step 1: Schema — `packages/db/src/schema/savedCards.ts`**

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

export const savedCards = sqliteTable(
  'saved_cards',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    paymentsLkCardId: text('payments_lk_card_id').notNull(),
    brand: text('brand'),
    last4: text('last4'),
    expiryMonth: integer('expiry_month'),
    expiryYear: integer('expiry_year'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    businessIdx: index('saved_cards_business_idx').on(t.businessId),
    businessCardUq: uniqueIndex('saved_cards_business_card_uq').on(t.businessId, t.paymentsLkCardId),
  }),
);

export type SavedCard = typeof savedCards.$inferSelect;
export type NewSavedCard = typeof savedCards.$inferInsert;
```

Export `savedCards` (and types) from `packages/db/src/schema/index.ts` following the file's existing export pattern.

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @vyro/db exec drizzle-kit generate --name saved_cards`
Expected: `packages/db/migrations/0051_saved_cards.sql` with the `saved_cards` CREATE TABLE + unique index. Review it, then:

Run: `pnpm --filter @vyro/api db:migrate:local`

- [ ] **Step 3: Repository — `apps/api/src/modules/savedCards/repository.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { savedCards, type SavedCard } from '@vyro/db/schema';

export interface UpsertSavedCardInput {
  businessId: string;
  paymentsLkCardId: string;
  brand?: string | null;
  last4?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
}

export const savedCardsRepository = {
  async listForBusiness(d1: D1Database, businessId: string): Promise<SavedCard[]> {
    return (await getDb(d1).select().from(savedCards).where(eq(savedCards.businessId, businessId)).all()) as SavedCard[];
  },

  async getById(d1: D1Database, id: string): Promise<SavedCard | null> {
    return ((await getDb(d1).select().from(savedCards).where(eq(savedCards.id, id)).get()) as SavedCard | undefined) ?? null;
  },

  async upsert(d1: D1Database, input: UpsertSavedCardInput): Promise<SavedCard> {
    const db = getDb(d1);
    const existing = (await db
      .select()
      .from(savedCards)
      .where(and(eq(savedCards.businessId, input.businessId), eq(savedCards.paymentsLkCardId, input.paymentsLkCardId)))
      .get()) as SavedCard | undefined;
    const now = Date.now();
    if (existing) {
      await db
        .update(savedCards)
        .set({
          brand: input.brand ?? undefined,
          last4: input.last4 ?? undefined,
          expiryMonth: input.expiryMonth ?? undefined,
          expiryYear: input.expiryYear ?? undefined,
          updatedAt: now,
        })
        .where(eq(savedCards.id, existing.id))
        .run();
      return (await this.getById(d1, existing.id))!;
    }
    const id = `sc_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    await db
      .insert(savedCards)
      .values({
        id,
        businessId: input.businessId,
        paymentsLkCardId: input.paymentsLkCardId,
        brand: input.brand ?? null,
        last4: input.last4 ?? null,
        expiryMonth: input.expiryMonth ?? null,
        expiryYear: input.expiryYear ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return (await this.getById(d1, id))!;
  },

  async remove(d1: D1Database, id: string, businessId: string): Promise<boolean> {
    const result = await getDb(d1)
      .delete(savedCards)
      .where(and(eq(savedCards.id, id), eq(savedCards.businessId, businessId)))
      .run();
    const r = result as unknown as { meta?: { changes?: number } };
    return Number(r?.meta?.changes ?? 0) > 0;
  },
};
```

- [ ] **Step 4: Routes — `apps/api/src/modules/savedCards/routes.ts`**

```ts
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../../env';
import { getDb, businesses } from '@vyro/db';
import { httpError } from '../../lib/errors';
import { session } from '../../middleware/session';
import { requireBusinessPaymentRole } from '../payments/membership';
import { recordAudit } from '../supplierProducts/repository';
import { savedCardsRepository } from './repository';

const router = new Hono<{ Bindings: Env }>();

/** GET /api/payments/saved-cards?businessId=… */
router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as { userId: string; isAdmin: boolean } | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId') ?? '';
  const db = getDb(c.env.DB);
  const biz = (await db.select().from(businesses).where(eq(businesses.id, businessId)).get()) as any;
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');
  if (!ctx.isAdmin) {
    await requireBusinessPaymentRole(c.env.DB, businessId, ctx.userId);
  }
  const cards = await savedCardsRepository.listForBusiness(c.env.DB, businessId);
  return c.json({
    cards: cards.map((card) => ({
      id: card.id,
      brand: card.brand,
      last4: card.last4,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      createdAt: card.createdAt,
    })),
  });
});

/** DELETE /api/payments/saved-cards/:id */
router.delete('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as { userId: string; isAdmin: boolean } | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const card = await savedCardsRepository.getById(c.env.DB, c.req.param('id'));
  if (!card) throw httpError(404, 'NOT_FOUND', 'Card not found');
  if (!ctx.isAdmin) {
    await requireBusinessPaymentRole(c.env.DB, card.businessId, ctx.userId);
  }
  const ok = await savedCardsRepository.remove(c.env.DB, c.req.param('id'), card.businessId);
  if (!ok) throw httpError(409, 'CONFLICT', 'Card already removed');
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'SAVED_CARD_DELETED',
    resourceType: 'saved_card',
    resourceId: c.req.param('id'),
    metadata: { businessId: card.businessId },
  });
  return c.json({ ok: true });
});

export default router;
```

Note: import `businesses` from `@vyro/db/schema` if `@vyro/db` does not re-export tables at the package root — match how `../payments/routes.ts` imports them (`getDb`/schema from `@vyro/db`, tables from `@vyro/db/schema`).

- [ ] **Step 5: Mount in `apps/api/src/index.ts`**

Next to the payments mount:

```ts
import savedCardsRouter from './modules/savedCards/routes';
app.route('/api/payments/saved-cards', savedCardsRouter);
```

- [ ] **Step 6: Off-session charge in the checkout route**

In `apps/api/src/modules/payments/routes.ts` `/:id/checkout`, after the RBAC block and before the hosted-checkout block:

```ts
  const checkoutBody = (await c.req.json().catch(() => ({}))) as { useSavedCardId?: string };

  if (checkoutBody.useSavedCardId) {
    const { savedCardsRepository } = await import('../savedCards/repository');
    const card = await savedCardsRepository.getById(c.env.DB, checkoutBody.useSavedCardId);
    if (!card || card.businessId !== po.businessId) {
      throw httpError(404, 'NOT_FOUND', 'Saved card not found');
    }
    if (adapter.chargeSavedCard) {
      const charge = await adapter.chargeSavedCard({
        cardId: card.paymentsLkCardId,
        amountCents: payment.amountCents,
        description: `PO ${po.poNumber}`,
        reference: payment.id,
        idempotencyKey: `charge_${payment.id}`,
      });
      try {
        await recordAttempt(c.env.DB, {
          paymentId: payment.id,
          provider,
          amountCents: payment.amountCents,
          currency: payment.currency,
          status: 'processing',
          providerReference: charge.paymentId ?? card.paymentsLkCardId,
          initiatedByUserId: ctx.userId,
          initiatedAt: Date.now(),
        });
      } catch (err) {
        console.error('[payments.checkout] attempt record failed', err);
      }
      await recordAudit(c.env.DB, {
        actorUserId: ctx.userId,
        action: 'PAYMENT_SAVED_CARD_CHARGE',
        resourceType: 'purchase_order',
        resourceId: po.id,
        metadata: { paymentId: payment.id, provider, outcome: charge.status },
      });
      if (charge.status === 'succeeded') {
        const { applyGatewayPaymentEvent } = await import('../webhooks/paymentslk');
        await applyGatewayPaymentEvent(env, {
          type: 'payment.success',
          gatewayRef: payment.id,
          paymentId: charge.paymentId,
          amountCents: payment.amountCents,
          currency: payment.currency,
          raw: { source: 'saved-card-charge', cardId: card.paymentsLkCardId },
        });
        return c.json({ status: 'succeeded', provider: adapter.provider, isMock: adapter.provider === 'mock' });
      }
      // Declined → fall through to the hosted checkout for a new attempt.
    }
  }
```

(`recordAttempt` and `httpError` are already imported in the file; `resolveGateway`/`env` are already resolved in the handler — declare `env` before this block: `const env = c.env as Env;`.)

- [ ] **Step 7: Write `apps/api/test/savedCards/savedCards.test.ts`**

Pattern: `makeD1`/`applyMigrations`; `vi.mock('../../src/middleware/session', …)` with an `actor.ctx` object like `test/finance/e2e.test.ts`; seed user + business type + business + businessMember(owner) + supplier + PO + pending online payment. Tests:

1. `card.saved` event (`data.reference = payId`, `data.card = { id: 'card_1', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030 }`) via `applyGatewayPaymentEvent` → `saved_cards` row for the business; duplicate delivery → still 1 row.
2. `GET /api/payments/saved-cards?businessId=<biz>` as owner → 200, one card with `last4: '4242'` and no PAN-like fields in the JSON.
3. `DELETE /api/payments/saved-cards/:id` as owner → `{ ok: true }`; a non-member user context → 403.
4. Checkout with body `{ useSavedCardId: <cardId> }` (mock adapter) → 200 `{ status: 'succeeded', isMock: true }`; payment row `confirmed`; ≥2 attempts recorded (creation + charge).

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @vyro/api test test/savedCards test/payments`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/db apps/api
git commit -m "feat(payments): saved cards — table, repository, REST, card.saved webhook, off-session charge"
```

---

### Task 7: Canonical method + provider labels + admin search + web frontend

**Files:**
- Modify: `packages/shared/src/constants/paymentStatus.ts`, `packages/shared/src/lib/money.ts`
- Modify: `apps/api/src/modules/admin/payments/paymentSearchRepository.ts` (line 33), `paymentSearchService.ts` (line 23)
- Modify: `apps/web/src/admin/useAdminPaymentSearch.ts` (line 12), `apps/web/src/admin/PaymentsPage.tsx` (provider filter)
- Modify: `apps/web/src/components/payments/PaymentPanel.tsx`
- Create: `apps/web/src/components/payments/SavedCardsPanel.tsx`
- Modify: `apps/web/src/pages/AccountsPage.tsx`

**Interfaces:**
- Produces: `CanonicalPaymentMethod.PAYMENTS_LK` (`online → PAYMENTS_LK`, `PAYHERE` deprecated legacy alias); `providerLabel(provider)` in `@vyro/shared`; web `PaymentProvider = 'payments_lk' | 'payhere' | 'mock'`; `SavedCardsPanel` component.

- [ ] **Step 1: Canonical method rename in `packages/shared/src/constants/paymentStatus.ts`**

```ts
export const CanonicalPaymentMethod = {
  PAYMENTS_LK: 'PAYMENTS_LK',
  COD: 'COD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  /** Deprecated: historical alias for PAYMENTS_LK (old-data display only). */
  PAYHERE: 'PAYHERE',
} as const;
export type CanonicalPaymentMethod =
  (typeof CanonicalPaymentMethod)[keyof typeof CanonicalPaymentMethod];

const LEGACY_METHOD_TO_CANONICAL: Record<string, CanonicalPaymentMethod> = {
  online: 'PAYMENTS_LK',
  cash: 'COD',
  bank_transfer: 'BANK_TRANSFER',
};

const CANONICAL_METHOD_TO_LEGACY: Record<CanonicalPaymentMethod, PaymentMethod> = {
  PAYMENTS_LK: 'online',
  COD: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  PAYHERE: 'online',
};

export function toCanonicalMethod(method: string): CanonicalPaymentMethod {
  if (method === 'PAYHERE') return CanonicalPaymentMethod.PAYMENTS_LK;
  const c = LEGACY_METHOD_TO_CANONICAL[method] ?? (method as CanonicalPaymentMethod);
  if (c !== 'PAYMENTS_LK' && c !== 'COD' && c !== 'BANK_TRANSFER') {
    throw new Error(`Unknown payment method: ${method}`);
  }
  return c;
}
```

Add to `packages/shared/src/lib/money.ts`:

```ts
/** Human label for a stored gateway provider value (historical-safe). */
export function providerLabel(provider: string | null | undefined): string {
  if (provider === 'payhere') return 'PayHere (legacy)';
  if (provider === 'mock') return 'Simulator';
  if (provider === 'payments_lk') return 'Payments.lk';
  return provider ?? '—';
}
```

Run: `pnpm --filter @vyro/shared test` then grep `PAYHERE` across `apps/` + `packages/` and fix any strict comparisons against the old canonical value (`'PAYHERE'` equality → use `toCanonicalMethod()` or compare against both).

- [ ] **Step 2: Admin search provider values**

`apps/api/src/modules/admin/payments/paymentSearchRepository.ts` line 33:

```ts
export type PaymentProvider = 'payments_lk' | 'payhere' | 'mock';
```

`apps/api/src/modules/admin/payments/paymentSearchService.ts` line 23:

```ts
const ALL_PROVIDERS = ['payments_lk', 'payhere', 'mock'] as const;
```

- [ ] **Step 3: Web admin filter**

`apps/web/src/admin/useAdminPaymentSearch.ts` line 12:

```ts
export type PaymentProvider = 'payments_lk' | 'payhere' | 'mock';
```

`apps/web/src/admin/PaymentsPage.tsx`: find the provider filter select; options become `payments_lk` → "Payments.lk", `payhere` → "PayHere (legacy)", `mock` → "Simulator" (label via `providerLabel`).

- [ ] **Step 4: Web PaymentPanel — copy + saved cards**

`apps/web/src/components/payments/PaymentPanel.tsx` changes:

1. Line ~132-136 branding block:

```tsx
      <div className="border border-ink/10 p-3">
        <div className="text-xs uppercase tracking-[0.14em] text-ink-4">Payment method</div>
        <div className="mt-1 font-medium">payments.lk</div>
        <p className="mt-1 text-xs text-ink-4">
          Pay securely by card through payments.lk's 3-D Secure checkout. You will be redirected to
          complete payment — we never see or store your card details.
        </p>
      </div>
```

2. Line ~60 mock warning copy:

```ts
        setErr('Online checkout is running against the staging payment simulator — no real money will move. Configure payments.lk credentials for live payments.');
```

3. Line ~198 create-payment notes copy: `'Pay online via payments.lk'`.
4. Line ~217 footer copy: `After payment you will return here — status updates only from server confirmation.`

5. Saved-card support — add above `payOnline`:

```tsx
  const { data: cardsData } = useQuery({
    queryKey: ['saved-cards'],
    queryFn: () =>
      api.get<{ cards: Array<{ id: string; brand: string | null; last4: string | null; expiryMonth: number | null; expiryYear: number | null }> }>(
        `/payments/saved-cards?businessId=${user?.memberships?.[0]?.businessId ?? ''}`,
      ),
    enabled: isBusinessMember,
  });
  const savedCards = cardsData?.cards ?? [];
  const [useCardId, setUseCardId] = useState('');
```

In `payOnline`, send the selected card and handle the non-redirect success:

```tsx
      const r = await api.post<{ redirectUrl?: string; isMock: boolean; provider: string; status?: string }>(
        `/payments/${paymentId}/checkout`,
        useCardId ? { useSavedCardId: useCardId } : {},
      );
      if (r.status === 'succeeded') {
        await refetch();
        return;
      }
      if (r.isMock) {
        setErr('Online checkout is running against the staging payment simulator — no real money will move. Configure payments.lk credentials for live payments.');
      }
      window.location.href = r.redirectUrl!;
```

Saved-card selector above the pay buttons (render only when `savedCards.length > 0`):

```tsx
      {canRecord && savedCards.length > 0 && (
        <select
          className="border border-ink/10 p-2 text-sm"
          value={useCardId}
          onChange={(e) => setUseCardId(e.target.value)}
          aria-label="Use a saved card"
        >
          <option value="">New card (hosted checkout)</option>
          {savedCards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.brand ?? 'Card'} ····{c.last4} (exp {c.expiryMonth}/{c.expiryYear})
            </option>
          ))}
        </select>
      )}
```

- [ ] **Step 5: Create `apps/web/src/components/payments/SavedCardsPanel.tsx`**

```tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, ErrorBanner, Surface } from '@/components/ui';
import { useAuth } from '@/lib/auth';

interface SavedCard {
  id: string;
  brand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  createdAt: number;
}

export function SavedCardsPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [err, setErr] = useState('');
  const businessId = user?.memberships?.[0]?.businessId ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['saved-cards', businessId],
    queryFn: () => api.get<{ cards: SavedCard[] }>(`/payments/saved-cards?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const forget = useMutation({
    mutationFn: (id: string) => api.delete(`/payments/saved-cards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-cards', businessId] }),
    onError: (e) => setErr(e instanceof Error ? e.message : 'Delete failed'),
  });

  const cards = data?.cards ?? [];

  return (
    <Surface className="p-5 space-y-3">
      <div>
        <div className="vyro-kicker">Saved cards</div>
        <h3 className="font-display text-lg mt-1">Cards kept on file with payments.lk</h3>
      </div>
      <ErrorBanner message={err} />
      {isLoading ? (
        <p className="text-sm text-ink-4">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="text-sm text-ink-4">
          No saved cards. Tick "save card" at checkout to keep one for one-tap payments.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center justify-between border-b border-ink/5 pb-2">
              <span>
                {c.brand ?? 'Card'} ····{c.last4}{' '}
                <span className="text-[11px] text-ink-4">
                  exp {c.expiryMonth}/{c.expiryYear}
                </span>
              </span>
              <Button size="sm" variant="secondary" loading={forget.isPending} onClick={() => forget.mutate(c.id)}>
                Forget
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
```

Note: check the `api` wrapper's delete support (`api.delete`) against `apps/web/src/lib/api.ts`; if absent, use that file's generic-request convention instead.

- [ ] **Step 6: Mount in AccountsPage**

`apps/web/src/pages/AccountsPage.tsx`: import `SavedCardsPanel` and render it in the Overview tab next to the balance/summary sections.

- [ ] **Step 7: Run web tests + typecheck**

Run: `pnpm --filter @vyro/shared test && pnpm --filter @vyro/web test && pnpm --filter @vyro/web typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared apps/api/src/modules/admin/payments apps/web
git commit -m "feat(web): payments.lk branding, canonical method rename, saved-cards management"
```

---

### Task 8: Mobile — copy, types, admin filter, saved-card toggle

**Files:**
- Modify: `apps/mobile/src/features/buyer/orders/OrderDetailScreen.tsx` (lines 371, 527, 602 + saved-card support in PaymentCard)
- Modify: `apps/mobile/src/features/buyer/orders/components/DeliveryCard.tsx` (line 82)
- Modify: `apps/mobile/src/features/buyer/commerce/CheckoutScreen.tsx` (lines 218, 259, 303)
- Modify: `apps/mobile/src/features/buyer/commerce/PaymentReturnScreen.tsx` (line 18 comment)
- Modify: `apps/mobile/src/features/buyer/rfqs/RfqCreateScreen.tsx` (line 206)
- Modify: `apps/mobile/src/features/buyer/finance/shared.tsx` (lines 19-20)
- Modify: `apps/mobile/src/features/buyer/finance/AccountsScreen.tsx` (lines 361, 414)
- Modify: `apps/mobile/src/features/admin/money/api.ts` (line 64), `apps/mobile/src/features/admin/money/payments/PaymentsScreen.tsx` (line 314)

**Interfaces:**
- Consumes: `providerLabel` from `@vyro/shared`; checkout body `useSavedCardId`.

- [ ] **Step 1: Copy updates (exact replacements)**

- `OrderDetailScreen.tsx:371`: `{ label: 'Payment', value: order.paymentMethod === 'wire' ? 'Bank wire' : 'payments.lk' }`
- `OrderDetailScreen.tsx:527`: `notes: lastFailed ? \`Retry after ${lastFailed.status}\` : 'Pay online via payments.lk',`
- `OrderDetailScreen.tsx:602`: `Outstanding {formatLKR(outstanding)} · online checkout opens payments.lk in a browser; status updates from server confirmation.`
- `DeliveryCard.tsx:82`: `VYRO escrow · {order.paymentMethod === 'wire' ? 'bank wire' : 'payments.lk / bank transfer'}`
- `CheckoutScreen.tsx:218`: `['Flexible settlement', 'Pay online via payments.lk (Visa / Mastercard, 3-D Secure) or bank wire.']`
- `CheckoutScreen.tsx:259`: `payments.lk Online (Visa, MasterCard) · Corporate bank wire · 256-bit TLS`
- `CheckoutScreen.tsx:303`: `sub="payments.lk online or bank transfer"`
- `PaymentReturnScreen.tsx:18`: `* payments.lk return hop — the gateway redirects here before the server webhook`
- `RfqCreateScreen.tsx:206`: `hint="e.g. Net 14, payments.lk on order"`
- `finance/shared.tsx:19-20`: `online: { label: 'payments.lk', tone: 'volt' },` and `payhere: { label: 'PayHere (legacy)', tone: 'volt' },`
- `AccountsScreen.tsx:361`: `Every payments.lk / bank transfer payment is held in licensed escrow until GRN or order completion. Refunds settle within 1–2 business days.`
- `AccountsScreen.tsx:414`: `{ value: 'online', label: 'payments.lk' },`

- [ ] **Step 2: Admin provider filter**

`apps/mobile/src/features/admin/money/api.ts` line 64:

```ts
export type PaymentProvider = 'payments_lk' | 'payhere' | 'mock';
```

`apps/mobile/src/features/admin/money/payments/PaymentsScreen.tsx` line 314 filter options:

```ts
{ v: 'payments_lk', l: 'Payments.lk' },
{ v: 'payhere', l: 'PayHere (legacy)' },
{ v: 'mock', l: 'Simulator' },
```

- [ ] **Step 3: Saved-card toggle in OrderDetailScreen's PaymentCard**

Extend `payOnline` to charge a saved card when the buyer selects one:

```tsx
  const [useCardId, setUseCardId] = useState('');
  const cardsQ = useQuery({
    queryKey: ['saved-cards'],
    queryFn: () =>
      api.get<{ cards: Array<{ id: string; brand: string | null; last4: string | null; expiryMonth: number | null; expiryYear: number | null }> }>(
        `/payments/saved-cards?businessId=${order.businessId}`,
      ),
  });
  const savedCards = cardsQ.data?.cards ?? [];
```

In `payOnline`, after resolving `id`:

```tsx
      const r = await api.post<{ redirectUrl?: string; isMock: boolean; status?: string }>(
        `/payments/${id}/checkout`,
        useCardId ? { useSavedCardId: useCardId } : {},
      );
      if (r.status === 'succeeded') {
        toast.success('Payment complete', 'Charged to your saved card.');
        onChanged();
        return;
      }
      if (r.isMock) toast.info('Staging payment simulator', 'No real money will move.');
      await WebBrowser.openBrowserAsync(r.redirectUrl!);
      onChanged();
```

Saved-card picker above the pay buttons (render only when `savedCards.length > 0`), following the screen's existing `Card`/`Button` UI primitives:

```tsx
{savedCards.length > 0 ? (
  <View style={{ gap: 6 }}>
    {savedCards.map((c) => (
      <Pressable
        key={c.id}
        onPress={() => setUseCardId(useCardId === c.id ? '' : c.id)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
          borderRadius: radii.lg, borderCurve: 'continuous',
          backgroundColor: useCardId === c.id ? colors.voltSoft : colors.pearl,
        }}
      >
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13 }}>
          {c.brand ?? 'Card'} ····{c.last4}
        </Text>
        <Text variant="caption" color="ink5" style={{ marginLeft: 'auto' }}>
          {useCardId === c.id ? 'Selected' : 'Use'}
        </Text>
      </Pressable>
    ))}
  </View>
) : null}
```

Import `Pressable` from `react-native` if not already imported. Match the screen's existing hook/imports style.

- [ ] **Step 4: Typecheck + lint**

Run (in `apps/mobile`): `npx tsc --noEmit && npx expo lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): payments.lk copy, provider filter, saved-card payment toggle"
```

---

### Task 9: Docs + runbook + full verification

**Files:**
- Modify: `docs/runbook.md`, `README.md` (secrets section)
- Create: `docs/superpowers/notes/2026-09-24-payhere-superseded.md`

**Interfaces:** none (docs).

- [ ] **Step 1: Runbook env/secrets update**

In `docs/runbook.md`, replace the PayHere secrets section:

```markdown
## Payment gateway (payments.lk)

| Secret / var | Purpose |
|---|---|
| `PAYMENTS_LK_SECRET_KEY` | REST secret key (`sk_test_…` sandbox / `sk_live_…` live). |
| `PAYMENTS_LK_WEBHOOK_SECRET` | Webhook signing secret (dashboard → Developers). |
| `PAYMENTS_LK_API_URL` | Optional API base override (default `https://api.payments.lk`). |
| `PAYMENTS_LK_RETURN_URL` / `PAYMENTS_LK_CANCEL_URL` | Optional hosted-checkout return/cancel overrides. |
| `PAYMENTS_LK_WEBHOOK_URL` | Optional webhook endpoint override (default `<origin>/api/webhooks/payments-lk`). |
| `PAYMENTS_LK_MOCK=1` | Force the mock gateway (local/staging only; refused in production). |

Missing secrets in `ENVIRONMENT=production` makes `/api/payments` checkout fail with
`GatewayConfigError` — the mock gateway is refused to prevent silent money loss.
Webhook endpoint to register in the payments.lk dashboard: `https://<api-origin>/api/webhooks/payments-lk`.
```

- [ ] **Step 2: README secrets list**

Update the README's secrets/vars list: remove `PAYHERE_*` entries, add the `PAYMENTS_LK_*` rows above.

- [ ] **Step 3: Supersession note**

Create `docs/superpowers/notes/2026-09-24-payhere-superseded.md`:

```markdown
# PayHere integration superseded (2026-09-24)

All PayHere gateway code was removed on 2026-09-24. The active gateway is
payments.lk (see `docs/superpowers/specs/2026-09-24-payments-lk-gateway-design.md`).

- `docs/superpowers/plans/2026-09-09-payhere-gateway.md` — superseded.
- Historical DB rows keep `provider='payhere'`; their refunds are manual (admin queue).
- New payments use `provider='payments_lk'`; webhook endpoint is `POST /api/webhooks/payments-lk`.
```

- [ ] **Step 4: Full verification**

```bash
pnpm typecheck && pnpm test
```

(Repo-level scripts: `pnpm typecheck` runs turbo typecheck across packages; `pnpm test` runs all vitest suites. If either script name differs, run per-package: `pnpm -r typecheck && pnpm -r test`.)
Expected: PASS everywhere, including `apps/api/test/finance/e2e.test.ts`, `test/webhooks/*`, `test/payments/*`, `test/refunds/*`, `test/savedCards/*`, `packages/payments`, `packages/shared`, `packages/db`, web tests, and mobile typecheck.

- [ ] **Step 5: Commit**

```bash
git add docs README.md
git commit -m "docs: payments.lk runbook/env, supersede PayHere gateway notes"
```

---

## Rollout checklist (post-implementation, manual)

1. Set `PAYMENTS_LK_SECRET_KEY` (sandbox `sk_test_…`) + `PAYMENTS_LK_WEBHOOK_SECRET` as Wrangler secrets.
2. Register `https://<api-origin>/api/webhooks/payments-lk` in the payments.lk dashboard (sandbox first).
3. Sandbox end-to-end: hosted checkout → `payment.succeeded` → PO paid; decline → `payment.failed`; abandoned → `checkout.expired`; admin refund → `processing` → `refund.succeeded` → completed + earnings adjusted; saveCard → `card.saved` → card appears in Accounts.
4. On approval swap to `sk_live_…` + live webhook endpoint.
5. Confirm no PayHere env vars remain; historical `provider='payhere'` rows unaffected.

