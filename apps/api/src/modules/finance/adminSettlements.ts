import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requirePermission } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import {
  supplierEarnings as earningsTable,
  payouts as payoutsTable,
  payments,
  ledgerEntries,
} from '@vyro/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  adjustmentCreateSchema,
  commissionRuleSchema,
  financialQuerySchema,
  payoutCreateSchema,
  payoutDecisionSchema,
  reconciliationResolveSchema,
  settlementCreateSchema,
} from '@vyro/validation';
import { canTransitionSettlement, canTransitionPayout } from '@vyro/shared';
import { recordAudit } from '../supplierProducts/repository';
import { auditAdmin } from '../admin/lib/audit';
import { notifyOrderParties, notifyAdmins } from '../notifications/dispatcher';
import { NotificationType } from '@vyro/shared';
import { writeLedgerEntry } from '../ledger/writer';
import { runReconciliation } from './reconciliation';
import {
  createSettlement,
  findSettlement,
  findSettlementByIdempotency,
  setSettlementStatus,
  listSettlements,
  listSettlementItems,
  createAdjustment,
  findAdjustment,
  setAdjustmentStatus,
  listAdjustments,
  listExceptions,
  resolveException,
  createCommissionRule,
  listCommissionRules,
  setCommissionRuleActive,
} from './repository';
import { findPayout, updatePayoutStatus } from '../payouts/repository';
import { adjustmentNumber, payoutNumber, settlementNumber } from './numbers';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

// --- Settlements (spec §21) ---

router.post('/settlements', requirePermission('settlement:approve'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = settlementCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  if (parsed.data.idempotencyKey) {
    const dup = await findSettlementByIdempotency(c.env.DB, parsed.data.idempotencyKey);
    if (dup) return c.json({ settlement: dup, duplicate: true }, 200);
  }
  const db = getDb(c.env.DB);
  // Eligibility gate: only eligible earnings, same supplier, unsettled.
  const conds: any[] = [eq(earningsTable.eligibility, 'eligible')];
  if (parsed.data.earningIds?.length) {
    conds.push(sql`${earningsTable.id} IN (${sql.join(parsed.data.earningIds.map((id) => sql`${id}`), sql`, `)})`);
  } else {
    conds.push(eq(earningsTable.supplierId, parsed.data.supplierId));
  }
  const candidates = (await db.select().from(earningsTable).where(and(...conds)).all()) as any[];
  const eligible = candidates.filter((e) => e.supplierId === parsed.data.supplierId && e.eligibility === 'eligible');
  if (eligible.length === 0) {
    throw httpError(409, 'SETTLEMENT_NOT_ELIGIBLE', 'No eligible earnings for this supplier');
  }
  const gross = eligible.reduce((a: number, e: any) => a + e.grossCents, 0);
  const commission = eligible.reduce((a: number, e: any) => a + e.commissionCents, 0);
  const refund = eligible.reduce((a: number, e: any) => a + (e.refundCents ?? 0), 0);
  const adj = eligible.reduce((a: number, e: any) => a + (e.adjustmentCents ?? 0), 0);
  const net = eligible.reduce((a: number, e: any) => a + e.netCents, 0);
  if (net <= 0) throw httpError(409, 'INSUFFICIENT_SETTLEMENT_BALANCE', 'Settlement net must be positive');
  const settlement = await createSettlement(c.env.DB, {
    settlementNumber: settlementNumber(),
    supplierId: parsed.data.supplierId,
    grossCents: gross,
    commissionCents: commission,
    refundCents: refund,
    adjustmentCents: adj,
    netCents: net,
    currency: eligible[0].currency,
    earningIds: eligible.map((e: any) => e.id),
    createdByUserId: ctx.userId,
    idempotencyKey: parsed.data.idempotencyKey ?? null,
  });
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'SETTLEMENT_CREATED',
    resourceType: 'supplier',
    resourceId: parsed.data.supplierId,
    metadata: { settlementId: settlement.id, netCents: net, earnings: eligible.length },
  });
  try {
    await notifyAdmins(c.env, {
      role: 'finance',
      severity: 'info',
      category: 'admin_alert',
      title: `Settlement ${settlement.settlementNumber} created`,
      body: `${eligible.length} earnings, net ${net}c.`,
      link: `/admin/finance?tab=settlements`,
    });
  } catch (err) {
    console.error('[admin.settlement] notify failed', err);
  }
  return c.json({ settlement }, 201);
});

