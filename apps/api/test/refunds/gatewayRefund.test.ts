import { describe, expect, it, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../helpers/d1';

const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  ENVIRONMENT: 'test',
};
const ids: Record<string, any> = {};

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  const biz = newId();
  const sup = newId();
  const bt = newId();
  await db.insert(schema.users).values({
    id: 'buyer', email: 'b@t', passwordHash: 'x', name: 'b', phone: null, avatarUrl: null,
    adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null,
  });
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  await db.insert(schema.businesses).values({
    id: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t',
    address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
  });
  await db.insert(schema.suppliers).values({
    id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 's@t',
    address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null,
  });
  const poId = newId();
  await db.insert(schema.purchaseOrders).values({
    id: poId, poNumber: 'PO-GR-1', businessId: biz, supplierId: sup, status: 'pending',
    subtotalCents: 10000, deliveryFeeCents: 0, totalCents: 10000, currency: 'LKR',
    deliveryAddress: '1', deliveryCity: 'C', deliveryDistrict: 'C', createdByUserId: 'buyer', createdAt: now, updatedAt: now,
  });
  const payLk = newId();
  await db.insert(schema.payments).values({
    id: payLk, purchaseOrderId: poId, businessId: biz, supplierId: sup, method: 'online', provider: 'payments_lk',
    status: 'confirmed', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR',
    gatewayRef: 'ch_lk_1', providerTransactionId: 'plk_pay_1', confirmedAt: now, paidAt: now, createdAt: now, updatedAt: now,
  });
  const payPh = newId();
  await db.insert(schema.payments).values({
    id: payPh, purchaseOrderId: poId, businessId: biz, supplierId: sup, method: 'online', provider: 'payhere',
    status: 'confirmed', amountCents: 10000, feeCents: 250, netCents: 9750, currency: 'LKR',
    gatewayRef: 'ch_ph_1', confirmedAt: now, paidAt: now, createdAt: now, updatedAt: now,
  });
  ids.biz = biz; ids.sup = sup; ids.po = poId; ids.payLk = payLk; ids.payPh = payPh;

  // Allocation + earning rows so refund deltas have an earning to adjust.
  const { ensureAllocationAndEarning } = await import('../../src/modules/finance/earnings');
  await ensureAllocationAndEarning(d1, payLk, null);
  await ensureAllocationAndEarning(d1, payPh, null);
}, 60000);

describe('gateway refunds (payments.lk provider)', () => {
  it('auto-executes via the gateway and finalizes immediately on completed', async () => {
    const { executeRefund } = await import('../../src/modules/refunds/executor');
    const out = await executeRefund(env, {
      paymentId: ids.payLk,
      amountCents: 4000,
      source: 'manual',
      reason: 'partial shortage',
      actorUserId: null,
      idempotencyKey: 'gr-test-1',
    });
    expect(out).not.toBeNull();
    expect(out!.status).toBe('completed');

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const refund = (await db.select().from(schema.refunds).where(eq(schema.refunds.id, out!.refundId)).get()) as any;
    expect(refund.refundMethod).toBe('gateway');
    expect(refund.gatewayRefundId).toMatch(/^MOCK-RFND-/);

    const ledger = (await db.select().from(schema.ledgerEntries).all()) as any[];
    expect(ledger.some((l) => l.refId === out!.refundId && l.category === 'REFUND')).toBe(true);

    const earning = (await db.select().from(schema.supplierEarnings).where(eq(schema.supplierEarnings.paymentId, ids.payLk)).get()) as any;
    expect(earning.refundCents).toBe(4000);

    const replay = await executeRefund(env, {
      paymentId: ids.payLk,
      amountCents: 4000,
      source: 'manual',
      actorUserId: null,
      idempotencyKey: 'gr-test-1',
    });
    expect(replay!.reused).toBe(true);
    expect(replay!.refundId).toBe(out!.refundId);
  });

  it('stays processing when seeded; the refund.completed webhook finalizes it', async () => {
    const { applyGatewayPaymentEvent } = await import('../../src/modules/webhooks/paymentslk');
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const refundId = newId();
    await db.insert(schema.refunds).values({
      id: refundId, paymentId: ids.payLk, purchaseOrderId: ids.po, amountCents: 2000, currency: 'LKR',
      status: 'processing', refundMethod: 'gateway', source: 'manual', requestedByUserId: 'buyer',
      gatewayRefundId: 're_gw_1', idempotencyKey: 'gr-test-2', createdAt: Date.now(), updatedAt: Date.now(),
    });
    const result = await applyGatewayPaymentEvent(env, {
      type: 'refund.completed',
      gatewayRef: ids.payLk,
      refundId: 're_gw_1',
      amountCents: 2000,
      currency: 'LKR',
      raw: { type: 'refund.completed' },
    });
    expect(result.refund).toBe('completed');
    const refund = (await db.select().from(schema.refunds).where(eq(schema.refunds.id, refundId)).get()) as any;
    expect(refund.status).toBe('completed');
    expect(refund.providerReference).toBeNull();
  });

  it('refund.failed webhook marks the refund failed', async () => {
    const { applyGatewayPaymentEvent } = await import('../../src/modules/webhooks/paymentslk');
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const refundId = newId();
    await db.insert(schema.refunds).values({
      id: refundId, paymentId: ids.payLk, purchaseOrderId: ids.po, amountCents: 1000, currency: 'LKR',
      status: 'processing', refundMethod: 'gateway', source: 'manual', requestedByUserId: 'buyer',
      gatewayRefundId: 're_gw_2', idempotencyKey: 'gr-test-3', createdAt: Date.now(), updatedAt: Date.now(),
    });
    const result = await applyGatewayPaymentEvent(env, {
      type: 'refund.failed',
      gatewayRef: ids.payLk,
      refundId: 're_gw_2',
      raw: { type: 'refund.failed' },
    });
    expect(result.refund).toBe('failed');
    const refund = (await db.select().from(schema.refunds).where(eq(schema.refunds.id, refundId)).get()) as any;
    expect(refund.status).toBe('failed');
    expect(refund.failureReason).toBe('gateway:refund.failed');
  });

  it('legacy payhere online payments stay on the manual queue', async () => {
    const { executeRefund } = await import('../../src/modules/refunds/executor');
    const out = await executeRefund(env, {
      paymentId: ids.payPh,
      amountCents: 4000,
      source: 'manual',
      actorUserId: null,
      idempotencyKey: 'gr-test-4',
    });
    expect(out!.status).toBe('requested');
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const refund = (await db.select().from(schema.refunds).where(eq(schema.refunds.id, out!.refundId)).get()) as any;
    expect(refund.refundMethod).toBe('online');
  });
});
