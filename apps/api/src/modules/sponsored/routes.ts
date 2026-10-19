import { Hono } from 'hono';
import { z } from 'zod';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { requireSupplierRole, SUPPLIER_ROLES } from '@vyro/auth';
import {
  createCampaignSchema,
  updateCampaignSchema,
  subscribePlanSchema,
  sponsorEventSchema,
} from '@vyro/validation';
import * as repo from './repository';
import * as svc from './service';
import { SponsoredError } from './errors';

const FLAG = 'SPONSORED_LISTINGS_ENABLED';

const router = new Hono<{ Bindings: Env }>();

function supplierIdFromQuery(c: any): string {
  const sid = (c.req.query('supplierId') ?? '').trim();
  if (!sid) throw httpError(400, 'VALIDATION_ERROR', 'supplierId query param required');
  return sid;
}

async function ensureSupplierRole(c: any): Promise<{ ctx: Ctx; supplierId: string }> {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const supplierId = supplierIdFromQuery(c);
  try {
    requireSupplierRole(ctx, supplierId, SUPPLIER_ROLES);
  } catch (e: any) {
    throw httpError(403, 'FORBIDDEN', e?.message ?? 'Not a supplier member');
  }
  return { ctx, supplierId };
}

// -------- Public (no auth) — flag-gated only --------

router.get('/sponsored/disclosure', async (c) => {
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) {
    throw httpError(404, 'FEATURE_DISABLED', 'Sponsored listings disabled');
  }
  return c.json(svc.getDisclosure());
});

router.post('/sponsored/events', async (c) => {
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) {
    throw httpError(404, 'FEATURE_DISABLED', 'Sponsored listings disabled');
  }
  const parsed = sponsorEventSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid event', parsed.error.flatten());
  }
  try {
    await repo.insertEvent(c.env.DB, {
      id: svc.newId(),
      campaignId: parsed.data.campaignId,
      eventType: parsed.data.eventType,
      surface: parsed.data.surface,
      occurredAt: Math.floor(Date.now() / 1000),
      requestId: parsed.data.requestId,
      userIdHash: null,
    });
    return c.json({ ok: true });
  } catch (e: any) {
    // UNIQUE request_id → dedupe OK
    if (String(e?.message ?? '').includes('UNIQUE')) {
      return c.json({ ok: true, deduped: true });
    }
    throw e;
  }
});

router.get('/sponsored/resolve/:surface', async (c) => {
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) {
    throw httpError(404, 'FEATURE_DISABLED', 'Sponsored listings disabled');
  }
  const surface = c.req.param('surface') as repo.Surface;
  const categoryId = c.req.query('categoryId') || null;
  if (!['search', 'category', 'homepage', 'storefront'].includes(surface)) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid surface');
  }
  const slots = await svc.resolveSlots(c.env.DB, surface, categoryId, Math.floor(Date.now() / 1000));
  return c.json({ sponsored: slots });
});

// -------- Supplier (role-gated) --------

router.use('/supplier/sponsored/*', session());
router.use('/supplier/sponsored/*', async (c, next) => {
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) {
    throw httpError(404, 'FEATURE_DISABLED', 'Sponsored listings disabled');
  }
  await next();
});

router.get('/supplier/sponsored/plans', async (c) => {
  await ensureSupplierRole(c);
  const plans = await repo.listActivePlans(c.env.DB);
  return c.json(plans);
});

router.post('/supplier/sponsored/subscriptions', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const parsed = subscribePlanSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const plan = await repo.getPlan(c.env.DB, parsed.data.planId);
  if (!plan) throw httpError(404, 'NOT_FOUND', 'Plan not found');
  const now = Math.floor(Date.now() / 1000);
  const sub: repo.SubscriptionRow = {
    id: svc.newId(),
    supplierId,
    planId: plan.id,
    startsAt: now,
    endsAt: now + 30 * 86400,
    status: 'active',
    slotCreditsRemaining: plan.includedSlotCredits,
    createdAt: now,
  };
  await repo.insertSubscription(c.env.DB, sub);
  return c.json(sub, 201);
});

router.get('/supplier/sponsored/subscriptions/me', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const list = await repo.listSubscriptionsBySupplier(c.env.DB, supplierId, 'active');
  return c.json(list[0] ?? null);
});

router.delete('/supplier/sponsored/subscriptions/:id', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const id = c.req.param('id');
  const sub = await repo.getSubscription(c.env.DB, id);
  if (!sub || sub.supplierId !== supplierId) {
    throw httpError(404, 'NOT_FOUND', 'Subscription not found');
  }
  await repo.cancelSubscription(c.env.DB, id, Math.floor(Date.now() / 1000));
  return c.json({ ok: true });
});

router.get('/supplier/sponsored/slots', async (c) => {
  await ensureSupplierRole(c);
  const surface = c.req.query('surface') as repo.Surface | undefined;
  const categoryId = c.req.query('categoryId') || null;
  if (!surface || !['search', 'category', 'homepage', 'storefront'].includes(surface)) {
    throw httpError(400, 'VALIDATION_ERROR', 'surface query required');
  }
  const slots = await repo.listSlotsForSurface(c.env.DB, surface, categoryId);
  return c.json(slots);
});