router.get('/settlements', requirePermission('settlement:read'), async (c) => {
  ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  return c.json({
    settlements: await listSettlements(c.env.DB, q.data.supplierId, q.data.status, q.data.limit ?? 50, q.data.cursor),
  });
});

router.get('/settlements/:id', requirePermission('settlement:read'), async (c) => {
  ctxOf(c);
  const s = await findSettlement(c.env.DB, c.req.param('id'));
  if (!s) throw httpError(404, 'NOT_FOUND', 'Settlement not found');
  return c.json({ settlement: s, items: await listSettlementItems(c.env.DB, s.id) });
});

for (const [action, to] of [['approve', 'approved'], ['process', 'processing'], ['complete', 'completed'], ['fail', 'failed'], ['cancel', 'cancelled']] as const) {
  router.post(`/settlements/:id/${action}`, requirePermission('settlement:approve'), async (c) => {
    const ctx = ctxOf(c);
    const s = await findSettlement(c.env.DB, c.req.param('id'));
    if (!s) throw httpError(404, 'NOT_FOUND', 'Settlement not found');
    if (!canTransitionSettlement(s.status, to)) {
      throw httpError(409, 'CONFLICT', `Illegal settlement transition ${s.status} -> ${to}`);
    }
    const patch: Record<string, unknown> = {};
    if (to === 'approved') {
      patch.approvedByUserId = ctx.userId;
      patch.approvedAt = Date.now();
    }
    if (to === 'processing') patch.processedAt = Date.now();
    if (to === 'completed') {
      patch.completedAt = Date.now();
      // Settlement completion writes the supplier-payable ledger leg once.
      const db = getDb(c.env.DB);
      const prior = (await db
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.refId, s.id), eq(ledgerEntries.category, 'SETTLEMENT' as never)))
        .get()) as any;
      if (!prior) {
        await db.transaction(async (tx) => {
          writeLedgerEntry(tx as any, {
            accountType: 'supplier',
            accountId: s.supplierId,
            direction: 'debit',
            amountCents: s.netCents,
            currency: s.currency,
            refType: 'payout',
            refId: s.id,
            category: 'SETTLEMENT',
            entityType: 'settlement',
            entityId: s.id,
            description: `Settlement ${s.settlementNumber} completed`,
            createdByUserId: ctx.userId,
          });
        }).catch((err) => console.error('[admin.settlement] ledger skipped', err));
      }
    }
    if (to === 'failed') {
      const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
      patch.failureReason = body.reason ?? null;
    }
    const updated = await setSettlementStatus(c.env.DB, s.id, to, patch);
    await recordAudit(c.env.DB, {
      actorUserId: ctx.userId,
      action: `SETTLEMENT_${to.toUpperCase()}`,
      resourceType: 'settlement',
      resourceId: s.id,
      metadata: { from: s.status, to },
    });
    // Supplier visibility: settlement available / updated.
    try {
      const db = getDb(c.env.DB);
      const { supplierMembers } = await import('@vyro/db/schema');
      const members = (await db.select({ userId: supplierMembers.userId }).from(supplierMembers).where(and(eq(supplierMembers.supplierId, s.supplierId), eq(supplierMembers.status, 'active'))).all()) as any[];
      void members;
      const { notifyUsers } = await import('../notifications/dispatcher');
      await notifyUsers(
        c.env.DB,
        c.env.NOTIFICATIONS_QUEUE,
        members.map((m: any) => m.userId),
        {
          type: NotificationType.SETTLEMENT_AVAILABLE,
          title: `Settlement ${s.settlementNumber} ${to}`,
          body: `Net ${s.netCents}c ${to}.`,
          link: `/supplier/accounts?tab=settlements`,
        },
      );
    } catch (err) {
      console.error('[admin.settlement] supplier notify failed', err);
    }
    return c.json({ settlement: updated });
  });
}

// --- Payouts from settlements (spec §22) ---

