import { Hono } from 'hono';
import {
  confirmPaymentSchema,
  createPaymentSchema,
  type CreatePaymentInput,
} from '@vyro/validation/payment';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import {
  businessMembers,
  purchaseOrders,
  supplierMembers,
  payments,
  businesses,
  suppliers,
} from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import { recordAudit } from '../supplierProducts/repository';
import { resolveGateway } from '@vyro/payments';
import {
  assertIdempotencyMatch,
  getIdempotencyResponse,
  hashRequestBody,
  storeIdempotencyResponse,
} from '../../lib/idempotency';
import { writeLedgerEntry } from '../ledger';
import { generateReceiptForPayment } from '../invoices/generate';
import { computePlatformFeeCents, getPlatformFeeBps } from './fees';
import {
  requireBusinessPaymentRole,
  requireSupplierConfirmRole,
  isSupplierMember,
} from './membership';
import { findPaymentForUpdate, listPaymentsForSupplier, sumConfirmedPaymentsForPo } from './repository';

const router = new Hono<{ Bindings: Env }>();

const ALLOWED_PO_STATUSES = new Set([
  'pending',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'completed',
  'disputed',
]);

async function rolesForPo(
  d1: D1Database,
  poId: string,
  userId: string,
  isAdmin: boolean,
): Promise<{ role: 'admin' | 'business' | 'supplier' | null; po: typeof purchaseOrders.$inferSelect | null }> {
  const db = getDb(d1);
  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get() ?? null) as typeof purchaseOrders.$inferSelect | null;
  if (!po) return { role: null, po: null };
  if (isAdmin) return { role: 'admin', po };
  const inBiz = await db
    .select()
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, po.businessId), eq(businessMembers.userId, userId)))
    .get();
  if (inBiz) return { role: 'business', po };
  const inSup = await db
    .select()
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, po.supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (inSup) return { role: 'supplier', po };
  return { role: null, po };
}

router.post('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const rawBody = (await c.req.json().catch(() => null)) as CreatePaymentInput | null;
  const parsed = createPaymentSchema.safeParse(rawBody);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  // Idempotency check
  const idemKey = c.req.header('Idempotency-Key');
  const requestHash = hashRequestBody(parsed.data);
  if (idemKey) {
    const hit = await getIdempotencyResponse(c.env.DB, ctx.userId, idemKey);
    if (hit) {
      await assertIdempotencyMatch(c.env.DB, ctx.userId, idemKey, requestHash);
      c.status(hit.statusCode as 200 | 201 | 400 | 401 | 403 | 404 | 409);
      return c.json(JSON.parse(hit.responseJson));
    }
  }

  const { role, po } = await rolesForPo(c.env.DB, parsed.data.purchaseOrderId, ctx.userId, ctx.isAdmin);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!ALLOWED_PO_STATUSES.has(po.status)) {
    throw httpError(409, 'CONFLICT', `Cannot pay PO in status ${po.status}`);
  }
  if (role !== 'business' && role !== 'admin') {
    throw httpError(403, 'FORBIDDEN', 'Only business/admin record payments');
  }
  if (role === 'business' && po.businessId) {
    try {
      await requireBusinessPaymentRole(c.env.DB, po.businessId, ctx.userId);
    } catch {
      throw httpError(403, 'FORBIDDEN', 'Insufficient role to record payment');
    }
  }

  // Determine amount (default to PO outstanding)
  const totals = await sumConfirmedPaymentsForPo(c.env.DB, po.id);
  const outstanding = po.totalCents - totals.confirmedCents + totals.refundedCents;
  if (outstanding <= 0) {
    throw httpError(409, 'CONFLICT', 'PO is fully paid');
  }
  const amountCents = parsed.data.amountCents ?? outstanding;
  if (amountCents > outstanding) {
    throw httpError(400, 'VALIDATION_ERROR', `amountCents exceeds PO outstanding (${outstanding})`);
  }

  const feeBps = await getPlatformFeeBps(c.env.DB);
  const feeCents = parseInt(String(parsed.data.method === 'online' ? 0 : computePlatformFeeCents(amountCents, feeBps)), 10);
  const netCents = amountCents - feeCents;

  const db = getDb(c.env.DB);
  const id = newId();
  const now = Date.now();
  await db.transaction(async (tx) => {
    tx.insert(payments)
      .values({
        id,
        purchaseOrderId: po.id,
        method: parsed.data.method,
        status: 'pending',
        amountCents,
        feeCents,
        netCents,
        currency: po.currency,
        transactionReference: parsed.data.transactionReference ?? null,
        idempotencyKey: idemKey ?? null,
        notes: parsed.data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'payment.create',
    resourceType: 'purchase_order',
    resourceId: po.id,
    metadata: { paymentId: id, method: parsed.data.method, amountCents, feeCents },
  });

  const responseBody = { id, amountCents, feeCents, netCents, status: 'pending' as const };
  if (idemKey) {
    await storeIdempotencyResponse(c.env.DB, ctx.userId, idemKey, requestHash, 201, JSON.stringify(responseBody));
  }
  return c.json(responseBody, 201);
});

