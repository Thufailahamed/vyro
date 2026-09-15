import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { requireSupplierRole } from '@vyro/auth';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { repeatOffers } from './service';
import { REPEAT_OFFER_FLAG } from './constants';

const router = new Hono<{ Bindings: Env }>();
const S_ROLES = ['owner', 'sales', 'operations'] as const;

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

async function ensureEnabled(d1: D1Database): Promise<void> {
  if (!(await isFeatureEnabled(d1, REPEAT_OFFER_FLAG))) {
    throw httpError(404, 'NOT_FOUND', 'feature not enabled');
  }
}

router.use('*', session());
router.use('*', async (c, next) => {
  await ensureEnabled(c.env.DB);
  await next();
});

router.get('/analytics', async (c) => {
  const ctx = ctxOf(c);
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  requireSupplierRole(ctx, supplierId, S_ROLES);
  const analytics = await repeatOffers.analyticsForSupplier(c.env.DB, supplierId);
  return c.json(analytics);
});

export default router;