router.post('/payouts', requirePermission('payout:approve'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = payoutCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const settlement = await findSettlement(c.env.DB, parsed.data.settlementId);
  if (!settlement) throw httpError(404, 'NOT_FOUND', 'Settlement not found');
  if (!['approved', 'completed'].includes(settlement.status)) {
    throw httpError(409, 'SETTLEMENT_NOT_ELIGIBLE', `Settlement is ${settlement.status}`);
  }
  const db = getDb(c.env.DB);
  if (parsed.data.idempotencyKey) {
    const dup = (await db.select().from(payoutsTable).where(eq(payoutsTable.idempotencyKey, parsed.data.idempotencyKey)).get()) as any;
    if (dup) return c.json({ payout: dup, duplicate: true }, 200);
  }
  const existing = (await db.select().from(payoutsTable).where(eq(payoutsTable.settlementId, settlement.id)).all()) as any[];
  if (existing.some((p: any) => !['failed', 'cancelled'].includes(p.status))) {
    throw httpError(409, 'PAYOUT_ALREADY_COMPLETED', 'A live payout already exists for this settlement');
  }
  const { createPayout } = await import('../payouts/repository');
  const payout = await createPayout(c.env.DB, {
    supplierId: settlement.supplierId,
    amountCents: settlement.netCents,
    feeCents: 0,
    netCents: settlement.netCents,
    currency: settlement.currency,
    periodStart: settlement.createdAt,
    periodEnd: Date.now(),
    method: parsed.data.method,
  });
  await db.update(payoutsTable).set({
    payoutNumber: payoutNumber(),
    settlementId: settlement.id,
    bankAccountId: parsed.data.bankAccountId ?? null,
    idempotencyKey: parsed.data.idempotencyKey ?? null,
    initiatedByUserId: ctx.userId,
    updatedAt: Date.now(),
  }).where(eq(payoutsTable.id, payout.id)).run();
  const full = await findPayout(c.env.DB, payout.id);
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'PAYOUT_CREATED',
    resourceType: 'settlement',
    resourceId: settlement.id,
    metadata: { payoutId: payout.id, netCents: settlement.netCents },
  });
  await auditAdmin({
    ctx: { env: c.env, get: (k: string) => (k === 'ctx' ? ctx : undefined) } as never,
    action: 'payout.create',
    target: { type: 'payout', id: payout.id },
    before: null,
    after: { status: 'pending', netCents: settlement.netCents },
  });
  return c.json({ payout: full }, 201);
});

for (const [action, to] of [['approve', 'approved'], ['process', 'processing'], ['complete', 'completed'], ['fail', 'failed'], ['cancel', 'cancelled']] as const) {
  router.post(`/payouts/:id/${action}`, requirePermission(to === 'approved' ? 'payout:approve' : 'payout:process'), async (c) => {
    const ctx = ctxOf(c);
    const payout = await findPayout(c.env.DB, c.req.param('id'));
    if (!payout) throw httpError(404, 'NOT_FOUND', 'Payout not found');
    // Completed/paid payouts are immutable — corrections go via adjustments.
    if (['completed', 'paid'].includes(payout.status)) {
      throw httpError(409, 'PAYOUT_ALREADY_COMPLETED', 'Completed payouts are immutable; create an adjustment instead');
    }
    if (!canTransitionPayout(payout.status, to)) {
      throw httpError(409, 'CONFLICT', `Illegal payout transition ${payout.status} -> ${to}`);
    }
    const body = (await c.req.json().catch(() => ({}))) as { externalReference?: string; reason?: string };
    const now = Date.now();
    const patch: Record<string, unknown> = {};
    if (to === 'approved') {
      patch.approvedByUserId = ctx.userId;
      patch.approvedAt = now;
    }
    if (to === 'processing') patch.processedAt = now;
    if (to === 'completed') {
      patch.completedAt = now;
      patch.paidAt = now;
      patch.paidByUserId = ctx.userId;
      patch.externalReference = body.externalReference ?? null;
      patch.status = 'paid';
    }
    if (to === 'failed' || to === 'cancelled') patch.failureReason = body.reason ?? to;
    const db = getDb(c.env.DB);
    await db.update(payoutsTable).set({ ...patch, ...(to !== 'completed' ? { status: to as never } : {}), updatedAt: now }).where(eq(payoutsTable.id, payout.id)).run();
    if (to === 'completed') {
      await db.transaction(async (tx) => {
        writeLedgerEntry(tx as any, {
          accountType: 'supplier',
          accountId: payout.supplierId,
          direction: 'debit',
          amountCents: payout.netCents,
          currency: payout.currency,
          refType: 'payout',
          refId: payout.id,
          category: 'PAYOUT',
          entityType: 'settlement',
          entityId: payout.settlementId ?? payout.id,
          description: `Payout ${payout.payoutNumber ?? payout.id} completed`,
          createdByUserId: ctx.userId,
        });
      }).catch((err) => console.error('[admin.payout] ledger skipped', err));
    }
    const full = await findPayout(c.env.DB, payout.id);
    await recordAudit(c.env.DB, {
      actorUserId: ctx.userId,
      action: `PAYOUT_${to.toUpperCase()}`,
      resourceType: 'payout',
      resourceId: payout.id,
      metadata: { from: payout.status, to, externalReference: body.externalReference ?? null },
    });
    try {
      const { notifyUsers } = await import('../notifications/dispatcher');
      const { supplierMembers } = await import('@vyro/db/schema');
      const dbm = getDb(c.env.DB);
      const members = (await dbm.select({ userId: supplierMembers.userId }).from(supplierMembers).where(and(eq(supplierMembers.supplierId, payout.supplierId), eq(supplierMembers.status, 'active'))).all()) as any[];
      await notifyUsers(c.env.DB, c.env.NOTIFICATIONS_QUEUE, members.map((m: any) => m.userId), {
        type: to === 'completed' ? NotificationType.PAYOUT_COMPLETED : to === 'failed' ? NotificationType.PAYOUT_FAILED : NotificationType.PAYOUT_INITIATED,
        title: `Payout ${to}`,
        body: `${payout.netCents}c ${to}.`,
        link: `/supplier/accounts?tab=payouts`,
      });
    } catch (err) {
      console.error('[admin.payout] notify failed', err);
    }
    return c.json({ payout: full });
  });
}

