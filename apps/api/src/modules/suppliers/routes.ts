import { Hono } from 'hono';
import { onboardingSupplierSchema } from '@vyro/validation/supplier';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import type { Ctx } from '../../middleware/session';
import { onboardSupplier } from './service';
import { findBusinessTypeBySlug, listBusinessTypes } from '../businesses/repository';
import { findSupplierById, listMySuppliers } from './repository';

const router = new Hono<{ Bindings: Env }>();

// Public endpoint to retrieve active supplier categories/types
router.get('/types', async (c) => {
  const types = await listBusinessTypes(c.env.DB);
  return c.json({ types });
});

const handleSupplierOnboard = async (c: any) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = onboardingSupplierSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const out = await onboardSupplier(c.env.DB, ctx.userId, parsed.data);
  return c.json(out, 201);
};

router.post('/', session(), handleSupplierOnboard);
router.post('/onboard', session(), handleSupplierOnboard);

router.get('/me', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  return c.json({ suppliers: await listMySuppliers(c.env.DB, ctx.userId) });
});

router.get('/:id', async (c) => {
  const row = await findSupplierById(c.env.DB, c.req.param('id'));
  if (!row) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  return c.json({ supplier: row });
});

export default router;
