import { Hono } from 'hono';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { isFeatureEnabled } from '../../lib/featureFlags';
import {
  adminSlotUpsertSchema,
  adminPlanUpsertSchema,
  adminApproveSchema,
  adminRejectSchema,
  adminRevokeSchema,
} from '@vyro/validation';
import * as repo from './repository';
import * as svc from './service';
import { SponsoredError } from './errors';

const FLAG = 'SPONSORED_LISTINGS_ENABLED';
const router = new Hono<{ Bindings: Env }>();

async function ensureAdmin(c: any): Promise<Ctx> {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  if (!ctx.isAdmin && !ctx.adminRole) throw httpError(403, 'FORBIDDEN', 'Admin only');
  return ctx;
}

router.use('*', session());
router.use('*', async (c, next) => {
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) {
    throw httpError(404, 'FEATURE_DISABLED', 'Sponsored listings disabled');
  }
  await next();
});

// -------- Plans CRUD --------

router.get('/plans', async (c) => {
  await ensureAdmin(c);
  return c.json(await repo.listAllPlans(c.env.DB));
});

router.post('/plans', async (c) => {
  await ensureAdmin(c);
  const parsed = adminPlanUpsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const now = Math.floor(Date.now() / 1000);
  const plan: repo.PlanRow = {
    id: svc.newId(),
    tier: parsed.data.tier,
    name: parsed.data.name,
    monthlyRateCents: parsed.data.monthlyRateCents,
    includedSlotCredits: parsed.data.includedSlotCredits,
    active: parsed.data.active ? 1 : 0,
  };
  try {
    await repo.insertPlan(c.env.DB, plan);
  } catch (e: any) {
    if (String(e?.message ?? '').includes('UNIQUE')) {
      throw httpError(409, 'CONFLICT', 'Plan tier already exists');
    }
    throw e;
  }
  return c.json(plan, 201);
});

