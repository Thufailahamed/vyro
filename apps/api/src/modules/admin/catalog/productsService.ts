import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import * as repo from './productsRepository';

export type AdminProductPatch = Parameters<typeof repo.updateProduct>[2];

export async function listProducts(d1: D1Database, opts: Parameters<typeof repo.listProducts>[1]) {
  return repo.listProducts(d1, opts);
}

export async function getProduct(d1: D1Database, id: string) {
  const out = await repo.getProduct(d1, id);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Product not found');
  const audit = await repo.lastAuditForProduct(d1, id);
  return { ...out, audit };
}

export async function updateProduct(
  ctx: Context,
  id: string,
  patch: AdminProductPatch & { expectedUpdatedAt?: number },
) {
  const before = await repo.getProduct(d1FromCtx(ctx), id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Product not found');
  if (patch.expectedUpdatedAt !== undefined && before.product.updatedAt !== patch.expectedUpdatedAt) {
    throw httpError(409, 'STALE_WRITE', 'Product was updated by another actor');
  }
  const { expectedUpdatedAt: _ignored, ...rest } = patch;
  void _ignored;
  const out = await repo.updateProduct(d1FromCtx(ctx), id, rest);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Product not found');
  await auditAdmin({
    ctx,
    action: 'product.update',
    target: { type: 'product', id },
    before: out.before,
    after: out.after,
  });
  return out.after;
}

export async function toggleFeatured(
  ctx: Context,
  id: string,
  featured: boolean,
) {
  const d1 = d1FromCtx(ctx);
  const before = await repo.getProduct(d1, id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Product not found');
  const out = await repo.updateProduct(d1, id, { featured });
  if (!out) throw httpError(404, 'NOT_FOUND', 'Product not found');
  await auditAdmin({
    ctx,
    action: 'product.feature',
    target: { type: 'product', id },
    before: { featured: out.before.featured },
    after: { featured: out.after.featured },
  });
  return out.after;
}

function d1FromCtx(ctx: Context): D1Database {
  return ctx.env.DB as D1Database;
}
