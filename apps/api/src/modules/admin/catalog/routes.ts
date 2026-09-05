import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import {
  adminProductListQuery,
  adminProductPatchBody,
  adminProductIdParam,
} from '@vyro/validation';
import { z } from 'zod';
import * as svc from './productsService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('product:read'), async (c) => {
  const parsed = adminProductListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  const out = await svc.listProducts(c.env.DB, parsed.data);
  return c.json(out);
});

router.get('/:id', requirePermission('product:read'), async (c) => {
  const parsed = adminProductIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.getProduct(c.env.DB, parsed.data.id));
});

router.patch('/:id', requirePermission('product:moderate'), async (c) => {
  const param = adminProductIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminProductPatchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  const patch: Parameters<typeof svc.updateProduct>[2] = {};
  if (body.data.name !== undefined) patch.name = body.data.name;
  if (body.data.description !== undefined) patch.description = body.data.description;
  if (body.data.categoryId !== undefined) patch.categoryId = body.data.categoryId;
  if (body.data.brand !== undefined) patch.brand = body.data.brand;
  if (body.data.unit !== undefined) patch.unit = body.data.unit;
  if (body.data.packSize !== undefined) patch.packSize = body.data.packSize;
  if (body.data.active !== undefined) patch.active = body.data.active;
  if (body.data.featured !== undefined) patch.featured = body.data.featured;
  if (body.data.moderationNotes !== undefined) patch.moderationNotes = body.data.moderationNotes;
  if (body.data.expectedUpdatedAt !== undefined) patch.expectedUpdatedAt = body.data.expectedUpdatedAt;
  const updated = await svc.updateProduct(c, param.data.id, patch);
  return c.json(updated);
});

const featureBody = z.object({ featured: z.boolean() }).strict();
router.post('/:id/feature', requirePermission('product:moderate'), async (c) => {
  const param = adminProductIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = featureBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  const updated = await svc.toggleFeatured(c, param.data.id, body.data.featured);
  return c.json(updated);
});

export default router;
