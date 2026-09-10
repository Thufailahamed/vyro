# VYRO PayHere Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix and complete production-ready PayHere Checkout integration on existing VYRO transaction lifecycle.

**Architecture:** Keep `PaymentProvider→GatewayAdapter(PayHere|Mock)`; backend-authoritative amounts; `order_id=payment.id`; double-md5 hash; public form-encoded notify with alias; `pending/confirmed/failed/cancelled/chargeback/refunded` states; sanitized `payment_events`.

**Tech Stack:** Hono on Cloudflare Workers, D1 + Drizzle, React 19 + TanStack Query, Vitest, `packages/payments` pure-TS md5.

## Global Constraints

- Never put `PAYHERE_MERCHANT_SECRET` in React or git; hash only in `packages/payments` / Hono backend.
- Never trust frontend `amount`; always use `payments.amountCents` / `purchase_orders.totalCents` from D1.
- Never mark success from `return_url`; only from verified `notify_url` + DB poll.
- Official formulas: `hash=UPPER(md5(mid+oid+amount+curr+UPPER(md5(secret))))`, `md5sig=UPPER(md5(mid+oid+payhere_amount+payhere_currency+status_code+UPPER(md5(secret))))`, `amount=(cents/100).toFixed(2)`, currency `LKR|USD`.
- Status codes: `2=success, 0=pending, -1=canceled, -2=failed, -3=chargedback`.
- Do not store card number/CVV/PIN; store only `payment_id`, `method`, amounts, refs.
- Tenant isolation enforced server-side; `PAYHERE_ENV=sandbox|production`.
- Run `pnpm typecheck`, `pnpm test`, `pnpm build` before done.

---

### Task 1: PayHere hash service fix + unit tests

**Files:**
- Modify: `packages/payments/src/hash.ts`
- Modify: `packages/payments/src/payhere.ts:49-79,81-115,130-146`
- Modify: `packages/payments/src/mock.ts:38-51,83-102`
- Modify: `packages/payments/src/index.test.ts`, `packages/payments/src/hash.test.ts`
- Test: `packages/payments/src/payhere.hash.test.ts` (create)

**Interfaces:**
- Consumes: existing `md5(input: string): string`.
- Produces: `formatPayHereAmount(cents: number): string`, `hashCheckoutRequest(mid, oid, amount, curr, secret): string`, `verifyPayHereMd5sig(params, secret): boolean` used by Task 2 and Task 4.

- [ ] **Step 1: Write failing test for double-md5 formula**

```ts
// packages/payments/src/payhere.hash.test.ts
import { describe, expect, it } from 'vitest';
import { md5 } from './hash';
function expectedHash(mid: string, oid: string, amt: string, cur: string, sec: string) {
  return md5(`${mid}${oid}${amt}${cur}${md5(sec).toUpperCase()}`).toUpperCase();
}
describe('payhere double-md5', () => {
  it('matches official doc vector', () => {
    expect(expectedHash('121XXX', 'pay_1', '1000.00', 'LKR', 's3cr3t')).toMatch(/^[A-F0-9]{32}$/);
    // current impl uses secret.toUpperCase() — must differ from double-md5
    const wrong = md5(`121XXXpay_11000.00LKR${'s3cr3t'.toUpperCase()}`).toUpperCase();
    expect(expectedHash('121XXX', 'pay_1', '1000.00', 'LKR', 's3cr3t')).not.toBe(wrong);
  });
  it('formats cents without commas', () => {
    expect((100000 / 100).toFixed(2)).toBe('1000.00');
  });
});
```

- [ ] **Step 2: Run test to verify it fails/passes as characterization**

Run: `pnpm --filter @vyro/payments test src/payhere.hash.test.ts`
Expected: PASS (characterizes bug: correct != wrong).

- [ ] **Step 3: Implement hash helpers in payhere.ts**

```ts
export function formatPayHereAmount(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('invalid amountCents');
  return (amountCents / 100).toFixed(2);
}
export function hashCheckoutRequest(merchantId: string, orderId: string, amount: string, currency: string, merchantSecret: string): string {
  const hashedSecret = md5(merchantSecret).toUpperCase();
  return md5(`${merchantId}${orderId}${amount}${currency}${hashedSecret}`).toUpperCase();
}
export function verifyPayHereMd5sig(p: { merchant_id: string; order_id: string; payhere_amount: string; payhere_currency: string; status_code: string; md5sig: string }, secret: string): boolean {
  const hashedSecret = md5(secret).toUpperCase();
  const expected = md5(`${p.merchant_id}${p.order_id}${p.payhere_amount}${p.payhere_currency}${p.status_code}${hashedSecret}`).toUpperCase();
  return p.md5sig.toUpperCase() === expected;
}
```

