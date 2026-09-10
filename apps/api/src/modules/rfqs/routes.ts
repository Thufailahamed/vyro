import { Hono } from 'hono';
import { z } from 'zod';
import {
  createRfqSchema, updateRfqSchema, submitQuoteSchema, counterOfferSchema,
  rfqMessageSchema, awardQuoteSchema, rfqThresholdsSchema, createTemplateSchema,
} from '@vyro/validation';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { eq } from 'drizzle-orm';
import { rfqs, rfqItems } from '@vyro/db/schema';
import { hasBusinessAccess, hasSupplierAccess, requireBusinessRole, requireSupplierRole } from '@vyro/auth';
import { rfqService } from './service';
import {
  findRfq, listRfqItems, listRfqInvites, listQuotesForRfq, listQuoteItems, listTiersForItems,
  findQuote, listRfqEvents, listRfqsForBusiness, listRfqsForSupplier, listCounters,
  listVersions, listMessages, messagesSince, listDocuments, listTemplates, listTemplateItems, insertRfqEvent,
} from './repository';

const router = new Hono<{ Bindings: Env }>();

const B_ROLES = ['owner', 'manager', 'purchasing'] as const;
const S_ROLES = ['owner', 'sales', 'operations'] as const;

async function assertBusinessRfq(ctx: Ctx, businessId: string, rfqBusinessId: string, adminOk = true) {
  if (adminOk && ctx.isAdmin) return;
  requireBusinessRole(ctx, businessId, B_ROLES);
  if (businessId !== rfqBusinessId) throw httpError(403, 'FORBIDDEN', 'Cross-business access denied');
}

// ---------- Business: thresholds / qualify ----------
router.post('/qualify', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = rfqThresholdsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  return c.json(await rfqService.qualifies(c.env.DB, parsed.data.cartTotalCents, parsed.data.cartQuantity));
});

router.get('/thresholds', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return c.json(await rfqService.thresholds(c.env.DB));
});

// ---------- Business: CRUD ----------
router.post('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = createRfqSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  requireBusinessRole(ctx, parsed.data.businessId, B_ROLES);
  const out = await rfqService.create(c.env.DB, ctx.userId, parsed.data, c.env.NOTIFICATIONS_QUEUE);
  return c.json(out, 201);
});

router.post('/from-cart', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const body = await c.req.json().catch(() => null) as { businessId?: string; supplierIds?: string[]; title?: string; deadline?: number } | null;
  if (!body?.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  requireBusinessRole(ctx, body.businessId, B_ROLES);
  const out = await rfqService.createFromCart(c.env.DB, ctx.userId, body.businessId, { supplierIds: body.supplierIds, title: body.title, deadline: body.deadline }, c.env.NOTIFICATIONS_QUEUE);
  return c.json(out, 201);
});

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  requireBusinessRole(ctx, businessId, B_ROLES);
  return c.json({ rfqs: await listRfqsForBusiness(c.env.DB, businessId) });
});

router.get('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const isBiz = hasBusinessAccess(ctx, rfq.businessId);
  const isSup = !isBiz && (await isInvitedOrOpen(c.env.DB, rfq.id, ctx));
  if (!isBiz && !isSup && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'No access');
  const items = await listRfqItems(c.env.DB, rfq.id);
  const invites = isBiz || ctx.isAdmin ? await listRfqInvites(c.env.DB, rfq.id) : undefined;
  const events = isBiz || ctx.isAdmin ? await listRfqEvents(c.env.DB, rfq.id) : undefined;
  return c.json({ rfq, items, invites, events });
});

async function isInvitedOrOpen(d1: D1Database, rfqId: string, ctx: Ctx): Promise<boolean> {
  if (!ctx.suppliers?.length) return false;
  const db = getDb(d1);
  const rfq = await findRfq(d1, rfqId);
  if (!rfq) return false;
  const mySupplierIds = ctx.suppliers.map((m) => m.supplierId).filter(Boolean) as string[];
  if (rfq.isOpen && ['open', 'quoting', 'quotes_received', 'under_review'].includes(rfq.status)) {
    return mySupplierIds.some((id) => hasSupplierAccess(ctx, id));
  }
  const { rfqSuppliers: inv } = await import('@vyro/db/schema');
  for (const sid of mySupplierIds) {
    const row = await db.select().from(inv).where(eq(inv.rfqId, rfqId)).all().then((rows) => rows.find((r) => r.supplierId === sid));
    if (row) return true;
  }
  return false;
}

