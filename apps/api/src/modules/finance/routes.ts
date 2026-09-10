import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import {
  payments,
  purchaseOrders,
  businessMembers,
  refunds as refundsTable,
  supplierMembers,
} from '@vyro/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  bankTransferSubmitSchema,
  codCollectSchema,
  financialQuerySchema,
  refundRequestSchema,
  supplierBankAccountSchema,
} from '@vyro/validation';
import { requireBusinessPaymentRole, isSupplierMember } from '../payments/membership';
import { recordAudit } from '../supplierProducts/repository';
import { notifyOrderParties, notifyAdmins } from '../notifications/dispatcher';
import { NotificationType } from '@vyro/shared';
import { writeLedgerEntry } from '../ledger/writer';
import { assertBusinessAccess, assertSupplierAccess, loadPaymentWithAccess } from './access';
import {
  businessOverview,
  supplierOverview,
  businessTransactions,
  supplierTransactions,
  businessInvoices,
} from './reports';
import { paymentChain } from './chain';
import {
  ensureCodCollection,
  findCodByPayment,
  updateCodGuarded,
  createBankTransfer,
  findBankTransferByPayment,
  listAttempts,
  listAllocations,
  listEarningsForSupplier,
  listSettlements,
  findSettlement,
  listSettlementItems,
  listSupplierBankAccounts,
  createSupplierBankAccount,
  listAdjustments,
} from './repository';
import { sumCompletedRefundsForPayment, createRefund } from '../refunds/repository';
import { recomputeEligibilityForPayment } from './earnings';
import { bankTransferReference, refundNumber } from './numbers';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

// --- Business accounts (spec §27) ---

router.get('/business/overview', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  return c.json({ ...(await businessOverview(c.env.DB, q.data.businessId)), currency: 'LKR' });
});

router.get('/business/payments', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  const db = getDb(c.env.DB);
  const pos = (await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.businessId, q.data.businessId)).all()) as any[];
  if (pos.length === 0) return c.json({ items: [], nextCursor: null });
  const conds: any[] = [sql`${payments.purchaseOrderId} IN (${sql.join(pos.map((p) => sql`${p.id}`), sql`, `)})`];
  if (q.data.status) conds.push(eq(payments.status, q.data.status as never));
  if (q.data.method) conds.push(eq(payments.method, q.data.method as never));
  if (q.data.from !== undefined) conds.push(sql`${payments.createdAt} >= ${q.data.from}`);
  if (q.data.to !== undefined) conds.push(sql`${payments.createdAt} <= ${q.data.to}`);
  if (q.data.cursor !== undefined) conds.push(sql`${payments.createdAt} < ${q.data.cursor}`);
  const limit = Math.min(q.data.limit ?? 50, 200);
  const rows = (await db.select().from(payments).where(and(...conds)).orderBy(desc(payments.createdAt)).limit(limit + 1).all()) as any[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return c.json({ items, nextCursor: hasMore ? items[items.length - 1].createdAt : null });
});

router.get('/business/invoices', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  return c.json({ invoices: await businessInvoices(c.env.DB, q.data.businessId, q.data.limit ?? 50, q.data.cursor) });
});

