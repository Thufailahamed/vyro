import { Hono } from 'hono';
import { z } from 'zod';
import { createProductSchema, updateProductSchema } from '@vyro/validation/product';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { productImages } from '@vyro/db/schema';
import { sql } from 'drizzle-orm';
import {
  addProductImage,
  createProduct,
  findCategoryById,
  findProductById,
  hasOfferForProduct,
  listProductImages,
  listProducts,
  nextProductImageSortOrder,
  removeProductImage,
  softDeleteProduct,
  updateProduct,
} from './repository';

const router = new Hono<{ Bindings: Env }>();

const addImageSchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.string().regex(/^image\/(png|jpe?g|webp|gif)$/),
    base64: z.string().min(1),
    sortOrder: z.number().int().optional(),
    altText: z.string().max(255).optional(),
  })
  .strict();

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * The catalog is shared: many suppliers may list the same product. A supplier
 * may only write to a catalog row they created or already list an offer for.
 * Without this, any supplier could rename/reprice another supplier's product.
 */
async function assertProductWriteAccess(
  c: { env: Env; req: { param(k: string): string | undefined } },
  ctx: Ctx,
  productId: string,
) {
  if (ctx.isAdmin) return;
  const supplierIds = (ctx.suppliers ?? [])
    .map((m) => m.supplierId)
    .filter((s): s is string => Boolean(s));
  if (supplierIds.length === 0) {
    throw httpError(403, 'FORBIDDEN', 'Supplier or Admin role required');
  }
  const existing = await findProductById(c.env.DB, productId);
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Product not found');
  if (existing.createdByUserId && existing.createdByUserId === ctx.userId) return;
  for (const sid of supplierIds) {
    if (await hasOfferForProduct(c.env.DB, sid, productId)) return;
  }
  throw httpError(403, 'FORBIDDEN', 'You do not list this product');
}

export function resolveImageUrl(r2Key: string): string {
  if (r2Key.startsWith('http://') || r2Key.startsWith('https://')) return r2Key;
  return `/api/products/images/${r2Key}`;
}

// Serve image from R2 bucket
router.get('/images/:key{.*}', async (c) => {
  const key = c.req.param('key');
  const object = await c.env.PRODUCTS.get(key);
  if (!object) return c.text('Not found', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
});

router.get('/', async (c) => {
  const categoryId = c.req.query('categoryId');
  // Cap the page size — an unbounded `limit` forced a full-table scan and a
  // huge public response.
  const requested = Number(c.req.query('limit') ?? 50);
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 200) : 50;
  const rawProducts = await listProducts(c.env.DB, { categoryId, limit });
  const pIds = rawProducts.map((p) => p.id);
  const imageMap = new Map<string, string>();
  if (pIds.length) {
    const db = getDb(c.env.DB);
    const imgs = await db
      .select()
      .from(productImages)
      .where(sql`${productImages.productId} in (${sql.join(pIds.map((id) => sql`${id}`), sql.raw(','))})`)
      .orderBy(productImages.sortOrder)
      .all();
    for (const img of imgs) {
      if (!imageMap.has(img.productId)) {
        imageMap.set(img.productId, resolveImageUrl(img.r2Key));
      }
    }
  }
  const products = rawProducts.map((p) => ({
    ...p,
    imageUrl: imageMap.get(p.id) ?? null,
  }));
  return c.json({ products });
});

router.get('/:id', async (c) => {
  const p = await findProductById(c.env.DB, c.req.param('id'));
  if (!p) throw httpError(404, 'NOT_FOUND', 'Product not found');
  const rawImages = await listProductImages(c.env.DB, p.id);
  const images = rawImages.map((img) => ({
    ...img,
    url: resolveImageUrl(img.r2Key),
  }));
  return c.json({
    product: {
      ...p,
      imageUrl: images[0]?.url ?? null,
    },
    images,
  });
});