router.patch('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  if (!['draft', 'open'].includes(rfq.status)) throw httpError(409, 'CONFLICT', `Cannot edit ${rfq.status} RFQ`);
  const parsed = updateRfqSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) patch[k] = v;
  if (patch.deadline && (patch.deadline as number) <= Date.now()) throw httpError(400, 'VALIDATION_ERROR', 'Deadline must be in the future');
  await db.update(rfqs).set(patch).where(eq(rfqs.id, rfq.id));
  return c.json({ ok: true });
});

router.post('/:id/publish', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  return c.json(await rfqService.publish(c.env.DB, ctx.userId, rfq.id, ctx.isAdmin ? 'admin' : 'business', c.env.NOTIFICATIONS_QUEUE));
});

router.post('/:id/invite', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  const body = z.object({ supplierIds: z.array(z.string().min(1)).min(1).max(50) }).strict().safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', body.error.flatten());
  return c.json(await rfqService.invite(c.env.DB, ctx.userId, rfq.id, body.data.supplierIds, c.env.NOTIFICATIONS_QUEUE));
});

router.post('/:id/cancel', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  return c.json(await rfqService.cancel(c.env.DB, ctx.userId, rfq.id, ctx.isAdmin ? 'admin' : 'business'));
});

router.post('/:id/close', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  return c.json(await rfqService.close(c.env.DB, ctx.userId, rfq.id));
});

router.post('/:id/reopen', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  const body = z.object({ deadline: z.number().int().positive().optional() }).strict().safeParse(await c.req.json().catch(() => ({})));
  return c.json(await rfqService.reopen(c.env.DB, ctx.userId, rfq.id, body.success ? body.data.deadline : undefined));
});

router.post('/:id/award', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  const parsed = awardQuoteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  return c.json(await rfqService.award(c.env.DB, ctx.userId, rfq.id, parsed.data.quoteId, parsed.data.acceptedAlternativeItemIds ?? [], c.env.NOTIFICATIONS_QUEUE));
});

router.post('/:id/convert', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  return c.json(await rfqService.convertToOrder(c.env.DB, ctx.userId, rfq.id, c.env.NOTIFICATIONS_QUEUE), 201);
});

// ---------- Compare / analytics / discovery / AI ----------
router.get('/:id/compare', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  return c.json(await rfqService.compare(c.env.DB, rfq.id));
});

router.get('/:id/quotes', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const isBiz = hasBusinessAccess(ctx, rfq.businessId);
  if (!isBiz && !ctx.isAdmin) {
    // Supplier: only their own quotes — never competitors'.
    const supplierId = c.req.query('supplierId');
    if (!supplierId || !hasSupplierAccess(ctx, supplierId)) throw httpError(403, 'FORBIDDEN', 'No access');
    const all = await listQuotesForRfq(c.env.DB, rfq.id);
    const mine = all.filter((q) => q.supplierId === supplierId);
    const enriched = [];
    for (const q of mine) {
      const items = await listQuoteItems(c.env.DB, q.id);
      enriched.push({ quote: q, items, tiers: await listTiersForItems(c.env.DB, items.map((i) => i.id)) });
    }
    return c.json({ quotes: enriched });
  }
  const all = await listQuotesForRfq(c.env.DB, rfq.id);
  const enriched = [];
  for (const q of all) {
    const items = await listQuoteItems(c.env.DB, q.id);
    enriched.push({ quote: q, items, tiers: await listTiersForItems(c.env.DB, items.map((i) => i.id)) });
  }
  return c.json({ quotes: enriched });
});

router.get('/:id/suppliers/discover', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  return c.json({ suppliers: await rfqService.discoverSuppliers(c.env.DB, rfq.id) });
});

router.get('/:id/ai-summary', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  return c.json(await rfqService.aiSummary(c.env.DB, rfq.id));
});

router.post('/:id/suggest-negotiation', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  const body = z.object({ targetTotalCents: z.number().int().positive(), quantity: z.number().int().positive().default(1), unit: z.string().max(20).default('kg') }).strict().safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', body.error.flatten());
  return c.json({ suggestion: rfqService.suggestNegotiation(body.data.targetTotalCents, body.data.quantity, body.data.unit) });
});