// --- Adjustments (spec §58) ---

router.post('/adjustments', requirePermission('adjustment:create'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = adjustmentCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const row = await createAdjustment(c.env.DB, {
    adjustmentNumber: adjustmentNumber(),
    kind: parsed.data.kind,
    accountType: parsed.data.accountType,
    accountId: parsed.data.accountId,
    amountCents: parsed.data.amountCents,
    currency: parsed.data.currency ?? 'LKR',
    entityType: parsed.data.entityType ?? null,
    entityId: parsed.data.entityId ?? null,
    reason: parsed.data.reason,
    createdByUserId: ctx.userId,
    idempotencyKey: parsed.data.idempotencyKey ?? null,
  });
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'FINANCIAL_ADJUSTMENT_CREATED',
    resourceType: 'financial_adjustment',
    resourceId: row.id,
    metadata: { kind: row.kind, amountCents: row.amountCents },
  });
  return c.json({ adjustment: row }, 201);
});

router.get('/adjustments', requirePermission('adjustment:create'), async (c) => {
  ctxOf(c);
  const q = financialQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  return c.json({ adjustments: await listAdjustments(c.env.DB, q.data.type, q.data.supplierId ?? q.data.businessId, q.data.limit ?? 50, q.data.cursor) });
});

router.post('/adjustments/:id/approve', requirePermission('adjustment:approve'), async (c) => {
  const ctx = ctxOf(c);
  const adj = await findAdjustment(c.env.DB, c.req.param('id'));
  if (!adj) throw httpError(404, 'NOT_FOUND', 'Adjustment not found');
  if (adj.status !== 'pending') throw httpError(409, 'CONFLICT', `Adjustment is ${adj.status}`);
  // Four-eyes: approver must differ from creator.
  if (adj.createdByUserId && adj.createdByUserId === ctx.userId) {
    throw httpError(403, 'UNAUTHORIZED_FINANCIAL_OPERATION', 'Approver must differ from creator');
  }
  const updated = await setAdjustmentStatus(c.env.DB, adj.id, 'approved', { approvedByUserId: ctx.userId, approvedAt: Date.now() });
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'FINANCIAL_ADJUSTMENT_APPROVED', resourceType: 'financial_adjustment', resourceId: adj.id, metadata: {} });
  return c.json({ adjustment: updated });
});

