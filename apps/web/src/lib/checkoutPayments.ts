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
