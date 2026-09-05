import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminLedgerSummaryQuery } from '@vyro/validation';
import * as svc from './ledgerService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/summary', requirePermission('ledger:read'), async (c) => {
  const parsed = adminLedgerSummaryQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  return c.json(await svc.summary(c.env.DB, parsed.data));
});

export default router;
