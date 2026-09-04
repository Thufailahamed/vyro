import { Hono } from 'hono';
import { onboardingBusinessSchema } from '@vyro/validation/business';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import type { Ctx } from '../../middleware/session';
import { onboardBusiness } from './service';
import { findBusinessForUser, listMyBusinesses } from './repository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.post('/', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = onboardingBusinessSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const out = await onboardBusiness(c.env.DB, ctx.userId, parsed.data);
  return c.json(out, 201);
});

router.get('/me', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const rows = await listMyBusinesses(c.env.DB, ctx.userId);
  return c.json({ businesses: rows });
});

router.get('/:id', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const biz = await findBusinessForUser(c.env.DB, c.req.param('id'), ctx.userId);
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');
  return c.json({ business: biz });
});

export default router;
