import { Hono } from 'hono';
import { requireBusinessRole } from '@vyro/auth';
import {
  orderListCreateSchema,
  orderListItemUpsertSchema,
  orderListRenameSchema,
} from '@vyro/validation/wholesale';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import {
  addListToCart,
  createList,
  deleteList,
  findList,
  listItemsDetailed,
  listListsForBusiness,
  removeListItem,
  renameList,
  upsertListItem,
} from './service';

/** Mounted at /api/order-lists. Same roles that may edit the cart. */
const router = new Hono<{ Bindings: Env }>();
const LIST_ROLES = ['owner', 'manager', 'purchasing'] as const;

router.use('*', session());

async function loadOwnedList(c: { env: Env; get(k: 'ctx'): Ctx }, id: string) {
  const list = await findList(c.env.DB, id);
  if (!list) throw httpError(404, 'NOT_FOUND', 'List not found');
  requireBusinessRole(c.get('ctx'), list.businessId, LIST_ROLES);
  return list;
}

router.get('/', async (c) => {
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  requireBusinessRole(c.get('ctx'), businessId, LIST_ROLES);
  return c.json({ lists: await listListsForBusiness(c.env.DB, businessId) });
});

router.post('/', async (c) => {
  const parsed = orderListCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const ctx = c.get('ctx');
  requireBusinessRole(ctx, parsed.data.businessId, LIST_ROLES);
  const list = await createList(c.env.DB, { ...parsed.data, userId: ctx.userId });
  return c.json({ list }, 201);
});

router.get('/:id', async (c) => {
  const list = await loadOwnedList(c, c.req.param('id'));
  const items = await listItemsDetailed(c.env.DB, list.id);
  const estimateCents = items.filter((i) => i.purchasable).reduce((s, i) => s + i.lineEstimateCents, 0);
  return c.json({ list, items, estimateCents });
});

router.patch('/:id', async (c) => {
  const list = await loadOwnedList(c, c.req.param('id'));
  const parsed = orderListRenameSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await renameList(c.env.DB, list.id, parsed.data.name);
  return c.json({ ok: true });
});

router.delete('/:id', async (c) => {
  const list = await loadOwnedList(c, c.req.param('id'));
  await deleteList(c.env.DB, list.id);
  return c.json({ ok: true });
});

router.put('/:id/items', async (c) => {
  const list = await loadOwnedList(c, c.req.param('id'));
  const parsed = orderListItemUpsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await upsertListItem(c.env.DB, list.id, parsed.data.supplierProductId, parsed.data.quantity);
  return c.json({ ok: true });
});

router.delete('/:id/items/:itemId', async (c) => {
  const list = await loadOwnedList(c, c.req.param('id'));
  const removed = await removeListItem(c.env.DB, list.id, c.req.param('itemId'));
  if (!removed) throw httpError(404, 'NOT_FOUND', 'Item not found');
  return c.json({ ok: true });
});

router.post('/:id/add-to-cart', async (c) => {
  const list = await loadOwnedList(c, c.req.param('id'));
  return c.json(await addListToCart(c.env.DB, list.id, list.businessId));
});

export default router;
