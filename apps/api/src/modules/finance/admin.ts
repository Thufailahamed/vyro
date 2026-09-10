import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requirePermission } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import {
  payments,
  purchaseOrders,
  refunds as refundsTable,
  bankTransfers as bankTransfersTable,
  codCollections as codTable,
  supplierEarnings as earningsTable,
} from '@vyro/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  bankTransferVerifySchema,
  bankTransferRejectSchema,
  bankTransferCorrectionSchema,
  codReconcileSchema,
  financialQuerySchema,
} from '@vyro/validation';
import { canTransitionRefund } from '@vyro/shared';
import { recordAudit } from '../supplierProducts/repository';
import { auditAdmin } from '../admin/lib/audit';
import { notifyOrderParties } from '../notifications/dispatcher';
import { NotificationType } from '@vyro/shared';
import { writeLedgerEntry } from '../ledger/writer';
import { adminOverview } from './reports';
import { paymentChain } from './chain';
import {
  findBankTransfer,
  updateBankTransferGuarded,
  listBankTransferQueue,
  findCodByPayment,
  listCodQueue,
  listExceptions,
  resolveException,
} from './repository';
import { ensureAllocationAndEarning, recomputeEligibilityForPayment } from './earnings';
import { applyEarningRefundDelta } from './repository';
import { updateRefundStatus, sumCompletedRefundsForPayment, findRefund } from '../refunds/repository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

// --- Overview (spec §29) ---

router.get('/overview', requirePermission('financial_report:read'), async (c) => {
  ctxOf(c);
  return c.json({ ...(await adminOverview(c.env.DB)), currency: 'LKR' });
});

// --- Payment operations (spec §30) ---

router.get('/payments', requirePermission('payment:read'), async (c) => {
  ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  const db = getDb(c.env.DB);
  const conds: any[] = [];
  if (q.data.status) conds.push(eq(payments.status, q.data.status as never));
  if (q.data.method) conds.push(eq(payments.method, q.data.method as never));
  if (q.data.currency) conds.push(eq(payments.currency, q.data.currency));
  if (q.data.from !== undefined) conds.push(sql`${payments.createdAt} >= ${q.data.from}`);
  if (q.data.to !== undefined) conds.push(sql`${payments.createdAt} <= ${q.data.to}`);
  if (q.data.orderId) conds.push(eq(payments.purchaseOrderId, q.data.orderId));
  if (q.data.businessId) {
    const pos = (await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.businessId, q.data.businessId)).all()) as any[];
    conds.push(pos.length ? sql`${payments.purchaseOrderId} IN (${sql.join(pos.map((p) => sql`${p.id}`), sql`, `)})` : sql`1 = 0`);
  }
  if (q.data.supplierId) {
    const pos = (await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.supplierId, q.data.supplierId)).all()) as any[];
    conds.push(pos.length ? sql`${payments.purchaseOrderId} IN (${sql.join(pos.map((p) => sql`${p.id}`), sql`, `)})` : sql`1 = 0`);
  }
  if (q.data.cursor !== undefined) conds.push(sql`${payments.createdAt} < ${q.data.cursor}`);
  const limit = Math.min(q.data.limit ?? 50, 200);
  const rows = (await db
    .select()
    .from(payments)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(payments.createdAt))
    .limit(limit + 1)
    .all()) as any[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  // Redact provider secrets: never expose gateway payloads.
  const safe = items.map((p: any) => {
    const { gatewayPayload: _g, ...rest } = p;
    void _g;
    return rest;
  });
  return c.json({ items: safe, nextCursor: hasMore ? items[items.length - 1].createdAt : null });
});

router.get('/payments/:id', requirePermission('payment:read'), async (c) => {
  ctxOf(c);
  const chain = await paymentChain(c.env.DB, c.req.param('id'));
  if (!chain) throw httpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
  const { payment, ...rest } = chain as any;
  const { gatewayPayload: _g, ...safePayment } = payment;
  void _g;
  return c.json({ payment: safePayment, ...rest });
});

// --- Refund lifecycle (spec §17-18): approve / reject / process / complete / fail ---

