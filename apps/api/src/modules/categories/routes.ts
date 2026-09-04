import { Hono } from 'hono';
import { createCategorySchema, updateCategorySchema } from '@vyro/validation/category';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import type { Ctx } from '../../middleware/session';
import {
  createCategory,
  findCategoryById,
  listCategories,
  updateCategory,
} from './repository';

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
  return c.json({ categories: await listCategories(c.env.DB) });
});

router.post('/', session(), requireRole({ admin: true }), async (c) => {
  const parsed = createCategorySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const id = await createCategory(c.env.DB, parsed.data);
  return c.json({ id }, 201);
});

router.patch('/:id', session(), requireRole({ admin: true }), async (c) => {
  const parsed = updateCategorySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const existing = await findCategoryById(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Category not found');
  await updateCategory(c.env.DB, c.req.param('id'), parsed.data);
  return c.json({ ok: true });
});

export default router;