router.patch('/plans/:id', async (c) => {
  await ensureAdmin(c);
  const parsed = adminPlanUpsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const existing = await repo.getPlan(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Plan not found');
  await repo.updatePlan(c.env.DB, existing.id, {
    name: parsed.data.name,
    monthlyRateCents: parsed.data.monthlyRateCents,
    includedSlotCredits: parsed.data.includedSlotCredits,
    active: parsed.data.active ? 1 : 0,
  });
  return c.json({ ok: true });
});

router.delete('/plans/:id', async (c) => {
  await ensureAdmin(c);
  await repo.deletePlan(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

// -------- Slots CRUD --------

router.get('/slots', async (c) => {
  await ensureAdmin(c);
  return c.json(await repo.listAllSlots(c.env.DB));
});

router.post('/slots', async (c) => {
  await ensureAdmin(c);
  const parsed = adminSlotUpsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const now = Math.floor(Date.now() / 1000);
  const slot: repo.SlotRow = {
    id: svc.newId(),
    surface: parsed.data.surface,
    position: parsed.data.position,
    categoryId: parsed.data.categoryId ?? null,
    label: parsed.data.label,
    dailyRateCents: parsed.data.dailyRateCents,
    active: parsed.data.active ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await repo.insertSlot(c.env.DB, slot);
  } catch (e: any) {
    if (String(e?.message ?? '').includes('UNIQUE')) {
      throw httpError(409, 'SLOT_DUPLICATE', 'Slot already exists for surface+position+category');
    }
    throw e;
  }
  return c.json(slot, 201);
});

router.patch('/slots/:id', async (c) => {
  await ensureAdmin(c);
  const parsed = adminSlotUpsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const existing = await repo.getSlot(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Slot not found');
  await repo.updateSlot(c.env.DB, existing.id, {
    surface: parsed.data.surface,
    position: parsed.data.position,
    categoryId: parsed.data.categoryId ?? null,
    label: parsed.data.label,
    dailyRateCents: parsed.data.dailyRateCents,
    active: parsed.data.active ? 1 : 0,
  });
  return c.json({ ok: true });
});

router.delete('/slots/:id', async (c) => {
  await ensureAdmin(c);
  await repo.deleteSlot(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

// -------- Campaigns --------

router.get('/campaigns', async (c) => {
  await ensureAdmin(c);
  const status = c.req.query('status') as repo.CampaignStatus | undefined;
  const surface = c.req.query('surface') as repo.Surface | undefined;
  const supplierId = c.req.query('supplierId') || undefined;
  const opts: { status?: repo.CampaignStatus; surface?: repo.Surface; supplierId?: string } = {};
  if (status) opts.status = status;
  if (surface) opts.surface = surface;
  if (supplierId) opts.supplierId = supplierId;
  const list = await repo.listAllCampaignsFiltered(c.env.DB, opts);
  return c.json(list);
});

router.get('/campaigns/:id', async (c) => {
  await ensureAdmin(c);
  const camp = await repo.getCampaign(c.env.DB, c.req.param('id'));
  if (!camp) throw httpError(404, 'NOT_FOUND', 'Campaign not found');
  return c.json(camp);
});

router.post('/campaigns/:id/approve', async (c) => {
  await ensureAdmin(c);
  const camp = await repo.getCampaign(c.env.DB, c.req.param('id'));
  if (!camp) throw httpError(404, 'NOT_FOUND', 'Campaign not found');
  if (camp.status !== 'pending_approval') {
    throw httpError(409, 'CONFLICT', `Cannot approve campaign in status ${camp.status}`);
  }
  const parsed = adminApproveSchema.safeParse(await c.req.json().catch(() => ({})));
  const now = Math.floor(Date.now() / 1000);
  await repo.updateCampaignStatus(c.env.DB, camp.id, 'pending_payment', now);
  if (parsed.success && parsed.data.adminNotes) {
    await repo.setCampaignAdminNotes(c.env.DB, camp.id, parsed.data.adminNotes);
  }
  // Ensure an invoice exists
  if (!camp.paymentInvoiceId) {
    const slot = await repo.getSlot(c.env.DB, camp.slotId);
    if (slot) {
      const inv: repo.InvoiceRow = {
        id: svc.newId(),
        campaignId: camp.id,
        supplierId: camp.supplierId,
        amountCents: svc.computeInvoiceCents({
          dailyRateCents: slot.dailyRateCents,
          startsAt: camp.startsAt,
          endsAt: camp.endsAt,
        }),
        status: 'pending',
        createdAt: now,
        paidAt: null,
      };
      await repo.insertInvoice(c.env.DB, inv);
      await repo.setCampaignInvoice(c.env.DB, camp.id, inv.id);
    }
  }
  return c.json({ ok: true });
});

router.post('/campaigns/:id/reject', async (c) => {
  await ensureAdmin(c);
  const camp = await repo.getCampaign(c.env.DB, c.req.param('id'));
  if (!camp) throw httpError(404, 'NOT_FOUND', 'Campaign not found');
  if (!['pending_approval', 'pending_payment'].includes(camp.status)) {
    throw httpError(409, 'CONFLICT', `Cannot reject campaign in status ${camp.status}`);
  }
  const parsed = adminRejectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'reason required');
  const now = Math.floor(Date.now() / 1000);
  await repo.updateCampaignStatus(c.env.DB, camp.id, 'rejected', now);
  await repo.setCampaignAdminNotes(c.env.DB, camp.id, `Rejected: ${parsed.data.reason}`);
  return c.json({ ok: true });
});

router.post('/campaigns/:id/revoke', async (c) => {
  await ensureAdmin(c);
  const camp = await repo.getCampaign(c.env.DB, c.req.param('id'));
  if (!camp) throw httpError(404, 'NOT_FOUND', 'Campaign not found');
  if (!['approved', 'live'].includes(camp.status)) {
    throw httpError(409, 'CONFLICT', `Cannot revoke campaign in status ${camp.status}`);
  }
  const parsed = adminRevokeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'reason required');
  const now = Math.floor(Date.now() / 1000);
  await repo.updateCampaignStatus(c.env.DB, camp.id, 'revoked', now);
  await repo.setCampaignAdminNotes(c.env.DB, camp.id, `Revoked: ${parsed.data.reason}`);
  // Compute prorated refund against paid invoice
  if (camp.paymentInvoiceId) {
    const inv = await repo.getInvoice(c.env.DB, camp.paymentInvoiceId);
    if (inv && inv.status === 'paid') {
      const refund = svc.proratedRefundCents({
        totalCents: inv.amountCents,
        startsAt: camp.startsAt,
        endsAt: camp.endsAt,
        now,
      });
      // MVP floor: log refund amount as admin note; actual credit application is admin-driven
      await repo.setCampaignAdminNotes(
        c.env.DB,
        camp.id,
        `Revoked: ${parsed.data.reason} | Refund due: ${refund} cents`,
      );
    }
  }
  return c.json({ ok: true });
});

router.post('/campaigns/:id/pin', async (c) => {
  await ensureAdmin(c);
  const camp = await repo.getCampaign(c.env.DB, c.req.param('id'));
  if (!camp) throw httpError(404, 'NOT_FOUND', 'Campaign not found');
  await repo.setCampaignPinned(c.env.DB, camp.id, camp.pinned === 1 ? 0 : 1);
  return c.json({ ok: true, pinned: camp.pinned === 1 ? 0 : 1 });
});

// -------- Invoices --------

router.post('/invoices/:id/waive', async (c) => {
  await ensureAdmin(c);
  const inv = await repo.getInvoice(c.env.DB, c.req.param('id'));
  if (!inv) throw httpError(404, 'NOT_FOUND', 'Invoice not found');
  if (inv.status === 'paid') {
    throw httpError(409, 'INVOICE_ALREADY_PAID', 'Cannot waive a paid invoice');
  }
  await repo.waiveInvoice(c.env.DB, inv.id);
  return c.json({ ok: true });
});

router.post('/invoices/:id/mark-paid', async (c) => {
  await ensureAdmin(c);
  const inv = await repo.getInvoice(c.env.DB, c.req.param('id'));
  if (!inv) throw httpError(404, 'NOT_FOUND', 'Invoice not found');
  if (inv.status === 'paid') {
    throw httpError(409, 'INVOICE_ALREADY_PAID', 'Invoice already paid');
  }
  const now = Math.floor(Date.now() / 1000);
  await repo.markInvoicePaid(c.env.DB, inv.id, now);
  const camp = await repo.getCampaign(c.env.DB, inv.campaignId);
  if (camp && camp.status === 'pending_payment') {
    await repo.updateCampaignStatus(c.env.DB, camp.id, 'approved', now);
  }
  return c.json({ ok: true });
});

// -------- Analytics --------

router.get('/analytics', async (c) => {
  await ensureAdmin(c);
  const from = Number(c.req.query('from') ?? '0');
  const to = Number(c.req.query('to') ?? Math.floor(Date.now() / 1000).toString());
  // Aggregate from events table filtered by time window; group impressions/clicks
  const events = await c.env.DB
    .prepare(
      'SELECT campaign_id, event_type, COUNT(*) as cnt FROM sponsored_events WHERE occurred_at >= ? AND occurred_at <= ? GROUP BY campaign_id, event_type',
    )
    .bind(from, to)
    .all<{ campaign_id: string; event_type: string; cnt: number }>();
  const byCampaign = new Map<string, { campaignId: string; impressions: number; clicks: number }>();
  for (const row of events.results ?? []) {
    const cur = byCampaign.get(row.campaign_id) ?? { campaignId: row.campaign_id, impressions: 0, clicks: 0 };
    if (row.event_type === 'impression') cur.impressions = row.cnt;
    else cur.clicks = row.cnt;
    byCampaign.set(row.campaign_id, cur);
  }
  return c.json({ analytics: Array.from(byCampaign.values()) });
});

export default router;