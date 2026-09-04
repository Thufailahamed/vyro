import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { supplierSettingsPatchSchema } from '@vyro/validation/settings';
import {
  getOrCreateSupplierSettings,
  patchSupplierSettings,
} from './supplierRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/:id/settings', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const id = c.req.param('id');
  const settings = await getOrCreateSupplierSettings(c.env.DB, id, ctx.userId);
  return c.json({ settings });
});

router.patch('/:id/settings', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const id = c.req.param('id');
  const parsed = supplierSettingsPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const updated = await patchSupplierSettings(c.env.DB, id, ctx.userId, parsed.data);
  return c.json({ settings: updated });
});

export default router;
