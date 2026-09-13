import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requirePermission } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { submitBuyerKyc, reviewBuyerKyc, listPendingKycBusinesses } from '../kyc/buyerKyc';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session());

router.get('/queue', requirePermission('kyc:review'), async (c) => {
  const rows = await listPendingKycBusinesses(c.env);
  return c.json({ businesses: rows });
});

const submitSchema = z.object({
  level: z.enum(['basic', 'enhanced']),
  documentUrls: z.array(z.string().url()).min(1),
});

router.post('/:businessId/submit', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'Buyer session required');
  const paramBizId = c.req.param('businessId');
  if (!paramBizId) throw httpError(400, 'VALIDATION_ERROR', 'Missing businessId');
  const memberBiz = ctx.businesses.find((m) => m.businessId === paramBizId);
  if (!memberBiz?.businessId) throw httpError(403, 'FORBIDDEN', 'Not a member of this business');
  const parsed = submitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await submitBuyerKyc({
    env: c.env,
    businessId: memberBiz.businessId,
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

router.post('/:businessId/review', requirePermission('kyc:review'), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'Admin session required');
  const parsed = reviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const paramBizId = c.req.param('businessId');
  if (!paramBizId) throw httpError(400, 'VALIDATION_ERROR', 'Missing businessId');
  await reviewBuyerKyc({
    env: c.env,
    businessId: paramBizId,
    decision: parsed.data.decision,
    ...(parsed.data.level ? { level: parsed.data.level } : {}),
    adminUserId: ctx.userId,
  });
  return c.json({ ok: true });
});

export default router;
