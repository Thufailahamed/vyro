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

router.get('/suppliers/by-slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  const supplier = await repo.findBySlug(c.env.DB, slug);
  if (!supplier) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  if (supplier.verificationStatus !== 'verified') {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const offers = await repo.listPublishedOffersBySupplierId(c.env.DB, supplier.id);
  const { trustSealRepository } = await import('../trustSeal/repository');
  const trustMap = await trustSealRepository.batchStatus(c.env.DB, [supplier.id]);
  const trust = trustMap.get(supplier.id);
  return c.json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      slug: supplier.slug,
      city: supplier.city,
      district: supplier.district,
      verificationStatus: supplier.verificationStatus,
      businessTypeName: supplier.businessTypeName ?? null,
      ratingCount: supplier.reviewCount ?? 0,
      ratingAvg: supplier.reviewAvg ? supplier.reviewAvg / 100 : null,
      trustSealed: trust?.trustSealed ?? false,
      trustSealExpiresAt: trust?.trustSealExpiresAt ?? null,
      memberSinceYear: trust?.memberSinceYear ?? null,
    },
    offers,
  });
});

export default router;