router.post('/:id/confirm', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = confirmPaymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const payment = await findPaymentForUpdate(c.env.DB, c.req.param('id'));
  if (!payment) throw httpError(404, 'NOT_FOUND', 'Payment not found');

  const { role, po } = await rolesForPo(c.env.DB, payment.purchaseOrderId, ctx.userId, ctx.isAdmin);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');

  // RBAC: confirmed requires supplier (or admin); failed requires business (or admin)
  if (parsed.data.status === 'confirmed') {
    if (role !== 'supplier' && role !== 'admin') {
      throw httpError(403, 'FORBIDDEN', 'Only supplier/admin confirm');
    }
    if (role === 'supplier') {
      try {
        await requireSupplierConfirmRole(c.env.DB, po.supplierId, ctx.userId);
      } catch {
        throw httpError(403, 'FORBIDDEN', 'Insufficient role to confirm');
      }
    }
  } else if (parsed.data.status === 'failed') {
    if (role !== 'business' && role !== 'admin') {
      throw httpError(403, 'FORBIDDEN', 'Only business/admin mark failed');
    }
  }

  // State guard
  if (payment.status !== 'pending') {
    throw httpError(409, 'CONFLICT', `Payment is already ${payment.status}`);
  }

  const now = Date.now();
  const db = getDb(c.env.DB);
  await db.transaction(async (tx) => {
    tx.update(payments)
      .set({
        status: parsed.data.status,
        confirmedByUserId: ctx.userId,
        confirmedAt: now,
        paidAt: parsed.data.status === 'confirmed' ? now : payment.paidAt,
        statusReason: parsed.data.reason ?? null,
        updatedAt: now,
      })
      .where(eq(payments.id, payment.id))
      .run();

    if (parsed.data.status === 'confirmed') {
      // Ledger entries: business.credit(netCents) + platform.credit(feeCents)
      writeLedgerEntry(tx as any, {
        accountType: 'business',
        accountId: po.businessId,
        direction: 'credit',
        amountCents: payment.netCents,
        refType: 'payment',
        refId: payment.id,
        description: `Payment ${payment.id} for PO ${po.poNumber}`,
        createdByUserId: ctx.userId,
      });
      if (payment.feeCents > 0) {
        writeLedgerEntry(tx as any, {
          accountType: 'platform',
          accountId: 'platform',
          direction: 'credit',
          amountCents: payment.feeCents,
          refType: 'fee',
          refId: payment.id,
          description: `Platform fee for payment ${payment.id}`,
          createdByUserId: ctx.userId,
        });
      }
    }
  });

  // Generate receipt outside the transaction (HTML snapshot is independent)
  if (parsed.data.status === 'confirmed') {
    try {
      await generateReceiptForPayment(c.env.DB, { ...payment, status: 'confirmed' } as any);
    } catch (e) {
      // Invoice failure shouldn't break payment confirmation; log + audit
      await recordAudit(c.env.DB, {
        actorUserId: ctx.userId,
        action: 'invoice.generate.failed',
        resourceType: 'purchase_order',
        resourceId: payment.purchaseOrderId,
        metadata: { paymentId: payment.id, error: String(e) },
      });
    }
  }

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: `payment.${parsed.data.status}`,
    resourceType: 'purchase_order',
    resourceId: payment.purchaseOrderId,
    metadata: { paymentId: payment.id, reason: parsed.data.reason ?? null },
  });

  return c.json({ ok: true, status: parsed.data.status });
});

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  if (!(await isSupplierMember(c.env.DB, supplierId, ctx.userId)) && !ctx.isAdmin) {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const cursorRaw = c.req.query('cursor');
  const cursor = cursorRaw ? Number(cursorRaw) : undefined;
  if (cursorRaw && Number.isNaN(cursor)) throw httpError(400, 'VALIDATION_ERROR', 'cursor must be a number');
  const status = c.req.query('status');
  const items = await listPaymentsForSupplier(c.env.DB, supplierId, cursor, status);
  return c.json({ items });
});