router.get('/business/refunds', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  const db = getDb(c.env.DB);
  const payRows = (await db
    .select({ id: payments.id })
    .from(payments)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, payments.purchaseOrderId))
    .where(eq(purchaseOrders.businessId, q.data.businessId))
    .all()) as any[];
  if (payRows.length === 0) return c.json({ refunds: [] });
  const ids = payRows.map((p: any) => p.id);
  const rows = (await db
    .select()
    .from(refundsTable)
    .where(sql`${refundsTable.paymentId} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
    .orderBy(desc(refundsTable.createdAt))
    .limit(Math.min(q.data.limit ?? 50, 200))
    .all()) as any[];
  return c.json({ refunds: rows });
});

router.get('/business/transactions', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  return c.json({
    transactions: await businessTransactions(c.env.DB, q.data.businessId, {
      from: q.data.from,
      to: q.data.to,
      limit: q.data.limit,
      cursor: q.data.cursor,
    }),
  });
});

// --- Supplier accounts (spec §28) ---

router.get('/supplier/overview', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  await assertSupplierAccess(c.env.DB, ctx, q.data.supplierId);
  return c.json({ ...(await supplierOverview(c.env.DB, q.data.supplierId)), currency: 'LKR' });
});

router.get('/supplier/earnings', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  await assertSupplierAccess(c.env.DB, ctx, q.data.supplierId);
  return c.json({
    earnings: await listEarningsForSupplier(c.env.DB, q.data.supplierId, {
      eligibility: q.data.status,
      limit: q.data.limit ?? 50,
      cursor: q.data.cursor,
    }),
  });
});

router.get('/supplier/settlements', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  await assertSupplierAccess(c.env.DB, ctx, q.data.supplierId);
  return c.json({ settlements: await listSettlements(c.env.DB, q.data.supplierId, q.data.status, q.data.limit ?? 50, q.data.cursor) });
});

router.get('/supplier/transactions', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  await assertSupplierAccess(c.env.DB, ctx, q.data.supplierId);
  return c.json({
    transactions: await supplierTransactions(c.env.DB, q.data.supplierId, {
      from: q.data.from,
      to: q.data.to,
      limit: q.data.limit,
      cursor: q.data.cursor,
    }),
  });
});

router.get('/supplier/adjustments', async (c) => {
  const ctx = ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  await assertSupplierAccess(c.env.DB, ctx, q.data.supplierId);
  return c.json({ adjustments: await listAdjustments(c.env.DB, 'supplier', q.data.supplierId, q.data.limit ?? 50, q.data.cursor) });
});

router.get('/supplier/bank-accounts', async (c) => {
  const ctx = ctxOf(c);
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  await assertSupplierAccess(c.env.DB, ctx, supplierId);
  return c.json({ accounts: await listSupplierBankAccounts(c.env.DB, supplierId) });
});

router.post('/supplier/bank-accounts', async (c) => {
  const ctx = ctxOf(c);
  const body = (await c.req.json().catch(() => null)) as any;
  const supplierId = body?.supplierId as string | undefined;
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  if (!ctx.isAdmin) {
    // Supplier owner/operations may manage payout details.
    const db = getDb(c.env.DB);
    const m = (await db
      .select({ role: supplierMembers.role })
      .from(supplierMembers)
      .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, ctx.userId), eq(supplierMembers.status, 'active')))
      .get()) as any;
    if (!m || !['owner', 'operations'].includes(m.role)) {
      throw httpError(403, 'FORBIDDEN', 'Only supplier owner/operations manage bank details');
    }
  }
  const parsed = supplierBankAccountSchema.safeParse(body);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const digits = parsed.data.accountNumber.replace(/\D/g, '');
  // Workers-safe hash: pure-TS md5 from @vyro/payments with a domain prefix.
  // Only the hash + last4 are stored; full numbers never touch the database.
  const { md5 } = await import('@vyro/payments');
  const account = await createSupplierBankAccount(c.env.DB, {
    supplierId,
    bankName: parsed.data.bankName,
    accountHolder: parsed.data.accountHolder,
    accountNumberLast4: digits.slice(-4),
    accountNumberHash: md5(`vyro-bank:${supplierId}:${digits}`),
    branch: parsed.data.branch ?? null,
    accountType: parsed.data.accountType ?? null,
    createdByUserId: ctx.userId,
  });
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'supplier.bank_account.created',
    resourceType: 'supplier',
    resourceId: supplierId,
    metadata: { accountId: (account as any).id, bankName: parsed.data.bankName },
  });
  return c.json({ account }, 201);
});

// --- Payment detail chain (spec §34) ---

router.get('/payments/:id', async (c) => {
  const ctx = ctxOf(c);
  const { payment } = await loadPaymentWithAccess(c.env.DB, ctx, c.req.param('id'));
  const chain = await paymentChain(c.env.DB, payment.id);
  const attempts = await listAttempts(c.env.DB, payment.id);
  const allocations = await listAllocations(c.env.DB, payment.id);
  return c.json({ ...chain, attempts, allocations });
});

// --- Refund request (spec §17): business → REQUESTED, approval happens in admin ---

router.post('/payments/:id/refunds', async (c) => {
  const ctx = ctxOf(c);
  const { payment, po } = await loadPaymentWithAccess(c.env.DB, ctx, c.req.param('id'));
  if (!ctx.isAdmin) {
    try {
      await requireBusinessPaymentRole(c.env.DB, po.businessId, ctx.userId);
    } catch {
      throw httpError(403, 'UNAUTHORIZED_FINANCIAL_OPERATION', 'Insufficient role to request refund');
    }
  }
  if (payment.status !== 'confirmed') {
    throw httpError(409, 'PAYMENT_NOT_REFUNDABLE', `Only confirmed payments can be refunded (current: ${payment.status})`);
  }
  const parsed = refundRequestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const alreadyRefunded = await sumCompletedRefundsForPayment(c.env.DB, payment.id);
  const maxRefundable = payment.amountCents - alreadyRefunded;
  if (maxRefundable <= 0) throw httpError(409, 'PAYMENT_NOT_REFUNDABLE', 'Payment already fully refunded');
  const refundCents = parsed.data.amountCents ?? maxRefundable;
  if (refundCents > maxRefundable) {
    throw httpError(400, 'REFUND_EXCEEDS_REMAINING_AMOUNT', `Refund exceeds remaining refundable (${maxRefundable})`);
  }
  // Idempotency: same key returns the original refund.
  if (parsed.data.idempotencyKey) {
    const db = getDb(c.env.DB);
    const dup = (await db
      .select()
      .from(refundsTable)
      .where(eq(refundsTable.idempotencyKey, parsed.data.idempotencyKey))
      .get()) as any;
    if (dup) return c.json({ id: dup.id, status: dup.status, amountCents: dup.amountCents }, 200);
  }
  const refund = await createRefund(c.env.DB, {
    paymentId: payment.id,
    amountCents: refundCents,
    reason: parsed.data.reason ?? null,
    requestedByUserId: ctx.userId,
  });
  const db = getDb(c.env.DB);
  const now = Date.now();
  await db
    .update(refundsTable)
    .set({
      refundNumber: refundNumber(now),
      currency: payment.currency,
      refundMethod: payment.method === 'online' ? 'payhere' : payment.method === 'cash' ? 'manual_cash' : 'manual_bank',
      idempotencyKey: parsed.data.idempotencyKey ?? null,
      updatedAt: now,
    })
    .where(eq(refundsTable.id, refund.id))
    .run();
  await recomputeEligibilityForPayment(c.env.DB, payment.id).catch(() => undefined);
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'REFUND_REQUESTED',
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { refundId: refund.id, amountCents: refundCents, paymentNumber: payment.paymentNumber ?? null },
  });
  try {
    await notifyAdmins(c.env, {
      role: 'finance',
      severity: 'info',
      category: 'admin_alert',
      title: `Refund requested: ${refundCents}c on PO ${po.poNumber}`,
      body: parsed.data.reason ?? 'Refund requested.',
      link: `/admin/finance?tab=refunds`,
    });
  } catch (err) {
    console.error('[finance.refund.request] admin notify failed', err);
  }
  try {
    await notifyOrderParties(
      c.env.DB,
      c.env.NOTIFICATIONS_QUEUE,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type: NotificationType.REFUND_INITIATED,
        title: `Refund requested for PO ${po.poNumber}`,
        body: parsed.data.reason,
        link: `/orders/${po.id}`,
        audience: 'both',
        excludeUserId: ctx.userId,
      },
    );
  } catch (err) {
    console.error('[finance.refund.request] notify failed', err);
  }
  return c.json({ id: refund.id, status: 'requested', amountCents: refundCents }, 201);
});

router.get('/refunds/:id', async (c) => {
  const ctx = ctxOf(c);
  const db = getDb(c.env.DB);
  const refund = (await db.select().from(refundsTable).where(eq(refundsTable.id, c.req.param('id'))).get()) as any;
  if (!refund) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  await loadPaymentWithAccess(c.env.DB, ctx, refund.paymentId);
  return c.json({ refund });
});

// --- Bank transfer submission (spec §10) ---

router.post('/payments/:id/bank-transfer', async (c) => {
  const ctx = ctxOf(c);
  const { payment, po } = await loadPaymentWithAccess(c.env.DB, ctx, c.req.param('id'));
  if (payment.method !== 'bank_transfer') throw httpError(400, 'VALIDATION_ERROR', 'Payment is not a bank transfer');
  if (!ctx.isAdmin) {
    try {
      await requireBusinessPaymentRole(c.env.DB, po.businessId, ctx.userId);
    } catch {
      throw httpError(403, 'UNAUTHORIZED_FINANCIAL_OPERATION', 'Insufficient role');
    }
  }
  if (!['pending'].includes(payment.status)) {
    throw httpError(409, 'PAYMENT_ALREADY_COMPLETED', `Payment is ${payment.status}`);
  }
  const parsed = bankTransferSubmitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const existing = await findBankTransferByPayment(c.env.DB, payment.id);
  const now = Date.now();
  // Auto-created `pending` rows (from payment creation) are claimed here;
  // resubmission after that is a conflict.
  if (existing && existing.status !== 'pending') {
    throw httpError(409, 'CONFLICT', 'Bank transfer already submitted for this payment');
  }
  const { bankTransfers: bt } = await import('@vyro/db/schema');
  let row: any;
  if (existing) {
    const db = getDb(c.env.DB);
    await db
      .update(bt)
      .set({
        transferredCents: parsed.data.transferredCents,
        status: 'pending_verification',
        bankReference: parsed.data.bankReference ?? null,
        submittedByUserId: ctx.userId,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(bt.id, existing.id))
      .run();
    row = { ...existing, transferredCents: parsed.data.transferredCents, status: 'pending_verification' };
  } else {
    row = await createBankTransfer(c.env.DB, {
      paymentId: payment.id,
      referenceNumber: bankTransferReference(now),
      expectedCents: payment.amountCents,
      transferredCents: parsed.data.transferredCents,
      currency: payment.currency,
      status: 'pending_verification',
      bankReference: parsed.data.bankReference ?? null,
      submittedByUserId: ctx.userId,
      submittedAt: now,
    });
  }
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'BANK_TRANSFER_SUBMITTED',
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { bankTransferId: row.id, referenceNumber: row.referenceNumber, transferredCents: parsed.data.transferredCents },
  });
  try {
    await notifyAdmins(c.env, {
      role: 'finance',
      severity: 'info',
      category: 'admin_alert',
      title: `Bank transfer submitted: ${row.referenceNumber}`,
      body: `PO ${po.poNumber} — awaiting verification.`,
      link: `/admin/finance?tab=bank-transfers`,
    });
  } catch (err) {
    console.error('[finance.bank.submit] admin notify failed', err);
  }
  return c.json({ bankTransfer: row }, 201);
});

const PROOF_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const PROOF_MAX_BYTES = 10 * 1024 * 1024;

router.post('/payments/:id/bank-transfer/proof', async (c) => {
  const ctx = ctxOf(c);
  const { payment, po } = await loadPaymentWithAccess(c.env.DB, ctx, c.req.param('id'));
  if (!ctx.isAdmin) {
    const db = getDb(c.env.DB);
    const m = (await db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(and(eq(businessMembers.businessId, po.businessId), eq(businessMembers.userId, ctx.userId), eq(businessMembers.status, 'active')))
      .get()) as any;
    if (!m) throw httpError(403, 'FORBIDDEN', 'No access');
  }
  const row = await findBankTransferByPayment(c.env.DB, payment.id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Submit the bank transfer before uploading proof');
  if (['verified', 'rejected'].includes(row.status)) {
    throw httpError(409, 'BANK_TRANSFER_ALREADY_VERIFIED', `Transfer is ${row.status}`);
  }
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw httpError(400, 'VALIDATION_ERROR', 'file field required');
  if (!PROOF_MIME.has(file.type)) throw httpError(400, 'VALIDATION_ERROR', `Unsupported type ${file.type}`);
  if (file.size > PROOF_MAX_BYTES) throw httpError(413, 'PAYLOAD_TOO_LARGE', 'Max 10MB');
  if (file.size <= 0) throw httpError(400, 'VALIDATION_ERROR', 'Empty file');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const r2Key = `bank-transfers/${payment.id}/${row.id}-${Date.now()}-${safeName}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  await (c.env as Env).INVOICES.put(r2Key, buf, { httpMetadata: { contentType: file.type } });
  const db = getDb(c.env.DB);
  const { bankTransfers: bt } = await import('@vyro/db/schema');
  await db
    .update(bt)
    .set({
      proofR2Key: r2Key,
      proofFileName: file.name.slice(0, 200),
      proofMimeType: file.type,
      proofUploadedAt: Date.now(),
      status: 'pending_verification',
      updatedAt: Date.now(),
    })
    .where(eq(bt.id, row.id))
    .run();
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'BANK_TRANSFER_PROOF_UPLOADED',
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { bankTransferId: row.id },
  });
  return c.json({ ok: true });
});