router.post('/', session(), async (c) => {
  const ctx = (c.get('ctx') || c.get('session' as any)) as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const isAuthorized = ctx.isAdmin || ((ctx.suppliers?.length ?? 0) > 0);
  if (!isAuthorized) throw httpError(403, 'FORBIDDEN', 'Supplier or Admin role required');

  const parsed = createProductSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const cat = await findCategoryById(c.env.DB, parsed.data.categoryId);
  if (!cat) throw httpError(400, 'INVALID_REFERENCE', 'categoryId does not exist');
  const id = await createProduct(c.env.DB, { ...parsed.data, createdByUserId: ctx.userId });
  return c.json({ id }, 201);
});

router.patch('/:id', session(), async (c) => {
  const ctx = (c.get('ctx') || c.get('session' as any)) as Ctx | undefined;
  if (!ctx || (!ctx.isAdmin && ((ctx.suppliers?.length ?? 0) === 0))) {
    throw httpError(403, 'FORBIDDEN', 'Supplier or Admin role required');
  }
  const parsed = updateProductSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  if (parsed.data.categoryId) {
    const cat = await findCategoryById(c.env.DB, parsed.data.categoryId);
    if (!cat) throw httpError(400, 'INVALID_REFERENCE', 'categoryId does not exist');
  }
  const existing = await findProductById(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Product not found');
  await assertProductWriteAccess(c, ctx, c.req.param('id'));
  await updateProduct(c.env.DB, c.req.param('id'), parsed.data);
  return c.json({ ok: true });
});

router.delete('/:id', session(), requireRole({ admin: true }), async (c) => {
  const existing = await findProductById(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Product not found');
  await softDeleteProduct(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

// Image upload to R2: receive JSON {filename,contentType,base64}, store under products/{productId}/{uuid}-{filename}.
router.post('/:id/images', session(), async (c) => {
  const ctx = (c.get('ctx') || c.get('session' as any)) as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const isAuthorized = ctx.isAdmin || ((ctx.suppliers?.length ?? 0) > 0);
  if (!isAuthorized) throw httpError(403, 'FORBIDDEN', 'Supplier or Admin role required');

  const parsed = addImageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const product = await findProductById(c.env.DB, c.req.param('id'));
  if (!product) throw httpError(404, 'NOT_FOUND', 'Product not found');
  await assertProductWriteAccess(c, ctx, c.req.param('id'));

  const bytes = Uint8Array.from(atob(parsed.data.base64), (ch) => ch.charCodeAt(0));
  if (bytes.byteLength > MAX_BYTES) throw httpError(413, 'PAYLOAD_TOO_LARGE', 'Image exceeds 5MB');

  const safeName = parsed.data.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const r2Key = `products/${product.id}/${newId()}-${safeName}`;
  await c.env.PRODUCTS.put(r2Key, bytes, {
    httpMetadata: { contentType: parsed.data.contentType },
  });

  const imageId = await addProductImage(c.env.DB, product.id, {
    r2Key,
    sortOrder: parsed.data.sortOrder ?? (await nextProductImageSortOrder(c.env.DB, product.id)),
    altText: parsed.data.altText,
  });
  return c.json({ id: imageId, r2Key, url: resolveImageUrl(r2Key) }, 201);
});

router.get('/:id/images', async (c) => {
  const rawImages = await listProductImages(c.env.DB, c.req.param('id'));
  const images = rawImages.map((img) => ({
    ...img,
    url: resolveImageUrl(img.r2Key),
  }));
  return c.json({ images });
});

// Admins may remove any image; a supplier may remove images on a product they
// list (the same rule as the upload endpoint). The R2 object is deleted too —
// dropping only the DB row leaked the bucket object forever.
router.delete('/:id/images/:imageId', session(), async (c) => {
  const ctx = (c.get('ctx') || c.get('session' as any)) as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const db = getDb(c.env.DB);
  const img = (await db.select().from(productImages).where(sql`${productImages.id} = ${c.req.param('imageId')}`).get()) as any;
  if (!img || img.productId !== c.req.param('id')) throw httpError(404, 'NOT_FOUND', 'Image not found');
  if (!ctx.isAdmin) {
    await assertProductWriteAccess(c, ctx, c.req.param('id'));
  }
  await removeProductImage(c.env.DB, c.req.param('imageId'));
  try {
    await c.env.PRODUCTS.delete(img.r2Key);
  } catch {
    // The DB row is gone; a stranded object is preferable to a broken row.
  }
  return c.json({ ok: true });
});

export default router;