router.post('/adjustments/:id/apply', requirePermission('adjustment:approve'), async (c) => {
  const ctx = ctxOf(c);
  const adj = await findAdjustment(c.env.DB, c.req.param('id'));
  if (!adj) throw httpError(404, 'NOT_FOUND', 'Adjustment not found');
  if (adj.status !== 'approved') throw httpError(409, 'CONFLICT', `Adjustment is ${adj.status}; approve first`);
  const db = getDb(c.env.DB);
  const now = Date.now();
  await db.transaction(async (tx) => {
    tx.update((await import('@vyro/db/schema')).financialAdjustments)
      .set({ status: 'applied', appliedAt: now, updatedAt: now })
      .where(eq((await import('@vyro/db/schema')).financialAdjustments.id, adj.id))
      .run();
    writeLedgerEntry(tx as any, {
      accountType: adj.accountType as never,
      accountId: adj.accountId,
      direction: adj.kind === 'credit' ? 'credit' : 'debit',
      amountCents: adj.amountCents,
      currency: adj.currency,
      refType: 'adjustment',
      refId: adj.id,
      category: 'MANUAL_ADJUSTMENT',
      entityType: adj.entityType ?? undefined,
      entityId: adj.entityId ?? undefined,
      description: `Adjustment ${adj.adjustmentNumber}: ${adj.reason}`.slice(0, 500),
      createdByUserId: ctx.userId,
    });
  });
  // Supplier earnings projection follows credit/debit adjustments.
  if (adj.accountType === 'supplier' && adj.entityType === 'supplier_earning') {
    try {
      const { supplierEarnings } = await import('@vyro/db/schema');
      const earning = (await db.select().from(supplierEarnings).where(eq(supplierEarnings.id, adj.entityId!)).get()) as any;
      if (earning && earning.eligibility !== 'settled') {
        const delta = adj.kind === 'credit' ? adj.amountCents : -adj.amountCents;
        const nextAdj = (earning.adjustmentCents ?? 0) + delta;
        const nextNet = earning.grossCents - earning.commissionCents - (earning.processingFeeCents ?? 0) + nextAdj - (earning.refundCents ?? 0);
        await db.update(supplierEarnings).set({ adjustmentCents: nextAdj, netCents: nextNet, updatedAt: now }).where(eq(supplierEarnings.id, earning.id)).run();
      }
    } catch (err) {
      console.error('[admin.adjustment] earning projection failed', err);
    }
  }
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'FINANCIAL_ADJUSTMENT_APPLIED', resourceType: 'financial_adjustment', resourceId: adj.id, metadata: {} });
  return c.json({ adjustment: await findAdjustment(c.env.DB, adj.id) });
});

router.post('/adjustments/:id/reject', requirePermission('adjustment:approve'), async (c) => {
  const ctx = ctxOf(c);
  const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
  const adj = await findAdjustment(c.env.DB, c.req.param('id'));
  if (!adj) throw httpError(404, 'NOT_FOUND', 'Adjustment not found');
  if (adj.status !== 'pending') throw httpError(409, 'CONFLICT', `Adjustment is ${adj.status}`);
  const updated = await setAdjustmentStatus(c.env.DB, adj.id, 'rejected', { approvedByUserId: ctx.userId, approvedAt: Date.now() });
  void body;
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'FINANCIAL_ADJUSTMENT_REJECTED', resourceType: 'financial_adjustment', resourceId: adj.id, metadata: {} });
  return c.json({ adjustment: updated });
});

// --- Commission rules (spec §15) ---

router.get('/commission-rules', requirePermission('commission:read'), async (c) => {
  ctxOf(c);
  return c.json({ rules: await listCommissionRules(c.env.DB) });
});

router.post('/commission-rules', requirePermission('commission:write'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = commissionRuleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const rule = await createCommissionRule(c.env.DB, {
    scope: parsed.data.scope,
    scopeId: parsed.data.scopeId ?? null,
    bps: parsed.data.bps,
    name: parsed.data.name ?? null,
    startsAt: parsed.data.startsAt ?? null,
    endsAt: parsed.data.endsAt ?? null,
    createdByUserId: ctx.userId,
  });
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'COMMISSION_RULE_CREATED', resourceType: 'commission_rule', resourceId: rule.id, metadata: { scope: rule.scope, bps: rule.bps } });
  return c.json({ rule }, 201);
});

router.post('/commission-rules/:id/deactivate', requirePermission('commission:write'), async (c) => {
  const ctx = ctxOf(c);
  await setCommissionRuleActive(c.env.DB, c.req.param('id'), false);
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'COMMISSION_RULE_DEACTIVATED', resourceType: 'commission_rule', resourceId: c.req.param('id'), metadata: {} });
  return c.json({ ok: true });
});

router.post('/commission-rules/:id/activate', requirePermission('commission:write'), async (c) => {
  const ctx = ctxOf(c);
  await setCommissionRuleActive(c.env.DB, c.req.param('id'), true);
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'COMMISSION_RULE_ACTIVATED', resourceType: 'commission_rule', resourceId: c.req.param('id'), metadata: {} });
  return c.json({ ok: true });
});

// --- Reconciliation run (spec §57) ---

