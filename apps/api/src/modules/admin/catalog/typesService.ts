import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import * as repo from './typesRepository';

export async function listBusinessTypes(d1: D1Database) {
  return repo.listBusinessTypes(d1);
}

export async function createBusinessType(ctx: Context, data: { slug: string; name: string }) {
  const d1 = ctx.env.DB as D1Database;
  const id = randomUUID();
  const created = await repo.createBusinessType(d1, { id, slug: data.slug, name: data.name, active: true });
  await auditAdmin({
    ctx,
    action: 'business_type.create',
    target: { type: 'business_type', id },
    after: created,
  });
  return created;
}

export async function updateBusinessType(
  ctx: Context,
  id: string,
  patch: Partial<{ name: string; active: boolean }>,
) {
  const d1 = ctx.env.DB as D1Database;
  const out = await repo.updateBusinessType(d1, id, patch);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Business type not found');
  await auditAdmin({
    ctx,
    action: 'business_type.update',
    target: { type: 'business_type', id },
    before: out.before,
    after: out.after,
  });
  return out.after;
}

export async function softDeleteBusinessType(ctx: Context, id: string) {
  const d1 = ctx.env.DB as D1Database;
  if (
    (await repo.businessesUsingType(d1, id)) ||
    (await repo.suppliersUsingType(d1, id))
  ) {
    throw httpError(409, 'TYPE_IN_USE', 'Type is referenced by active business or supplier');
  }
  const out = await repo.softDeleteBusinessType(d1, id);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Business type not found');
  await auditAdmin({
    ctx,
    action: 'business_type.delete',
    target: { type: 'business_type', id },
    before: { active: true },
    after: { active: false },
  });
  return out;
}