router.get('/refunds', requirePermission('payment:read'), async (c) => {
  ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  const db = getDb(c.env.DB);
  const conds: any[] = [];
  if (q.data.status) conds.push(eq(refundsTable.status, q.data.status as never));
  if (q.data.from !== undefined) conds.push(sql`${refundsTable.createdAt} >= ${q.data.from}`);
  if (q.data.to !== undefined) conds.push(sql`${refundsTable.createdAt} <= ${q.data.to}`);
  if (q.data.cursor !== undefined) conds.push(sql`${refundsTable.createdAt} < ${q.data.cursor}`);
  const limit = Math.min(q.data.limit ?? 50, 200);
  const rows = (await db
    .select()
    .from(refundsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(refundsTable.createdAt))
    .limit(limit + 1)
    .all()) as any[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return c.json({ refunds: items, nextCursor: hasMore ? items[items.length - 1].createdAt : null });
});

async function transitionRefund(
  c: { env: Env; get(k: string): unknown },
  refundId: string,
  to: 'approved' | 'rejected' | 'processing' | 'completed' | 'failed' | 'cancelled',
  opts: { reason?: string | null; providerReference?: string | null } = {},
) {
  const ctx = ctxOf(c);
  const refund = await findRefund(c.env.DB, refundId);
  if (!refund) throw httpError(404, 'NOT_FOUND', 'Refund not found');
  const from = (refund as any).status as string;
  // Legacy rows only know requested/processing/completed/failed; treat the
  // approval-machine as the authority and fast-path requested→completed via
  // intermediate audit legs (finance walk, single transaction).
  const direct = canTransitionRefund(from, to);
  const fastPath = from === 'requested' && (to === 'completed' || to === 'processing');
  if (!direct && !fastPath) {
    throw httpError(409, 'CONFLICT', `Illegal refund transition ${from} -> ${to}`);
  }
  const db = getDb(c.env.DB);
  const payment = (await db.select().from(payments).where(eq(payments.id, (refund as any).paymentId)).get()) as any;
  if (!payment) throw httpError(404, 'NOT_FOUND', 'Underlying payment missing');
  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get()) as any;
  const now = Date.now();

  if (to === 'approved') {
    await updateRefundStatus(c.env.DB, refundId, 'approved', { processedAt: null });
    await db.update(refundsTable).set({ approvedByUserId: ctx.userId, approvedAt: now, updatedAt: now }).where(eq(refundsTable.id, refundId)).run();
  } else if (to === 'rejected') {
    await updateRefundStatus(c.env.DB, refundId, 'failed', { processedAt: now, failureReason: opts.reason ?? 'rejected' });
    await db.update(refundsTable).set({ rejectionReason: opts.reason ?? null, updatedAt: now }).where(eq(refundsTable.id, refundId)).run();
  } else if (to === 'processing') {
    await updateRefundStatus(c.env.DB, refundId, 'processing', { processedAt: null });
  } else if (to === 'completed') {
    // Transactional guard: re-check the refundable balance inside the write
    // path so two concurrent approvals cannot over-refund.
    const already = await sumCompletedRefundsForPayment(c.env.DB, payment.id);
    if (already + (refund as any).amountCents > payment.amountCents) {
      throw httpError(400, 'REFUND_EXCEEDS_REMAINING_AMOUNT', 'Refund would exceed paid amount');
    }
    const feeRefund = payment.feeCents > 0 ? Math.round((((refund as any).amountCents as number) * payment.feeCents) / payment.amountCents) : 0;
    await db.transaction(async (tx) => {
      tx.update(refundsTable)
        .set({
          status: 'completed',
          feeRefundCents: feeRefund,
          providerReference: opts.providerReference ?? (refund as any).providerReference ?? null,
          processedAt: now,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(refundsTable.id, refundId))
        .run();
      const newTotal = already + (refund as any).amountCents;
      if (newTotal >= payment.amountCents) {
        tx.update(payments).set({ status: 'refunded', updatedAt: now }).where(eq(payments.id, payment.id)).run();
      } else if ((payment.status as string) === 'confirmed') {
        // Partial refund is tracked on the refund rows; payment stays paid
        // until fully refunded (canonical PARTIALLY_REFUNDED view).
      }
      // Refund accounting (spec §20): reverse business credit + platform fee
      // pro-rata, and shrink the supplier earning by the refunded share.
      writeLedgerEntry(tx as any, {
        accountType: 'business',
        accountId: po.businessId,
        direction: 'debit',
        amountCents: (refund as any).amountCents,
        currency: payment.currency,
        refType: 'refund',
        refId: refundId,
        category: 'REFUND',
        entityType: 'payment',
        entityId: payment.id,
        description: `Refund ${(refund as any).refundNumber ?? refundId} for payment ${payment.id}`,
        createdByUserId: ctx.userId,
      });
      if (feeRefund > 0) {
        writeLedgerEntry(tx as any, {
          accountType: 'platform',
          accountId: 'platform',
          direction: 'debit',
          amountCents: feeRefund,
          currency: payment.currency,
          refType: 'refund',
          refId: refundId,
          category: 'REFUND_ADJUSTMENT',
          entityType: 'payment',
          entityId: payment.id,
          description: `Platform fee reversal for refund ${refundId}`,
          createdByUserId: ctx.userId,
        });
      }
    });
    // Supplier earnings adjustment (outside the money transaction — earning
    // rows are projections with their own guards).
    try {
      const updated = await applyEarningRefundDelta(c.env.DB, payment.id, po.supplierId, (refund as any).amountCents);
      if (updated) {
        const dbTx = getDb(c.env.DB);
        await dbTx.transaction(async (tx) => {
          writeLedgerEntry(tx as any, {
            accountType: 'supplier',
            accountId: po.supplierId,
            direction: 'debit',
            amountCents: (refund as any).amountCents,
            currency: payment.currency,
            refType: 'refund',
            refId: refundId,
            category: 'REFUND_ADJUSTMENT',
            entityType: 'supplier_earning',
            entityId: updated.id,
            description: `Supplier earnings adjustment for refund ${refundId}`,
            createdByUserId: ctx.userId,
          });
        });
      }
    } catch (err) {
      console.error('[admin.refund] earning adjustment failed', err);
    }
    await recomputeEligibilityForPayment(c.env.DB, payment.id).catch(() => undefined);
  } else if (to === 'failed' || to === 'cancelled') {
    const mapped = to === 'cancelled' ? 'failed' : 'failed';
    await updateRefundStatus(c.env.DB, refundId, mapped as never, { processedAt: now, failureReason: opts.reason ?? to });
  }
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: `REFUND_${to.toUpperCase()}`,
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { refundId, from, to, reason: opts.reason ?? null },
  });
  await auditAdmin({
    ctx: { env: c.env, get: (k: string) => (k === 'ctx' ? ctx : undefined) } as never,
    action: `refund.${to}`,
    target: { type: 'refund', id: refundId },
    before: { status: from },
    after: { status: to },
  });
  if (po && (to === 'completed' || to === 'failed')) {
    try {
      await notifyOrderParties(
        c.env.DB,
        c.env.NOTIFICATIONS_QUEUE,
        { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
        {
          type: to === 'completed' ? NotificationType.REFUND_COMPLETED : NotificationType.REFUND_FAILED,
          title: to === 'completed' ? `Refund completed for PO ${po.poNumber}` : `Refund failed for PO ${po.poNumber}`,
          body: opts.reason ?? null,
          link: `/orders/${po.id}`,
          audience: 'both',
        },
      );
    } catch (err) {
      console.error('[admin.refund] notify failed', err);
    }
  }
  return { id: refundId, from, to };
}

