import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { businesses } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';
import { session } from '../../middleware/session';
import { requireBusinessPaymentRole } from '../payments/membership';
import { recordAudit } from '../supplierProducts/repository';
import { savedCardsRepository } from './repository';

const router = new Hono<{ Bindings: Env }>();

/** GET /api/payments/saved-cards?businessId=… — the business's cards on file. */
router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as { userId: string; isAdmin: boolean } | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId') ?? '';
  const db = getDb(c.env.DB);
  const biz = (await db.select().from(businesses).where(eq(businesses.id, businessId)).get()) as any;
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');
  if (!ctx.isAdmin) {
    try {
      await requireBusinessPaymentRole(c.env.DB, businessId, ctx.userId);
    } catch {
      throw httpError(403, 'FORBIDDEN', 'Insufficient role');
    }
  }
  const cards = await savedCardsRepository.listForBusiness(c.env.DB, businessId);
  return c.json({
    cards: cards.map((card) => ({
      id: card.id,
      brand: card.brand,
      last4: card.last4,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      createdAt: card.createdAt,
    })),
  });
});

/** DELETE /api/payments/saved-cards/:id — forget a saved card. */
router.delete('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as { userId: string; isAdmin: boolean } | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const card = await savedCardsRepository.getById(c.env.DB, c.req.param('id'));
  if (!card) throw httpError(404, 'NOT_FOUND', 'Card not found');
  if (!ctx.isAdmin) {
    try {
      await requireBusinessPaymentRole(c.env.DB, card.businessId, ctx.userId);
    } catch {
      throw httpError(403, 'FORBIDDEN', 'Insufficient role');
    }
  }
  const ok = await savedCardsRepository.remove(c.env.DB, c.req.param('id'), card.businessId);
  if (!ok) throw httpError(409, 'CONFLICT', 'Card already removed');
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'SAVED_CARD_DELETED',
    resourceType: 'saved_card',
    resourceId: c.req.param('id'),
    metadata: { businessId: card.businessId },
  });
  return c.json({ ok: true });
});

export default router;
