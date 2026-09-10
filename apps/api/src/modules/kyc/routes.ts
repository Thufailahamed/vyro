import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { sellerKycSubmitBody } from '@vyro/validation';
import * as svc from './service';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/my', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  return c.json(await svc.getMy(c.env.DB, ctx.userId));
});

router.post('/submit', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = sellerKycSubmitBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  return c.json(await svc.submit(c.env.DB, ctx.userId, parsed.data), 201);
});

export default router;
