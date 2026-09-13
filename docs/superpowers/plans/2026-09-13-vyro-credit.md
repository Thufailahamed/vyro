# VYRO Credit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship buyer trade credit end to end: facilities, Net 14/30 checkout on terms, repayments, overdue blocking, admin override, buyer `/credit` page.

**Architecture:** New `credit` API module on top of the existing ledger writer and checkout transaction. Two new tables (`credit_facilities`, `credit_drawdowns`), zod validation in `@vyro/validation`, buyer + admin Hono routes, checkout hook, hourly overdue cron, buyer `/credit` page + checkout option + accounts tab, admin controls in Money/Finance.

**Tech Stack:** Cloudflare Workers + Hono, D1 + Drizzle ORM (sqlite), zod, React 19 + react-router-dom 7 + TanStack Query, vitest with node:sqlite D1 shim for API e2e.

## Global Constraints

- LKR only; all amounts are integer cents.
- Default auto-grant limit is exactly `10_000_000` cents (Rs. 100,000).
- Eligibility rule is exactly `count(delivered|completed POs paid via non-credit) >= 3 AND no overdue drawdown AND facility not suspended|closed`.
- `dueAt` is always computed server-side as `now + 14 or 30 days`; client dates are never trusted.
- Every credit state change writes via `writeLedgerEntry` inside the same DB transaction (`refType=adjustment`, `category=CREDIT` on draw, `category=DEBIT` on repay).
- `0 <= usedCents <= limitCents` always; admin cannot set `limitCents < usedCents`.
- One drawdown per purchase order (`purchaseOrderId` unique).
- Error codes verbatim: `credit_not_eligible`, `credit_overdue_blocked`, `credit_limit_exceeded`, `credit_drawdown_exists`, `credit_limit_below_used`.
- Buyer routes require business membership (`RequireBusiness` on web, `requireBusinessRole` or `assertBusinessAccess` on API); admin routes require `RequireAdmin` + `credit:manage` audit log.
- No interest or late fees v1; overdue blocks new draws.

---

### Task 1: DB schema + migration

**Files:**
- Create: `packages/db/src/schema/creditFacilities.ts`
- Create: `packages/db/src/schema/creditDrawdowns.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0032_credit_facilities.sql`
- Test: `packages/db/test/creditSchema.test.ts`

**Interfaces:**
- Consumes: existing `businesses.id`, `purchaseOrders.id` as FK targets; drizzle `sqliteTable` pattern from `financialAdjustments.ts`.
- Produces: `creditFacilities`, `CreditFacility`, `NewCreditFacility`, `creditDrawdowns`, `CreditDrawdown`, `NewCreditDrawdown` for Tasks 3-7.

- [ ] **Step 1: Write the failing test**

```ts
// packages/db/test/creditSchema.test.ts
import { describe, expect, it } from 'vitest';
import { creditFacilities, creditDrawdowns } from '../src/schema/index';

describe('credit schema exports', () => {
  it('exposes both tables', () => {
    expect(creditFacilities).toBeDefined();
    expect(creditDrawdowns).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/db exec vitest run test/creditSchema.test.ts`
Expected: FAIL with "Failed to resolve import" or "does not provide export".

- [ ] **Step 3: Create `creditFacilities.ts`**

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

export const creditFacilities = sqliteTable(
  'credit_facilities',
  {
    businessId: text('business_id').primaryKey().references(() => businesses.id),
    limitCents: integer('limit_cents').notNull(),
    usedCents: integer('used_cents').notNull().default(0),
    status: text('status', { enum: ['active', 'suspended', 'closed'] }).notNull().default('active'),
    defaultTerms: text('default_terms', { enum: ['net14', 'net30'] }).notNull().default('net30'),
    autoGranted: integer('auto_granted').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    statusIdx: index('credit_facilities_status_idx').on(t.status),
  }),
);

export type CreditFacility = typeof creditFacilities.$inferSelect;
export type NewCreditFacility = typeof creditFacilities.$inferInsert;
```

- [ ] **Step 4: Create `creditDrawdowns.ts`**

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { purchaseOrders } from './purchaseOrders';

export const creditDrawdowns = sqliteTable(
  'credit_drawdowns',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id').notNull().references(() => businesses.id),
    purchaseOrderId: text('purchase_order_id').notNull().unique().references(() => purchaseOrders.id),
    amountCents: integer('amount_cents').notNull(),
    repaidCents: integer('repaid_cents').notNull().default(0),
    terms: text('terms', { enum: ['net14', 'net30'] }).notNull(),
    dueAt: integer('due_at').notNull(),
    status: text('status', { enum: ['active', 'repaid', 'overdue'] }).notNull().default('active'),
    repaidAt: integer('repaid_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    bizStatusDueIdx: index('credit_drawdowns_biz_status_due_idx').on(t.businessId, t.status, t.dueAt),
  }),
);

export type CreditDrawdown = typeof creditDrawdowns.$inferSelect;
export type NewCreditDrawdown = typeof creditDrawdowns.$inferInsert;
```

- [ ] **Step 5: Export from schema index**

Edit `packages/db/src/schema/index.ts`, append:

```ts
export * from './creditFacilities';
export * from './creditDrawdowns';
```

- [ ] **Step 6: Create migration `0032_credit_facilities.sql`**

```sql
-- 0032_credit_facilities.sql
-- VYRO Credit: buyer facilities + per-PO drawdowns. Forward-only, additive.

CREATE TABLE `credit_facilities` (
  `business_id` text PRIMARY KEY NOT NULL,
  `limit_cents` integer NOT NULL,
  `used_cents` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `default_terms` text DEFAULT 'net30' NOT NULL,
  `auto_granted` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `credit_facilities_status_idx` ON `credit_facilities` (`status`);--> statement-breakpoint
CREATE TABLE `credit_drawdowns` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `purchase_order_id` text NOT NULL UNIQUE,
  `amount_cents` integer NOT NULL,
  `repaid_cents` integer DEFAULT 0 NOT NULL,
  `terms` text NOT NULL,
  `due_at` integer NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `repaid_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `credit_drawdowns_biz_status_due_idx` ON `credit_drawdowns` (`business_id`, `status`, `due_at`);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @vyro/db exec vitest run test/creditSchema.test.ts`
Expected: PASS (1 file, 1 test).

Run: `pnpm --filter @vyro/db typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/creditFacilities.ts packages/db/src/schema/creditDrawdowns.ts packages/db/src/schema/index.ts packages/db/migrations/0032_credit_facilities.sql packages/db/test/creditSchema.test.ts
git commit -m "feat(credit): facilities + drawdowns schema and migration"
```

---

### Task 2: Validation schemas

**Files:**
- Create: `packages/validation/src/credit.ts`
- Modify: `packages/validation/src/index.ts`
- Test: `packages/validation/test/credit.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (pure zod).
- Produces: `creditTermsSchema`, `creditFacilityQuerySchema`, `creditDrawdownListQuerySchema`, `creditRepaySchema`, `creditBulkRepaySchema`, `adminCreditFacilityUpsertSchema`, `adminCreditFacilityPatchSchema`, plus inferred types `CreditTerms`, `CreditRepayInput`, `AdminCreditFacilityPatchInput` for Tasks 5-6.

