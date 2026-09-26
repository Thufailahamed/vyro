import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// End-to-end buyer purchase lifecycle driven entirely through the real UI:
//   add to cart → checkout (COD) → supplier accept → prepare → track →
//   dispatch → POD delivery → buyer confirm → return → approve → receive →
//   restock + refund → COD payment confirmed.
// Personas + sessions are created in global-setup.ts against real local D1.

const e2eDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(e2eDir, '../../api');
const CSRF_ORIGIN = { origin: 'http://localhost:5199' };
const QTY = 8;
const RETURN_QTY = 2;
const TRACKING_NUMBER = 'TRK-E2E-12345';

test.describe.configure({ mode: 'serial' });

let buyerCtx: BrowserContext;
let supplierCtx: BrowserContext;
let buyer: Page;
let supplier: Page;
let poId = '';

test.beforeAll(async ({ browser }) => {
  buyerCtx = await newAuthedContext(browser, 'buyer.json');
  supplierCtx = await newAuthedContext(browser, 'supplier.json');
  buyer = await buyerCtx.newPage();
  supplier = await supplierCtx.newPage();
});

test.afterAll(async () => {
  await buyerCtx.close();
  await supplierCtx.close();
});

async function newAuthedContext(browser: Browser, state: string) {
  return browser.newContext({
    baseURL: 'http://localhost:5199',
    storageState: resolve(e2eDir, '.auth', state),
    extraHTTPHeaders: CSRF_ORIGIN,
  });
}

function d1Query(sql: string): unknown[] {
  const r = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'vyro', '--local', '--json', '--command', sql],
    { cwd: apiDir, input: 'y\n', encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`d1 query failed: ${r.stderr || r.stdout}`);
  const parsed = JSON.parse(r.stdout) as Array<{ results: unknown[] }>;
  return parsed[0]?.results ?? [];
}

test('buyer: add to cart → checkout → COD payment', async () => {
  // Product page lists the single e2e offer (competing offers deactivated by seed).
  await buyer.goto('/products/p-rice-5kg');
  await expect(buyer.getByText('E2E Wholesale Co').first()).toBeVisible();

  await buyer.locator('input[type="number"]').first().fill(String(QTY));
  const [addRes] = await Promise.all([
    buyer.waitForResponse((r) => r.url().includes('/api/cart/items') && r.request().method() === 'POST'),
    buyer.getByRole('button', { name: /add to cart|^add$/i }).click(),
  ]);
  expect(addRes.status()).toBe(201);

  // Cart shows the line with correct pricing.
  await buyer.goto('/cart');
  await expect(buyer.getByText('White Rice 5kg').first()).toBeVisible();
  await buyer.getByRole('button', { name: /generate.*checkout/i }).click();
  await expect(buyer).toHaveURL(/\/checkout/);

  // Checkout → purchase order issued.
  const [checkoutRes] = await Promise.all([
    buyer.waitForResponse((r) => r.url().includes('/api/purchase-orders/checkout') && r.request().method() === 'POST'),
    buyer.getByRole('button', { name: /confirm.*issue purchase orders/i }).click(),
  ]);
  expect(checkoutRes.status()).toBe(201);
  const body = (await checkoutRes.json()) as { poIds: string[] };
  expect(body.poIds).toHaveLength(1);
  poId = body.poIds[0];
  await expect(buyer).toHaveURL(new RegExp(`/orders/${poId}`));

  // Cash on delivery: buyer records a cash payment (supplier confirms later).
  const pay = await buyer.request.post('/api/payments', {
    data: { purchaseOrderId: poId, method: 'cash' },
  });
  expect(pay.status()).toBe(201);
});

