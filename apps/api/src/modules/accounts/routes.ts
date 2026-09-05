import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { businessMembers } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { computeBalance, listStatement, type AccountType } from '../ledger';
import { isSupplierMember } from '../payments/membership';

const router = new Hono<{ Bindings: Env }>();

const VALID_ACCOUNT_TYPES: AccountType[] = ['supplier', 'business', 'platform'];

async function assertAccountAccess(
  d1: D1Database,
  ctx: Ctx,
  accountType: AccountType,
  accountId: string,
): Promise<void> {
  if (ctx.isAdmin) return;
  if (accountType === 'business') {
    const db = getDb(d1);
    const member = (await db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(and(eq(businessMembers.businessId, accountId), eq(businessMembers.userId, ctx.userId)))
      .get()) as any;
    if (!member) throw httpError(403, 'FORBIDDEN', 'Not a member of this business');
  } else if (accountType === 'supplier') {
    const member = await isSupplierMember(d1, accountId, ctx.userId);
    if (!member) throw httpError(403, 'FORBIDDEN', 'Not a member of this supplier');
  } else if (accountType === 'platform') {
    throw httpError(403, 'FORBIDDEN', 'Platform balance is admin-only');
  }
}

router.get('/balance', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const accountType = c.req.query('accountType') as AccountType | undefined;
  const accountId = c.req.query('accountId');
  if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
    throw httpError(400, 'VALIDATION_ERROR', 'accountType must be supplier|business|platform');
  }
  if (!accountId) throw httpError(400, 'VALIDATION_ERROR', 'accountId required');
  await assertAccountAccess(c.env.DB, ctx, accountType, accountId);
  const db = getDb(c.env.DB);
  const balance = await computeBalance(db, accountType, accountId);
  return c.json({ accountType, accountId, balanceCents: balance, currency: 'LKR' });
});

router.get('/statement', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const accountType = c.req.query('accountType') as AccountType | undefined;
  const accountId = c.req.query('accountId');
  if (!accountType || !VALID_ACCOUNT_TYPES.includes(accountType)) {
    throw httpError(400, 'VALIDATION_ERROR', 'accountType must be supplier|business|platform');
  }
  if (!accountId) throw httpError(400, 'VALIDATION_ERROR', 'accountId required');
  await assertAccountAccess(c.env.DB, ctx, accountType, accountId);

  const fromRaw = c.req.query('from');
  const toRaw = c.req.query('to');
  const cursorRaw = c.req.query('cursor');
  const from = fromRaw ? Number(fromRaw) : undefined;
  const to = toRaw ? Number(toRaw) : undefined;
  const cursor = cursorRaw ? Number(cursorRaw) : undefined;
  if ([from, to, cursor].some((n) => n !== undefined && Number.isNaN(n))) {
    throw httpError(400, 'VALIDATION_ERROR', 'from/to/cursor must be numbers');
  }

  const db = getDb(c.env.DB);

  if (c.req.query('format') === 'csv') {
    // Walk all entries within window and emit CSV. Bounded by 5000 rows max.
    const all: any[] = [];
    let cur = cursor;
    for (let i = 0; i < 50; i++) {
      const page = await listStatement(db, { accountType, accountId, from, to, cursor: cur, limit: 100 });
      all.push(...page.entries);
      if (!page.nextCursor || page.entries.length === 0) break;
      cur = page.nextCursor;
      if (all.length >= 5000) break;
    }
    const lines = ['createdAt,direction,refType,refId,description,amount_cents,running_balance_cents'];
    for (const e of all) {
      lines.push(
        [new Date(e.createdAt).toISOString(), e.direction, e.refType, e.refId, JSON.stringify(e.description), e.amountCents, e.runningBalanceCents].join(','),
      );
    }
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="statement-${accountId}.csv"`);
    return c.body(lines.join('\n'));
  }

  const page = await listStatement(db, {
    accountType,
    accountId,
    from,
    to,
    cursor,
    limit: 100,
  });
  return c.json({ ...page, accountType, accountId });
});

export default router;