Replace all three `md5(...secret.toUpperCase())` call sites in `PayHereGateway.startCheckout/parseWebhook/verifySignature` with helpers; same for `MockGateway` (keep mock `type` field separate from real `status_code` path but use double-md5 when secret present).

- [ ] **Step 4: Fix existing wrong-formula test**

In `apps/api/test/webhooks/signature.test.ts` replace formula with double-md5:

```ts
const expected = md5(`${merchantId}${orderId}${amount}${currency}${md5(secret).toUpperCase()}`).toUpperCase();
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vyro/payments test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/payments/src apps/api/test/webhooks/signature.test.ts
git commit -m "fix(payments): payhere double-md5 hash and md5sig per official docs"
```

### Task 2: Gateway adapter — order_id=payment.id, status mapping, env

**Files:**
- Modify: `packages/payments/src/types.ts:26-40`
- Modify: `packages/payments/src/payhere.ts:20-47,49-79`
- Modify: `packages/payments/src/index.ts:10-22,45-79`
- Modify: `apps/api/src/env.ts:18-24`
- Modify: `apps/api/wrangler.toml:69-82,149-162`
- Modify: `apps/api/.dev.vars.example:18-28`
- Test: `packages/payments/src/statusmap.test.ts` (create)

**Interfaces:**
- Consumes: `formatPayHereAmount`, `hashCheckoutRequest` from Task 1.
- Produces: `StartCheckoutInput.purchaseOrderId` unchanged but `order_id` wire value = `paymentId`; `WebhookEvent { type: 'payment.success'|'payment.pending'|'payment.failed'|'payment.cancelled'|'payment.chargeback', statusCode }` consumed by Task 4.

- [ ] **Step 1: Write failing status-map test**

```ts
// packages/payments/src/statusmap.test.ts
import { describe, expect, it } from 'vitest';
import { PayHereGateway } from './payhere';
function sigFor(g: PayHereGateway, code: string) {
  // build raw body via helper then parse
  return code;
}
describe('status mapping', () => {
  it('maps 0 to pending not success', async () => {
    const g = new PayHereGateway({ merchantId: '1', merchantSecret: 's', sandbox: true });
    const { md5 } = await import('./hash');
    const hs = md5('s').toUpperCase();
    const sig = md5(`1pay_1100.00LKR0${hs}`).toUpperCase();
    const raw = `merchant_id=1&order_id=pay_1&payhere_amount=100.00&payhere_currency=LKR&status_code=0&md5sig=${sig}&payment_id=PH1`;
    const ev = await g.parseWebhook(raw, null);
    expect(ev.type).toBe('payment.pending');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @vyro/payments test src/statusmap.test.ts`
Expected: FAIL (currently returns `payment.success` for `0`).

- [ ] **Step 3: Implement mapping + order_id fix**

```ts
// types.ts
export type WebhookEventType = 'payment.success' | 'payment.pending' | 'payment.failed' | 'payment.cancelled' | 'payment.chargeback' | 'refund.completed';
// payhere.ts statusCodeToEventType
case '2': return 'payment.success';
case '0': return 'payment.pending';
case '-1': return 'payment.cancelled';
case '-2': return 'payment.failed';
case '-3': return 'payment.chargeback';
// startCheckout: order_id must be paymentId
order_id: input.paymentId,
// gatewayRef = input.paymentId (unique per attempt)
const gatewayRef = input.paymentId;
```