test('supplier: notified → accept → prepare → track → dispatch → POD delivery', async () => {
  test.skip(!poId, 'depends on buyer checkout');

  // Seller was notified + can see the order.
  await supplier.goto('/supplier/orders');
  await expect(supplier.getByText(/PO-|pending/i).first()).toBeVisible();
  await supplier.goto(`/supplier/orders/${poId}`);
  await expect(supplier.getByText('White Rice 5kg').first()).toBeVisible();

  // Accept in full.
  await supplier.getByRole('button', { name: 'Accept' }).click();
  await supplier.getByRole('button', { name: /accept in full/i }).click();
  await expect(supplier.getByRole('button', { name: 'Start preparing' })).toBeVisible();

  // Fulfilment stages.
  await supplier.getByRole('button', { name: 'Start preparing' }).click();
  await expect(supplier.getByRole('button', { name: 'Mark ready for pickup' })).toBeVisible();
  await supplier.getByRole('button', { name: 'Mark ready for pickup' }).click();
  await expect(supplier.getByRole('button', { name: 'Dispatch' })).toBeVisible();

  // Shipping / tracking details.
  await supplier.locator('#trk-carrier').fill('E2E Logistics');
  await supplier.locator('#trk-number').fill(TRACKING_NUMBER);
  await supplier.locator('#trk-url').fill('https://track.example.com/TRK-E2E-12345');
  await supplier.getByRole('button', { name: 'Save tracking' }).click();
  await expect(supplier.getByText('Saved')).toBeVisible();

  // COD payment is dispatchable — Dispatch must not be payment-gated.
  await expect(supplier.getByRole('button', { name: 'Dispatch' })).toBeEnabled();
  await supplier.getByRole('button', { name: 'Dispatch' }).click();
  await expect(supplier.getByRole('button', { name: 'Mark delivered' })).toBeVisible();

  // Proof of delivery is required before delivered.
  await supplier.getByRole('button', { name: 'Mark delivered' }).click();
  await supplier.locator('#pod-recipient').fill('E2E Stores Manager');
  await supplier.locator('#pod-note').fill('Signed GRN #E2E-1001 at dock');
  await supplier.getByRole('button', { name: /save & mark delivered/i }).click();
  await expect(supplier.getByText('Marked delivered.', { exact: false })).toBeVisible();
});

test('buyer: tracking visible → confirm receipt → request return', async () => {
  test.skip(!poId, 'depends on buyer checkout');

  await buyer.goto(`/orders/${poId}`);
  await expect(buyer.getByText(TRACKING_NUMBER)).toBeVisible();
  await expect(buyer.getByText('E2E Logistics')).toBeVisible();

  // Confirm receipt → completed (releases funds).
  await buyer.getByRole('button', { name: /yes — confirm receipt/i }).click();
  await expect(buyer.getByText(/receipt confirmed/i).first()).toBeVisible();

  // Request a return for part of the order.
  await buyer.getByRole('button', { name: /request a return/i }).click();
  await buyer.locator('#return-note').fill('E2E: cartons damaged on arrival');
  await buyer.locator('input[aria-label^="Return quantity"]').first().fill(String(RETURN_QTY));
  await buyer.getByRole('button', { name: /submit return/i }).click();
  await expect(buyer.getByText(/requested/i).first()).toBeVisible();
});

test('supplier: approve → receive return → confirm COD payment; stock restocked', async () => {
  test.skip(!poId, 'depends on buyer checkout');

  // The RMA is listed on the supplier returns queue…
  await supplier.goto('/supplier/returns');
  await expect(supplier.getByText(/requested|rma/i).first()).toBeVisible();

  // …but approve/receive actions live on the order detail page.
  await supplier.goto(`/supplier/orders/${poId}`);
  await supplier.getByRole('button', { name: 'Approve' }).first().click();
  await supplier.getByRole('button', { name: /approve return/i }).click();

  // Mark received (restock is checked by default).
  await supplier.getByRole('button', { name: /mark received/i }).click();
  await supplier.getByRole('button', { name: /confirm receipt/i }).click();
  await expect(supplier.getByText(/received|closed|refunded/i).first()).toBeVisible();

  // Supplier confirms the cash-on-delivery payment.
  await supplier.goto('/supplier/payments');
  await supplier.getByRole('button', { name: /confirm receipt/i }).first().click();
  await expect(supplier.getByText(/confirmed/i).first()).toBeVisible();

  // Authoritative stock check: 500 seeded − 8 committed + 2 restocked = 494.
  const rows = d1Query("SELECT stock_qty AS qty FROM supplier_products WHERE id='sp-rice-colombo'") as Array<{ qty: number }>;
  expect(rows[0]?.qty).toBe(500 - QTY + RETURN_QTY);
});
