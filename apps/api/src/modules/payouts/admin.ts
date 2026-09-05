import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import {
  payoutGenerateSchema,
  payoutMarkPaidSchema,
  payoutMarkFailedSchema,
} from '@vyro/validation/payment';
import { getDb } from '@vyro/db';
import { recordAudit } from '../supplierProducts/repository';
import { writeLedgerEntry } from '../ledger';
import { getOrCreateSupplierSettings } from '../settings/supplierRepository';
import {
  aggregatePayableForSupplier,
  createPayout,
  findPayout,
  updatePayoutStatus,
} from './repository';

const adminRouter = new Hono<{ Bindings: { DB: D1Database } }>();

adminRouter.use('*', session());

function requireAdmin(ctx: Ctx | undefined): asserts ctx is Ctx {
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  if (!ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
}

adminRouter.post('/generate', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  requireAdmin(ctx);
  const parsed = payoutGenerateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const settings = await getOrCreateSupplierSettings(c.env.DB, parsed.data.supplierId, ctx.userId);

  const aggregate = await aggregatePayableForSupplier(c.env.DB, {
    supplierId: parsed.data.supplierId,
    periodStart: parsed.data.periodStart,
    periodEnd: parsed.data.periodEnd,
  });

  if (aggregate.paymentCount === 0) {
    throw httpError(409, 'CONFLICT', 'No confirmed payments in this period for this supplier');
  }

  const method = (settings.payoutMethod ?? 'bank') as 'bank' | 'cash';

  let payout;
  try {
    payout = await createPayout(c.env.DB, {
      supplierId: parsed.data.supplierId,
      amountCents: aggregate.amountCents,
      feeCents: aggregate.feeCents,
      netCents: aggregate.netCents,
      currency: 'LKR',
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      method,
    });
  } catch (e) {
    throw httpError(409, 'CONFLICT', 'Payout already exists for this period');
  }

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'payout.generate',
    resourceType: 'supplier',
    resourceId: parsed.data.supplierId,
    metadata: {
      payoutId: payout.id,
      paymentCount: aggregate.paymentCount,
      amountCents: aggregate.amountCents,
    },
  });

  return c.json({ payout }, 201);
});

adminRouter.post('/:id/mark-paid', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  requireAdmin(ctx);
  const parsed = payoutMarkPaidSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const payout = await findPayout(c.env.DB, c.req.param('id'));
  if (!payout) throw httpError(404, 'NOT_FOUND', 'Payout not found');
  if (payout.status !== 'pending' && payout.status !== 'processing') {
    throw httpError(409, 'CONFLICT', `Payout is ${payout.status}`);
  }

  const now = Date.now();
  await getDb(c.env.DB).transaction(async (tx) => {
    updatePayoutStatus(c.env.DB, payout.id, {
      status: 'paid',
      paidAt: now,
      paidByUserId: ctx.userId,
      reference: parsed.data.reference ?? null,
    });
    writeLedgerEntry(tx as any, {
      accountType: 'supplier',
      accountId: payout.supplierId,
      direction: 'credit',
      amountCents: payout.netCents,
      refType: 'payout',
      refId: payout.id,
      description: `Payout ${payout.id} paid (${payout.method})`,
      createdByUserId: ctx.userId,
    });
    writeLedgerEntry(tx as any, {
      accountType: 'platform',
      accountId: 'platform',
      direction: 'debit',
      amountCents: payout.netCents,
      refType: 'payout',
      refId: payout.id,
      description: `Platform owes supplier ${payout.supplierId} for payout ${payout.id}`,
      createdByUserId: ctx.userId,
    });
  });

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'payout.mark_paid',
    resourceType: 'supplier',
    resourceId: payout.supplierId,
    metadata: { payoutId: payout.id, reference: parsed.data.reference ?? null },
  });

  return c.json({ ok: true });
});

adminRouter.post('/:id/mark-failed', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  requireAdmin(ctx);
  const parsed = payoutMarkFailedSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const payout = await findPayout(c.env.DB, c.req.param('id'));
  if (!payout) throw httpError(404, 'NOT_FOUND', 'Payout not found');
  if (payout.status !== 'pending' && payout.status !== 'processing') {
    throw httpError(409, 'CONFLICT', `Payout is ${payout.status}`);
  }

  await updatePayoutStatus(c.env.DB, payout.id, {
    status: 'failed',
    failureReason: parsed.data.reason,
  });

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'payout.mark_failed',
    resourceType: 'supplier',
    resourceId: payout.supplierId,
    metadata: { payoutId: payout.id, reason: parsed.data.reason },
  });

  return c.json({ ok: true });
});

export default adminRouter;
