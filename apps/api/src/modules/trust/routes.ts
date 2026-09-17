import { Hono } from 'hono';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { getTrustSignalView, recomputeForSupplier } from './service';
import { trustRepository } from './repository';

const FLAG = 'TRUST_SIGNALS_ENABLED';
const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/signals/:supplierId', async (c) => {
  const supplierId = c.req.param('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'Missing supplierId');
  const row = await trustRepository.getBySupplierId(c.env.DB, supplierId);
  return c.json({
    raw: row,
    view: await getTrustSignalView(c.env.DB, supplierId),
    flagEnabled: await isFeatureEnabled(c.env.DB, FLAG),
  });
});

router.post('/signals/:supplierId/recompute', async (c) => {
  const supplierId = c.req.param('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'Missing supplierId');
  await recomputeForSupplier(c.env.DB, supplierId, Date.now());
  return c.json({
    ok: true,
    view: await getTrustSignalView(c.env.DB, supplierId),
  });
});

export default router;
