import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { businessMembers } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { computeBalance, decodeLedgerCursor, listStatement, type AccountType } from '../ledger';
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
      .where(
        and(
          eq(businessMembers.businessId, accountId),
          eq(businessMembers.userId, ctx.userId),
          // An invited (never accepted) or suspended member must not be able
          // to read the business ledger — the same rule the finance routes
          // apply via `assertBusinessAccess`.
          eq(businessMembers.status, 'active'),
        ),
      )
      .get()) as any;
    if (!member) throw httpError(403, 'FORBIDDEN', 'Not a member of this business');
  } else if (accountType === 'supplier') {
    const member = await isSupplierMember(d1, accountId, ctx.userId);
    if (!member) throw httpError(403, 'FORBIDDEN', 'Not a member of this supplier');
  } else if (accountType === 'platform') {
    throw httpError(403, 'FORBIDDEN', 'Platform balance is admin-only');
  }
}

/** RFC 4180 field escaping — descriptions contain commas and quotes. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
  if ([from, to].some((n) => n !== undefined && Number.isNaN(n))) {
    throw httpError(400, 'VALIDATION_ERROR', 'from/to must be numbers');
  }
  // The cursor is opaque ("<createdAt>_<id>"); a legacy bare timestamp is
  // still accepted.
  const cursor = cursorRaw && decodeLedgerCursor(cursorRaw) ? cursorRaw : undefined;
  if (cursorRaw && !cursor) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid cursor');
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
        [
          new Date(e.createdAt).toISOString(),
          csvField(e.direction),
          csvField(e.refType),
          csvField(e.refId),
          csvField(e.description),
          e.amountCents,
          e.runningBalanceCents,
        ].join(','),
      );
    }
    c.header('Content-Type', 'text/csv');
    // The account id goes into a response header — keep it to a safe charset.
    const safeAccountId = accountId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64);
    c.header('Content-Disposition', `attachment; filename="statement-${safeAccountId}.csv"`);
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