router.get('/by-po/:poId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const { role } = await rolesForPo(c.env.DB, c.req.param('poId'), ctx.userId, ctx.isAdmin);
  if (!role) throw httpError(403, 'FORBIDDEN', 'No access');
  const db = getDb(c.env.DB);
  const list = (await db.select().from(payments).where(eq(payments.purchaseOrderId, c.req.param('poId'))).all()) as any;
  return c.json({ payments: list });
});

// Online checkout: returns gateway redirect URL for payment method=online
router.post('/:id/checkout', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const payment = await findPaymentForUpdate(c.env.DB, c.req.param('id'));
  if (!payment) throw httpError(404, 'NOT_FOUND', 'Payment not found');
  if (payment.method !== 'online') {
    throw httpError(400, 'VALIDATION_ERROR', 'Only online payments have a checkout URL');
  }
  if (payment.status !== 'pending') {
    throw httpError(409, 'CONFLICT', `Payment is ${payment.status}`);
  }

  const { po } = await rolesForPo(c.env.DB, payment.purchaseOrderId, ctx.userId, ctx.isAdmin);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');

  // RBAC: business owner/purchasing or admin
  if (!ctx.isAdmin) {
    try {
      await requireBusinessPaymentRole(c.env.DB, po.businessId, ctx.userId);
    } catch {
      throw httpError(403, 'FORBIDDEN', 'Insufficient role to checkout');
    }
  }

  const db = getDb(c.env.DB);
  const biz = (await db.select().from(businesses).where(eq(businesses.id, po.businessId)).get()) as any;
  const sup = (await db.select().from(suppliers).where(eq(suppliers.id, po.supplierId)).get()) as any;
  if (!biz || !sup) throw httpError(404, 'NOT_FOUND', 'Business or supplier not found');

  const env = c.env as Env;
  const { adapter } = resolveGateway(env);
  const origin = env.WEB_ORIGIN;
  const notifyUrl = env.PAYHERE_NOTIFY_URL ?? `${origin}/api/webhooks/payhere`;

  const result = await adapter.startCheckout({
    paymentId: payment.id,
    purchaseOrderId: po.id,
    amountCents: payment.amountCents,
    currency: payment.currency,
    businessName: biz.contactPerson,
    businessEmail: biz.email,
    businessPhone: biz.phone,
    supplierName: sup.name,
    description: `PO ${po.poNumber}`,
    returnUrl: `${origin}/orders/${po.id}/payment-success?paymentId=${payment.id}`,
    cancelUrl: `${origin}/orders/${po.id}/payment-cancel?paymentId=${payment.id}`,
    notifyUrl,
  });

  db.update(payments)
    .set({
      gatewayRef: result.gatewayRef,
      updatedAt: Date.now(),
    })
    .where(eq(payments.id, payment.id))
    .run();

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'payment.checkout',
    resourceType: 'purchase_order',
    resourceId: po.id,
    metadata: { paymentId: payment.id, gatewayRef: result.gatewayRef, provider: adapter.provider },
  });

  return c.json({
    redirectUrl: result.redirectUrl,
    gatewayRef: result.gatewayRef,
    expiresAt: result.expiresAt,
    provider: adapter.provider,
    isMock: adapter.provider === 'mock',
  });
});

export default router;