router.post('/refunds/:id/approve', requirePermission('refund:approve'), async (c) => {
  ctxOf(c);
  return c.json(await transitionRefund(c, c.req.param('id'), 'approved'));
});

router.post('/refunds/:id/reject', requirePermission('refund:approve'), async (c) => {
  const ctx = ctxOf(c);
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  if (!body.reason) throw httpError(400, 'VALIDATION_ERROR', 'reason required');
  void ctx;
  return c.json(await transitionRefund(c, c.req.param('id'), 'rejected', { reason: body.reason }));
});

router.post('/refunds/:id/process', requirePermission('refund:process'), async (c) => {
  ctxOf(c);
  return c.json(await transitionRefund(c, c.req.param('id'), 'processing'));
});

router.post('/refunds/:id/complete', requirePermission('refund:process'), async (c) => {
  ctxOf(c);
  const body = (await c.req.json().catch(() => ({}))) as { providerReference?: string };
  return c.json(await transitionRefund(c, c.req.param('id'), 'completed', { providerReference: body.providerReference ?? null }));
});

router.post('/refunds/:id/fail', requirePermission('refund:process'), async (c) => {
  ctxOf(c);
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  return c.json(await transitionRefund(c, c.req.param('id'), 'failed', { reason: body.reason ?? null }));
});

// --- Bank transfer admin flow (spec §31) ---

router.get('/bank-transfers', requirePermission('payment:read'), async (c) => {
  ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  return c.json({
    transfers: await listBankTransferQueue(c.env.DB, q.data.status, q.data.limit ?? 50, q.data.cursor),
  });
});

