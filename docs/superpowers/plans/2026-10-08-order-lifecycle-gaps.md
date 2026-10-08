# Order Lifecycle Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the six audited order-lifecycle gaps: pay-at-checkout, delivery address book, buyer partial refunds, `payment.cancelled` webhook mapping, cart-clear endpoint, and the associated web bugs.

**Architecture:** Web-only orchestration for pay-at-checkout (existing API endpoints, no checkout-service changes); a new `/addresses` page over the existing addresses API; a client-side remaining-refund helper for partial refunds; one mapping case in the payments.lk adapter; one DELETE route on the cart module; and targeted bug fixes.

**Tech Stack:** Hono + Cloudflare Workers + D1 (API), Drizzle, React 19 + React Query + react-router-dom v7 (web), Vitest (`@cloudflare/vitest-pool-workers` for API, plain vitest for packages/web).

## Global Constraints

- No new dependencies in any package.
- Follow spec: `docs/superpowers/specs/2026-10-08-order-lifecycle-gaps-design.md`.
- API errors use `httpError(status, CODE, message)` from `apps/api/src/lib/errors`.
- Web calls the API only through `api` from `apps/web/src/lib/api.ts` (it already prefixes `/api`; never pass a path starting with `/api`).
- Tests: API under `apps/api/test/`, packages next to source (`*.test.ts`), web under `apps/web/test/`.
- Commit steps assume the user has authorized commits for this workstream; if not, skip the commit step and leave the working tree for review.
- Do not touch `apps/mobile` (address book there is deferred).

---

### Task 1: Cart clear endpoint

**Files:**
- Modify: `apps/api/src/modules/cart/routes.ts` (add `DELETE /`, remove `void clearCart;` at line 235)
- Test: `apps/api/test/cart.test.ts`

**Interfaces:**
- Consumes: `clearCart(d1, cartId)` from `apps/api/src/modules/cart/repository.ts:62`; `ensureOpenCart(d1, businessId)`.
- Produces: `DELETE /api/cart?businessId=` → `{ ok: true }` (200), 400 without `businessId`, 401 no session, 403 wrong role.

- [ ] **Step 1: Write the failing tests**

In `apps/api/test/cart.test.ts`, replace the `clearCart` stub inside the repository mock (line 33) with a behavior-accurate stub that actually empties the store:

```ts
  clearCart: vi.fn(async (_d1, cartId) => {
    for (let i = itemsStore.length - 1; i >= 0; i--) {
      if (itemsStore[i].cartId === cartId) itemsStore.splice(i, 1);
    }
  }),
```

Append at the end of the file:

```ts
describe('DELETE /api/cart', () => {
  it('clears every item for the business and returns ok', async () => {
    sessionCtx = { userId: 'u1', isAdmin: false, businesses: [{ businessId: 'biz-1', role: 'owner' }], suppliers: [] };
    const { ensureOpenCart } = await import('../src/modules/cart/repository');
    const cart = await ensureOpenCart(D1_STUB, 'biz-1');
    itemsStore.push({ id: 'ci-1', cartId: cart.id, supplierProductId: 'sp-1', quantity: 2 });
    itemsStore.push({ id: 'ci-2', cartId: cart.id, supplierProductId: 'sp-2', quantity: 1 });

    const res = await app.request('/api/cart?businessId=biz-1', { method: 'DELETE' }, { DB: D1_STUB, ENVIRONMENT: 'test' } as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(itemsStore.length).toBe(0);
  });

  it('is 400 without businessId', async () => {
    sessionCtx = { userId: 'u1', isAdmin: false, businesses: [{ businessId: 'biz-1', role: 'owner' }], suppliers: [] };
    const res = await app.request('/api/cart', { method: 'DELETE' }, { DB: D1_STUB, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(400);
  });

  it('is 403 for a role that cannot manage the cart', async () => {
    sessionCtx = { userId: 'u2', isAdmin: false, businesses: [{ businessId: 'biz-1', role: 'accountant' }], suppliers: [] };
    const res = await app.request('/api/cart?businessId=biz-1', { method: 'DELETE' }, { DB: D1_STUB, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(403);
  });

  it('is 401 without a session', async () => {
    const res = await app.request('/api/cart?businessId=biz-1', { method: 'DELETE' }, { DB: D1_STUB, ENVIRONMENT: 'test' } as any);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @vyro/api exec vitest run test/cart.test.ts`
Expected: FAIL — `DELETE /api/cart?businessId=biz-1` returns 404 (no route).

- [ ] **Step 3: Implement the route**

In `apps/api/src/modules/cart/routes.ts`, add after the `DELETE /items/:itemId` handler (line 231), and delete the `void clearCart;` line (235):

```ts
router.delete('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  requireBusinessRole(ctx, businessId, CART_ROLES);

  const cart = await ensureOpenCart(c.env.DB, businessId);
  await clearCart(c.env.DB, cart.id);
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/api exec vitest run test/cart.test.ts`
Expected: PASS (all cart tests).

- [ ] **Step 5: Wire the web clear button to the endpoint**

In `apps/web/src/pages/CartPage.tsx`, replace the loop in `clearAll()` (lines 210-214) with a single call:

```ts
    setClearing(true);
    try {
      await api.del(`/cart?businessId=${businessId}`);
      await qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Cart cleared');
```

