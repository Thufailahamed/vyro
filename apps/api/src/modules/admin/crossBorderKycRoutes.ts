import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { submitBuyerKyc, reviewBuyerKyc, listPendingKycBusinesses } from '../kyc/buyerKyc';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session());

router.get('/queue', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx || ctx.role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Admin role required');
  const rows = await listPendingKycBusinesses(c.env);
  return c.json({ businesses: rows });
});

const submitSchema = z.object({
  level: z.enum(['basic', 'enhanced']),
  documentUrls: z.array(z.string().url()).min(1),
});

router.post('/:businessId/submit', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx || !ctx.businessId) throw httpError(401, 'UNAUTHORIZED', 'Buyer session required');
  if (ctx.businessId !== c.req.param('businessId')) throw httpError(403, 'FORBIDDEN', 'Cannot submit KYC for another business');
  const parsed = submitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await submitBuyerKyc({
    env: c.env,
    businessId: ctx.businessId,
    level: parsed.data.level,
    documentUrls: parsed.data.documentUrls,
    submittedBy: ctx.userId,
  });
  return c.json({ ok: true });
});

const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  level: z.enum(['basic', 'enhanced']).optional(),
});

router.post('/:businessId/review', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx || ctx.role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Admin role required');
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await reviewBuyerKyc({
    env: c.env,
    businessId: c.req.param('businessId'),
    decision: parsed.data.decision,
    level: parsed.data.level,
    adminUserId: ctx.userId,
  });
  return c.json({ ok: true });
});

export default router;