router.get('/bank-transfers/:id', requirePermission('payment:read'), async (c) => {
  ctxOf(c);
  const row = await findBankTransfer(c.env.DB, c.req.param('id'));
  if (!row) throw httpError(404, 'NOT_FOUND', 'Not found');
  const { proofR2Key: _k, ...safe } = row as any;
  void _k;
  return c.json({ bankTransfer: safe });
});

router.post('/bank-transfers/:id/verify', requirePermission('payment:verify_bank_transfer'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = bankTransferVerifySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const row = await findBankTransfer(c.env.DB, c.req.param('id'));
  if (!row) throw httpError(404, 'NOT_FOUND', 'Not found');
  if (['verified', 'rejected'].includes(row.status)) {
    throw httpError(409, 'BANK_TRANSFER_ALREADY_VERIFIED', `Transfer is ${row.status}`);
  }
  const db = getDb(c.env.DB);
  const payment = (await db.select().from(payments).where(eq(payments.id, row.paymentId)).get()) as any;
  if (!payment) throw httpError(404, 'NOT_FOUND', 'Payment missing');
  if (payment.status !== 'pending') {
    throw httpError(409, 'PAYMENT_ALREADY_COMPLETED', `Payment is ${payment.status}`);
  }
  const now = Date.now();
  const difference = parsed.data.verifiedCents - row.expectedCents;
  const reconStatus = difference === 0 ? 'matched' : 'partial';
  // Concurrency: guarded update wins only if status unchanged since read.
  const ok = await updateBankTransferGuarded(c.env.DB, row.id, ['pending', 'proof_submitted', 'pending_verification', 'correction_requested'], {
    verifiedCents: parsed.data.verifiedCents,
    differenceCents: difference,
    bankReference: parsed.data.bankReference,
    status: 'verified',
    verifiedByUserId: ctx.userId,
    verifiedAt: now,
  });
  if (!ok) throw httpError(409, 'CONFLICT', 'Transfer changed concurrently — retry');
  // Only exact matches settle automatically; mismatches stay visible as
  // partial/exception for reconciliation (spec §11).
  if (difference === 0) {
    await db
      .update(payments)
      .set({ status: 'confirmed', confirmedAt: now, paidAt: now, confirmedByUserId: ctx.userId, transactionReference: parsed.data.bankReference, updatedAt: now })
      .where(eq(payments.id, payment.id))
      .run();
    await ensureAllocationAndEarning(c.env.DB, payment.id, ctx.userId);
    await db.transaction(async (tx) => {
      writeLedgerEntry(tx as any, {
        accountType: 'business',
        accountId: (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get() as any).businessId,
        direction: 'credit',
        amountCents: payment.netCents,
        currency: payment.currency,
        refType: 'payment',
        refId: payment.id,
        category: 'PAYMENT',
        entityType: 'bank_transfer',
        entityId: row.id,
        description: `Bank transfer ${row.referenceNumber} verified`,
        createdByUserId: ctx.userId,
      });
    }).catch((err) => console.error('[admin.bank.verify] ledger skipped', err));
    try {
      const { generateReceiptForPayment } = await import('../invoices/generate');
      await generateReceiptForPayment(c.env.DB, { ...payment, status: 'confirmed' } as any);
    } catch (err) {
      console.error('[admin.bank.verify] receipt failed', err);
    }
  } else {
    await updateBankTransferGuarded(c.env.DB, row.id, ['verified'], { status: 'partial' });
  }
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'BANK_TRANSFER_VERIFIED',
    resourceType: 'payment',
    resourceId: payment.id,
    metadata: { bankTransferId: row.id, verifiedCents: parsed.data.verifiedCents, reconciliation: reconStatus },
  });
  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get()) as any;
  if (po) {
    try {
      await notifyOrderParties(
        c.env.DB,
        c.env.NOTIFICATIONS_QUEUE,
        { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
        {
          type: difference === 0 ? NotificationType.BANK_TRANSFER_VERIFIED : NotificationType.RECONCILIATION_EXCEPTION,
          title: difference === 0 ? `Bank transfer verified for PO ${po.poNumber}` : `Bank transfer amount mismatch on PO ${po.poNumber}`,
          body: difference === 0 ? 'Payment confirmed.' : `Expected ${row.expectedCents}c, verified ${parsed.data.verifiedCents}c.`,
          link: `/orders/${po.id}`,
          audience: 'buyer',
        },
      );
    } catch (err) {
      console.error('[admin.bank.verify] notify failed', err);
    }
  }
  return c.json({ ok: true, reconciliation: reconStatus, differenceCents: difference });
});

