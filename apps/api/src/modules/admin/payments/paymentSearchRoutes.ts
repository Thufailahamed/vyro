import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requireRole, requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import {
  listPayments,
  getPaymentDetail,
  getPaymentOptions,
  getReconciliation,
} from './paymentSearchService';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/', requirePermission('payment:read'), async (c) => {
  const url = new URL(c.req.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const out = await listPayments(c.env.DB, params);
  return c.json({ payments: out.rows, nextCursor: out.nextCursor });
});

router.get('/options', requirePermission('payment:read'), async (c) => {
  const out = await getPaymentOptions(c.env.DB);
  return c.json(out);
});

router.get('/reconcile', requirePermission('payment:read'), async (c) => {
  const out = await getReconciliation(c.env.DB);
  return c.json(out);
});

router.get('/:id', requirePermission('payment:read'), async (c) => {
  const id = c.req.param('id');
  if (!id) throw httpError(400, 'VALIDATION_ERROR', 'id required');
  const bundle = await getPaymentDetail(c.env.DB, id);
  if (!bundle) throw httpError(404, 'NOT_FOUND', 'payment not found');
  await auditAdmin({
    ctx: c,
    action: 'payment.view',
    target: { type: 'payment', id },
  });
  return c.json(bundle);
});

export default router;