router.get('/:id/events', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  await assertBusinessRfq(ctx, rfq.businessId, rfq.businessId);
  return c.json({ events: await listRfqEvents(c.env.DB, rfq.id) });
});

router.get('/:id/documents', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const isBiz = hasBusinessAccess(ctx, rfq.businessId);
  if (!isBiz && !ctx.isAdmin && !(await isInvitedOrOpen(c.env.DB, rfq.id, ctx))) throw httpError(403, 'FORBIDDEN', 'No access');
  return c.json({ documents: await listDocuments(c.env.DB, rfq.id) });
});

router.post('/:id/documents', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const body = z.object({ quoteId: z.string().optional(), r2Key: z.string().min(1).max(500), fileName: z.string().min(1).max(255), mimeType: z.string().max(100).optional(), sizeBytes: z.number().int().nonnegative().optional(), kind: z.string().max(50).optional() }).strict().safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', body.error.flatten());
  return c.json(await rfqService.addDocument(c.env.DB, ctx.userId, rfq.id, body.data), 201);
});

// ---------- Messaging ----------
router.get('/:id/messages', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const quoteId = c.req.query('quoteId');
  const isBiz = hasBusinessAccess(ctx, rfq.businessId);
  if (!isBiz && !ctx.isAdmin) {
    if (!quoteId) throw httpError(403, 'FORBIDDEN', 'Supplier must scope messages to own quote');
    const q = await findQuote(c.env.DB, quoteId);
    if (!q || q.rfqId !== rfq.id || !hasSupplierAccess(ctx, q.supplierId)) throw httpError(403, 'FORBIDDEN', 'No access');
    return c.json({ messages: await listMessages(c.env.DB, rfq.id, quoteId) });
  }
  const since = Number(c.req.query('since') ?? 0);
  if (since) return c.json({ messages: await messagesSince(c.env.DB, rfq.id, since) });
  return c.json({ messages: await listMessages(c.env.DB, rfq.id, quoteId) });
});

router.post('/:id/messages', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const rfq = await findRfq(c.env.DB, c.req.param('id'));
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const parsed = rfqMessageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const isBiz = hasBusinessAccess(ctx, rfq.businessId);
  let senderType: 'business' | 'supplier' = 'business';
  if (isBiz) {
    requireBusinessRole(ctx, rfq.businessId, B_ROLES);
  } else if (!ctx.isAdmin) {
    if (!parsed.data.quoteId) throw httpError(400, 'VALIDATION_ERROR', 'quoteId required for suppliers');
    const q = await findQuote(c.env.DB, parsed.data.quoteId);
    if (!q || q.rfqId !== rfq.id) throw httpError(404, 'NOT_FOUND', 'Quote not found');
    requireSupplierRole(ctx, q.supplierId, S_ROLES);
    senderType = 'supplier';
  } else senderType = 'business';
  return c.json(await rfqService.sendMessage(c.env.DB, ctx.userId, senderType, rfq.id, parsed.data.quoteId, parsed.data.message, parsed.data.attachmentR2Key, c.env.NOTIFICATIONS_QUEUE), 201);
});

// ---------- Supplier quote endpoints ----------
router.post('/:id/quote', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = submitQuoteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  // supplierId comes from query param to keep POST body strictly the quote.
  const url = new URL(c.req.url);
  const qSid = url.searchParams.get('supplierId') ?? ctx.suppliers?.[0]?.supplierId;
  if (!qSid) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  requireSupplierRole(ctx, qSid, S_ROLES);
  await rfqService.markViewed(c.env.DB, c.req.param('id'), qSid, c.env.NOTIFICATIONS_QUEUE);
  return c.json(await rfqService.submitQuote(c.env.DB, ctx.userId, c.req.param('id'), qSid, parsed.data, c.env.NOTIFICATIONS_QUEUE), 201);
});