router.post('/reconciliation/run', requirePermission('reconciliation:read'), async (c) => {
  const ctx = ctxOf(c);
  const summary = await runReconciliation(c.env.DB);
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'RECONCILIATION_RUN', resourceType: 'platform', resourceId: 'platform', metadata: summary });
  try {
    if (summary.raised > 0) {
      await notifyAdmins(c.env, {
        role: 'finance',
        severity: 'warning',
        category: 'admin_alert',
        title: `Reconciliation raised ${summary.raised} exceptions`,
        body: JSON.stringify(summary.byKind),
        link: `/admin/finance?tab=reconciliation`,
      });
    }
  } catch (err) {
    console.error('[admin.recon] notify failed', err);
  }
  return c.json(summary);
});

router.get('/reconciliation/exceptions', requirePermission('reconciliation:read'), async (c) => {
  ctxOf(c);
  return c.json({ exceptions: await listExceptions(c.env.DB, c.req.query('status'), c.req.query('kind'), 100) });
});

router.post('/reconciliation/exceptions/:id/resolve', requirePermission('reconciliation:resolve'), async (c) => {
  const ctx = ctxOf(c);
  const parsed = reconciliationResolveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const row = await resolveException(c.env.DB, c.req.param('id'), ctx.userId, parsed.data.note);
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'RECONCILIATION_RESOLVED', resourceType: 'reconciliation_exception', resourceId: c.req.param('id'), metadata: {} });
  return c.json({ exception: row });
});

// --- Exports (spec §43): CSV, permission-gated, secrets redacted ---

function toCsv(rows: any[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((col) => esc(r[col])).join(','))].join('\n');
}

router.get('/exports/payments.csv', requirePermission('financial_report:read'), async (c) => {
  ctxOf(c);
  const db = getDb(c.env.DB);
  const rows = (await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(2000).all()) as any[];
  const safe = rows.map((p: any) => {
    const { gatewayPayload: _g, ...rest } = p;
    void _g;
    return rest;
  });
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', 'attachment; filename="payments.csv"');
  return c.body(toCsv(safe, ['id', 'paymentNumber', 'purchaseOrderId', 'businessId', 'supplierId', 'method', 'provider', 'status', 'amountCents', 'feeCents', 'netCents', 'currency', 'providerReference', 'createdAt', 'paidAt']));
});

router.get('/exports/ledger.csv', requirePermission('financial_report:read'), async (c) => {
  ctxOf(c);
  const db = getDb(c.env.DB);
  const rows = (await db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(5000).all()) as any[];
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', 'attachment; filename="ledger.csv"');
  return c.body(toCsv(rows, ['id', 'accountType', 'accountId', 'direction', 'amountCents', 'currency', 'refType', 'refId', 'category', 'description', 'createdAt']));
});

// --- Supplier bank verification ---

router.post('/supplier-bank-accounts/:id/verify', requirePermission('payout:approve'), async (c) => {
  const ctx = ctxOf(c);
  const db = getDb(c.env.DB);
  const { supplierBankAccounts } = await import('@vyro/db/schema');
  const row = (await db.select().from(supplierBankAccounts).where(eq(supplierBankAccounts.id, c.req.param('id'))).get()) as any;
  if (!row) throw httpError(404, 'NOT_FOUND', 'Account not found');
  await db.update(supplierBankAccounts).set({ verificationStatus: 'verified', verifiedByUserId: ctx.userId, verifiedAt: Date.now(), updatedAt: Date.now() }).where(eq(supplierBankAccounts.id, row.id)).run();
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'supplier.bank_account.verified', resourceType: 'supplier', resourceId: row.supplierId, metadata: { accountId: row.id } });
  return c.json({ ok: true });
});

router.post('/supplier-bank-accounts/:id/reject', requirePermission('payout:approve'), async (c) => {
  const ctx = ctxOf(c);
  const db = getDb(c.env.DB);
  const { supplierBankAccounts } = await import('@vyro/db/schema');
  const row = (await db.select().from(supplierBankAccounts).where(eq(supplierBankAccounts.id, c.req.param('id'))).get()) as any;
  if (!row) throw httpError(404, 'NOT_FOUND', 'Account not found');
  await db.update(supplierBankAccounts).set({ verificationStatus: 'rejected', verifiedByUserId: ctx.userId, verifiedAt: Date.now(), updatedAt: Date.now() }).where(eq(supplierBankAccounts.id, row.id)).run();
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'supplier.bank_account.rejected', resourceType: 'supplier', resourceId: row.supplierId, metadata: { accountId: row.id } });
  return c.json({ ok: true });
});

export default router;