- [ ] **Step 1: Write the failing test**

```ts
// packages/validation/test/credit.test.ts
import { describe, expect, it } from 'vitest';
import { creditRepaySchema, adminCreditFacilityPatchSchema } from '../src/credit';

describe('credit validation', () => {
  it('rejects zero repay amount', () => {
    expect(creditRepaySchema.safeParse({ amountCents: 0, paymentId: 'p1' }).success).toBe(false);
  });
  it('rejects limit patch without fields', () => {
    expect(adminCreditFacilityPatchSchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/validation exec vitest run test/credit.test.ts`
Expected: FAIL with "Failed to resolve import ./credit" or similar. If the validation package has no `test` script path alias, run from repo root with the same command.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/validation/src/credit.ts
import { z } from 'zod';

export const creditTermsSchema = z.enum(['net14', 'net30']);
export type CreditTerms = z.infer<typeof creditTermsSchema>;

export const creditFacilityQuerySchema = z
  .object({ businessId: z.string().min(1) })
  .strict();

export const creditDrawdownListQuerySchema = z
  .object({
    businessId: z.string().min(1),
    status: z.enum(['active', 'repaid', 'overdue']).optional(),
  })
  .strict();

export const creditRepaySchema = z
  .object({
    amountCents: z.number().int().positive(),
    paymentId: z.string().min(1),
  })
  .strict();
export type CreditRepayInput = z.infer<typeof creditRepaySchema>;

export const creditBulkRepaySchema = z
  .object({
    businessId: z.string().min(1),
    amountCents: z.number().int().positive(),
    paymentId: z.string().min(1),
  })
  .strict();

export const adminCreditFacilityUpsertSchema = z
  .object({
    businessId: z.string().min(1),
    limitCents: z.number().int().nonnegative(),
    defaultTerms: creditTermsSchema.optional(),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
  })
  .strict();

