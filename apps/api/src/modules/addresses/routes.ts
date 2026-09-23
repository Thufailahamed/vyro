import { Hono } from 'hono';
import { requireBusinessRole } from '@vyro/auth';
import {
  businessAddressCreateSchema,
  businessAddressPatchSchema,
} from '@vyro/validation/wholesale';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { createAddress, deleteAddress, findAddress, listAddresses, updateAddress } from './repository';

/** Mounted at /api/businesses → /api/businesses/:businessId/addresses */
const router = new Hono<{ Bindings: Env }>();

const READ_ROLES = ['owner', 'manager', 'purchasing', 'accountant'] as const;
const WRITE_ROLES = ['owner', 'manager'] as const;

router.use('/:businessId/addresses/*', session());
router.use('/:businessId/addresses', session());

router.get('/:businessId/addresses', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const businessId = c.req.param('businessId');
  requireBusinessRole(ctx, businessId, READ_ROLES);
  return c.json({ addresses: await listAddresses(c.env.DB, businessId) });
});

router.post('/:businessId/addresses', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const businessId = c.req.param('businessId');
  requireBusinessRole(ctx, businessId, WRITE_ROLES);
  const parsed = businessAddressCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  if ((await listAddresses(c.env.DB, businessId)).length >= 50) {
    throw httpError(409, 'CONFLICT', 'Address book is full (50). Remove an address first.');
  }
  const address = await createAddress(c.env.DB, businessId, parsed.data);
  return c.json({ address }, 201);
});

router.patch('/:businessId/addresses/:id', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const businessId = c.req.param('businessId');
  requireBusinessRole(ctx, businessId, WRITE_ROLES);
  const parsed = businessAddressPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const current = await findAddress(c.env.DB, businessId, c.req.param('id'));
  if (!current) throw httpError(404, 'NOT_FOUND', 'Address not found');
  const address = await updateAddress(c.env.DB, current, parsed.data);
  return c.json({ address });
});

router.delete('/:businessId/addresses/:id', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const businessId = c.req.param('businessId');
  requireBusinessRole(ctx, businessId, WRITE_ROLES);
  const current = await findAddress(c.env.DB, businessId, c.req.param('id'));
  if (!current) throw httpError(404, 'NOT_FOUND', 'Address not found');
  await deleteAddress(c.env.DB, current);
  return c.json({ ok: true });
});

export default router;