router.post('/bank-transfers/:id/reject', requirePermission('payment:verify_bank_transfer'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = bankTransferRejectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const ok = await updateBankTransferGuarded(c.env.DB, c.req.param('id'), ['pending', 'proof_submitted', 'pending_verification', 'correction_requested'], {
    status: 'rejected',
    rejectionReason: parsed.data.reason,
  });
  if (!ok) throw httpError(409, 'BANK_TRANSFER_ALREADY_VERIFIED', 'Transfer already decided or missing');
  const row = await findBankTransfer(c.env.DB, c.req.param('id'));
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'BANK_TRANSFER_REJECTED',
    resourceType: 'payment',
    resourceId: row?.paymentId ?? c.req.param('id'),
    metadata: { bankTransferId: c.req.param('id'), reason: parsed.data.reason },
  });
  return c.json({ ok: true });
});

router.post('/bank-transfers/:id/correction', requirePermission('payment:verify_bank_transfer'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = bankTransferCorrectionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const ok = await updateBankTransferGuarded(c.env.DB, c.req.param('id'), ['pending_verification', 'proof_submitted'], {
    status: 'correction_requested',
    rejectionReason: parsed.data.message,
  });
  if (!ok) throw httpError(409, 'CONFLICT', 'Transfer cannot be sent back for correction from its current state');
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'BANK_TRANSFER_CORRECTION_REQUESTED',
    resourceType: 'bank_transfer',
    resourceId: c.req.param('id'),
    metadata: { message: parsed.data.message },
  });
  return c.json({ ok: true });
});

// --- COD reconciliation (spec §32) ---

router.get('/cod', requirePermission('payment:read'), async (c) => {
  ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  return c.json({ collections: await listCodQueue(c.env.DB, q.data.status, q.data.limit ?? 50, q.data.cursor) });
});

router.post('/cod/:paymentId/reconcile', requirePermission('payment:reconcile_cod'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = codReconcileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const current = (await findCodByPayment(c.env.DB, c.req.param('paymentId'))) as any;
  if (!current) throw httpError(404, 'NOT_FOUND', 'No COD collection for this payment');
  const db = getDb(c.env.DB);
  await db.update(codTable).set({ reconciliationStatus: parsed.data.status as never, reconciledAt: Date.now(), reconciledByUserId: ctx.userId, notes: parsed.data.notes ?? current.notes, updatedAt: Date.now() }).where(eq(codTable.id, current.id)).run();
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'COD_RECONCILED',
    resourceType: 'payment',
    resourceId: c.req.param('paymentId'),
    metadata: { status: parsed.data.status, discrepancyCents: current.discrepancyCents },
  });
  return c.json({ ok: true, reconciliationStatus: parsed.data.status });
});

// --- Supplier earnings (read) ---

router.get('/earnings', requirePermission('payment:read'), async (c) => {
  ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  const db = getDb(c.env.DB);
  const conds: any[] = [];
  if (q.data.supplierId) conds.push(eq(earningsTable.supplierId, q.data.supplierId));
  if (q.data.status) conds.push(eq(earningsTable.eligibility, q.data.status as never));
  if (q.data.cursor !== undefined) conds.push(sql`${earningsTable.createdAt} < ${q.data.cursor}`);
  const limit = Math.min(q.data.limit ?? 50, 200);
  const rows = (await db
    .select()
    .from(earningsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(earningsTable.createdAt))
    .limit(limit)
    .all()) as any[];
  return c.json({ earnings: rows });
});

// --- Reconciliation exceptions (read/resolve live here; run lives in adminSettlements) ---

router.get('/reconciliation/exceptions', requirePermission('reconciliation:read'), async (c) => {
  ctxOf(c);
  const status = c.req.query('status');
  const kind = c.req.query('kind');
  return c.json({ exceptions: await listExceptions(c.env.DB, status, kind, 100) });
});

router.post('/reconciliation/exceptions/:id/resolve', requirePermission('reconciliation:resolve'), async (c) => {
  const ctx = ctxOf(c);
  const body = (await c.req.json().catch(() => ({}))) as { note?: string; status?: 'resolved' | 'acknowledged' | 'dismissed' };
  if (!body.note) throw httpError(400, 'VALIDATION_ERROR', 'note required');
  const row = await resolveException(c.env.DB, c.req.param('id'), ctx.userId, body.note, body.status ?? 'resolved');
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'RECONCILIATION_RESOLVED',
    resourceType: 'reconciliation_exception',
    resourceId: c.req.param('id'),
    metadata: { status: body.status ?? 'resolved' },
  });
  return c.json({ exception: row });
});

export default router;
