import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { creditDrawdowns, creditFacilities } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import {
  adminCreditFacilityPatchSchema,
  adminCreditFacilityUpsertSchema,
  adminCreditListQuerySchema,
  creditBulkRepaySchema,
  creditDrawdownListQuerySchema,
  creditFacilityQuerySchema,
  creditRepaySchema,
} from '@vyro/validation';
import { assertBusinessAccess } from '../finance/access';
import { recordAudit } from '../supplierProducts/repository';
import { applyRepayment, assertLimitChange, availableCents, evaluateEligibility } from './service';
import { countOverdue, countPaidOrders, ensureAutoFacility, getFacility, listDrawdowns } from './repository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

router.get('/facility', async (c) => {
  const ctx = ctxOf(c);
  const q = creditFacilityQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  let facility = await getFacility(c.env.DB, q.data.businessId);
  if (!facility) facility = await ensureAutoFacility(c.env.DB, q.data.businessId, Date.now());
  if (!facility) {
    const paid = await countPaidOrders(c.env.DB, q.data.businessId);
    return c.json({ facility: null, availableCents: 0, eligible: false, reason: 'credit_not_eligible', paidOrderCount: paid, requiredPaidOrders: 3 });
  }
  const overdue = await countOverdue(c.env.DB, q.data.businessId);
  const paid = await countPaidOrders(c.env.DB, q.data.businessId);
  const evalRes = evaluateEligibility({ paidOrderCount: paid, overdueCount: overdue, facility });
  return c.json({ facility, availableCents: availableCents(facility), eligible: evalRes.eligible, reason: evalRes.reason, paidOrderCount: paid, requiredPaidOrders: 3, overdueCount: overdue });
});

router.get('/drawdowns', async (c) => {
  const ctx = ctxOf(c);
  const q = creditDrawdownListQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  return c.json({ items: await listDrawdowns(c.env.DB, q.data.businessId, q.data.status) });
});

router.post('/drawdowns/:id/repay', async (c) => {
  const ctx = ctxOf(c);
  const parsed = creditRepaySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const dd = (await db.select().from(creditDrawdowns).where(eq(creditDrawdowns.id, c.req.param('id'))).get()) as any;
  if (!dd) throw httpError(404, 'NOT_FOUND', 'Drawdown not found');
  await assertBusinessAccess(c.env.DB, ctx, dd.businessId);
  const out = await db.transaction(async (tx: any) => {
    return applyRepayment(tx, { businessId: dd.businessId, drawdownId: dd.id, amountCents: parsed.data.amountCents, paymentId: parsed.data.paymentId, userId: ctx.userId, now: Date.now() });
  });
  return c.json(out);
});

router.post('/repay', async (c) => {
  const ctx = ctxOf(c);
  const parsed = creditBulkRepaySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await assertBusinessAccess(c.env.DB, ctx, parsed.data.businessId);
  const items = await listDrawdowns(c.env.DB, parsed.data.businessId, 'active');
  (items as any[]).sort((a: any, b: any) => a.dueAt - b.dueAt);
  let remaining = parsed.data.amountCents;
  const applied: Array<{ id: string; amount: number }> = [];
  const db = getDb(c.env.DB);
  await db.transaction(async (tx: any) => {
    for (const dd of items as any[]) {
      if (remaining <= 0) break;
      const bal = dd.amountCents - dd.repaidCents;
      const take = Math.min(bal, remaining);
      if (take <= 0) continue;
      await applyRepayment(tx, { businessId: parsed.data.businessId, drawdownId: dd.id, amountCents: take, paymentId: parsed.data.paymentId, userId: ctx.userId, now: Date.now() });
      applied.push({ id: dd.id, amount: take });
      remaining -= take;
    }
  });
  if (applied.length === 0) throw httpError(400, 'VALIDATION_ERROR', 'No active drawdown to repay');
  return c.json({ applied, remainingCents: remaining });
});

export const creditAdminRouter = new Hono<{ Bindings: Env }>();
creditAdminRouter.use('*', session());

function requireCreditAdmin(ctx: Ctx) {
  if (!ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
}

creditAdminRouter.get('/facilities', async (c) => {
  const ctx = ctxOf(c);
  requireCreditAdmin(ctx);
  const q = adminCreditListQuerySchema.safeParse(c.req.query());
  const db = getDb(c.env.DB);
  const rows = (await db.select().from(creditFacilities).all()) as any[];
  const status = q.success ? q.data.status : undefined;
  return c.json({ items: status ? rows.filter((r) => r.status === status) : rows });
});

creditAdminRouter.post('/facilities', async (c) => {
  const ctx = ctxOf(c);
  requireCreditAdmin(ctx);
  const parsed = adminCreditFacilityUpsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const now = Date.now();
  const existing = await getFacility(c.env.DB, parsed.data.businessId);
  if (existing) {
    assertLimitChange(existing, parsed.data.limitCents);
    await db.update(creditFacilities).set({ limitCents: parsed.data.limitCents, defaultTerms: (parsed.data.defaultTerms ?? existing.defaultTerms) as never, status: (parsed.data.status ?? existing.status) as never, updatedAt: now }).where(eq(creditFacilities.businessId, parsed.data.businessId)).run();
  } else {
    await db.insert(creditFacilities).values({ businessId: parsed.data.businessId, limitCents: parsed.data.limitCents, usedCents: 0, status: (parsed.data.status ?? 'active') as never, defaultTerms: (parsed.data.defaultTerms ?? 'net30') as never, autoGranted: 0, createdAt: now, updatedAt: now }).run();
  }
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'credit.facility.upsert', resourceType: 'credit_facility', resourceId: parsed.data.businessId, metadata: { limitCents: parsed.data.limitCents } });
  return c.json({ ok: true });
});

creditAdminRouter.patch('/facilities/:businessId', async (c) => {
  const ctx = ctxOf(c);
  requireCreditAdmin(ctx);
  const parsed = adminCreditFacilityPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const businessId = c.req.param('businessId');
  const existing = await getFacility(c.env.DB, businessId);
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Facility not found');
  if (parsed.data.limitCents !== undefined) assertLimitChange(existing, parsed.data.limitCents);
  const db = getDb(c.env.DB);
  await db.update(creditFacilities).set({ ...(parsed.data.limitCents !== undefined ? { limitCents: parsed.data.limitCents } : {}), ...(parsed.data.defaultTerms ? { defaultTerms: parsed.data.defaultTerms as never } : {}), ...(parsed.data.status ? { status: parsed.data.status as never } : {}), updatedAt: Date.now() }).where(eq(creditFacilities.businessId, businessId)).run();
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'credit.facility.patch', resourceType: 'credit_facility', resourceId: businessId, metadata: parsed.data });
  return c.json({ ok: true });
});

creditAdminRouter.get('/overdue', async (c) => {
  const ctx = ctxOf(c);
  requireCreditAdmin(ctx);
  const db = getDb(c.env.DB);
  const rows = (await db.select().from(creditDrawdowns).where(eq(creditDrawdowns.status, 'overdue' as never)).all()) as any[];
  return c.json({ items: rows });
});

export default router;