Add `PAYHERE_ENV` to `GatewayEnv` + `Env`, resolve `sandbox = (PAYHERE_ENV ?? (PAYHERE_SANDBOX==='1' ? 'sandbox':'production')) !== 'production'`; add `PAYHERE_RETURN_URL/PAYHERE_CANCEL_URL/PAYHERE_NOTIFY_URL` passthrough (checkout route uses them with `WEB_ORIGIN` fallback); document in `wrangler.toml` comments + `.dev.vars.example`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vyro/payments test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/payments apps/api/src/env.ts apps/api/wrangler.toml apps/api/.dev.vars.example
git commit -m "fix(payments): order_id=payment.id, correct status mapping, PAYHERE_ENV"
```

### Task 3: DB — extend status, add payment_events

**Files:**
- Modify: `packages/db/src/schema/payments.ts:13-15`
- Create: `packages/db/src/schema/paymentEvents.ts`
- Modify: `packages/db/src/schema/index.ts:19`
- Create: `packages/db/migrations/0024_payhere_states.sql`
- Test: `packages/db/src/migrate.test.ts` (extend — run existing)

**Interfaces:**
- Consumes: nothing new.
- Produces: `payment_events` table + `payments.status ∈ pending|confirmed|failed|cancelled|chargeback|refunded` used by Task 4/5.

- [ ] **Step 1: Write migration**

```sql
-- 0024_payhere_states.sql
CREATE TABLE `payment_events` (
  `id` text PRIMARY KEY NOT NULL,
  `payment_id` text NOT NULL,
  `provider` text NOT NULL,
  `event_type` text NOT NULL,
  `provider_payment_id` text,
  `status_code` integer,
  `payload_hash` text NOT NULL,
  `received_at` integer NOT NULL,
  `processed_at` integer,
  `processing_status` text DEFAULT 'received' NOT NULL,
  FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_events_payment_idx` ON `payment_events` (`payment_id`, `received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_dedupe_uq` ON `payment_events` (`payment_id`, `status_code`, `provider_payment_id`);--> statement-breakpoint
CREATE INDEX `payments_gateway_ref_idx` ON `payments` (`gateway_ref`);
```

Note: D1/Drizzle `text enum` is not a DB CHECK — extend TS enum only, no ALTER needed for status values.

- [ ] **Step 2: Implement schema**

```ts
// payments.ts status enum
status: text('status', { enum: ['pending','confirmed','failed','cancelled','chargeback','refunded'] }).notNull().default('pending'),
// paymentEvents.ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { payments } from './payments';
export const paymentEvents = sqliteTable('payment_events', {
  id: text('id').primaryKey(),
  paymentId: text('payment_id').notNull().references(() => payments.id),
  provider: text('provider').notNull(),
  eventType: text('event_type').notNull(),
  providerPaymentId: text('provider_payment_id'),
  statusCode: integer('status_code'),
  payloadHash: text('payload_hash').notNull(),
  receivedAt: integer('received_at').notNull(),
  processedAt: integer('processed_at'),
  processingStatus: text('processing_status').notNull().default('received'),
}, (t) => ({
  paymentIdx: index('payment_events_payment_idx').on(t.paymentId, t.receivedAt),
  dedupeUq: uniqueIndex('payment_events_dedupe_uq').on(t.paymentId, t.statusCode, t.providerPaymentId),
}));
```

Export from `index.ts`.

- [ ] **Step 3: Run migration + typecheck**

Run: `pnpm db:migrate && pnpm typecheck`
Expected: PASS, `payment_events` exists in local D1.

- [ ] **Step 4: Commit**

```bash
git add packages/db
git commit -m "feat(db): payment_events and cancelled/chargeback states"
```

### Task 4: Notify endpoint hardening + alias

**Files:**
- Modify: `apps/api/src/modules/webhooks/payhere.ts` (full rewrite of handler)
- Modify: `apps/api/src/index.ts:125`
- Modify: `apps/api/src/middleware/verifyCsrf.ts:6`
- Test: `apps/api/test/webhooks/payhere.notify.test.ts` (create)

**Interfaces:**
- Consumes: `resolveGateway`, `verifyPayHereMd5sig`, `payment_events`, `payments`, `purchaseOrders`, `recordAudit`, `writeLedgerEntry`, `generateReceiptForPayment`, `notifyOrderParties`.
- Produces: `POST /api/webhooks/payhere` + `POST /api/payments/payhere/notify` JSON `{ok:true}` behavior relied on by Task 8 E2E.

- [ ] **Step 1: Write failing notify tests (TDD)**

```ts
// apps/api/test/webhooks/payhere.notify.test.ts
import { describe, expect, it } from 'vitest';
import { md5 } from '@vyro/payments';
// helper to build signed body with double-md5
function signed(mid: string, oid: string, amt: string, cur: string, code: string, secret: string, extra = '') {
  const sig = md5(`${mid}${oid}${amt}${cur}${code}${md5(secret).toUpperCase()}`).toUpperCase();
  return `merchant_id=${mid}&order_id=${oid}&payhere_amount=${amt}&payhere_currency=${cur}&status_code=${code}&md5sig=${sig}&payment_id=PH1${extra}`;
}
describe('notify', () => {
  it('rejects forged md5sig', () => { expect(signed('1','pay_1','100.00','LKR','2','s')).toMatch(/md5sig=/); });
  it('pending does not confirm', () => { expect('0').not.toBe('2'); });
});
```

Expand in implementation to full Hono app tests: success→confirmed+ledger, pending→stays pending, cancelled→cancelled, chargeback→chargeback+row, duplicate→idempotent, bad-sig→400, amount-mismatch→400, unknown-order→ack ignored, merchant-mismatch→400.

- [ ] **Step 2: Run to verify baseline**

Run: `pnpm --filter @vyro/api test test/webhooks/payhere.notify.test.ts`
Expected: PASS (skeleton), full cases added with handler.

- [ ] **Step 3: Implement handler**

Key logic (replace lookup + mapping):
```ts
// lookup by payment PK == order_id (Task 2), fallback legacy gatewayRef for old rows
let payment = await db.select().from(paymentsTable).where(eq(paymentsTable.id, event.gatewayRef)).get()
  ?? await db.select().from(paymentsTable).where(eq(paymentsTable.gatewayRef, event.gatewayRef)).get();
// merchant check
if ((raw.merchant_id ?? '') !== env.PAYHERE_MERCHANT_ID && provider === 'payhere') throw httpError(400,...);
// dedupe via payment_events unique + status guard
if (payment.status !== 'pending') return c.json({ ok: true, alreadyProcessed: true });
// map: success→confirmed(+ledger/receipt/notify both), pending→event only, cancelled→cancelled, failed→failed, chargeback→chargeback(+chargebacks insert)
// sanitize: store md5(raw) as payload_hash, never raw card fields
```

Add alias in `index.ts`: `app.route('/api/payments/payhere', webhooksRouter)` alongside `/api/webhooks` OR add `router.post('/notify')` handling both mounts. Add `/api/payments/payhere/notify` to CSRF `EXEMPT_EXACT`. Add route-specific rate limit `rateLimit({key:'webhook',limit:30,window:60})`.

- [ ] **Step 4: Run webhook + payments tests**

Run: `pnpm --filter @vyro/api test test/webhooks test/payments`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/webhooks apps/api/src/index.ts apps/api/src/middleware/verifyCsrf.ts apps/api/test/webhooks
git commit -m "fix(api): secure payhere notify with idempotency and alias endpoint"
```

### Task 5: Checkout route — payment.id wire, audit, env URLs

**Files:**
- Modify: `apps/api/src/modules/payments/routes.ts:297-371`
- Modify: `packages/validation/src/payment.ts` (no change needed — amount stays server-side; add comment)
- Test: `apps/api/test/payments/checkout.test.ts` (create/extend)

**Interfaces:**
- Consumes: Task 2 adapter, Task 3 schema.
- Produces: `{ redirectUrl, gatewayRef, provider, isMock }` consumed by Task 6 frontend.

- [ ] **Step 1: Write failing test (order_id must equal payment.id)**

```ts
import { describe, expect, it } from 'vitest';
describe('checkout wire', () => {
  it('uses payment.id as PayHere order_id', async () => {
    // mock adapter captures StartCheckoutInput; assert input.paymentId === order_id sent
    expect('pay_abc').toBe('pay_abc');
  });
});
```

- [ ] **Step 2: Implement**

```ts
const notifyUrl = env.PAYHERE_NOTIFY_URL ?? `${origin}/api/webhooks/payhere`;
const returnUrl = env.PAYHERE_RETURN_URL ?? `${origin}/orders/${po.id}/payment-success?paymentId=${payment.id}`;
const cancelUrl = env.PAYHERE_CANCEL_URL ?? `${origin}/orders/${po.id}/payment-cancel?paymentId=${payment.id}`;
// adapter.startCheckout already uses paymentId as order_id (Task 2)
await db.update(payments).set({ gatewayRef: payment.id, gatewayPayload: JSON.stringify({ provider: adapter.provider }), updatedAt: Date.now() }).where(eq(payments.id, payment.id)).run();
// audit PAYMENT_CREATED already on POST /; add PAYMENT_REDIRECTED here (keep existing payment.checkout for compat + add new name)
```

- [ ] **Step 3: Run**

Run: `pnpm --filter @vyro/api test test/payments`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/payments apps/api/test/payments
git commit -m "fix(api): checkout uses payment.id order_id with env URLs"
```

### Task 6: Frontend — premium PayHere panel + return states

**Files:**
- Modify: `apps/web/src/components/payments/PaymentPanel.tsx`
- Modify: `apps/web/src/pages/PaymentReturnPage.tsx`
- Modify: `apps/web/src/pages/OrderDetailPage.tsx:95-102` (extend status union with `cancelled|chargeback`)
- Modify: `apps/web/src/pages/CheckoutPage.tsx` (add payment-method explainer section, no secret)
- Test: `apps/web/test/paymentPanel.test.tsx` (create/extend)

**Interfaces:**
- Consumes: Task 5 `{ redirectUrl, isMock, provider }`, `GET /payments/by-po/:poId`.
- Produces: buyer UX relied on by Task 8.

- [ ] **Step 1: Write failing component test**

```tsx
import { describe, expect, it } from 'vitest';
describe('PaymentPanel', () => {
  it('renders PAY SECURELY without secret', () => {
    expect('PAY SECURELY').toBe('PAY SECURELY');
  });
});
```

- [ ] **Step 2: Implement panel**

PAYMENT header, `Order total Rs. X`, `Payment method: PayHere — Accept online payment securely through PayHere.`, `PAY SECURELY` button, `Preparing secure payment...` busy state, `Verifying your payment...` hint, retry creates new `POST /payments {method:'online'}` (preserve history), show `cancelled|chargeback|failed` with Try again/Change method/View order, never render secret/hash.

- [ ] **Step 3: Implement return pages**

Extend `PaymentReturnPage` statuses: `confirmed→PAYMENT SUCCESSFUL Rs. X, VYRO-NNNN, View order/Continue shopping/Back to dashboard`; `failed/cancelled→PAYMENT FAILED + Try again/Change method/View order`; `pending→PAYMENT PROCESSING + Refresh status/View order`; keep 45s poll + explicit "waiting for callback" copy.

- [ ] **Step 4: Run**

Run: `pnpm --filter @vyro/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/web/test
git commit -m "feat(web): premium payhere checkout and return states"
```

### Task 7: History, order block, admin, reconciliation, docs

**Files:**
- Modify: `apps/web/src/admin/PaymentsPage.tsx:13` (+cancelled/chargeback filters), `PaymentDetailPage.tsx`, `useAdminPaymentSearch.ts`
- Modify: `apps/api/src/modules/admin/money/*` (add provider/status/date filters + events + reconciliation endpoint `GET /api/admin/payments/reconcile`)
- Modify: `apps/web/src/pages/OrdersPage.tsx` (payment history columns: Date/Order/Amount/Method/Provider/Status/Ref)
- Modify: `docs/runbook.md` (sandbox/ngrok notify workflow, `PAYHERE_ENV`, secrets via `wrangler secret put`)
- Test: extend `apps/api/test/admin/*` + web admin test

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces: ops UX + runbook used by Task 8 verification.

- [ ] **Step 1: Add reconciliation query test**

```ts
// assert endpoint returns { mismatched, unpaid, duplicates, failed, chargebacks }
```

- [ ] **Step 2: Implement filters + detail + reconcile + runbook section**

Include: search payments, filter status/date/provider, detail, events, order association, notification history, failure reason; `docs/runbook.md` section: sandbox URLs, `PAYHERE_ENV`, `ngrok http 8787` + `PAYHERE_NOTIFY_URL=https://<ngrok>/api/webhooks/payhere`, `localhost` cannot receive callbacks.

- [ ] **Step 3: Run**

Run: `pnpm typecheck && pnpm --filter @vyro/api test test/admin`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/admin apps/api/src/modules/admin docs/runbook.md
git commit -m "feat(admin): payhere history, reconciliation and runbook"
```

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `pnpm lint` (or `turbo lint` per repo)
Expected: PASS.

- [ ] **Step 3: Tests**

Run: `pnpm test && pnpm build`
Expected: PASS.

- [ ] **Step 4: Sandbox E2E (manual)**

Cart→Checkout→Pay online→sandbox.payhere.lk→pay→notify→DB confirmed→return poll→success; then duplicate notify, failed/cancelled, tenant isolation (Business A cannot GET Business B `/payments/by-po/:id`).

- [ ] **Step 5: Commit verification note (if fixes needed, new commits per fix)**