// ---------- Supplier portal: list RFQs ----------
router.get('/supplier/list', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  requireSupplierRole(ctx, supplierId, S_ROLES);
  const { rows, invites } = await listRfqsForSupplier(c.env.DB, supplierId, true);
  const now = Date.now();
  const withMeta = await Promise.all(rows.map(async (r) => {
    const items = await listRfqItems(c.env.DB, r.id);
    const quotes = (await listQuotesForRfq(c.env.DB, r.id)).filter((q) => q.supplierId === supplierId);
    const inv = invites.find((i) => i.rfqId === r.id);
    return {
      rfq: r, itemCount: items.length, myQuotes: quotes.length, myStatus: quotes[0]?.status ?? null,
      inviteStatus: inv?.status ?? (r.isOpen ? 'open' : null),
      expiringSoon: r.deadline != null && r.deadline > now && r.deadline - now < 72 * 3600 * 1000,
    };
  }));
  return c.json({ rfqs: withMeta });
});

router.post('/supplier/view', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const body = z.object({ rfqId: z.string().min(1), supplierId: z.string().min(1) }).strict().safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', body.error.flatten());
  requireSupplierRole(ctx, body.data.supplierId, S_ROLES);
  await rfqService.markViewed(c.env.DB, body.data.rfqId, body.data.supplierId, c.env.NOTIFICATIONS_QUEUE);
  const rfq = await findRfq(c.env.DB, body.data.rfqId);
  return c.json({ rfq, items: await listRfqItems(c.env.DB, body.data.rfqId) });
});

// ---------- Quote detail / history / negotiation ----------
router.get('/quotes/:quoteId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const q = await findQuote(c.env.DB, c.req.param('quoteId'));
  if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
  const rfq = await findRfq(c.env.DB, q.rfqId);
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const isBiz = hasBusinessAccess(ctx, rfq.businessId);
  const isMine = hasSupplierAccess(ctx, q.supplierId);
  if (!isBiz && !isMine && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'No access');
  const items = await listQuoteItems(c.env.DB, q.id);
  return c.json({ quote: q, rfq, items, tiers: await listTiersForItems(c.env.DB, items.map((i) => i.id)) });
});

router.get('/quotes/:quoteId/history', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const q = await findQuote(c.env.DB, c.req.param('quoteId'));
  if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
  const rfq = await findRfq(c.env.DB, q.rfqId);
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const isBiz = hasBusinessAccess(ctx, rfq.businessId);
  const isMine = hasSupplierAccess(ctx, q.supplierId);
  if (!isBiz && !isMine && !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'No access');
  return c.json({ versions: await listVersions(c.env.DB, q.id), counters: await listCounters(c.env.DB, q.id) });
});

router.patch('/quotes/:quoteId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const q = await findQuote(c.env.DB, c.req.param('quoteId'));
  if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
  requireSupplierRole(ctx, q.supplierId, S_ROLES);
  const parsed = submitQuoteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  return c.json(await rfqService.updateQuoteDraft(c.env.DB, ctx.userId, q.id, q.supplierId, parsed.data));
});

router.post('/quotes/:quoteId/submit', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const q = await findQuote(c.env.DB, c.req.param('quoteId'));
  if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
  requireSupplierRole(ctx, q.supplierId, S_ROLES);
  if (q.status !== 'draft' && q.status !== 'withdrawn' && q.status !== 'expired') throw httpError(409, 'CONFLICT', `Cannot submit ${q.status} quote`);
  const db = getDb(c.env.DB);
  await db.update((await import('@vyro/db/schema')).supplierQuotes).set({ status: 'submitted', submittedAt: Date.now(), updatedAt: Date.now() }).where(eq((await import('@vyro/db/schema')).supplierQuotes.id, q.id));
  await insertRfqEvent(c.env.DB, { rfqId: q.rfqId, quoteId: q.id, actorUserId: ctx.userId, action: 'QUOTE_SUBMITTED' });
  return c.json({ ok: true });
});

router.post('/quotes/:quoteId/counter', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const q = await findQuote(c.env.DB, c.req.param('quoteId'));
  if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
  const rfq = await findRfq(c.env.DB, q.rfqId);
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  const parsed = counterOfferSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const isBiz = hasBusinessAccess(ctx, rfq.businessId);
  if (isBiz) {
    requireBusinessRole(ctx, rfq.businessId, B_ROLES);
    return c.json(await rfqService.counter(c.env.DB, ctx.userId, q.id, 'business', { proposedTotalCents: parsed.data.proposedTotalCents, proposedUnitPrices: parsed.data.proposedUnitPrices, message: parsed.data.message }, c.env.NOTIFICATIONS_QUEUE));
  }
  requireSupplierRole(ctx, q.supplierId, S_ROLES);
  return c.json(await rfqService.counter(c.env.DB, ctx.userId, q.id, 'supplier', { proposedTotalCents: parsed.data.proposedTotalCents, proposedUnitPrices: parsed.data.proposedUnitPrices, message: parsed.data.message }, c.env.NOTIFICATIONS_QUEUE));
});

