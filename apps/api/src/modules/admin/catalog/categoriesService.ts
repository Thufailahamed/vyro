import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import * as repo from './categoriesRepository';

export async function listCategories(d1: D1Database) {
  return repo.listCategoriesTree(d1);
}

export async function createCategory(
  ctx: Context,
  data: { slug: string; name: string; parentId: string | null; sortOrder: number },
) {
  const d1 = ctx.env.DB as D1Database;
  const id = randomUUID();
  const created = await repo.createCategory(d1, { id, ...data });
  await auditAdmin({
    ctx,
    action: 'category.create',
    target: { type: 'category', id },
    after: created,
  });
  return created;
}

export async function updateCategory(
  ctx: Context,
  id: string,
  patch: Partial<{ name: string; parentId: string | null; sortOrder: number; active: boolean }>,
) {
  const d1 = ctx.env.DB as D1Database;
  if (patch.parentId !== undefined && patch.parentId !== null) {
    const cycle = await repo.isDescendantOf(d1, patch.parentId, id);
    if (cycle) throw httpError(400, 'CATEGORY_CYCLE', 'Cannot reparent into own descendant');
  }
  const out = await repo.updateCategory(d1, id, patch);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Category not found');
  await auditAdmin({
    ctx,
    action: 'category.update',
    target: { type: 'category', id },
    before: out.before,
    after: out.after,
  });
  return out.after;
}

export async function softDeleteCategory(ctx: Context, id: string) {
  const d1 = ctx.env.DB as D1Database;
  if (await repo.hasActiveChildren(d1, id)) {
    throw httpError(409, 'CATEGORY_HAS_CHILDREN', 'Category has active children');
  }
  const out = await repo.softDeleteCategory(d1, id);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Category not found');
  await auditAdmin({
    ctx,
    action: 'category.delete',
    target: { type: 'category', id },
    before: { active: true },
    after: { active: false },
  });
  return out;
}
