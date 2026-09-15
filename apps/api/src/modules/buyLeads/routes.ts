import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { requireSupplierRole } from '@vyro/auth';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { buyLeadsSubscriptionSchema } from '@vyro/validation';
import { buyLeads } from './service';

const router = new Hono<{ Bindings: Env }>();
const S_ROLES = ['owner', 'sales', 'operations'] as const;
const FLAG = 'BUYLEADS_ENABLED';

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

async function ensureEnabled(d1: D1Database): Promise<void> {
  if (!(await isFeatureEnabled(d1, FLAG))) {
    throw httpError(404, 'NOT_FOUND', 'feature not enabled');
  }
}

function requireSupplier(c: {
  req: { query: (k: string) => string | undefined };
  get: (k: string) => unknown;
}): { supplierId: string } {
  const ctx = ctxOf(c);
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  requireSupplierRole(ctx, supplierId, S_ROLES);
  return { supplierId };
}

router.use('*', session());
router.use('*', async (c, next) => {
  await ensureEnabled(c.env.DB);
  await next();
});

router.get('/', async (c) => {
  const { supplierId } = requireSupplier(c);
  const sub = await buyLeads.getMySubscription(c.env.DB, supplierId);
  return c.json(sub);
});

router.put('/', async (c) => {
  const { supplierId } = requireSupplier(c);
  const body = buyLeadsSubscriptionSchema.parse(await c.req.json().catch(() => null));
  const sub = await buyLeads.updateMySubscription(c.env.DB, supplierId, body);
  return c.json(sub);
});

export default router;
