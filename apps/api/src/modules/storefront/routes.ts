import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import type { Env } from '../../env';
import { httpError } from '../../lib/errors';
import { updateSupplierSlugSchema } from '@vyro/validation';
import * as repo from './repository';

const router = new Hono<{ Bindings: Env }>();

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

router.patch('/suppliers/me/slug', async (c) => {
  const ctx = ctxOf(c);
  const supplierId = ctx.suppliers?.[0]?.supplierId;
  if (!supplierId) throw httpError(403, 'FORBIDDEN', 'Supplier only');
  const parsed = updateSupplierSlugSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid slug', parsed.error.flatten());
  const existing = await repo.findBySlug(c.env.DB, parsed.data.slug);
  if (existing && existing.id !== supplierId) {
    throw httpError(409, 'CONFLICT', 'Slug taken');
  }
  const updated = await repo.updateSupplierSlug(c.env.DB, supplierId, parsed.data.slug);
  return c.json({ slug: updated?.slug ?? parsed.data.slug });
});

export default router;