(`businessId` is already in scope at line 92 as `user?.memberships?.[0]?.businessId`.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/cart/routes.ts apps/api/test/cart.test.ts apps/web/src/pages/CartPage.tsx
git commit -m "feat(cart): add DELETE /api/cart and wire clear-cart button"
```

---

### Task 2: Map `payment.cancelled` in the payments.lk adapter

**Files:**
- Modify: `packages/payments/src/paymentslk.ts` (functions `paymentsLkStatusCode` line 29 and `paymentsLkEventToType` line 50)
- Test: `packages/payments/src/paymentslk.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `paymentsLkEventToType('payment.cancelled' | 'checkout.cancelled') === 'payment.cancelled'`; `paymentsLkStatusCode('payment.cancelled') === -4`.

- [ ] **Step 1: Write the failing test**

Append inside `describe('payments.lk webhook verification')` in `packages/payments/src/paymentslk.test.ts`:

```ts
  it('maps cancelled events to payment.cancelled', async () => {
    const mk = (vendorType: string) =>
      JSON.stringify({ id: 'evt_c', type: vendorType, data: { reference: 'p1' } });
    const parse = async (s: string) => gateway().parseWebhook(s, signed(s));

    const cancelled = await parse(mk('payment.cancelled'));
    expect(cancelled.type).toBe('payment.cancelled');
    expect(cancelled.statusCode).toBe(-4);

    const checkoutCancelled = await parse(mk('checkout.cancelled'));
    expect(checkoutCancelled.type).toBe('payment.cancelled');

    expect(paymentsLkEventToType('payment.cancelled')).toBe('payment.cancelled');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/payments test`
Expected: FAIL — type is `'unknown'`, `statusCode` undefined.

- [ ] **Step 3: Implement the mapping**

In `packages/payments/src/paymentslk.ts`, add to `paymentsLkStatusCode` (after the `checkout.expired` case):

```ts
    case 'payment.cancelled':
    case 'checkout.cancelled':
      return -4;
```

And in `paymentsLkEventToType` (after the `checkout.expired` case):

```ts
    case 'payment.cancelled':
    case 'checkout.cancelled':
      return 'payment.cancelled';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/payments test`
Expected: PASS (all payments package tests).

- [ ] **Step 5: Commit**

```bash
git add packages/payments/src/paymentslk.ts packages/payments/src/paymentslk.test.ts
git commit -m "fix(payments): map payment.cancelled webhook events"
```

---

### Task 3: Cancelled webhook processor regression test

**Files:**
- Test: `apps/api/test/webhooks/paymentslk.webhook.test.ts` (insert after the `checkout.expired` test, line 153)

**Interfaces:**
- Consumes: processor branch `apps/api/src/modules/webhooks/paymentslk.ts:355` and the mapping from Task 2.
- Produces: no production code; proves a cancelled event cancels a pending payment.

- [ ] **Step 1: Write the test**

Insert after the `expires a pending payment on checkout.expired` test:

```ts
  it('cancels a pending payment on payment.cancelled', async () => {
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    const pay4 = newId();
    await db.insert(schema.payments).values({ id: pay4, purchaseOrderId: ids.po, businessId: ids.biz, supplierId: ids.sup, method: 'online', provider: 'payments_lk', status: 'pending', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR', createdAt: now, updatedAt: now });
    const raw = JSON.stringify({ id: 'evt_cxl_1', type: 'payment.cancelled', data: { reference: pay4, id: 'ch_cxl_1' } });
    const r = await post('/api/webhooks/payments-lk', raw, { 'content-type': 'application/json' });
    expect(r.status).toBe(200);
    const pay = (await db.select().from(schema.payments).where(eq(schema.payments.id, pay4)).get()) as any;
    expect(pay.status).toBe('cancelled');
    expect(pay.statusReason).toBe('gateway:payment.cancelled');
    expect(pay.cancelledAt).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run test/webhooks/paymentslk.webhook.test.ts`
Expected: PASS (the mock gateway passes the internal event name through and the processor branch writes `cancelled`). If it fails with `status: 'pending'`, Task 2 is incomplete.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/webhooks/paymentslk.webhook.test.ts
git commit -m "test(webhooks): cover payment.cancelled cancellation path"
```

---

### Task 4: Buyer partial refunds

**Files:**
- Create: `apps/web/src/lib/refundable.ts`
- Create: `apps/web/test/refundable.test.ts`
- Modify: `apps/web/src/pages/OrderDetailPage.tsx` (state at lines 183-186, `submitRefund` at 257-274, modal amount block at 1097-1126)

**Interfaces:**
- Consumes: `GET /refunds/:paymentId/refunds` → `{ refunds: Array<{ amountCents: number; status: string }> }`.
- Produces: `remainingRefundableCents(paymentAmountCents: number, refunds: RefundLike[]): number`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/refundable.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { remainingRefundableCents } from '../src/lib/refundable';

describe('remainingRefundableCents', () => {
  it('returns the full amount with no prior refunds', () => {
    expect(remainingRefundableCents(10000, [])).toBe(10000);
  });

  it('subtracts completed and in-flight refunds', () => {
    expect(
      remainingRefundableCents(10000, [
        { amountCents: 2000, status: 'completed' },
        { amountCents: 1500, status: 'processing' },
        { amountCents: 500, status: 'requested' },
        { amountCents: 300, status: 'approved' },
      ]),
    ).toBe(5700);
  });

  it('ignores failed, rejected and cancelled refunds', () => {
    expect(
      remainingRefundableCents(10000, [
        { amountCents: 4000, status: 'failed' },
        { amountCents: 3000, status: 'rejected' },
        { amountCents: 2000, status: 'cancelled' },
      ]),
    ).toBe(10000);
  });

  it('never goes negative', () => {
    expect(remainingRefundableCents(1000, [{ amountCents: 5000, status: 'completed' }])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web exec vitest run test/refundable.test.ts`
Expected: FAIL — cannot resolve `../src/lib/refundable`.

- [ ] **Step 3: Write the helper**

Create `apps/web/src/lib/refundable.ts`:

```ts
export interface RefundLike {
  amountCents: number;
  status: string;
}

/** Statuses the server counts against the refundable balance (refunds/executor.ts). */
const OCCUPYING_STATUSES = new Set(['requested', 'approved', 'processing', 'completed']);

export function remainingRefundableCents(paymentAmountCents: number, refunds: RefundLike[]): number {
  const used = refunds
    .filter((r) => OCCUPYING_STATUSES.has(r.status))
    .reduce((sum, r) => sum + r.amountCents, 0);
  return Math.max(0, paymentAmountCents - used);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/web exec vitest run test/refundable.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the modal**

In `apps/web/src/pages/OrderDetailPage.tsx`:

1. Import the helper near the other lib imports: `import { remainingRefundableCents } from '@/lib/refundable';`
2. Add state next to `refundReason` (line 184): `const [refundAmount, setRefundAmount] = useState('');`
3. Add the refunds query after the payments query (line 204):

```tsx
  const { data: refundsData } = useQuery({
    queryKey: ['payment-refunds', refundablePayment?.id],
    queryFn: () =>
      api.get<{ refunds: Array<{ amountCents: number; status: string }> }>(
        `/refunds/${refundablePayment!.id}/refunds`,
      ),
    enabled: refundOpen && !!refundablePayment,
  });
  const refundRemaining = useMemo(
    () => (refundablePayment ? remainingRefundableCents(refundablePayment.amountCents, refundsData?.refunds ?? []) : 0),
    [refundablePayment, refundsData],
  );
  const refundAmountCents = useMemo(
    () => (refundAmount.trim() === '' ? refundRemaining : Math.round(Number(refundAmount) * 100)),
    [refundAmount, refundRemaining],
  );
```

4. Replace `submitRefund` (line 257) with:

```tsx
  async function submitRefund() {
    if (!refundablePayment) return;
    setRefundMsg('');
    if (!Number.isFinite(refundAmountCents) || refundAmountCents <= 0) {
      setRefundMsg('Enter a refund amount greater than zero.');
      return;
    }
    if (refundAmountCents > refundRemaining) {
      setRefundMsg(`Maximum refundable is ${formatLKR(refundRemaining)}.`);
      return;
    }
    setRefundSubmitting(true);
    try {
      await api.post(`/refunds/${refundablePayment.id}/refund`, {
        amountCents: refundAmountCents,
        reason: refundReason.trim() || 'Buyer requested refund',
      });
      setRefundMsg('Refund requested. You will be notified when it completes.');
      setRefundOpen(false);
      setRefundReason('');
      setRefundAmount('');
      void qc.invalidateQueries({ queryKey: ['payments', id] });
      void qc.invalidateQueries({ queryKey: ['payment-refunds', refundablePayment.id] });
    } catch (e) {
      setRefundMsg(e instanceof ApiError ? e.message : 'Refund request failed');
    } finally {
      setRefundSubmitting(false);
    }
  }
```

5. In the modal (line 1097), replace the fixed-amount block:

```tsx
              <div className="rounded-xl bg-ink text-paper p-4 text-center">
                <div className="text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  Refund amount
                </div>
                <div className="font-mono text-3xl mt-1 text-volt">
                  {formatLKR(Number.isFinite(refundAmountCents) ? refundAmountCents : 0)}
                </div>
              </div>
```

with:

```tsx
              <div className="space-y-1.5">
                <Label htmlFor="refund-amount">Refund amount (LKR)</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  placeholder={(refundRemaining / 100).toFixed(2)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
                <p className="text-[11px] text-ink-4">
                  Remaining refundable: {formatLKR(refundRemaining)}. Leave blank to refund the full remaining amount.
                </p>
              </div>
```

6. If `Input` is not already imported from `@/components/ui` in this file, add it (the submit button's disabled condition already allows submission and amount validity is handled inside `submitRefund` with a visible message).

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @vyro/web exec vitest run test/refundable.test.ts && pnpm --filter @vyro/web typecheck`
Expected: PASS / no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/refundable.ts apps/web/test/refundable.test.ts apps/web/src/pages/OrderDetailPage.tsx
git commit -m "feat(refunds): support buyer partial refund requests"
```

---

### Task 5: Pay at checkout

**Files:**
- Create: `apps/web/src/lib/checkoutPayments.ts`
- Create: `apps/web/test/checkoutPayments.test.ts`
- Modify: `apps/web/src/pages/CheckoutPage.tsx` (`submit`, lines 187-216)

**Interfaces:**
- Consumes: `POST /payments` (body `{purchaseOrderId, method:'online'}`, `Idempotency-Key` header), `POST /payments/:id/checkout` → `{ redirectUrl, isMock }`.
- Produces: `startPaymentsAfterCheckout(poIds: string[], checkoutKey: string, deps: PaymentStartDeps): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/checkoutPayments.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { startPaymentsAfterCheckout, type PaymentStartDeps } from '../src/lib/checkoutPayments';

function makeDeps(overrides: Partial<PaymentStartDeps> = {}) {
  const calls = {
    created: [] as Array<{ poId: string; key: string }>,
    started: [] as string[],
    navigated: [] as string[],
    redirected: [] as string[],
    notices: [] as Array<{ kind: 'success' | 'error'; message: string }>,
  };
  const deps: PaymentStartDeps = {
    createPayment: vi.fn(async (poId, idempotencyKey) => {
      calls.created.push({ poId, key: idempotencyKey });
      return { id: `pay-${poId}` };
    }),
    startCheckout: vi.fn(async (paymentId) => {
      calls.started.push(paymentId);
      return { redirectUrl: `https://gw.test/${paymentId}`, isMock: false };
    }),
    navigate: (p) => calls.navigated.push(p),
    redirect: (u) => calls.redirected.push(u),
    notify: (kind, message) => calls.notices.push({ kind, message }),
    ...overrides,
  };
  return { deps, calls };
}

describe('startPaymentsAfterCheckout', () => {
  it('redirects to the gateway for a single order', async () => {
    const { deps, calls } = makeDeps();
    await startPaymentsAfterCheckout(['po-1'], 'key-1', deps);
    expect(calls.created).toEqual([{ poId: 'po-1', key: 'checkout-key-1-po-1' }]);
    expect(calls.redirected).toEqual(['https://gw.test/pay-po-1']);
    expect(calls.navigated).toEqual([]);
  });

  it('creates payments for every order and lands on the orders list for multi-supplier carts', async () => {
    const { deps, calls } = makeDeps();
    await startPaymentsAfterCheckout(['po-1', 'po-2'], 'key-1', deps);
    expect(calls.created.map((c) => c.poId)).toEqual(['po-1', 'po-2']);
    expect(calls.navigated).toEqual(['/orders']);
    expect(calls.redirected).toEqual([]);
    expect(calls.notices[0]?.kind).toBe('success');
  });

  it('does not redirect when the gateway is the mock simulator', async () => {
    const { deps, calls } = makeDeps({
      startCheckout: vi.fn(async () => ({ redirectUrl: 'https://mock.vyro.local/x', isMock: true })),
    });
    await startPaymentsAfterCheckout(['po-1'], 'key-1', deps);
    expect(calls.redirected).toEqual([]);
    expect(calls.navigated).toEqual(['/orders/po-1']);
    expect(calls.notices[0]?.kind).toBe('error');
  });

  it('still navigates to the order when payment creation fails', async () => {
    const { deps, calls } = makeDeps({
      createPayment: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await startPaymentsAfterCheckout(['po-1'], 'key-1', deps);
    expect(calls.navigated).toEqual(['/orders/po-1']);
    expect(calls.notices[0]?.kind).toBe('error');
  });

  it('still navigates to the order when checkout startup fails', async () => {
    const { deps, calls } = makeDeps({
      startCheckout: vi.fn(async () => {
        throw new Error('gateway down');
      }),
    });
    await startPaymentsAfterCheckout(['po-1'], 'key-1', deps);
    expect(calls.navigated).toEqual(['/orders/po-1']);
    expect(calls.notices[0]?.kind).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web exec vitest run test/checkoutPayments.test.ts`
Expected: FAIL — cannot resolve `../src/lib/checkoutPayments`.

- [ ] **Step 3: Write the helper**

Create `apps/web/src/lib/checkoutPayments.ts`:

```ts
export interface PaymentStartDeps {
  createPayment(poId: string, idempotencyKey: string): Promise<{ id: string }>;
  startCheckout(paymentId: string): Promise<{ redirectUrl: string; isMock?: boolean }>;
  navigate(path: string): void;
  redirect(url: string): void;
  notify(kind: 'success' | 'error', message: string): void;
}

/**
 * Start online payments for freshly-created POs after checkout.
 * Best-effort: the orders already exist, so a payment failure must never
 * block or roll back checkout — payment can be retried from the order page.
 */
export async function startPaymentsAfterCheckout(
  poIds: string[],
  checkoutKey: string,
  deps: PaymentStartDeps,
): Promise<void> {
  if (poIds.length === 0) return;

  const payments: Array<{ poId: string; paymentId: string }> = [];
  let failed = 0;
  for (const poId of poIds) {
    try {
      const payment = await deps.createPayment(poId, `checkout-${checkoutKey}-${poId}`);
      payments.push({ poId, paymentId: payment.id });
    } catch {
      failed += 1;
    }
  }

  if (poIds.length === 1) {
    const first = payments[0];
    if (!first) {
      deps.notify('error', 'Order created, but payment could not be started. Pay from the order page.');
      deps.navigate(`/orders/${poIds[0]}`);
      return;
    }
    try {
      const checkout = await deps.startCheckout(first.paymentId);
      if (checkout.isMock) {
        deps.notify('error', 'Staging payment simulator active — no real money will move.');
        deps.navigate(`/orders/${first.poId}`);
        return;
      }
      deps.redirect(checkout.redirectUrl);
    } catch {
      deps.notify('error', 'Payment could not be started. Pay from the order page.');
      deps.navigate(`/orders/${first.poId}`);
    }
    return;
  }

  deps.navigate('/orders');
  if (failed > 0) {
    deps.notify(
      'error',
      `${poIds.length} purchase orders created, but ${failed} payment(s) could not be started. Pay each order from its page.`,
    );
  } else {
    deps.notify('success', `${poIds.length} purchase orders created — pay each supplier order.`);
  }
}
```

Before running, fix the test's stray `calls.redistributed` assertion: replace that line with `expect(calls.redirected).toEqual([]);` so the test compiles.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/web exec vitest run test/checkoutPayments.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire CheckoutPage**

In `apps/web/src/pages/CheckoutPage.tsx`:

1. Add imports: `import { useToast } from '@vyro/ui';` and `import { startPaymentsAfterCheckout } from '@/lib/checkoutPayments';`
2. Add `const toast = useToast();` next to `const navigate = useNavigate();` (line 68).
3. Replace `submit` (line 187) with:

```tsx
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    const checkoutKey = crypto.randomUUID();
    try {
      const res = await api.post<{ poIds: string[]; count: number }>('/purchase-orders/checkout', {
        businessId: activeBusinessId,
        notes: notes.trim() || undefined,
        paymentMethod,
        ...(paymentMethod === 'credit' ? { creditTerms } : {}),
      });

      if (paymentMethod === 'paynow') {
        await startPaymentsAfterCheckout(res.poIds, checkoutKey, {
          createPayment: (poId, idempotencyKey) =>
            api.post<{ id: string }>('/payments', { purchaseOrderId: poId, method: 'online' }, { idempotencyKey }),
          startCheckout: (paymentId) =>
            api.post<{ redirectUrl: string; isMock?: boolean }>(`/payments/${paymentId}/checkout`, {}),
          navigate: (path) => navigate(path),
          redirect: (url) => {
            window.location.href = url;
          },
          notify: (kind, message) => {
            if (kind === 'success') toast.success(message);
            else toast.error(message);
          },
        });
        return;
      }

      if (res.poIds && res.poIds.length === 1) {
        navigate(`/orders/${res.poIds[0]}`);
      } else {
        navigate('/orders');
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'KYC_REQUIRED') {
        navigate(`/businesses/${activeBusinessId}/kyc`);
        return;
      }
      if (e instanceof ApiError && (e.code === 'credit_limit_exceeded' || e.code === 'credit_overdue_blocked' || e.code === 'credit_not_eligible')) {
        setErr(`${e.message} — View VYRO Credit`);
      } else {
        setErr(e instanceof ApiError ? e.message : 'Failed to place purchase orders. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }
```

Note: `purchase-orders/checkout` ignores `idempotencyKey` server-side today (schema field unused), so no key is sent for the checkout itself; keys are sent only on payment creation, which does enforce them.

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @vyro/web exec vitest run test/checkoutPayments.test.ts && pnpm --filter @vyro/web typecheck`
Expected: PASS / no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/checkoutPayments.ts apps/web/test/checkoutPayments.test.ts apps/web/src/pages/CheckoutPage.tsx
git commit -m "feat(checkout): start payments after checkout for pay-now orders"
```

---

### Task 6: Delivery address book

**Files:**
- Create: `apps/web/src/lib/addressBook.ts`
- Create: `apps/web/test/addressBook.test.ts`
- Create: `apps/web/src/pages/AddressesPage.tsx`
- Modify: `apps/web/src/App.tsx` (lazy import + route), `apps/web/src/pages/CheckoutPage.tsx` (address query + selector + `deliveryAddressId`), `apps/web/src/pages/ProfilePage.tsx` (link)

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /businesses/:businessId/addresses`.
- Produces: `AddressFormState`, `EMPTY_ADDRESS_FORM`, `isAddressFormValid(form)`, `toAddressPayload(form): BusinessAddressCreate`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/addressBook.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EMPTY_ADDRESS_FORM, isAddressFormValid, toAddressPayload } from '../src/lib/addressBook';

describe('address book form helpers', () => {
  it('rejects an empty form and short addresses', () => {
    expect(isAddressFormValid(EMPTY_ADDRESS_FORM)).toBe(false);
    expect(
      isAddressFormValid({ ...EMPTY_ADDRESS_FORM, label: 'Main', address: 'ab', city: 'Colombo', district: 'Colombo' }),
    ).toBe(false);
  });

  it('accepts a complete form', () => {
    expect(
      isAddressFormValid({
        label: 'Main Depot',
        contactName: '',
        phone: '',
        address: '12 Galle Road',
        city: 'Colombo',
        district: 'Colombo',
        isDefault: false,
      }),
    ).toBe(true);
  });

  it('trims fields and maps empty optionals to null', () => {
    expect(
      toAddressPayload({
        label: '  Main Depot ',
        contactName: ' ',
        phone: '',
        address: ' 12 Galle Road ',
        city: ' Colombo ',
        district: ' Colombo ',
        isDefault: true,
      }),
    ).toEqual({
      label: 'Main Depot',
      contactName: null,
      phone: null,
      address: '12 Galle Road',
      city: 'Colombo',
      district: 'Colombo',
      isDefault: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web exec vitest run test/addressBook.test.ts`
Expected: FAIL — cannot resolve `../src/lib/addressBook`.

- [ ] **Step 3: Write the helper**

Create `apps/web/src/lib/addressBook.ts`:

```ts
import type { BusinessAddressCreate } from '@vyro/validation';

export interface AddressFormState {
  label: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  isDefault: boolean;
}

export const EMPTY_ADDRESS_FORM: AddressFormState = {
  label: '',
  contactName: '',
  phone: '',
  address: '',
  city: '',
  district: '',
  isDefault: false,
};

export function isAddressFormValid(form: AddressFormState): boolean {
  return (
    form.label.trim().length > 0 &&
    form.address.trim().length >= 3 &&
    form.city.trim().length > 0 &&
    form.district.trim().length > 0
  );
}

export function toAddressPayload(form: AddressFormState): BusinessAddressCreate {
  return {
    label: form.label.trim(),
    contactName: form.contactName.trim() || null,
    phone: form.phone.trim() || null,
    address: form.address.trim(),
    city: form.city.trim(),
    district: form.district.trim(),
    isDefault: form.isDefault,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/web exec vitest run test/addressBook.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the address book page**

Create `apps/web/src/pages/AddressesPage.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Badge, Button, ErrorBanner, Input, Label } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { useToast } from '@vyro/ui';
import {
  EMPTY_ADDRESS_FORM,
  isAddressFormValid,
  toAddressPayload,
  type AddressFormState,
} from '@/lib/addressBook';

interface AddressRow {
  id: string;
  label: string;
  contactName: string | null;
  phone: string | null;
  address: string;
  city: string;
  district: string;
  isDefault: boolean;
}

const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
  'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
  'Mannar', 'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

export function AddressesPage() {
  usePageTitle('Delivery Addresses');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<AddressFormState>(EMPTY_ADDRESS_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [err, setErr] = useState('');

  const addresses = useQuery({
    queryKey: ['addresses', businessId],
    queryFn: () => api.get<{ addresses: AddressRow[] }>(`/businesses/${businessId}/addresses`),
    enabled: !!businessId,
  });

  function resetForm() {
    setForm(EMPTY_ADDRESS_FORM);
    setEditingId(null);
    setFormOpen(false);
    setErr('');
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = toAddressPayload(form);
      if (editingId) return api.patch(`/businesses/${businessId}/addresses/${editingId}`, payload);
      return api.post(`/businesses/${businessId}/addresses`, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success(editingId ? 'Address updated' : 'Address added');
      resetForm();
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Could not save address'),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/businesses/${businessId}/addresses/${id}`, { isDefault: true }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success('Default address updated');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not set default'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/businesses/${businessId}/addresses/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success('Address removed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove address'),
  });

  if (!businessId) {
    return (
      <div className="py-16 max-w-lg mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">No business profile found</h2>
        <p className="text-xs text-ink-3">Set up a business profile to manage delivery addresses.</p>
        <Link to="/onboarding/business">
          <Button variant="primary">Set Up Business Profile</Button>
        </Link>
      </div>
    );
  }

  const list = addresses.data?.addresses ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-1">Delivery addresses</h1>
          <p className="text-xs text-ink-3 mt-1">
            Choose a dock or receiving site at checkout. The first address you save becomes the default.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setForm(EMPTY_ADDRESS_FORM);
            setEditingId(null);
            setFormOpen(true);
            setErr('');
          }}
        >
          + Add address
        </Button>
      </div>

      {err && <ErrorBanner message={err} />}

      {formOpen && (
        <Surface className="p-5 rounded-2xl border border-paper-subtle bg-paper space-y-4">
          <h2 className="text-sm font-bold text-ink-1">{editingId ? 'Edit address' : 'New address'}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="addr-label">Label *</Label>
              <Input id="addr-label" value={form.label} maxLength={60}
                onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Main Depot" />
            </div>
            <div>
              <Label htmlFor="addr-contact">Contact name</Label>
              <Input id="addr-contact" value={form.contactName} maxLength={120}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Receiving officer" />
            </div>
            <div>
              <Label htmlFor="addr-phone">Phone</Label>
              <Input id="addr-phone" value={form.phone} maxLength={20}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="077 000 0000" />
            </div>
            <div>
              <Label htmlFor="addr-city">City *</Label>
              <Input id="addr-city" value={form.city} maxLength={80}
                onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Colombo" />
            </div>
            <div>
              <Label htmlFor="addr-district">District *</Label>
              <select
                id="addr-district"
                className="w-full mt-1 p-2.5 text-xs rounded-xl bg-paper border border-paper-subtle"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              >
                <option value="">Select district…</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="addr-address">Address *</Label>
              <Input id="addr-address" value={form.address} maxLength={300}
                onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="12 Galle Road, Colombo 03" />
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-2 sm:col-span-2">
              <input type="checkbox" checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Make this the default delivery address
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={resetForm} disabled={save.isPending}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={!isAddressFormValid(form) || save.isPending}
              loading={save.isPending}
            >
              {editingId ? 'Save changes' : 'Add address'}
            </Button>
          </div>
        </Surface>
      )}

      {addresses.isLoading ? (
        <div className="h-40 vyro-surface animate-pulse" />
      ) : list.length === 0 ? (
        <Surface className="p-10 text-center rounded-2xl border border-paper-subtle bg-paper space-y-2">
          <h3 className="text-sm font-bold text-ink-1">No saved addresses yet</h3>
          <p className="text-xs text-ink-3">
            Checkout uses your registered business address until you save one here.
          </p>
        </Surface>
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <Surface key={a.id} className="p-4 rounded-2xl border border-paper-subtle bg-paper flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink-1 truncate">{a.label}</h3>
                  {a.isDefault && <Badge variant="neutral" className="text-[10px]">Default</Badge>}
                </div>
                <p className="text-xs text-ink-3 mt-1">{a.address}, {a.city}, {a.district}</p>
                {(a.contactName || a.phone) && (
                  <p className="text-[11px] text-ink-4 mt-0.5">
                    {a.contactName}{a.contactName && a.phone ? ' · ' : ''}{a.phone}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!a.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setDefault.mutate(a.id)} disabled={setDefault.isPending}>
                    Set default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setForm({
                      label: a.label,
                      contactName: a.contactName ?? '',
                      phone: a.phone ?? '',
                      address: a.address,
                      city: a.city,
                      district: a.district,
                      isDefault: a.isDefault,
                    });
                    setEditingId(a.id);
                    setFormOpen(true);
                    setErr('');
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Remove ${a.label}?`)) remove.mutate(a.id);
                  }}
                  disabled={remove.isPending}
                >
                  Delete
                </Button>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
```

If `Badge`, `Input`, or `ErrorBanner` are exported differently from `@/components/ui`, match what `CheckoutPage.tsx` imports (it already imports `Button, ErrorBanner, Label, Badge` from there; `Input` is used by `ProfilePage.tsx` from the same barrel).

- [ ] **Step 6: Register the route and profile link**

In `apps/web/src/App.tsx`:

```tsx
const AddressesPage = lazy(() => import('./pages/AddressesPage').then((m) => ({ default: m.AddressesPage })));
```

and under `<Route element={<Layout />}>` next to `/profile` (line 166):

```tsx
<Route path="/addresses" element={<RequireBusiness><AddressesPage /></RequireBusiness>} />
```

In `apps/web/src/pages/ProfilePage.tsx`, inside the organizations tab header (line 370), wrap the existing Register link with an Addresses link beside it:

```tsx
<div className="flex items-center gap-2">
  <Link to="/addresses">
    <Button variant="ghost" size="sm" className="text-xs uppercase tracking-wider font-bold">
      Addresses
    </Button>
  </Link>
  <Link to="/onboarding/business">
    <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-bold">
      + Register
    </Button>
  </Link>
</div>
```

- [ ] **Step 7: Add the checkout selector**

In `apps/web/src/pages/CheckoutPage.tsx`:

1. Add state near line 63: `const [deliveryAddressId, setDeliveryAddressId] = useState<string | undefined>(undefined);`
2. Add the query after the business detail query (line 105):

```tsx
  const addresses = useQuery({
    queryKey: ['addresses', activeBusinessId],
    queryFn: () =>
      api.get<{
        addresses: Array<{
          id: string;
          label: string;
          contactName: string | null;
          phone: string | null;
          address: string;
          city: string;
          district: string;
          isDefault: boolean;
        }>;
      }>(`/businesses/${activeBusinessId}/addresses`),
    enabled: !!activeBusinessId,
  });
  const addressList = addresses.data?.addresses ?? [];
  const effectiveAddressId =
    deliveryAddressId ?? addressList.find((a) => a.isDefault)?.id ?? addressList[0]?.id;
```

3. In Section 2 (`SECTION 2: Receiving Facility & Delivery Instructions`, line 505), insert this block directly after the header `div` (after line 516) and before the `Quick Instruction Presets` block:

```tsx
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink-4">Deliver to</span>
                  <Link to="/addresses" className="text-[11px] font-semibold text-emerald-700 hover:underline">
                    Manage addresses
                  </Link>
                </div>
                {addressList.length === 0 ? (
                  <p className="text-[11px] text-ink-4">
                    Using your registered business address. Save delivery addresses to choose a dock here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {addressList.map((a) => (
                      <label
                        key={a.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          effectiveAddressId === a.id
                            ? 'border-emerald-500 bg-emerald-500/5'
                            : 'border-paper-subtle bg-paper-subtle/20 hover:border-ink-4'
                        }`}
                      >
                        <input
                          type="radio"
                          name="delivery-address"
                          className="mt-1"
                          checked={effectiveAddressId === a.id}
                          onChange={() => setDeliveryAddressId(a.id)}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-ink-1">
                            {a.label}
                            {a.isDefault ? ' (default)' : ''}
                          </span>
                          <span className="block text-[11px] text-ink-3 mt-0.5">
                            {a.address}, {a.city}, {a.district}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
```

4. In `submit`, add the address to the checkout body (inside the `api.post` body object, after `notes`):

```ts
        ...(effectiveAddressId ? { deliveryAddressId: effectiveAddressId } : {}),
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm --filter @vyro/web exec vitest run test/addressBook.test.ts && pnpm --filter @vyro/web typecheck`
Expected: PASS / no type errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/addressBook.ts apps/web/test/addressBook.test.ts apps/web/src/pages/AddressesPage.tsx apps/web/src/App.tsx apps/web/src/pages/CheckoutPage.tsx apps/web/src/pages/ProfilePage.tsx
git commit -m "feat(checkout): delivery address book page and checkout selector"
```

---

### Task 7: Fix conversational order business id

**Files:**
- Create: `apps/web/src/lib/activeBusiness.ts`
- Create: `apps/web/test/activeBusiness.test.ts`
- Modify: `apps/web/src/pages/ConversationalOrderPage.tsx` (line 76)

**Interfaces:**
- Produces: `firstBusinessId(user): string | undefined`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/activeBusiness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { firstBusinessId } from '../src/lib/activeBusiness';

describe('firstBusinessId', () => {
  it('returns the first membership business id', () => {
    expect(firstBusinessId({ memberships: [{ businessId: 'biz-1' }, { businessId: 'biz-2' }] })).toBe('biz-1');
  });

  it('returns undefined without memberships', () => {
    expect(firstBusinessId({ memberships: [] })).toBeUndefined();
    expect(firstBusinessId(null)).toBeUndefined();
    expect(firstBusinessId(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web exec vitest run test/activeBusiness.test.ts`
Expected: FAIL — cannot resolve `../src/lib/activeBusiness`.

- [ ] **Step 3: Write the helper**

Create `apps/web/src/lib/activeBusiness.ts`:

```ts
export interface MembershipLike {
  businessId: string;
}

export function firstBusinessId(
  user: { memberships?: MembershipLike[] } | null | undefined,
): string | undefined {
  return user?.memberships?.[0]?.businessId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/web exec vitest run test/activeBusiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the page**

In `apps/web/src/pages/ConversationalOrderPage.tsx`:

1. Add imports: `import { useAuth } from '@/lib/auth';` and `import { firstBusinessId } from '@/lib/activeBusiness';`
2. After `const navigate = useNavigate();` (line 19) add:

```tsx
  const { user } = useAuth();
  const activeBusinessId = firstBusinessId(user);
```

3. Replace `handleConfirmDraft` (line 69) with:

```tsx
  async function handleConfirmDraft(draft: OrderDraft) {
    if (!activeBusinessId) {
      toast.show(toast.error('No business profile found. Complete business onboarding first.'));
      return;
    }
    setConfirming(true);
    try {
      const res = await api.post<{ ok: boolean; poIds: string[]; totalCents: number }>(
        '/conversational/confirm',
        {
          draftId: draft.id,
          businessId: activeBusinessId,
        },
      );
      toast.show(toast.success('Purchase Order placed successfully!'));
      if (res.poIds[0]) {
        navigate(`/orders/${res.poIds[0]}`);
      }
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Could not place order'));
    } finally {
      setConfirming(false);
    }
  }
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @vyro/web exec vitest run test/activeBusiness.test.ts && pnpm --filter @vyro/web typecheck`
Expected: PASS / no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/activeBusiness.ts apps/web/test/activeBusiness.test.ts apps/web/src/pages/ConversationalOrderPage.tsx
git commit -m "fix(orders): use the real business id for conversational checkout"
```

---

### Task 8: Remaining web bug fixes

**Files:**
- Modify: `apps/web/src/pages/CheckoutPage.tsx:374`, `apps/web/src/storefront/StorefrontPage.tsx:53,77,104`, `apps/web/src/pages/OrderDetailPage.tsx:1012`, `apps/web/src/ai/CartHintsBanner.tsx:26`
- Modify: `apps/web/src/supplier/sponsored/CampaignFormPage.tsx:19-26`, `apps/web/src/supplier/catalogListing.ts`, `apps/web/test/catalogListing.test.ts`
- Delete: `apps/web/src/admin/Lists.new.tsx`

**Interfaces:**
- Produces: `productOptionsFromOffers(offers, products): Array<{ id: string; name: string }>`.

- [ ] **Step 1: Write the failing test for the campaign product picker**

Append to `apps/web/test/catalogListing.test.ts`:

```ts
import { productOptionsFromOffers } from '../src/supplier/catalogListing';

describe('productOptionsFromOffers', () => {
  it('returns only products the supplier actively lists', () => {
    const options = productOptionsFromOffers(
      [
        { productId: 'p-rice', active: true, deletedAt: null },
        { productId: 'p-sugar', active: false, deletedAt: null },
        { productId: 'p-tea', active: true, deletedAt: 123 },
        { productId: 'p-dhal', active: true, deletedAt: null },
      ],
      [
        { id: 'p-rice', name: 'Rice 5kg' },
        { id: 'p-sugar', name: 'Sugar 1kg' },
        { id: 'p-tea', name: 'Tea 100g' },
        { id: 'p-dhal', name: 'Dhal 1kg' },
        { id: 'p-flour', name: 'Flour 1kg' },
      ],
    );
    expect(options).toEqual([
      { id: 'p-rice', name: 'Rice 5kg' },
      { id: 'p-dhal', name: 'Dhal 1kg' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web exec vitest run test/catalogListing.test.ts`
Expected: FAIL — `productOptionsFromOffers` is not exported.

- [ ] **Step 3: Implement the helper and fix the campaign form**

Append to `apps/web/src/supplier/catalogListing.ts`:

```ts
export function productOptionsFromOffers(
  offers: Array<{ productId: string; active: boolean; deletedAt: number | null }>,
  products: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  const listed = new Set(offers.filter((o) => o.active && !o.deletedAt).map((o) => o.productId));
  return products.filter((p) => listed.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
}
```

In `apps/web/src/supplier/sponsored/CampaignFormPage.tsx`, replace the query (lines 19-26) with:

```tsx
  const products = useQuery({
    queryKey: ['supplierProducts', supplierId],
    queryFn: async () => {
      const [offersRes, catalogRes] = await Promise.all([
        api.get<{ offers: Array<{ id: string; productId: string; active: boolean; deletedAt: number | null }> }>(
          `/supplier-products/by-supplier/${supplierId}`,
        ),
        api.get<{ products: Array<{ id: string; name: string }> }>('/products?limit=500'),
      ]);
      return productOptionsFromOffers(offersRes.offers, catalogRes.products);
    },
    enabled: !!supplierId,
  });
```

and add to the imports: `import { productOptionsFromOffers } from '../catalogListing';`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/web exec vitest run test/catalogListing.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix links and API prefixes**

1. `apps/web/src/pages/CheckoutPage.tsx:374`: change `<Link to="/marketplace"` → `<Link to="/search"`.
2. `apps/web/src/storefront/StorefrontPage.tsx`:
   - line 53: `api.get<StorefrontData>(\`/api/suppliers/by-slug/${encodeURIComponent(slug)}\`)` → `` api.get<StorefrontData>(`/suppliers/by-slug/${encodeURIComponent(slug)}`) ``
   - lines 77 and 104: `<Link to="/marketplace"` → `<Link to="/search"`.
3. `apps/web/src/pages/OrderDetailPage.tsx:1012`: `to="/support"` → `to="/ask"` and change the link text `Open a support ticket` → `Ask Vyro Assistant`.
4. `apps/web/src/ai/CartHintsBanner.tsx:26`: `` api.get<{ hints: CartHint[] }>(`/api/ai/cart-hints?businessId=${businessId ?? ''}`) `` → `` api.get<{ hints: CartHint[] }>(`/ai/cart-hints?businessId=${businessId ?? ''}`) ``.

- [ ] **Step 6: Delete the orphan file**

Run: `git rm apps/web/src/admin/Lists.new.tsx`

Verify nothing imports it: `grep -rn "Lists.new" apps/web/src` → expect no output.

- [ ] **Step 7: Verify no dead links or double prefixes remain**

Run:
```bash
grep -rn '"/marketplace"\|to="/support"\|/api/ai/cart-hints\|/api/suppliers/by-slug' apps/web/src --include='*.tsx'
```
Expected: no output (all fixed).

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm --filter @vyro/web exec vitest run test/catalogListing.test.ts && pnpm --filter @vyro/web typecheck`
Expected: PASS / no type errors.

- [ ] **Step 9: Commit**

```bash
git add -A apps/web
git commit -m "fix(web): dead links, double api prefix, campaign product picker, remove orphan"
```

---

### Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Monorepo typecheck**

Run: `pnpm typecheck`
Expected: all packages pass, no output errors.

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: api, web, payments, shared, validation, auth all pass; no regressions in the existing 1000+ API tests.

- [ ] **Step 3: Web production build**

Run: `pnpm --filter @vyro/web build`
Expected: `tsc -b` + `vite build` succeed.

- [ ] **Step 4: Manual smoke (dev server)**

Run: `pnpm dev`, then in the browser:
1. Business account → `/addresses` → add two addresses, set one default, edit, delete.
2. `/checkout` → confirm the selector shows addresses with default preselected and "Manage addresses" links out.
3. Place a single-supplier cart with "Pay now" → gateway redirect (or staging-simulator toast in mock mode).
4. Place a multi-supplier cart with "Pay now" → lands on `/orders` with the "pay each supplier order" toast.
5. `/cart` → Clear Cart removes all items in one request (check Network tab: one `DELETE /api/cart`).
6. `/orders/:id` → Request refund → default amount equals remaining refundable, over-amount shows the max message, valid amount submits.
7. `/orders/conversational` with a membership → Confirm draft no longer 403s.
8. `/supplier/sponsored/campaigns/new` → product dropdown lists only actively-listed products.