router.get('/payments/:id/bank-transfer', async (c) => {
  const ctx = ctxOf(c);
  const { payment } = await loadPaymentWithAccess(c.env.DB, ctx, c.req.param('id'));
  const row = await findBankTransferByPayment(c.env.DB, payment.id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'No bank transfer for this payment');
  const { proofR2Key: _k, ...safe } = row as any;
  void _k;
  return c.json({ bankTransfer: safe });
});

router.get('/bank-transfer/proof/:id', async (c) => {
  const ctx = ctxOf(c);
  const db = getDb(c.env.DB);
  const { bankTransfers: bt } = await import('@vyro/db/schema');
  const row = (await db.select().from(bt).where(eq(bt.id, c.req.param('id'))).get()) as any;
  if (!row) throw httpError(404, 'NOT_FOUND', 'Not found');
  await loadPaymentWithAccess(c.env.DB, ctx, row.paymentId);
  if (!row.proofR2Key) throw httpError(404, 'NOT_FOUND', 'No proof uploaded');
  const obj = await (c.env as Env).INVOICES.get(row.proofR2Key);
  if (!obj) throw httpError(404, 'NOT_FOUND', 'Proof missing from storage');
  const buf = await obj.arrayBuffer();
  return new Response(buf, {
    headers: { 'content-type': row.proofMimeType ?? 'application/octet-stream', 'cache-control': 'private, max-age=60' },
  });
});

