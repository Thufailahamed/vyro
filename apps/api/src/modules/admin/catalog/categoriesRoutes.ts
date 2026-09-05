import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import {
  adminCategoryCreateBody,
  adminCategoryUpdateBody,
  adminCategoryIdParam,
} from '@vyro/validation';
import * as svc from './categoriesService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('category:read'), async (c) => {
  return c.json(await svc.listCategories(c.env.DB));
});

router.post('/', requirePermission('category:write'), async (c) => {
  const body = adminCategoryCreateBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  const created = await svc.createCategory(c, {
    slug: body.data.slug,
    name: body.data.name,
    parentId: body.data.parentId ?? null,
    sortOrder: body.data.sortOrder ?? 0,
  });
  return c.json(created, 201);
});

router.patch('/:id', requirePermission('category:write'), async (c) => {
  const param = adminCategoryIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminCategoryUpdateBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.updateCategory(c, param.data.id, {
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.parentId !== undefined ? { parentId: body.data.parentId } : {}),
      ...(body.data.sortOrder !== undefined ? { sortOrder: body.data.sortOrder } : {}),
      ...(body.data.active !== undefined ? { active: body.data.active } : {}),
    }),
  );
});

router.delete('/:id', requirePermission('category:write'), async (c) => {
  const param = adminCategoryIdParam.safeParse(c.req.param());
  if (!param.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.softDeleteCategory(c, param.data.id));
});

export default router;