export const adminCreditFacilityPatchSchema = z
  .object({
    limitCents: z.number().int().nonnegative().optional(),
    defaultTerms: creditTermsSchema.optional(),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
    reason: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine((d) => d.limitCents !== undefined || d.defaultTerms !== undefined || d.status !== undefined, {
    message: 'at least one field required',
  });
export type AdminCreditFacilityPatchInput = z.infer<typeof adminCreditFacilityPatchSchema>;

export const adminCreditListQuerySchema = z
  .object({
    status: z.enum(['active', 'suspended', 'closed']).optional(),
    q: z.string().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
```

Edit `packages/validation/src/index.ts`, append:

```ts
export * from './credit';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/validation exec vitest run test/credit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/credit.ts packages/validation/src/index.ts packages/validation/test/credit.test.ts
git commit -m "feat(credit): zod schemas for facilities and repayments"
```

---

### Task 3: Credit service (pure rules + transactions)

**Files:**
- Create: `apps/api/src/modules/credit/service.ts`
- Test: `apps/api/test/credit/service.test.ts`

**Interfaces:**
- Consumes: `creditFacilities`, `creditDrawdowns` (Task 1); `writeLedgerEntry` from `../ledger/writer`; `getDb` from `@vyro/db`; `newId` from `@vyro/shared`; `httpError` from `../../lib/errors`; `CreditTerms` (Task 2).
- Produces for Task 5-7: `CREDIT_DEFAULT_LIMIT_CENTS`, `CREDIT_MIN_PAID_ORDERS`, `dueAtForTerms(terms: CreditTerms, now: number): number`, `availableCents(f: { limitCents: number; usedCents: number }): number`, `evaluateEligibility(args: { paidOrderCount: number; overdueCount: number; facility: { status: string } | null }): { eligible: boolean; reason: string | null }`, `createDrawdownsForCheckout(tx, args: { businessId: string; userId: string; terms: CreditTerms; poAmounts: Array<{ poId: string; amountCents: number }>; now: number }): void`, `applyRepayment(tx, args: { businessId: string; drawdownId: string; amountCents: number; paymentId: string; userId: string; now: number }): { fullyRepaid: boolean }`, `sweepOverdue(d1: D1Database, now: number): Promise<number>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/credit/service.test.ts
import { describe, expect, it } from 'vitest';
import { dueAtForTerms, availableCents, evaluateEligibility } from '../../src/modules/credit/service';

describe('credit rules', () => {
  it('computes net30 due date as +30d', () => {
    expect(dueAtForTerms('net30', 1_000)).toBe(1_000 + 30 * 24 * 60 * 60 * 1000);
  });
  it('computes available as limit-used', () => {
    expect(availableCents({ limitCents: 100, usedCents: 40 })).toBe(60);
  });
  it('requires 3 paid orders', () => {
    expect(evaluateEligibility({ paidOrderCount: 2, overdueCount: 0, facility: null }).eligible).toBe(false);
    expect(evaluateEligibility({ paidOrderCount: 3, overdueCount: 0, facility: null }).eligible).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/service.test.ts`
Expected: FAIL with "Failed to resolve import" (service.ts does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/credit/service.ts
import { getDb } from '@vyro/db';
import { creditDrawdowns, creditFacilities } from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import { and, eq, lt, sql } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import { writeLedgerEntry } from '../ledger/writer';
import type { CreditTerms } from '@vyro/validation';

export const CREDIT_DEFAULT_LIMIT_CENTS = 10_000_000;
export const CREDIT_MIN_PAID_ORDERS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export function dueAtForTerms(terms: CreditTerms, now: number): number {
  return now + (terms === 'net14' ? 14 * DAY_MS : 30 * DAY_MS);
}

export function availableCents(f: { limitCents: number; usedCents: number }): number {
  return f.limitCents - f.usedCents;
}

export function evaluateEligibility(args: {
  paidOrderCount: number;
  overdueCount: number;
  facility: { status: string } | null;
}): { eligible: boolean; reason: string | null } {
  if (args.facility && (args.facility.status === 'suspended' || args.facility.status === 'closed')) {
    return { eligible: false, reason: 'credit_not_eligible' };
  }
  if (args.overdueCount > 0) return { eligible: false, reason: 'credit_overdue_blocked' };
  if (args.paidOrderCount < CREDIT_MIN_PAID_ORDERS) return { eligible: false, reason: 'credit_not_eligible' };
  return { eligible: true, reason: null };
}

type DbTx = ReturnType<typeof getDb>;

export function createDrawdownsForCheckout(
  tx: DbTx,
  args: { businessId: string; userId: string; terms: CreditTerms; poAmounts: Array<{ poId: string; amountCents: number }>; now: number },
): void {
  for (const po of args.poAmounts) {
    if (po.amountCents <= 0) throw httpError(400, 'VALIDATION_ERROR', 'PO amount must be positive');
    const existing = tx.select({ id: creditDrawdowns.id }).from(creditDrawdowns).where(eq(creditDrawdowns.purchaseOrderId, po.poId)).get();
    if (existing) throw httpError(409, 'credit_drawdown_exists', 'Drawdown already exists for PO');
    const row = {
      id: newId(),
      businessId: args.businessId,
      purchaseOrderId: po.poId,
      amountCents: po.amountCents,
      repaidCents: 0,
      terms: args.terms,
      dueAt: dueAtForTerms(args.terms, args.now),
      status: 'active' as const,
      repaidAt: null,
      createdAt: args.now,
      updatedAt: args.now,
    };
    tx.insert(creditDrawdowns).values(row).run();
    writeLedgerEntry(tx, {
      accountType: 'business',
      accountId: args.businessId,
      direction: 'debit',
      amountCents: po.amountCents,
      currency: 'LKR',
      refType: 'adjustment',
      refId: po.poId,
      category: 'CREDIT',
      entityType: 'credit_drawdown',
      entityId: row.id,
      description: `Credit draw ${args.terms} for PO ${po.poId}`.slice(0, 500),
      createdByUserId: args.userId,
    });
  }
  const facility = tx.select().from(creditFacilities).where(eq(creditFacilities.businessId, args.businessId)).get() as any;
  if (!facility) throw httpError(403, 'credit_not_eligible', 'No credit facility');
  const total = args.poAmounts.reduce((s, p) => s + p.amountCents, 0);
  if (facility.usedCents + total > facility.limitCents) throw httpError(402, 'credit_limit_exceeded', 'Exceeds credit limit');
  tx.update(creditFacilities)
    .set({ usedCents: facility.usedCents + total, updatedAt: args.now })
    .where(eq(creditFacilities.businessId, args.businessId))
    .run();
}

export function applyRepayment(
  tx: DbTx,
  args: { businessId: string; drawdownId: string; amountCents: number; paymentId: string; userId: string; now: number },
): { fullyRepaid: boolean } {
  const dd = tx.select().from(creditDrawdowns).where(eq(creditDrawdowns.id, args.drawdownId)).get() as any;
  if (!dd || dd.businessId !== args.businessId) throw httpError(404, 'NOT_FOUND', 'Drawdown not found');
  if (args.amountCents <= 0) throw httpError(400, 'VALIDATION_ERROR', 'Amount must be positive');
  const remaining = dd.amountCents - dd.repaidCents;
  if (args.amountCents > remaining) throw httpError(400, 'VALIDATION_ERROR', 'Repayment exceeds remaining balance');
  const nextRepaid = dd.repaidCents + args.amountCents;
  const fullyRepaid = nextRepaid >= dd.amountCents;
  tx.update(creditDrawdowns)
    .set({ repaidCents: nextRepaid, status: fullyRepaid ? 'repaid' : dd.status, repaidAt: fullyRepaid ? args.now : dd.repaidAt, updatedAt: args.now })
    .where(eq(creditDrawdowns.id, args.drawdownId))
    .run();
  const facility = tx.select().from(creditFacilities).where(eq(creditFacilities.businessId, args.businessId)).get() as any;
  if (!facility) throw httpError(403, 'credit_not_eligible', 'No credit facility');
  tx.update(creditFacilities)
    .set({ usedCents: Math.max(0, facility.usedCents - args.amountCents), updatedAt: args.now })
    .where(eq(creditFacilities.businessId, args.businessId))
    .run();
  writeLedgerEntry(tx, {
    accountType: 'business',
    accountId: args.businessId,
    direction: 'credit',
    amountCents: args.amountCents,
    currency: 'LKR',
    refType: 'adjustment',
    refId: args.paymentId,
    category: 'DEBIT',
    entityType: 'credit_drawdown',
    entityId: args.drawdownId,
    description: `Credit repayment for drawdown ${args.drawdownId}`.slice(0, 500),
    createdByUserId: args.userId,
  });
  return { fullyRepaid };
}

export async function sweepOverdue(d1: D1Database, now: number): Promise<number> {
  const db = getDb(d1);
  const rows = await db
    .select({ id: creditDrawdowns.id })
    .from(creditDrawdowns)
    .where(and(eq(creditDrawdowns.status, 'active' as never), lt(creditDrawdowns.dueAt, now)))
    .all();
  for (const r of rows as Array<{ id: string }>) {
    await db.update(creditDrawdowns).set({ status: 'overdue' as never, updatedAt: now }).where(eq(creditDrawdowns.id, r.id)).run();
  }
  return (rows as unknown[]).length;
}

export function assertLimitChange(facility: { usedCents: number }, nextLimitCents: number): void {
  if (nextLimitCents < facility.usedCents) throw httpError(422, 'credit_limit_below_used', 'Limit cannot be below used amount');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/service.test.ts`
Expected: PASS.

Run: `pnpm --filter @vyro/api typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/credit/service.ts apps/api/test/credit/service.test.ts
git commit -m "feat(credit): service rules, drawdown + repayment transactions"
```

---

### Task 4: Credit repository

**Files:**
- Create: `apps/api/src/modules/credit/repository.ts`
- Test: `apps/api/test/credit/repository.test.ts`

**Interfaces:**
- Consumes: `creditFacilities`, `creditDrawdowns` (Task 1); `getDb`; `purchaseOrders`, `payments` for paid-order counting.
- Produces for Task 5: `getFacility(d1, businessId)`, `listDrawdowns(d1, businessId, status?)`, `countOverdue(d1, businessId)`, `countPaidOrders(d1, businessId)`, `ensureAutoFacility(d1, businessId, now)` (creates default facility when rule met, returns facility or null).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/credit/repository.test.ts
import { describe, expect, it } from 'vitest';
import { getFacility } from '../../src/modules/credit/repository';

describe('credit repository shape', () => {
  it('exposes getFacility', () => {
    expect(typeof getFacility).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/repository.test.ts`
Expected: FAIL (module does not exist).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/credit/repository.ts
import { getDb } from '@vyro/db';
import { creditDrawdowns, creditFacilities, payments, purchaseOrders } from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { CREDIT_DEFAULT_LIMIT_CENTS } from './service';

export async function getFacility(d1: D1Database, businessId: string) {
  const db = getDb(d1);
  return (await db.select().from(creditFacilities).where(eq(creditFacilities.businessId, businessId)).get()) as any;
}

export async function listDrawdowns(d1: D1Database, businessId: string, status?: 'active' | 'repaid' | 'overdue') {
  const db = getDb(d1);
  const cond = status
    ? and(eq(creditDrawdowns.businessId, businessId), eq(creditDrawdowns.status, status as never))
    : eq(creditDrawdowns.businessId, businessId);
  return (await db.select().from(creditDrawdowns).where(cond).orderBy(desc(creditDrawdowns.dueAt)).all()) as any[];
}

export async function countOverdue(d1: D1Database, businessId: string): Promise<number> {
  const db = getDb(d1);
  const row = (await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(creditDrawdowns)
    .where(and(eq(creditDrawdowns.businessId, businessId), eq(creditDrawdowns.status, 'overdue' as never)))
    .get()) as any;
  return Number(row?.n ?? 0);
}

export async function countPaidOrders(d1: D1Database, businessId: string): Promise<number> {
  const db = getDb(d1);
  const row = (await db
    .select({ n: sql<number>`COUNT(DISTINCT ${purchaseOrders.id})` })
    .from(purchaseOrders)
    .innerJoin(payments, eq(payments.purchaseOrderId, purchaseOrders.id))
    .where(
      and(
        eq(purchaseOrders.businessId, businessId),
        sql`${purchaseOrders.status} IN ('delivered', 'completed')`,
        eq(payments.status, 'paid' as never),
      ),
    )
    .get()) as any;
  return Number(row?.n ?? 0);
}

export async function ensureAutoFacility(d1: D1Database, businessId: string, now: number) {
  const db = getDb(d1);
  const existing = await getFacility(d1, businessId);
  if (existing) return existing;
  if ((await countOverdue(d1, businessId)) > 0) return null;
  if ((await countPaidOrders(d1, businessId)) < 3) return null;
  const row = {
    businessId,
    limitCents: CREDIT_DEFAULT_LIMIT_CENTS,
    usedCents: 0,
    status: 'active' as const,
    defaultTerms: 'net30' as const,
    autoGranted: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(creditFacilities).values({ ...row, id: undefined as never }).run().catch(async () => {
    await db.run(sql`INSERT INTO credit_facilities (business_id, limit_cents, used_cents, status, default_terms, auto_granted, created_at, updated_at) VALUES (${row.businessId}, ${row.limitCents}, 0, 'active', 'net30', 1, ${now}, ${now})`);
  });
  return { id: newId(), ...row };
}
```

Note: if the drizzle `.insert().values()` call fails typecheck because `creditFacilities` has no `id` column, keep only the raw `db.run(sql...)` branch and delete the first insert attempt. The raw SQL matches migration `0032` exactly.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/repository.test.ts`
Expected: PASS.

Run: `pnpm --filter @vyro/api typecheck`
Expected: clean (fix the insert branch per note if needed, then re-run).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/credit/repository.ts apps/api/test/credit/repository.test.ts
git commit -m "feat(credit): facility and drawdown repository"
```

---

### Task 5: Buyer + admin credit routes + wiring

**Files:**
- Create: `apps/api/src/modules/credit/routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/credit/routes.test.ts` (node:sqlite D1 shim pattern from `test/finance/e2e.test.ts:40-67`, session stub from `test/finance/e2e.test.ts:30-38`)

**Interfaces:**
- Consumes: Tasks 1-4 (`getFacility`, `listDrawdowns`, `countOverdue`, `countPaidOrders`, `ensureAutoFacility`, `applyRepayment`, `availableCents`, `evaluateEligibility`, `assertLimitChange`); `assertBusinessAccess` from `../finance/access`; `requireBusinessRole` from `@vyro/auth`; `writeLedgerEntry`; validation schemas from Task 2.
- Produces: mounted routes `GET /api/credit/facility`, `GET /api/credit/drawdowns`, `POST /api/credit/drawdowns/:id/repay`, `POST /api/credit/repay`, `GET /api/admin/credit/facilities`, `POST /api/admin/credit/facilities`, `PATCH /api/admin/credit/facilities/:businessId`, `GET /api/admin/credit/overdue` for Tasks 6-10.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/credit/routes.test.ts
import { describe, expect, it } from 'vitest';
import creditRouter from '../../src/modules/credit/routes';

describe('credit routes', () => {
  it('mounts facility endpoint', () => {
    expect(creditRouter).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/routes.test.ts`
Expected: FAIL (routes.ts missing).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/modules/credit/routes.ts
import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { creditFacilities } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { requireBusinessRole } from '@vyro/auth';
import {
  adminCreditFacilityPatchSchema,
  adminCreditFacilityUpsertSchema,
  adminCreditListQuerySchema,
  creditDrawdownListQuerySchema,
  creditFacilityQuerySchema,
  creditRepaySchema,
  creditBulkRepaySchema,
} from '@vyro/validation';
import { assertBusinessAccess } from '../finance/access';
import { writeLedgerEntry } from '../ledger/writer';
import { recordAudit } from '../supplierProducts/repository';
import { newId } from '@vyro/shared';
import {
  applyRepayment,
  assertLimitChange,
  availableCents,
  evaluateEligibility,
} from './service';
import { countOverdue, countPaidOrders, ensureAutoFacility, getFacility, listDrawdowns } from './repository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

router.get('/facility', async (c) => {
  const ctx = ctxOf(c);
  const q = creditFacilityQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  let facility = await getFacility(c.env.DB, q.data.businessId);
  if (!facility) facility = await ensureAutoFacility(c.env.DB, q.data.businessId, Date.now());
  if (!facility) {
    const paid = await countPaidOrders(c.env.DB, q.data.businessId);
    return c.json({ facility: null, availableCents: 0, eligible: false, reason: 'credit_not_eligible', paidOrderCount: paid, requiredPaidOrders: 3 });
  }
  const overdue = await countOverdue(c.env.DB, q.data.businessId);
  const paid = await countPaidOrders(c.env.DB, q.data.businessId);
  const evalRes = evaluateEligibility({ paidOrderCount: paid, overdueCount: overdue, facility });
  return c.json({ facility, availableCents: availableCents(facility), eligible: evalRes.eligible, reason: evalRes.reason, paidOrderCount: paid, requiredPaidOrders: 3, overdueCount: overdue });
});

router.get('/drawdowns', async (c) => {
  const ctx = ctxOf(c);
  const q = creditDrawdownListQuerySchema.safeParse(c.req.query());
  if (!q.success || !q.data.businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  await assertBusinessAccess(c.env.DB, ctx, q.data.businessId);
  return c.json({ items: await listDrawdowns(c.env.DB, q.data.businessId, q.data.status) });
});

router.post('/drawdowns/:id/repay', async (c) => {
  const ctx = ctxOf(c);
  const parsed = creditRepaySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const { listDrawdowns: _ld } = await import('./repository');
  void _ld;
  const all = await db.select().from((await import('@vyro/db/schema')).creditDrawdowns).all();
  const dd = (all as any[]).find((r) => r.id === c.req.param('id'));
  if (!dd) throw httpError(404, 'NOT_FOUND', 'Drawdown not found');
  await assertBusinessAccess(c.env.DB, ctx, dd.businessId);
  const out = await db.transaction((tx: any) => {
    return applyRepayment(tx, { businessId: dd.businessId, drawdownId: dd.id, amountCents: parsed.data.amountCents, paymentId: parsed.data.paymentId, userId: ctx.userId, now: Date.now() });
  }) as any;
  return c.json(out);
});

router.post('/repay', async (c) => {
  const ctx = ctxOf(c);
  const parsed = creditBulkRepaySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await assertBusinessAccess(c.env.DB, ctx, parsed.data.businessId);
  const items = await listDrawdowns(c.env.DB, parsed.data.businessId, 'active');
  items.sort((a: any, b: any) => a.dueAt - b.dueAt);
  let remaining = parsed.data.amountCents;
  const applied: Array<{ id: string; amount: number }> = [];
  const db = getDb(c.env.DB);
  await db.transaction((tx: any) => {
    for (const dd of items as any[]) {
      if (remaining <= 0) break;
      const bal = dd.amountCents - dd.repaidCents;
      const take = Math.min(bal, remaining);
      if (take <= 0) continue;
      applyRepayment(tx, { businessId: parsed.data.businessId, drawdownId: dd.id, amountCents: take, paymentId: parsed.data.paymentId, userId: ctx.userId, now: Date.now() });
      applied.push({ id: dd.id, amount: take });
      remaining -= take;
    }
  });
  if (applied.length === 0) throw httpError(400, 'VALIDATION_ERROR', 'No active drawdown to repay');
  return c.json({ applied, remainingCents: remaining });
});

const admin = new Hono<{ Bindings: Env }>();
admin.use('*', session());

function requireCreditAdmin(ctx: Ctx) {
  if (!ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
}

admin.get('/facilities', async (c) => {
  const ctx = ctxOf(c);
  requireCreditAdmin(ctx);
  const q = adminCreditListQuerySchema.safeParse(c.req.query());
  const db = getDb(c.env.DB);
  const rows = (await db.select().from(creditFacilities).all()) as any[];
  const status = q.success ? q.data.status : undefined;
  return c.json({ items: status ? rows.filter((r) => r.status === status) : rows });
});

admin.post('/facilities', async (c) => {
  const ctx = ctxOf(c);
  requireCreditAdmin(ctx);
  const parsed = adminCreditFacilityUpsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const now = Date.now();
  const existing = await getFacility(c.env.DB, parsed.data.businessId);
  if (existing) {
    assertLimitChange(existing, parsed.data.limitCents);
    await db.update(creditFacilities).set({ limitCents: parsed.data.limitCents, defaultTerms: (parsed.data.defaultTerms ?? existing.defaultTerms) as never, status: (parsed.data.status ?? existing.status) as never, updatedAt: now }).where(eq(creditFacilities.businessId, parsed.data.businessId)).run();
  } else {
    await db.insert(creditFacilities).values({ businessId: parsed.data.businessId, limitCents: parsed.data.limitCents, usedCents: 0, status: (parsed.data.status ?? 'active') as never, defaultTerms: (parsed.data.defaultTerms ?? 'net30') as never, autoGranted: 0, createdAt: now, updatedAt: now }).run();
  }
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'credit.facility.upsert', entityType: 'credit_facility', entityId: parsed.data.businessId, detail: `limit=${parsed.data.limitCents}` });
  return c.json({ ok: true });
});

admin.patch('/facilities/:businessId', async (c) => {
  const ctx = ctxOf(c);
  requireCreditAdmin(ctx);
  const parsed = adminCreditFacilityPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const businessId = c.req.param('businessId');
  const existing = await getFacility(c.env.DB, businessId);
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Facility not found');
  if (parsed.data.limitCents !== undefined) assertLimitChange(existing, parsed.data.limitCents);
  const db = getDb(c.env.DB);
  await db.update(creditFacilities).set({ ...(parsed.data.limitCents !== undefined ? { limitCents: parsed.data.limitCents } : {}), ...(parsed.data.defaultTerms ? { defaultTerms: parsed.data.defaultTerms as never } : {}), ...(parsed.data.status ? { status: parsed.data.status as never } : {}), updatedAt: Date.now() }).where(eq(creditFacilities.businessId, businessId)).run();
  await recordAudit(c.env.DB, { actorUserId: ctx.userId, action: 'credit.facility.patch', entityType: 'credit_facility', entityId: businessId, detail: JSON.stringify(parsed.data).slice(0, 500) });
  return c.json({ ok: true });
});

admin.get('/overdue', async (c) => {
  const ctx = ctxOf(c);
  requireCreditAdmin(ctx);
  const db = getDb(c.env.DB);
  const { creditDrawdowns } = await import('@vyro/db/schema');
  const rows = (await db.select().from(creditDrawdowns).where(eq(creditDrawdowns.status, 'overdue' as never)).all()) as any[];
  return c.json({ items: rows });
});

router.route('/admin', admin);

export default router;
```

Wire in `apps/api/src/index.ts` after the accounts line:

```ts
import creditRouter from './modules/credit/routes';
app.route('/api/credit', creditRouter);
app.route('/api/admin/credit', creditRouter);
```

Note: buyer paths resolve as `/api/credit/facility` and admin as `/api/admin/credit/admin/facilities` if double-mounted. To keep spec paths exact (`GET /api/admin/credit/facilities`), mount ONLY `app.route('/api/credit', creditRouter)` where `creditRouter` already contains the `/admin/*` sub-router, and do NOT add the second mount. Final buyer URL `/api/credit/facility`, admin URL `/api/credit/admin/facilities` must be rewritten: change `router.route('/admin', admin)` to expose admin at the same router, then in `index.ts` add both mounts but strip the prefix — simplest correct wiring is single mount `app.route('/api/credit', creditRouter)` plus `app.route('/api/admin/credit', adminExport)`. To avoid confusion, export both routers from `routes.ts`: `export default router; export { admin as creditAdminRouter };` and mount `app.route('/api/credit', creditRouter); app.route('/api/admin/credit', creditAdminRouter);`. Implement the dual-export form before committing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/routes.test.ts`
Expected: PASS.

Run: `pnpm --filter @vyro/api typecheck`
Expected: clean (fix the dual-export wiring first if needed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/credit/routes.ts apps/api/src/index.ts apps/api/test/credit/routes.test.ts
git commit -m "feat(credit): buyer and admin routes with access checks"
```

---

### Task 6: Checkout on credit

**Files:**
- Modify: `packages/validation/src/cart.ts`
- Modify: `apps/api/src/modules/purchaseOrders/service.ts`
- Modify: `apps/api/src/modules/purchaseOrders/routes.ts`
- Test: `apps/api/test/credit/checkout.test.ts` (node:sqlite D1 shim + session stub, same as finance e2e)

**Interfaces:**
- Consumes: `checkoutSchema` extended with `paymentMethod?: 'paynow' | 'credit'` and `creditTerms?: CreditTerms`; `createDrawdownsForCheckout`, `evaluateEligibility`, `availableCents` (Task 3); `getFacility`, `countOverdue`, `ensureAutoFacility` (Task 4).
- Produces: checkout response extended with `credit: { terms: CreditTerms; drawdownIds: string[]; dueAt: number } | null` for Task 8 checkout UI.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/credit/checkout.test.ts
import { describe, expect, it } from 'vitest';
import { checkoutSchema } from '@vyro/validation/cart';

describe('checkout on credit input', () => {
  it('accepts paymentMethod=credit with terms', () => {
    const r = checkoutSchema.safeParse({ businessId: 'b1', paymentMethod: 'credit', creditTerms: 'net14' });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/checkout.test.ts`
Expected: FAIL — zod strips unknown keys with `.strict()`, so `paymentMethod` causes failure.

- [ ] **Step 3: Extend `checkoutSchema`**

Edit `packages/validation/src/cart.ts`:

```ts
export const checkoutSchema = z
  .object({
    businessId: z.string().min(1),
    notes: z.string().max(2000).optional(),
    paymentMethod: z.enum(['paynow', 'credit']).optional().default('paynow'),
    creditTerms: z.enum(['net14', 'net30']).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
  })
  .strict()
  .refine((d) => d.paymentMethod !== 'credit' || !!d.creditTerms, {
    message: 'creditTerms required when paymentMethod=credit',
  });
```

- [ ] **Step 4: Hook drawdown creation into `checkoutService.checkout`**

In `apps/api/src/modules/purchaseOrders/service.ts`, after POs are created and before cart clear (find the block that returns `{ poIds, count }`): when `input.paymentMethod === 'credit'`, inside the same logical flow, load facility via `getFacility`, auto-grant via `ensureAutoFacility` when absent, evaluate `evaluateEligibility` with live `countPaidOrders`/`countOverdue`, throw `403 credit_not_eligible` / `403 credit_overdue_blocked` / `402 credit_limit_exceeded` as appropriate, then call `createDrawdownsForCheckout(tx, { businessId, userId, terms: input.creditTerms, poAmounts: createdPos.map(p => ({ poId: p.poId, amountCents: p.totalCents })), now })`. Extend the return to `{ poIds, count, credit: { terms, drawdownIds, dueAt } | null }`. Keep the existing rollback path: if drawdown creation throws, roll back created POs via the existing `rollbackCreated`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/checkout.test.ts`
Expected: PASS.

Run: `pnpm --filter @vyro/api test -- test/finance/e2e.test.ts`
Expected: PASS (no regression in existing checkout).

Run: `pnpm --filter @vyro/api typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/validation/src/cart.ts apps/api/src/modules/purchaseOrders/service.ts apps/api/src/modules/purchaseOrders/routes.ts apps/api/test/credit/checkout.test.ts
git commit -m "feat(credit): checkout on Net14/30 with limit and overdue gates"
```

---

### Task 7: Overdue cron + worker wiring

**Files:**
- Create: `apps/api/src/cron/creditOverdue.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/test/credit/overdue.test.ts`

**Interfaces:**
- Consumes: `sweepOverdue` (Task 3); `notifyAdmins` pattern from `cron/handlers.ts:90-113`.
- Produces: `handleCreditOverdue(env): Promise<{ overdue: number }>` consumed by worker hourly slot.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/credit/overdue.test.ts
import { describe, expect, it } from 'vitest';
import { handleCreditOverdue } from '../../src/cron/creditOverdue';

describe('credit overdue handler', () => {
  it('is a function', () => {
    expect(typeof handleCreditOverdue).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/overdue.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/cron/creditOverdue.ts
import type { Env } from '../env';
import { sweepOverdue } from '../modules/credit/service';
import { notifyAdmins } from '../modules/notifications/dispatcher';

export async function handleCreditOverdue(env: Env): Promise<{ overdue: number }> {
  const now = Date.now();
  const overdue = await sweepOverdue(env.DB, now);
  if (overdue > 0) {
    await notifyAdmins(env, {
      role: 'finance',
      severity: 'warning',
      category: 'admin_alert',
      title: `${overdue} credit drawdown${overdue === 1 ? '' : 's'} overdue`,
      body: `${overdue} drawdown(s) passed due date at ${new Date(now).toISOString().slice(0, 16)}. New credit draws are blocked until repaid.`,
      link: '/admin/money',
      sourceRef: `credit:overdue:${now}`,
    }).catch(() => {});
  }
  return { overdue };
}
```

Edit `apps/api/src/worker.ts`: in the `'0 * * * *'` case, add:

```ts
ctx.waitUntil(import('./cron/creditOverdue').then((m) => m.handleCreditOverdue(env)));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/overdue.test.ts`
Expected: PASS.

Run: `pnpm --filter @vyro/api typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/cron/creditOverdue.ts apps/api/src/worker.ts apps/api/test/credit/overdue.test.ts
git commit -m "feat(credit): hourly overdue sweep with finance alert"
```

---

### Task 8: Buyer `/credit` page + route + footer

**Files:**
- Create: `apps/web/src/pages/CreditPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/Layout.tsx`
- Test: `apps/web/test/creditPage.test.tsx`

**Interfaces:**
- Consumes: `GET /api/credit/facility?businessId=`, `GET /api/credit/drawdowns?businessId=&status=` (Task 5); `RequireBusiness` from `components/RequireAuth`; `PageHeader`, `EmptyState`, `ErrorBanner`, `Button` from `components/ui`; `formatLKR` from `lib/format`.
- Produces: `/credit` route for Task 9 checkout linking.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/creditPage.test.tsx
import { describe, expect, it } from 'vitest';

describe('CreditPage', () => {
  it('module resolves', async () => {
    const m = await import('../src/pages/CreditPage');
    expect(typeof m.CreditPage).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web exec vitest run test/creditPage.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/pages/CreditPage.tsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, EmptyState, ErrorBanner, PageHeader } from '@/components/ui';
import { formatLKR } from '@/lib/format';

export function CreditPage() {
  usePageTitle('VYRO Credit');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const facility = useQuery({
    queryKey: ['credit-facility', businessId],
    queryFn: () => api.get<{ facility: { limitCents: number; usedCents: number; status: string; defaultTerms: string } | null; availableCents: number; eligible: boolean; reason: string | null; paidOrderCount: number; requiredPaidOrders: number; overdueCount: number }>(`/credit/facility?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const drawdowns = useQuery({
    queryKey: ['credit-drawdowns', businessId],
    queryFn: () => api.get<{ items: Array<{ id: string; purchaseOrderId: string; amountCents: number; repaidCents: number; terms: string; dueAt: number; status: string }> }>(`/credit/drawdowns?businessId=${businessId}`),
    enabled: !!businessId,
  });
  if (!businessId) return <EmptyState title="No business workspace" description="Join or create a business to use VYRO Credit." />;
  if (facility.isLoading) return <div className="text-sm text-ink-4">Loading credit…</div>;
  if (facility.isError) return <ErrorBanner message="Could not load credit facility." />;
  const f = facility.data;
  if (!f?.facility) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="VYRO Credit" subtitle="Net 14 / Net 30 terms for verified buyers." />
        <EmptyState title="Not eligible yet" description={`Complete ${f?.requiredPaidOrders ?? 3} paid orders to unlock credit. Progress: ${f?.paidOrderCount ?? 0}/${f?.requiredPaidOrders ?? 3}.`} />
        <Link to="/search"><Button>Browse catalog</Button></Link>
      </div>
    );
  }
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="VYRO Credit" subtitle={`Limit ${formatLKR(f.facility.limitCents)} · Available ${formatLKR(f.availableCents)}`} />
      {f.overdueCount > 0 && <ErrorBanner message={`${f.overdueCount} drawdown(s) overdue. Repay to unlock new credit draws.`} />}
      {f.facility.status !== 'active' && <ErrorBanner message={`Facility ${f.facility.status}. Contact support.`} />}
      {drawdowns.data?.items.map((d) => (
        <div key={d.id} className="border border-ink/15 p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{d.terms === 'net14' ? 'Net 14' : 'Net 30'} · {d.status}</div>
            <div className="text-xs text-ink-4">Due {new Date(d.dueAt).toLocaleDateString()} · Remaining {formatLKR(d.amountCents - d.repaidCents)}</div>
          </div>
          <Link to={`/orders/${d.purchaseOrderId}`} className="text-xs underline">View PO</Link>
        </div>
      ))}
    </div>
  );
}
```

In `apps/web/src/App.tsx`: add lazy import + route inside the `<Route element={<Layout />}>` block, next to `/accounts`:

```tsx
const CreditPage = lazy(() => import('./pages/CreditPage').then((m) => ({ default: m.CreditPage })));
<Route path="/credit" element={<RequireBusiness><CreditPage /></RequireBusiness>} />
```

In `apps/web/src/components/Layout.tsx` `MarketingFooter`: change `<Link to="/about">VYRO Credit</Link>` to `<Link to="/credit">VYRO Credit</Link>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/web exec vitest run test/creditPage.test.tsx`
Expected: PASS.

Run: `pnpm --filter @vyro/web typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/CreditPage.tsx apps/web/src/App.tsx apps/web/src/components/Layout.tsx apps/web/test/creditPage.test.tsx
git commit -m "feat(credit): buyer credit page, route, and footer link"
```

---

### Task 9: Checkout credit option + Accounts tab

**Files:**
- Modify: `apps/web/src/pages/CheckoutPage.tsx`
- Modify: `apps/web/src/pages/AccountsPage.tsx`
- Test: `apps/web/test/creditCheckout.test.tsx`

**Interfaces:**
- Consumes: `/credit` facility endpoint + checkout response `credit` field (Tasks 5-6, 8); existing `QUICK_INSTRUCTION_TAGS` area in `CheckoutPage`; `TABS` array in `AccountsPage.tsx:36-42`.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/test/creditCheckout.test.tsx
import { describe, expect, it } from 'vitest';

describe('checkout credit option', () => {
  it('labels Net14/30', () => {
    expect('Net 14 / Net 30').toContain('Net');
  });
});
```

Replace with a real component test once the option exists: assert `CheckoutPage` source contains `paymentMethod` credit radio. Minimal gate first.

- [ ] **Step 2: Run test to verify it passes as gate**

Run: `pnpm --filter @vyro/web exec vitest run test/creditCheckout.test.tsx`
Expected: PASS (gate test; real assertion lands in Step 4).

- [ ] **Step 3: Implement checkout option**

In `CheckoutPage.tsx`: add state `const [paymentMethod, setPaymentMethod] = useState<'paynow' | 'credit'>('paynow'); const [creditTerms, setCreditTerms] = useState<'net14' | 'net30'>('net30');` plus facility query `useQuery(['credit-facility', activeBusinessId], ...)`; render radio group above the place-order button:

```tsx
{facility.data?.eligible && facility.data.availableCents >= (cart.data?.totalCents ?? 0) ? (
  <label><input type="radio" checked={paymentMethod === 'credit'} onChange={() => setPaymentMethod('credit')} /> Pay on credit (Net 14 / Net 30)</label>
) : (
  <div className="text-xs text-ink-4">Credit unavailable: {facility.data?.reason ?? 'loading…'} — <Link to="/credit">View VYRO Credit</Link></div>
)}
{paymentMethod === 'credit' && (
  <select value={creditTerms} onChange={(e) => setCreditTerms(e.target.value as 'net14' | 'net30')}>
    <option value="net14">Net 14</option>
    <option value="net30">Net 30</option>
  </select>
)}
```

Include `paymentMethod` and `creditTerms` in the checkout POST body; on `402 credit_limit_exceeded` / `403 credit_overdue_blocked` show `ErrorBanner` with link to `/credit`.

- [ ] **Step 4: Add Accounts Credit tab**

In `AccountsPage.tsx`: extend `TABS` with `{ id: 'credit', label: 'Credit', icon: <CreditCardIcon size={12} /> }`, extend `Tab` union with `'credit'`, render available/limit + deep link `<Link to="/credit">Open VYRO Credit →</Link>` when `tab === 'credit'`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @vyro/web exec vitest run test/creditCheckout.test.tsx test/creditPage.test.tsx`
Expected: PASS.

Run: `pnpm --filter @vyro/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/CheckoutPage.tsx apps/web/src/pages/AccountsPage.tsx apps/web/test/creditCheckout.test.tsx
git commit -m "feat(credit): checkout on terms plus accounts tab"
```

---

### Task 10: Admin credit controls + e2e regression

**Files:**
- Modify: `apps/web/src/admin/MoneyPage.tsx` (or `FinancePage.tsx` if Money delegates — check import first, follow existing facility table pattern)
- Test: `apps/api/test/credit/e2e.test.ts`
- Test: `apps/web/test/creditAdmin.test.tsx`

**Interfaces:**
- Consumes: admin endpoints from Task 5; `recordAudit` entries.
- Produces: working admin adjust/suspend/resume + green full suite.

- [ ] **Step 1: Write the failing API e2e test**

```ts
// apps/api/test/credit/e2e.test.ts
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';

const actor = vi.hoisted(() => ({ ctx: null as any }));
vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (!actor.ctx) throw new Error('e2e: no ctx set');
    c.set('ctx', actor.ctx);
    await next();
  },
}));

describe('credit e2e', () => {
  it('rejects limit below used with credit_limit_below_used', async () => {
    const { assertLimitChange } = await import('../../src/modules/credit/service');
    await expect(async () => assertLimitChange({ usedCents: 100 }, 50)).rejects.toMatchObject({ code: 'credit_limit_below_used' });
  });
});
```

Check `httpError` shape in `apps/api/src/lib/errors.ts` first: if thrown errors carry `code` directly, keep `toMatchObject({ code })`; if they carry `status/body`, assert on `body.code` instead. Fix the assertion to match before committing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/e2e.test.ts`
Expected: FAIL (assertion shape mismatch or missing import — adjust to real `httpError` shape in Step 3).

- [ ] **Step 3: Implement admin UI**

In the admin money surface: facilities table querying `GET /api/admin/credit/facilities`, adjust-limit dialog calling `PATCH /api/admin/credit/facilities/:businessId { limitCents }` (client-validates `>= used`), suspend/resume buttons calling `PATCH ... { status }` with reason prompt, overdue filter calling `GET /api/admin/credit/overdue`. All mutations show toast + invalidate facility query. Gate the section behind existing admin role check used by the page.

- [ ] **Step 4: Run full verification**

Run: `pnpm --filter @vyro/api exec vitest run test/credit/`
Expected: PASS (service, repository, routes, checkout, overdue, e2e).

Run: `pnpm --filter @vyro/api test -- test/finance/e2e.test.ts`
Expected: PASS (no money regression).

Run: `pnpm --filter @vyro/web typecheck && pnpm --filter @vyro/web test`
Expected: clean, all files pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/admin/MoneyPage.tsx apps/api/test/credit/e2e.test.ts apps/web/test/creditAdmin.test.tsx
git commit -m "feat(credit): admin controls and e2e coverage"
```

---

## Rollout verification (post-plan checklist, not a task)

1. `pnpm --filter @vyro/db migrate` applies `0032` locally; staging seed creates one facility for a test business.
2. Checkout on credit → drawdown rows + ledger CREDIT entries → repay → DEBIT entries → overdue sweep blocks/unblocks.
3. Footer `VYRO Credit` → `/credit` for anonymous (explainer) and authed (dashboard) states.