router.post('/supplier/sponsored/campaigns', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const parsed = createCampaignSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    if (parsed.error.errors.some((e) => e.message === 'endsAt must be after startsAt')) {
      throw httpError(422, 'INVALID_DATE_RANGE', 'endsAt must be after startsAt');
    }
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  }
  try {
    await svc.checkEligibility(c.env.DB, supplierId, parsed.data.slotId);
  } catch (e) {
    if (e instanceof SponsoredError) throw e.toHttp();
    throw e;
  }
  const slot = await repo.getSlot(c.env.DB, parsed.data.slotId);
  if (!slot) throw httpError(404, 'NOT_FOUND', 'Slot not found');
  const now = Math.floor(Date.now() / 1000);
  const amountCents = svc.computeInvoiceCents({
    dailyRateCents: slot.dailyRateCents,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
  });
  const campaignId = svc.newId();
  const invoice: repo.InvoiceRow = {
    id: svc.newId(),
    campaignId,
    supplierId,
    amountCents,
    status: 'pending',
    paymentReference: null,
    createdAt: now,
    paidAt: null,
  };
  await repo.insertInvoice(c.env.DB, invoice);
  const campaign: repo.CampaignRow = {
    id: campaignId,
    supplierId,
    slotId: parsed.data.slotId,
    productId: parsed.data.productId,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    status: 'pending_approval',
    paymentInvoiceId: invoice.id,
    adminNotes: null,
    pinned: 0,
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertCampaign(c.env.DB, campaign);
  return c.json({ campaign, invoice }, 201);
});

router.get('/supplier/sponsored/campaigns', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const status = c.req.query('status') as repo.CampaignStatus | undefined;
  const list = await repo.listCampaignsBySupplier(c.env.DB, supplierId, status);
  return c.json(list);
});

router.get('/supplier/sponsored/campaigns/:id', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const camp = await repo.getCampaign(c.env.DB, c.req.param('id'));
  if (!camp || camp.supplierId !== supplierId) {
    throw httpError(404, 'NOT_FOUND', 'Campaign not found');
  }
  return c.json(camp);
});

router.patch('/supplier/sponsored/campaigns/:id', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const camp = await repo.getCampaign(c.env.DB, c.req.param('id'));
  if (!camp || camp.supplierId !== supplierId) {
    throw httpError(404, 'NOT_FOUND', 'Campaign not found');
  }
  if (!['pending_approval', 'pending_payment', 'approved'].includes(camp.status)) {
    throw httpError(409, 'CAMPAIGN_NOT_EDITABLE', `Cannot edit campaign in status ${camp.status}`);
  }
  const parsed = updateCampaignSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    if (parsed.error.errors.some((e) => e.message === 'endsAt must be after startsAt')) {
      throw httpError(422, 'INVALID_DATE_RANGE', 'endsAt must be after startsAt');
    }
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  }
  const startsAt = parsed.data.startsAt ?? camp.startsAt;
  const endsAt = parsed.data.endsAt ?? camp.endsAt;
  await repo.updateCampaignDates(c.env.DB, camp.id, startsAt, endsAt, Math.floor(Date.now() / 1000));
  return c.json({ ok: true });
});

router.delete('/supplier/sponsored/campaigns/:id', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const camp = await repo.getCampaign(c.env.DB, c.req.param('id'));
  if (!camp || camp.supplierId !== supplierId) {
    throw httpError(404, 'NOT_FOUND', 'Campaign not found');
  }
  if (['live', 'expired', 'rejected', 'revoked', 'cancelled'].includes(camp.status)) {
    throw httpError(409, 'CAMPAIGN_NOT_CANCELABLE', `Cannot cancel campaign in status ${camp.status}`);
  }
  const now = Math.floor(Date.now() / 1000);
  await repo.updateCampaignStatus(c.env.DB, camp.id, 'cancelled', now);
  if (camp.paymentInvoiceId) {
    const inv = await repo.getInvoice(c.env.DB, camp.paymentInvoiceId);
    if (inv && inv.status === 'pending') {
      // void the invoice: simplest = waive (admin-issued, no longer owed)
      await repo.waiveInvoice(c.env.DB, inv.id);
    }
  }
  return c.json({ ok: true });
});

router.get('/supplier/sponsored/invoices', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const status = c.req.query('status') as repo.InvoiceStatus | undefined;
  const list = await repo.listInvoicesBySupplier(c.env.DB, supplierId, status);
  return c.json(list);
});

/**
 * Supplier submits proof of payment. The invoice moves to 'submitted' and the
 * campaign is NOT released — only an admin, after verifying the transfer, can
 * mark the invoice paid (which approves the campaign). Letting the supplier
 * mark their own invoice paid and approve the campaign gave away paid
 * placement for free.
 */
router.post('/supplier/sponsored/invoices/:id/pay', async (c) => {
  const { supplierId, ctx } = await ensureSupplierRole(c);
  const body = z
    .object({ reference: z.string().min(3).max(120) })
    .strict()
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'A payment reference is required', body.error.flatten());
  const inv = await repo.getInvoice(c.env.DB, c.req.param('id'));
  if (!inv || inv.supplierId !== supplierId) {
    throw httpError(404, 'NOT_FOUND', 'Invoice not found');
  }
  if (inv.status === 'paid') {
    throw httpError(409, 'INVOICE_ALREADY_PAID', 'Invoice already paid');
  }
  if (inv.status === 'waived') {
    throw httpError(409, 'CONFLICT', 'Invoice was waived — no payment is due');
  }
  await repo.submitInvoicePaymentProof(c.env.DB, inv.id, body.data.reference.trim());
  await repo.recordSponsoredAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'sponsored.invoice.payment_proof_submitted',
    resourceType: 'sponsored_invoice',
    resourceId: inv.id,
    metadata: { supplierId, amountCents: inv.amountCents, reference: body.data.reference.trim() },
  });
  return c.json({ ok: true, status: 'submitted' as const });
});

export default router;