// --- COD collection (spec §9) ---

router.post('/payments/:id/cod/collect', async (c) => {
  const ctx = ctxOf(c);
  const { payment, po } = await loadPaymentWithAccess(c.env.DB, ctx, c.req.param('id'));
  if (payment.method !== 'cash') throw httpError(400, 'VALIDATION_ERROR', 'Payment is not COD');
  if (!ctx.isAdmin && !(await isSupplierMember(c.env.DB, po.supplierId, ctx.userId))) {
    throw httpError(403, 'UNAUTHORIZED_FINANCIAL_OPERATION', 'Only supplier/admin record COD collection');
  }
  const parsed = codCollectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const existing = await findCodByPayment(c.env.DB, payment.id);
  if (!existing) {
    await ensureCodCollection(c.env.DB, {
      paymentId: payment.id,
      purchaseOrderId: po.id,
      expectedCents: payment.amountCents,
      currency: payment.currency,
      status: 'pending',
      reconciliationStatus: 'unreconciled',
      collectedCents: null,
      discrepancyCents: 0,
    });
  }
  const current = (await findCodByPayment(c.env.DB, payment.id)) as any;
  if (['collected', 'partial'].includes(current.status) && current.collectedCents != null) {
    throw httpError(409, 'PAYMENT_ALREADY_COMPLETED', 'COD already collected for this payment');
  }
  const collected = parsed.data.collectedCents;
  const discrepancy = collected - payment.amountCents;
  const status = collected === 0 ? 'failed' : collected < payment.amountCents ? 'partial' : 'collected';
  const now = Date.now();
  const ok = await updateCodGuarded(c.env.DB, current.id, current.status, {
    collectedCents: collected,
    discrepancyCents: discrepancy,
    status,
    collectorUserId: ctx.userId,
    collectorName: parsed.data.collectorName ?? null,
    collectionMethod: parsed.data.collectionMethod ?? 'cash',
    collectionReference: parsed.data.collectionReference ?? null,
    collectedAt: now,
    notes: parsed.data.notes ?? null,
  });
  if (!ok) throw httpError(409, 'CONFLICT', 'COD state changed concurrently — retry');

  // Exact payment settles the payment; under/over/failure routes to reconciliation.
  const db = getDb(c.env.DB);
  if (status === 'collected' && discrepancy === 0) {
    await db
      .update(payments)
      .set({ status: 'confirmed', confirmedAt: now, paidAt: now, confirmedByUserId: ctx.userId, updatedAt: now })
      .where(eq(payments.id, payment.id))
      .run();
    const { ensureAllocationAndEarning } = await import('./earnings');
    await ensureAllocationAndEarning(c.env.DB, payment.id, ctx.userId);
    await writeCodLedger(c.env.DB, payment, po, ctx.userId);
    try {
      const { generateReceiptForPayment } = await import('../invoices/generate');
      await generateReceiptForPayment(c.env.DB, { ...payment, status: 'confirmed' } as any);
    } catch (err) {
      console.error('[finance.cod] receipt failed', err);
    }
  }
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'COD_COLLECTION_RECORDED',
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { collectedCents: collected, discrepancyCents: discrepancy, status },
  });
  try {
    await notifyOrderParties(
      c.env.DB,
      c.env.NOTIFICATIONS_QUEUE,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type: discrepancy === 0 ? NotificationType.COD_COLLECTED : NotificationType.COD_DISCREPANCY,
        title: discrepancy === 0 ? `COD collected for PO ${po.poNumber}` : `COD discrepancy on PO ${po.poNumber}`,
        body: discrepancy === 0 ? 'Cash collected in full.' : `Expected ${payment.amountCents}c, collected ${collected}c.`,
        link: `/orders/${po.id}`,
        audience: 'both',
        excludeUserId: ctx.userId,
      },
    );
  } catch (err) {
    console.error('[finance.cod] notify failed', err);
  }
  return c.json({ ok: true, status, collectedCents: collected, discrepancyCents: discrepancy });
});

async function writeCodLedger(d1: D1Database, payment: any, po: any, userId: string) {
  try {
    const db = getDb(d1);
    await db.transaction(async (tx) => {
      writeLedgerEntry(tx as any, {
        accountType: 'business',
        accountId: po.businessId,
        direction: 'credit',
        amountCents: payment.netCents,
        currency: payment.currency,
        refType: 'payment',
        refId: payment.id,
        category: 'PAYMENT',
        entityType: 'purchase_order',
        entityId: po.id,
        description: `COD payment ${payment.id} collected for PO ${po.poNumber}`,
        createdByUserId: userId,
      });
    });
  } catch (err) {
    console.error('[finance.cod] ledger skipped', err);
  }
}

// --- Settlements (read for members) ---

router.get('/settlements/:id', async (c) => {
  const ctx = ctxOf(c);
  const s = await findSettlement(c.env.DB, c.req.param('id'));
  if (!s) throw httpError(404, 'NOT_FOUND', 'Settlement not found');
  await assertSupplierAccess(c.env.DB, ctx, s.supplierId);
  const items = await listSettlementItems(c.env.DB, s.id);
  return c.json({ settlement: s, items });
});

export default router;
