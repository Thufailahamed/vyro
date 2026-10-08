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