router.post('/counters/:counterId/respond', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const body = z.object({ accept: z.boolean() }).strict().safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', body.error.flatten());
  return c.json(await rfqService.respondCounter(c.env.DB, ctx.userId, c.req.param('counterId'), body.data.accept, c.env.NOTIFICATIONS_QUEUE));
});

router.post('/quotes/:quoteId/request-revision', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const q = await findQuote(c.env.DB, c.req.param('quoteId'));
  if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
  const rfq = await findRfq(c.env.DB, q.rfqId);
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  requireBusinessRole(ctx, rfq.businessId, B_ROLES);
  const body = z.object({ message: z.string().min(1).max(2000) }).strict().safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', body.error.flatten());
  return c.json(await rfqService.requestRevision(c.env.DB, ctx.userId, q.id, body.data.message, c.env.NOTIFICATIONS_QUEUE));
});

router.post('/quotes/:quoteId/withdraw', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const q = await findQuote(c.env.DB, c.req.param('quoteId'));
  if (!q) throw httpError(404, 'NOT_FOUND', 'Quote not found');
  requireSupplierRole(ctx, q.supplierId, S_ROLES);
  if (['accepted', 'rejected'].includes(q.status)) throw httpError(409, 'CONFLICT', `Cannot withdraw ${q.status} quote`);
  const db = getDb(c.env.DB);
  const { supplierQuotes: sq } = await import('@vyro/db/schema');
  await db.update(sq).set({ status: 'withdrawn', updatedAt: Date.now() }).where(eq(sq.id, q.id));
  await insertRfqEvent(c.env.DB, { rfqId: q.rfqId, quoteId: q.id, actorUserId: ctx.userId, action: 'QUOTE_UPDATED', metadata: { withdrawn: true } });
  return c.json({ ok: true });
});

// ---------- Templates ----------
router.post('/templates', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = createTemplateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  requireBusinessRole(ctx, parsed.data.businessId, B_ROLES);
  return c.json(await rfqService.saveTemplate(c.env.DB, ctx.userId, parsed.data), 201);
});

router.get('/templates/list', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  requireBusinessRole(ctx, businessId, B_ROLES);
  return c.json({ templates: await listTemplates(c.env.DB, businessId) });
});

router.get('/templates/:templateId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const items = await listTemplateItems(c.env.DB, c.req.param('templateId'));
  return c.json({ items });
});

router.post('/templates/:templateId/create', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const body = z.object({ deadline: z.number().int().positive().optional(), supplierIds: z.array(z.string()).max(50).optional() }).strict().safeParse(await c.req.json().catch(() => ({})));
  return c.json(await rfqService.createFromTemplate(c.env.DB, ctx.userId, c.req.param('templateId'), body.success ? body.data : {}, c.env.NOTIFICATIONS_QUEUE), 201);
});

// ---------- Dashboards / analytics ----------
router.get('/dashboard/business', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  requireBusinessRole(ctx, businessId, B_ROLES);
  const analytics = await rfqService.analyticsBusiness(c.env.DB, businessId);
  const all = await listRfqsForBusiness(c.env.DB, businessId);
  const now = Date.now();
  return c.json({ ...analytics, expiringSoon: all.filter((r) => r.deadline != null && r.deadline > now && r.deadline - now < 72 * 3600 * 1000).length, recent: all.slice(0, 10) });
});

router.get('/dashboard/supplier', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  requireSupplierRole(ctx, supplierId, S_ROLES);
  return c.json(await rfqService.analyticsSupplier(c.env.DB, supplierId));
});

router.post('/admin/expire', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  if (!ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
  return c.json(await rfqService.expireDue(c.env.DB, c.env.NOTIFICATIONS_QUEUE));
});

void rfqItems;

export default router;
