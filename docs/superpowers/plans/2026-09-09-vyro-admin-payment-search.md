# Admin Payment Search + Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-tenant admin payment search and per-payment detail bundle so ops can investigate chargebacks, duplicates, and gateway disputes from one place.

**Architecture:** New admin sub-module `apps/api/src/modules/admin/payments/` exposing three endpoints under `/api/admin/payments/*` — list, detail, options. Reads join `payments ⋈ purchase_orders ⋈ suppliers ⋈ businesses` for names; detail bundle fans out to `refunds`, `chargebacks`, `ledger_entries` in parallel. SPA gets list page (`/admin/payments`) and detail page (`/admin/payments/:id`). Reuses existing `payment:read` permission. No schema changes, no new indexes.

**Tech Stack:** Hono on Cloudflare Workers + D1 (Drizzle); React SPA (Vite) + TanStack Query; vitest; better-auth + RBAC.

## Global Constraints

- **Node**: 20+
- **Package manager**: pnpm 9+ workspace
- **TypeScript**: strict, `tsc --noEmit` clean (`pnpm typecheck`)
- **Tests**: vitest, file pattern `*.test.ts(x)` co-located in `apps/api/test/` for API; in `apps/web/src/admin/` for SPA
- **Naming**: kebab-case files; camelCase exports; routes under `/api/*` Hono; admin SPA routes under `/admin/*`
- **Commit prefix**: `feat|fix|chore|docs|test|refactor(<scope>):` — scope = package name (`api`, `web`, `db`, `admin`)
- **Migrations**: none in this spec (no schema change)
- **RBAC**: every admin route goes through `requireRole({ admin: true })` plus `requirePermission('payment:read')` per route
- **No new permissions, no new tables, no new indexes** (spec mandates)
- **Spec**: `docs/superpowers/specs/2026-09-09-vyro-admin-payment-search-design.md`

---

## File Structure

**New:**
- `apps/api/src/modules/admin/payments/paymentSearchRepository.ts` — D1 queries
- `apps/api/src/modules/admin/payments/paymentSearchService.ts` — bundle assembly
- `apps/api/src/modules/admin/payments/paymentSearchRoutes.ts` — Hono sub-router
- `apps/web/src/admin/useAdminPaymentSearch.ts` — list hook
- `apps/web/src/admin/useAdminPaymentDetail.ts` — detail hook
- `apps/web/src/admin/useAdminPaymentOptions.ts` — dropdown lookups hook
- `apps/web/src/admin/PaymentsPage.tsx` — list page
- `apps/web/src/admin/PaymentDetailPage.tsx` — detail page
- Tests: `apps/api/test/admin/payments-search.test.ts`, `apps/api/test/admin/payment-detail.test.ts`, `apps/web/src/admin/PaymentsPage.test.tsx`, `apps/web/src/admin/PaymentDetailPage.test.tsx`

**Modify:**
- `apps/api/src/modules/admin/routes.ts` — mount `paymentSearchRoutes`
- `apps/web/src/App.tsx` — add `/admin/payments` and `/admin/payments/:id` routes
- `apps/web/src/admin/MoneyPage.tsx` — link to `/admin/payments`

---

## Task 1: paymentSearchRepository (TDD)

**Files:**
- Create: `apps/api/src/modules/admin/payments/paymentSearchRepository.ts`
- Create: `apps/api/test/admin/payment-search-repo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type PaymentRow = {
    id: string;
    purchaseOrderId: string;
    poNumber: string;
    businessId: string;
    businessName: string;
    supplierId: string;
    supplierName: string;
    amountCents: number;
    feeCents: number;
    netCents: number;
    currency: string;
    status: 'pending' | 'confirmed' | 'failed' | 'refunded';
    method: 'cash' | 'bank_transfer' | 'online';
    transactionReference: string | null;
    gatewayRef: string | null;
    paidAt: number | null;
    confirmedAt: number | null;
    createdAt: number;
  };
  export type PaymentSearchFilters = {
    q?: string;
    status?: ('pending' | 'confirmed' | 'failed' | 'refunded')[];
    method?: 'cash' | 'bank_transfer' | 'online';
    businessId?: string;
    supplierId?: string;
    minCents?: number;
    maxCents?: number;
    from?: number;
    to?: number;
    cursor?: string;
    limit?: number;
    sort?: 'createdAt-desc' | 'createdAt-asc' | 'amount-desc' | 'amount-asc';
  };
  export async function searchPayments(db: any, filters: PaymentSearchFilters): Promise<{ rows: PaymentRow[]; nextCursor: string | null }>;
  export async function getPaymentDetailBundle(db: any, paymentId: string): Promise<{
    payment: PaymentRow & { statusReason: string|null; idempotencyKey: string|null; gatewayPayload: string|null; confirmedByUserId: string|null; notes: string|null; updatedAt: number };
    purchaseOrder: { id:string; poNumber:string; status:string; totalCents:number; createdAt:number; deliveryAt:number|null } | null;
    business: { id:string; name:string; email:string|null } | null;
    supplier: { id:string; name:string; email:string|null } | null;
    refunds: Array<{ id:string; paymentId:string; amountCents:number; reason:string|null; status:string; requestedByUserId:string; processedAt:number|null; failureReason:string|null; createdAt:number }>;
    chargebacks: Array<{ id:string; paymentId:string; reason:string; status:'open'|'resolved'|'cancelled'; resolvedBy:string|null; resolvedAt:number|null; notes:string|null; createdAt:number }>;
    ledger: Array<{ id:string; accountType:string; accountId:string; direction:'debit'|'credit'; amountCents:number; currency:string; refType:string; refId:string; description:string; createdAt:number }>;
  } | null>;
  export async function listPaymentOptions(db: any): Promise<{ businesses: Array<{id:string;name:string}>; suppliers: Array<{id:string;name:string}> }>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/admin/payment-search-repo.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { searchPayments, getPaymentDetailBundle, listPaymentOptions } from '../../src/modules/admin/payments/paymentSearchRepository';

function makeDb(rows: any[]) {
  const where = vi.fn().mockReturnValue({
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue(rows) }),
    }),
    get: vi.fn().mockResolvedValue(rows[0] ?? null),
    all: vi.fn().mockResolvedValue(rows),
  });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select } as any;
}

describe('searchPayments', () => {
  it('returns rows + nextCursor when limit+1 rows returned', async () => {
    const rows = [
      { id: 'p1', createdAt: 100, amountCents: 500 },
      { id: 'p2', createdAt: 50, amountCents: 300 },
    ];
    const db = makeDb(rows);
    const out = await searchPayments(db, { limit: 1 });
    expect(out.rows).toHaveLength(1);
    expect(out.nextCursor).toBe('100');
  });

  it('nulls nextCursor when fewer than limit rows', async () => {
    const db = makeDb([{ id: 'p1', createdAt: 100, amountCents: 500 }]);
    const out = await searchPayments(db, { limit: 5 });
    expect(out.rows).toHaveLength(1);
    expect(out.nextCursor).toBeNull();
  });

  it('parses opaque cursor base64(createdAt:id)', async () => {
    const cursor = Buffer.from('100:p1').toString('base64url');
    const db = makeDb([{ id: 'p0', createdAt: 50, amountCents: 100 }]);
    await searchPayments(db, { cursor, limit: 1 });
    expect(db.select).toHaveBeenCalled();
  });
});

describe('getPaymentDetailBundle', () => {
  it('returns null when payment missing', async () => {
    const db = makeDb([]);
    const out = await getPaymentDetailBundle(db, 'missing');
    expect(out).toBeNull();
  });
});

describe('listPaymentOptions', () => {
  it('returns businesses + suppliers', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Biz' }]) }),
      }),
    } as any;
    // Override second call (suppliers)
    let call = 0;
    db.select = vi.fn().mockImplementation(() => {
      call++;
      return { from: () => ({ all: async () => call === 1 ? [{ id: 'b1', name: 'Biz' }] : [{ id: 's1', name: 'Sup' }] }) };
    });
    const out = await listPaymentOptions(db);
    expect(out.businesses).toEqual([{ id: 'b1', name: 'Biz' }]);
    expect(out.suppliers).toEqual([{ id: 's1', name: 'Sup' }]);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `cd apps/api && pnpm exec vitest run test/admin/payment-search-repo.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the repository**

Create `apps/api/src/modules/admin/payments/paymentSearchRepository.ts`:

```ts
import {
  and,
  desc,
  asc,
  eq,
  gte,
  inArray,
  like,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  payments,
  purchaseOrders,
  businesses,
  suppliers,
  refunds,
  chargebacks,
  ledgerEntries,
} from '@vyro/db/schema';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'online';
export type PaymentRow = {
  id: string;
  purchaseOrderId: string;
  poNumber: string;
  businessId: string;
  businessName: string;
  supplierId: string;
  supplierName: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  transactionReference: string | null;
  gatewayRef: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
  createdAt: number;
};

export type PaymentSearchFilters = {
  q?: string;
  status?: PaymentStatus[];
  method?: PaymentMethod;
  businessId?: string;
  supplierId?: string;
  minCents?: number;
  maxCents?: number;
  from?: number;
  to?: number;
  cursor?: string;
  limit?: number;
  sort?: 'createdAt-desc' | 'createdAt-asc' | 'amount-desc' | 'amount-asc';
};

function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const [tsStr, id] = raw.split(':');
    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || !id) return null;
    return { createdAt: ts, id };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: number, id: string): string {
  return Buffer.from(`${createdAt}:${id}`, 'utf8').toString('base64url');
}

const SELECT_COLS = {
  id: payments.id,
  purchaseOrderId: payments.purchaseOrderId,
  poNumber: purchaseOrders.poNumber,
  businessId: purchaseOrders.businessId,
  businessName: businesses.name,
  supplierId: purchaseOrders.supplierId,
  supplierName: suppliers.name,
  amountCents: payments.amountCents,
  feeCents: payments.feeCents,
  netCents: payments.netCents,
  currency: payments.currency,
  status: payments.status,
  method: payments.method,
  transactionReference: payments.transactionReference,
  gatewayRef: payments.gatewayRef,
  paidAt: payments.paidAt,
  confirmedAt: payments.confirmedAt,
  createdAt: payments.createdAt,
} as const;

export async function searchPayments(
  db: any,
  filters: PaymentSearchFilters,
): Promise<{ rows: PaymentRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const sort = filters.sort ?? 'createdAt-desc';

  const conds: SQL[] = [];

  if (filters.status && filters.status.length) {
    conds.push(inArray(payments.status, filters.status));
  }
  if (filters.method) {
    conds.push(eq(payments.method, filters.method));
  }
  if (filters.businessId) {
    conds.push(eq(purchaseOrders.businessId, filters.businessId));
  }
  if (filters.supplierId) {
    conds.push(eq(purchaseOrders.supplierId, filters.supplierId));
  }
  if (typeof filters.minCents === 'number') {
    conds.push(gte(payments.amountCents, filters.minCents));
  }
  if (typeof filters.maxCents === 'number') {
    conds.push(lte(payments.amountCents, filters.maxCents));
  }
  if (typeof filters.from === 'number') {
    conds.push(gte(payments.createdAt, filters.from));
  }
  if (typeof filters.to === 'number') {
    conds.push(lte(payments.createdAt, filters.to));
  }

  if (filters.q && filters.q.length > 0) {
    const q = filters.q.slice(0, 200);
    const ors: SQL[] = [like(payments.id, `${q}%`)];
    if (q.length <= 64) {
      ors.push(eq(payments.transactionReference, q));
      ors.push(eq(payments.gatewayRef, q));
    }
    conds.push(or(...ors));
  }

  if (filters.cursor) {
    const decoded = decodeCursor(filters.cursor);
    if (decoded) {
      conds.push(
        or(
          lt(payments.createdAt, decoded.createdAt),
          and(eq(payments.createdAt, decoded.createdAt), lt(payments.id, decoded.id)),
        ),
      );
    }
  }

  const base = db
    .select(SELECT_COLS)
    .from(payments)
    .innerJoin(purchaseOrders, eq(payments.purchaseOrderId, purchaseOrders.id))
    .innerJoin(businesses, eq(purchaseOrders.businessId, businesses.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id));

  const ordered = (() => {
    switch (sort) {
      case 'createdAt-asc':
        return base.orderBy(asc(payments.createdAt), asc(payments.id));
      case 'amount-desc':
        return base.orderBy(desc(payments.amountCents), desc(payments.createdAt), desc(payments.id));
      case 'amount-asc':
        return base.orderBy(asc(payments.amountCents), asc(payments.createdAt), asc(payments.id));
      case 'createdAt-desc':
      default:
        return base.orderBy(desc(payments.createdAt), desc(payments.id));
    }
  })();

  const rows = (await (conds.length
    ? ordered.where(and(...conds))
    : ordered
  ).limit(limit + 1).all()) as PaymentRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export type DetailBundle = {
  payment: PaymentRow & {
    statusReason: string | null;
    idempotencyKey: string | null;
    gatewayPayload: string | null;
    confirmedByUserId: string | null;
    notes: string | null;
    updatedAt: number;
  };
  purchaseOrder: {
    id: string;
    poNumber: string;
    status: string;
    totalCents: number;
    createdAt: number;
    deliveryAt: number | null;
  } | null;
  business: { id: string; name: string; email: string | null } | null;
  supplier: { id: string; name: string; email: string | null } | null;
  refunds: Array<{
    id: string;
    paymentId: string;
    amountCents: number;
    reason: string | null;
    status: string;
    requestedByUserId: string;
    processedAt: number | null;
    failureReason: string | null;
    createdAt: number;
  }>;
  chargebacks: Array<{
    id: string;
    paymentId: string;
    reason: string;
    status: 'open' | 'resolved' | 'cancelled';
    resolvedBy: string | null;
    resolvedAt: number | null;
    notes: string | null;
    createdAt: number;
  }>;
  ledger: Array<{
    id: string;
    accountType: string;
    accountId: string;
    direction: 'debit' | 'credit';
    amountCents: number;
    currency: string;
    refType: string;
    refId: string;
    description: string;
    createdAt: number;
  }>;
};

export async function getPaymentDetailBundle(db: any, paymentId: string): Promise<DetailBundle | null> {
  const head = await db
    .select({
      ...SELECT_COLS,
      statusReason: payments.statusReason,
      idempotencyKey: payments.idempotencyKey,
      gatewayPayload: payments.gatewayPayload,
      confirmedByUserId: payments.confirmedByUserId,
      notes: payments.notes,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .innerJoin(purchaseOrders, eq(payments.purchaseOrderId, purchaseOrders.id))
    .innerJoin(businesses, eq(purchaseOrders.businessId, businesses.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(payments.id, paymentId))
    .get();

  if (!head) return null;

  const refundIdsRows = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.paymentId, paymentId))
    .all();
  const refundIds = refundIdsRows.map((r: { id: string }) => r.id);

  const [poRow, bizRow, supRow, refundRows, cbRows, ledgerRows] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
        totalCents: purchaseOrders.totalCents,
        createdAt: purchaseOrders.createdAt,
        deliveryAt: purchaseOrders.deliveredAt,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, head.purchaseOrderId))
      .get(),
    db
      .select({ id: businesses.id, name: businesses.name, email: businesses.email })
      .from(businesses)
      .where(eq(businesses.id, head.businessId))
      .get(),
    db
      .select({ id: suppliers.id, name: suppliers.name, email: suppliers.email })
      .from(suppliers)
      .where(eq(suppliers.id, head.supplierId))
      .get(),
    db
      .select({
        id: refunds.id,
        paymentId: refunds.paymentId,
        amountCents: refunds.amountCents,
        reason: refunds.reason,
        status: refunds.status,
        requestedByUserId: refunds.requestedByUserId,
        processedAt: refunds.processedAt,
        failureReason: refunds.failureReason,
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .where(eq(refunds.paymentId, paymentId))
      .orderBy(desc(refunds.createdAt))
      .all(),
    db
      .select({
        id: chargebacks.id,
        paymentId: chargebacks.paymentId,
        reason: chargebacks.reason,
        status: chargebacks.status,
        resolvedBy: chargebacks.resolvedBy,
        resolvedAt: chargebacks.resolvedAt,
        notes: chargebacks.notes,
        createdAt: chargebacks.createdAt,
      })
      .from(chargebacks)
      .where(eq(chargebacks.paymentId, paymentId))
      .orderBy(desc(chargebacks.createdAt))
      .all(),
    // Ledger: payment itself + every refund on the payment. Use refType+refId
    // (refType='payment', refId=paymentId) OR (refType='refund', refId IN refundIds).
    refundIds.length
      ? db
          .select({
            id: ledgerEntries.id,
            accountType: ledgerEntries.accountType,
            accountId: ledgerEntries.accountId,
            direction: ledgerEntries.direction,
            amountCents: ledgerEntries.amountCents,
            currency: ledgerEntries.currency,
            refType: ledgerEntries.refType,
            refId: ledgerEntries.refId,
            description: ledgerEntries.description,
            createdAt: ledgerEntries.createdAt,
          })
          .from(ledgerEntries)
          .where(
            or(
              and(eq(ledgerEntries.refType, 'payment'), eq(ledgerEntries.refId, paymentId)),
              and(eq(ledgerEntries.refType, 'refund'), inArray(ledgerEntries.refId, refundIds)),
            ),
          )
          .orderBy(desc(ledgerEntries.createdAt))
          .all()
      : db
          .select({
            id: ledgerEntries.id,
            accountType: ledgerEntries.accountType,
            accountId: ledgerEntries.accountId,
            direction: ledgerEntries.direction,
            amountCents: ledgerEntries.amountCents,
            currency: ledgerEntries.currency,
            refType: ledgerEntries.refType,
            refId: ledgerEntries.refId,
            description: ledgerEntries.description,
            createdAt: ledgerEntries.createdAt,
          })
          .from(ledgerEntries)
          .where(and(eq(ledgerEntries.refType, 'payment'), eq(ledgerEntries.refId, paymentId)))
          .orderBy(desc(ledgerEntries.createdAt))
          .all(),
  ]);

  return {
    payment: head,
    purchaseOrder: poRow ?? null,
    business: bizRow ?? null,
    supplier: supRow ?? null,
    refunds: refundRows ?? [],
    chargebacks: cbRows ?? [],
    ledger: ledgerRows ?? [],
  };
}

export async function listPaymentOptions(db: any): Promise<{
  businesses: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}> {
  const [biz, sup] = await Promise.all([
    db
      .select({ id: businesses.id, name: businesses.name })
      .from(businesses)
      .orderBy(asc(businesses.name))
      .all(),
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .orderBy(asc(suppliers.name))
      .all(),
  ]);
  return { businesses: biz ?? [], suppliers: sup ?? [] };
}

// Suppress unused-import warning on `sql` — kept for future sort hooks.
void sql;
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run test/admin/payment-search-repo.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/payments/paymentSearchRepository.ts \
        apps/api/test/admin/payment-search-repo.test.ts
git commit -m "feat(api): admin payment search repository (list/detail/options)"
```

---

## Task 2: paymentSearchService (TDD)

**Files:**
- Create: `apps/api/src/modules/admin/payments/paymentSearchService.ts`
- Create: `apps/api/test/admin/payment-search-service.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function listPayments(d1: D1Database, filters: PaymentSearchFilters): Promise<{ rows: PaymentRow[]; nextCursor: string | null }>;
  export async function getPaymentDetail(d1: D1Database, id: string): Promise<DetailBundle | null>;
  export async function getPaymentOptions(d1: D1Database): Promise<{ businesses: Array<{id:string;name:string}>; suppliers: Array<{id:string;name:string}> }>;
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/admin/payment-search-service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { listPayments, getPaymentDetail, getPaymentOptions } from '../../src/modules/admin/payments/paymentSearchService';

vi.mock('@vyro/db', () => ({ getDb: (d1: any) => d1 }));

const db = {
  search: vi.fn(),
  detail: vi.fn(),
  options: vi.fn(),
};

vi.mock('../../src/modules/admin/payments/paymentSearchRepository', () => ({
  searchPayments: (...args: any[]) => db.search(...args),
  getPaymentDetailBundle: (...args: any[]) => db.detail(...args),
  listPaymentOptions: (...args: any[]) => db.options(...args),
}));

describe('listPayments', () => {
  it('parses csv status + clamps limit + returns rows + cursor', async () => {
    db.search.mockResolvedValueOnce({ rows: [{ id: 'p1' }], nextCursor: 'cur' });
    const out = await listPayments({} as any, { status: 'pending,confirmed', limit: '500' } as any);
    expect(out.nextCursor).toBe('cur');
    const filters = db.search.mock.calls[0][1];
    expect(filters.status).toEqual(['pending', 'confirmed']);
    expect(filters.limit).toBe(200); // clamped to max
  });
});

describe('getPaymentDetail', () => {
  it('delegates and returns bundle', async () => {
    db.detail.mockResolvedValueOnce({ payment: { id: 'p1' } });
    const out = await getPaymentDetail({} as any, 'p1');
    expect(out?.payment.id).toBe('p1');
  });

  it('returns null when missing', async () => {
    db.detail.mockResolvedValueOnce(null);
    const out = await getPaymentDetail({} as any, 'x');
    expect(out).toBeNull();
  });
});

describe('getPaymentOptions', () => {
  it('delegates', async () => {
    db.options.mockResolvedValueOnce({ businesses: [], suppliers: [] });
    const out = await getPaymentOptions({} as any);
    expect(out).toEqual({ businesses: [], suppliers: [] });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run test/admin/payment-search-service.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/modules/admin/payments/paymentSearchService.ts`:

```ts
import { getDb } from '@vyro/db';
import {
  searchPayments as repoSearch,
  getPaymentDetailBundle as repoDetail,
  listPaymentOptions as repoOptions,
  type PaymentSearchFilters,
  type PaymentRow,
  type DetailBundle,
} from './paymentSearchRepository';

export type { PaymentRow, PaymentSearchFilters, DetailBundle } from './paymentSearchRepository';

const ALL_STATUSES = ['pending', 'confirmed', 'failed', 'refunded'] as const;
const ALL_METHODS = ['cash', 'bank_transfer', 'online'] as const;

function parseCsv<T extends string>(raw: unknown, allowed: readonly T[]): T[] | undefined {
  if (typeof raw !== 'string' || !raw.length) return undefined;
  const out: T[] = [];
  for (const part of raw.split(',')) {
    const v = part.trim();
    if ((allowed as readonly string[]).includes(v)) out.push(v as T);
  }
  return out.length ? out : undefined;
}

function parseSort(raw: unknown): PaymentSearchFilters['sort'] {
  switch (raw) {
    case 'createdAt-asc':
    case 'createdAt-desc':
    case 'amount-desc':
    case 'amount-asc':
      return raw;
    default:
      return 'createdAt-desc';
  }
}

export type ListInput = {
  q?: unknown;
  status?: unknown;
  method?: unknown;
  businessId?: unknown;
  supplierId?: unknown;
  minCents?: unknown;
  maxCents?: unknown;
  from?: unknown;
  to?: unknown;
  cursor?: unknown;
  limit?: unknown;
  sort?: unknown;
};

export async function listPayments(
  d1: D1Database,
  raw: ListInput,
): Promise<{ rows: PaymentRow[]; nextCursor: string | null }> {
  const filters: PaymentSearchFilters = {};
  if (typeof raw.q === 'string') filters.q = raw.q;
  const status = parseCsv(raw.status, ALL_STATUSES);
  if (status) filters.status = status as PaymentSearchFilters['status'];
  if (typeof raw.method === 'string' && (ALL_METHODS as readonly string[]).includes(raw.method)) {
    filters.method = raw.method as PaymentSearchFilters['method'];
  }
  if (typeof raw.businessId === 'string' && raw.businessId.length) filters.businessId = raw.businessId;
  if (typeof raw.supplierId === 'string' && raw.supplierId.length) filters.supplierId = raw.supplierId;
  if (typeof raw.minCents === 'string' && raw.minCents.length) {
    const n = Number(raw.minCents);
    if (Number.isFinite(n) && n >= 0) filters.minCents = n;
  }
  if (typeof raw.maxCents === 'string' && raw.maxCents.length) {
    const n = Number(raw.maxCents);
    if (Number.isFinite(n) && n >= 0) filters.maxCents = n;
  }
  if (typeof raw.from === 'string' && raw.from.length) {
    const n = Number(raw.from);
    if (Number.isFinite(n)) filters.from = n;
  }
  if (typeof raw.to === 'string' && raw.to.length) {
    const n = Number(raw.to);
    if (Number.isFinite(n)) filters.to = n;
  }
  if (typeof raw.cursor === 'string' && raw.cursor.length) filters.cursor = raw.cursor;
  if (typeof raw.limit === 'string' && raw.limit.length) {
    const n = Number(raw.limit);
    if (Number.isFinite(n)) filters.limit = Math.min(Math.max(Math.floor(n), 1), 200);
  }
  filters.sort = parseSort(raw.sort);

  return repoSearch(getDb(d1), filters);
}

export async function getPaymentDetail(d1: D1Database, id: string): Promise<DetailBundle | null> {
  return repoDetail(getDb(d1), id);
}

export async function getPaymentOptions(d1: D1Database) {
  return repoOptions(getDb(d1));
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm exec vitest run test/admin/payment-search-service.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/payments/paymentSearchService.ts \
        apps/api/test/admin/payment-search-service.test.ts
git commit -m "feat(api): admin payment search service (csv parse + clamps)"
```

---

## Task 3: paymentSearchRoutes (HTTP layer, TDD)

**Files:**
- Create: `apps/api/src/modules/admin/payments/paymentSearchRoutes.ts`
- Create: `apps/api/test/admin/payment-search-routes.test.ts`
- Modify: `apps/api/src/modules/admin/routes.ts`

**Interfaces:**
- Produces: Hono sub-router mounted at `/api/admin/payments/*` with three GET endpoints, all gated by `requirePermission('payment:read')`; detail route additionally audits `payment.view`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/admin/payment-search-routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AdminRole } from '@vyro/auth';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test',
  },
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    const role = (c.get('testRole') ?? null) as AdminRole | null;
    c.set('ctx', { userId: 'admin-1', email: 'a@x', isAdmin: role !== null, adminRole: role, businesses: [], suppliers: [] });
    await n();
  },
}));

const state = vi.hoisted(() => ({
  list: [] as any[],
  detail: null as any,
  options: { businesses: [], suppliers: [] } as any,
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/payments/paymentSearchService', () => ({
  listPayments: async (_d1: any, _f: any) => ({ rows: state.list, nextCursor: null }),
  getPaymentDetail: async (_d1: any, id: string) => (id === 'p1' ? state.detail : null),
  getPaymentOptions: async (_d1: any) => state.options,
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => { state.audit.push(opts); },
}));

import paymentSearchRoutes from '../../src/modules/admin/payments/paymentSearchRoutes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp(adminRole: AdminRole | null) {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => { c.set('testRole', adminRole); await next(); });
  app.route('/api/admin/payments', paymentSearchRoutes);
  return app;
}

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test',
} as any;

describe('GET /api/admin/payments', () => {
  beforeEach(() => { state.list = [{ id: 'p1', amountCents: 100 }]; state.audit = []; });

  it('finance → 200 with rows', async () => {
    const res = await buildApp('finance').fetch(new Request('http://localhost/api/admin/payments'), env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.payments).toEqual([{ id: 'p1', amountCents: 100 }]);
  });

  it('ops → 403', async () => {
    const res = await buildApp('ops').fetch(new Request('http://localhost/api/admin/payments'), env);
    expect(res.status).toBe(403);
  });

  it('super_admin → 200', async () => {
    const res = await buildApp('super_admin').fetch(new Request('http://localhost/api/admin/payments'), env);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/payments/:id', () => {
  beforeEach(() => { state.detail = { payment: { id: 'p1' }, refunds: [], chargebacks: [], ledger: [] }; state.audit = []; });

  it('returns detail + audits payment.view', async () => {
    const res = await buildApp('finance').fetch(new Request('http://localhost/api/admin/payments/p1'), env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.payment.id).toBe('p1');
    expect(state.audit[0].action).toBe('payment.view');
    expect(state.audit[0].target).toEqual({ type: 'payment', id: 'p1' });
  });

  it('missing → 404', async () => {
    const res = await buildApp('finance').fetch(new Request('http://localhost/api/admin/payments/absent'), env);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/payments/options', () => {
  beforeEach(() => { state.options = { businesses: [{ id: 'b1', name: 'Biz' }], suppliers: [] }; });

  it('returns options', async () => {
    const res = await buildApp('finance').fetch(new Request('http://localhost/api/admin/payments/options'), env);
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.businesses).toEqual([{ id: 'b1', name: 'Biz' }]);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run test/admin/payment-search-routes.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the routes**

Create `apps/api/src/modules/admin/payments/paymentSearchRoutes.ts`:

```ts
import { Hono } from 'hono';
import type { Env } from '../../../env';
import { requireRole, requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import {
  listPayments,
  getPaymentDetail,
  getPaymentOptions,
} from './paymentSearchService';

const router = new Hono<{ Bindings: Env }>();

router.use('*', requireRole({ admin: true }));

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
```

- [ ] **Step 4: Mount in admin router**

Edit `apps/api/src/modules/admin/routes.ts`. The router already has `router.use('*', session(), requireRole({ admin: true }));` and `router.route('/queues', queuesRoutes);`. Add the import:

```ts
import paymentSearchRoutes from './payments/paymentSearchRoutes';
```

After the queues mount, add:

```ts
router.route('/payments', paymentSearchRoutes);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm exec vitest run test/admin/payment-search-routes.test.ts`
Expected: PASS

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/admin/payments/paymentSearchRoutes.ts \
        apps/api/test/admin/payment-search-routes.test.ts \
        apps/api/src/modules/admin/routes.ts
git commit -m "feat(api): admin /api/admin/payments routes with payment:read RBAC"
```

---

## Task 4: Web hooks (useAdminPaymentSearch/Detail/Options)

**Files:**
- Create: `apps/web/src/admin/useAdminPaymentSearch.ts`
- Create: `apps/web/src/admin/useAdminPaymentDetail.ts`
- Create: `apps/web/src/admin/useAdminPaymentOptions.ts`

**Interfaces:**
- Produces (in `useAdminPaymentSearch.ts`):
  ```ts
  export type PaymentRow = { id: string; purchaseOrderId: string; poNumber: string;
    businessId: string; businessName: string; supplierId: string; supplierName: string;
    amountCents: number; feeCents: number; netCents: number; currency: string;
    status: 'pending'|'confirmed'|'failed'|'refunded';
    method: 'cash'|'bank_transfer'|'online';
    transactionReference: string|null; gatewayRef: string|null;
    paidAt: number|null; confirmedAt: number|null; createdAt: number; };
  export type PaymentSearchFilters = {
    q?: string; status?: ('pending'|'confirmed'|'failed'|'refunded')[];
    method?: 'cash'|'bank_transfer'|'online';
    businessId?: string; supplierId?: string;
    minCents?: number; maxCents?: number;
    from?: number; to?: number;
    cursor?: string; limit?: number;
    sort?: 'createdAt-desc'|'createdAt-asc'|'amount-desc'|'amount-asc';
  };
  export function useAdminPaymentSearch(filters: PaymentSearchFilters, cursor?: string): UseQueryResult<{ payments: PaymentRow[]; nextCursor: string|null }>;
  ```
- Produces (in `useAdminPaymentDetail.ts`):
  ```ts
  export function useAdminPaymentDetail(id: string): UseQueryResult<{
    payment: PaymentRow & { statusReason: string|null; idempotencyKey: string|null; gatewayPayload: string|null; confirmedByUserId: string|null; notes: string|null; updatedAt: number };
    purchaseOrder: { id:string; poNumber:string; status:string; totalCents:number; createdAt:number; deliveryAt:number|null }|null;
    business: { id:string; name:string; email:string|null }|null;
    supplier: { id:string; name:string; email:string|null }|null;
    refunds: Array<...>; chargebacks: Array<...>; ledger: Array<...>;
  }>;
  ```
- Produces (in `useAdminPaymentOptions.ts`):
  ```ts
  export function useAdminPaymentOptions(): UseQueryResult<{
    businesses: Array<{id:string;name:string}>; suppliers: Array<{id:string;name:string}>;
  }>;
  ```

- [ ] **Step 1: Create useAdminPaymentSearch**

Create `apps/web/src/admin/useAdminPaymentSearch.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'online';

export type PaymentRow = {
  id: string;
  purchaseOrderId: string;
  poNumber: string;
  businessId: string;
  businessName: string;
  supplierId: string;
  supplierName: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  transactionReference: string | null;
  gatewayRef: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
  createdAt: number;
};

export type PaymentSearchFilters = {
  q?: string;
  status?: PaymentStatus[];
  method?: PaymentMethod;
  businessId?: string;
  supplierId?: string;
  minCents?: number;
  maxCents?: number;
  from?: number;
  to?: number;
  sort?: 'createdAt-desc' | 'createdAt-asc' | 'amount-desc' | 'amount-asc';
};

function buildQuery(filters: PaymentSearchFilters, cursor?: string): string {
  const qs = new URLSearchParams();
  if (filters.q) qs.set('q', filters.q);
  if (filters.status?.length) qs.set('status', filters.status.join(','));
  if (filters.method) qs.set('method', filters.method);
  if (filters.businessId) qs.set('businessId', filters.businessId);
  if (filters.supplierId) qs.set('supplierId', filters.supplierId);
  if (typeof filters.minCents === 'number') qs.set('minCents', String(filters.minCents));
  if (typeof filters.maxCents === 'number') qs.set('maxCents', String(filters.maxCents));
  if (typeof filters.from === 'number') qs.set('from', String(filters.from));
  if (typeof filters.to === 'number') qs.set('to', String(filters.to));
  if (filters.sort) qs.set('sort', filters.sort);
  if (cursor) qs.set('cursor', cursor);
  return qs.toString();
}

export function useAdminPaymentSearch(
  filters: PaymentSearchFilters,
  cursor?: string,
): UseQueryResult<{ payments: PaymentRow[]; nextCursor: string | null }> {
  const qs = buildQuery(filters, cursor);
  return useQuery({
    queryKey: ['admin', 'payments', 'search', filters, cursor ?? null],
    queryFn: async () => {
      const path = `/admin/payments${qs ? `?${qs}` : ''}`;
      return (await api.get<{ payments: PaymentRow[]; nextCursor: string | null }>(path));
    },
  });
}
```

- [ ] **Step 2: Create useAdminPaymentDetail**

Create `apps/web/src/admin/useAdminPaymentDetail.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PaymentRow } from './useAdminPaymentSearch';

export type DetailBundle = {
  payment: PaymentRow & {
    statusReason: string | null;
    idempotencyKey: string | null;
    gatewayPayload: string | null;
    confirmedByUserId: string | null;
    notes: string | null;
    updatedAt: number;
  };
  purchaseOrder: {
    id: string;
    poNumber: string;
    status: string;
    totalCents: number;
    createdAt: number;
    deliveryAt: number | null;
  } | null;
  business: { id: string; name: string; email: string | null } | null;
  supplier: { id: string; name: string; email: string | null } | null;
  refunds: Array<{
    id: string;
    paymentId: string;
    amountCents: number;
    reason: string | null;
    status: string;
    requestedByUserId: string;
    processedAt: number | null;
    failureReason: string | null;
    createdAt: number;
  }>;
  chargebacks: Array<{
    id: string;
    paymentId: string;
    reason: string;
    status: 'open' | 'resolved' | 'cancelled';
    resolvedBy: string | null;
    resolvedAt: number | null;
    notes: string | null;
    createdAt: number;
  }>;
  ledger: Array<{
    id: string;
    accountType: string;
    accountId: string;
    direction: 'debit' | 'credit';
    amountCents: number;
    currency: string;
    refType: string;
    refId: string;
    description: string;
    createdAt: number;
  }>;
};

export function useAdminPaymentDetail(id: string): UseQueryResult<DetailBundle> {
  return useQuery({
    queryKey: ['admin', 'payments', 'detail', id],
    queryFn: async () => (await api.get<DetailBundle>(`/admin/payments/${encodeURIComponent(id)}`)),
    enabled: !!id,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 3: Create useAdminPaymentOptions**

Create `apps/web/src/admin/useAdminPaymentOptions.ts`:

```ts
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type PaymentOptions = {
  businesses: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
};

export function useAdminPaymentOptions(): UseQueryResult<PaymentOptions> {
  return useQuery({
    queryKey: ['admin', 'payments', 'options'],
    queryFn: async () => (await api.get<PaymentOptions>('/admin/payments/options')),
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/admin/useAdminPaymentSearch.ts \
        apps/web/src/admin/useAdminPaymentDetail.ts \
        apps/web/src/admin/useAdminPaymentOptions.ts
git commit -m "feat(web): useAdminPaymentSearch/Detail/Options hooks"
```

---

## Task 5: PaymentsPage (list) component

**Files:**
- Create: `apps/web/src/admin/PaymentsPage.tsx`
- Create: `apps/web/src/admin/PaymentsPage.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/admin/MoneyPage.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/admin/PaymentsPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PaymentsPage } from './PaymentsPage';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PaymentsPage', () => {
  it('renders filter bar + results table', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/payments/options')) {
        return Promise.resolve(new Response(JSON.stringify({ businesses: [], suppliers: [] }), { status: 200 }));
      }
      if (u.includes('/admin/payments')) {
        return Promise.resolve(new Response(JSON.stringify({
          payments: [
            { id: 'pay-1', purchaseOrderId: 'po-1', poNumber: 'PO-1',
              businessId: 'b1', businessName: 'Biz', supplierId: 's1', supplierName: 'Sup',
              amountCents: 50000, feeCents: 1000, netCents: 49000, currency: 'LKR',
              status: 'confirmed', method: 'online', transactionReference: 'ref-1', gatewayRef: 'gw-1',
              paidAt: 1700000000000, confirmedAt: 1700000010000, createdAt: 1700000020000 },
          ],
          nextCursor: null,
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    global.fetch = fetchMock as any;
    setup();
    expect(await screen.findByDisplayValue('')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Biz')).toBeInTheDocument());
    expect(screen.getByText('Sup')).toBeInTheDocument();
    expect(screen.getByText(/500\.00 LKR/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/web exec vitest run src/admin/PaymentsPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement PaymentsPage**

Create `apps/web/src/admin/PaymentsPage.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useAdminPaymentSearch,
  useAdminPaymentOptions,
  type PaymentStatus,
  type PaymentMethod,
  type PaymentRow,
} from './useAdminPaymentSearch';

const ALL_STATUSES: PaymentStatus[] = ['pending', 'confirmed', 'failed', 'refunded'];

function fmtCents(c: number, currency: string) {
  return `${(c / 100).toFixed(2)} ${currency}`;
}

function statusBadge(status: PaymentRow['status']) {
  const cls = status === 'confirmed'
    ? 'bg-mint/15 text-mint border-mint/25'
    : status === 'failed'
      ? 'bg-rose/15 text-rose border-rose/30'
      : status === 'refunded'
        ? 'bg-amber/15 text-amber border-amber/25'
        : 'bg-mist text-ink-3 border-line';
  return `inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase border ${cls}`;
}

function fmtTs(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

export function PaymentsPage() {
  const can = usePermission('payment:read');
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const f: Parameters<typeof useAdminPaymentSearch>[0] = {};
    const q = params.get('q'); if (q) f.q = q;
    const status = params.get('status'); if (status) f.status = status.split(',') as PaymentStatus[];
    const method = params.get('method') as PaymentMethod | null;
    if (method) f.method = method;
    const businessId = params.get('businessId'); if (businessId) f.businessId = businessId;
    const supplierId = params.get('supplierId'); if (supplierId) f.supplierId = supplierId;
    const minCents = params.get('minCents'); if (minCents) f.minCents = Number(minCents);
    const maxCents = params.get('maxCents'); if (maxCents) f.maxCents = Number(maxCents);
    const sort = params.get('sort');
    if (sort === 'createdAt-asc' || sort === 'createdAt-desc' || sort === 'amount-asc' || sort === 'amount-desc') f.sort = sort;
    return f;
  }, [params]);

  const search = useAdminPaymentSearch(filters);
  const options = useAdminPaymentOptions();
  const [cursor, setCursor] = useState<string | null>(null);

  if (!can) return <ErrorBanner message="You need payment:read permission" />;
  if (search.isError) return <ErrorBanner message={(search.error as Error).message} />;

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '' || value === undefined) next.delete(key);
    else next.set(key, value);
    setParams(next);
    setCursor(null);
  };

  const toggleStatus = (s: PaymentStatus) => {
    const cur = (params.get('status') ?? '').split(',').filter(Boolean) as PaymentStatus[];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    updateParam('status', next.length ? next.join(',') : null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" sub="Cross-tenant payment search and detail" />

      <Surface className="p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col text-xs flex-1 min-w-[200px]">
            <span className="text-ink-500">Search (id, txn ref, gateway ref)</span>
            <input
              type="text"
              defaultValue={params.get('q') ?? ''}
              onBlur={(e) => updateParam('q', e.currentTarget.value || null)}
              placeholder="pay_… or gateway ref"
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Method</span>
            <select
              value={params.get('method') ?? ''}
              onChange={(e) => updateParam('method', e.currentTarget.value || null)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            >
              <option value="">Any</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="online">Online</option>
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Sort</span>
            <select
              value={params.get('sort') ?? 'createdAt-desc'}
              onChange={(e) => updateParam('sort', e.currentTarget.value)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            >
              <option value="createdAt-desc">Newest first</option>
              <option value="createdAt-asc">Oldest first</option>
              <option value="amount-desc">Amount high → low</option>
              <option value="amount-asc">Amount low → high</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Business</span>
            <select
              value={params.get('businessId') ?? ''}
              onChange={(e) => updateParam('businessId', e.currentTarget.value || null)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            >
              <option value="">Any</option>
              {(options.data?.businesses ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Supplier</span>
            <select
              value={params.get('supplierId') ?? ''}
              onChange={(e) => updateParam('supplierId', e.currentTarget.value || null)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper"
            >
              <option value="">Any</option>
              {(options.data?.suppliers ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Min (LKR)</span>
            <input
              type="number" min={0} step={0.01}
              defaultValue={params.get('minCents') ? String(Number(params.get('minCents')) / 100) : ''}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                updateParam('minCents', v ? String(Math.round(Number(v) * 100)) : null);
              }}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper w-32"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="text-ink-500">Max (LKR)</span>
            <input
              type="number" min={0} step={0.01}
              defaultValue={params.get('maxCents') ? String(Number(params.get('maxCents')) / 100) : ''}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                updateParam('maxCents', v ? String(Math.round(Number(v) * 100)) : null);
              }}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper w-32"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-500">Status:</span>
          {ALL_STATUSES.map((s) => {
            const active = (params.get('status') ?? '').split(',').includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`text-[10px] font-mono uppercase px-2 py-1 border rounded ${
                  active ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15 text-ink-3'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </Surface>

      <Surface className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-500 bg-bone/70">
              <th className="py-2 px-3">Payment</th>
              <th className="py-2 px-3">PO</th>
              <th className="py-2 px-3">Business</th>
              <th className="py-2 px-3">Supplier</th>
              <th className="py-2 px-3 text-right">Amount</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Method</th>
              <th className="py-2 px-3">When</th>
            </tr>
          </thead>
          <tbody>
            {(search.data?.payments ?? []).map((p) => (
              <tr key={p.id} className="border-t border-ink/10 hover:bg-bone/30">
                <td className="py-2 px-3">
                  <Link to={`/admin/payments/${p.id}`} className="font-mono text-xs text-copper hover:underline">
                    {p.id.slice(0, 16)}…
                  </Link>
                </td>
                <td className="py-2 px-3 font-mono text-xs">{p.poNumber}</td>
                <td className="py-2 px-3">{p.businessName}</td>
                <td className="py-2 px-3">{p.supplierName}</td>
                <td className="py-2 px-3 text-right tabular-nums">{fmtCents(p.amountCents, p.currency)}</td>
                <td className="py-2 px-3"><span className={statusBadge(p.status)}>{p.status}</span></td>
                <td className="py-2 px-3">{p.method}</td>
                <td className="py-2 px-3 text-xs">{fmtTs(p.createdAt)}</td>
              </tr>
            ))}
            {!search.data?.payments?.length ? (
              <tr><td colSpan={8} className="py-6 text-center text-ink-500">No payments match these filters</td></tr>
            ) : null}
          </tbody>
        </table>
      </Surface>

      {search.data?.nextCursor ? (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setCursor(search.data!.nextCursor!)}>
            Load next page
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Mount routes in App.tsx**

Edit `apps/web/src/App.tsx`. After `const MoneyPage = lazy(...)`, add:

```tsx
const PaymentsPage = lazy(() => import('./admin/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const PaymentDetailPage = lazy(() => import('./admin/PaymentDetailPage').then((m) => ({ default: m.PaymentDetailPage })));
```

In the admin `<Route path="/admin" element={<AdminShell />}>` block, after the `money` route, add:

```tsx
<Route path="payments" element={<RequireAdmin><PaymentsPage /></RequireAdmin>} />
<Route path="payments/:id" element={<RequireAdmin><PaymentDetailPage /></RequireAdmin>} />
```

- [ ] **Step 5: Add link from MoneyPage**

Edit `apps/web/src/admin/MoneyPage.tsx`. Inside the `MoneyPage` component, after the `<PageHeader>`, add a small link row:

```tsx
<div className="text-xs">
  <Link to="/admin/payments" className="text-volt underline">All payments →</Link>
</div>
```

Add the import at top:

```tsx
import { Link } from 'react-router-dom';
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @vyro/web exec vitest run src/admin/PaymentsPage.test.tsx`
Expected: PASS

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/admin/PaymentsPage.tsx \
        apps/web/src/admin/PaymentsPage.test.tsx \
        apps/web/src/App.tsx \
        apps/web/src/admin/MoneyPage.tsx
git commit -m "feat(web): admin Payments list page + nav link from MoneyPage"
```

---

## Task 6: PaymentDetailPage (detail bundle) component

**Files:**
- Create: `apps/web/src/admin/PaymentDetailPage.tsx`
- Create: `apps/web/src/admin/PaymentDetailPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/admin/PaymentDetailPage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { PaymentDetailPage } from './PaymentDetailPage';

function setup(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/admin/payments/:id" element={<PaymentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PaymentDetailPage', () => {
  it('renders header + timeline + linked entities', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/admin/payments/pay-1')) {
        return Promise.resolve(new Response(JSON.stringify({
          payment: {
            id: 'pay-1', purchaseOrderId: 'po-1', poNumber: 'PO-1',
            businessId: 'b1', businessName: 'Biz', supplierId: 's1', supplierName: 'Sup',
            amountCents: 50000, feeCents: 1000, netCents: 49000, currency: 'LKR',
            status: 'confirmed', method: 'online', transactionReference: 'ref-1', gatewayRef: 'gw-1',
            paidAt: 1700000000000, confirmedAt: 1700000010000, createdAt: 1700000020000,
            statusReason: null, idempotencyKey: null, gatewayPayload: null,
            confirmedByUserId: null, notes: null, updatedAt: 1700000030000,
          },
          purchaseOrder: { id: 'po-1', poNumber: 'PO-1', status: 'delivered', totalCents: 50000, createdAt: 1700000000000, deliveryAt: 1700000040000 },
          business: { id: 'b1', name: 'Biz', email: 'biz@x' },
          supplier: { id: 's1', name: 'Sup', email: 'sup@x' },
          refunds: [],
          chargebacks: [],
          ledger: [],
        }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    global.fetch = fetchMock as any;
    setup('/admin/payments/pay-1');
    await waitFor(() => expect(screen.getByText(/pay-1/)).toBeInTheDocument());
    expect(screen.getByText('Biz')).toBeInTheDocument();
    expect(screen.getByText('Sup')).toBeInTheDocument();
    expect(screen.getByText(/500\.00 LKR/)).toBeInTheDocument();
  });

  it('renders 404 banner when payment missing', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'payment not found' } }), { status: 404 })) as any;
    setup('/admin/payments/absent');
    await waitFor(() => expect(screen.getByText(/payment not found|404/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm --filter @vyro/web exec vitest run src/admin/PaymentDetailPage.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement PaymentDetailPage**

Create `apps/web/src/admin/PaymentDetailPage.tsx`:

```tsx
import { useParams, Link } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner } from '@/components/ui';
import { usePermission } from './lib/permissions';
import { useAdminPaymentDetail } from './useAdminPaymentDetail';

function fmtCents(c: number, currency: string) {
  return `${(c / 100).toFixed(2)} ${currency}`;
}

function fmtTs(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

function maskPayload(json: string | null): string {
  if (!json) return '';
  try {
    const parsed = JSON.parse(json);
    const SECRET = /(secret|password|signature)/i;
    const mask = (v: unknown): unknown => {
      if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
          out[k] = SECRET.test(k) ? '••••' : mask(val);
        }
        return out;
      }
      if (Array.isArray(v)) return v.map(mask);
      return v;
    };
    return JSON.stringify(mask(parsed), null, 2);
  } catch {
    return json;
  }
}

export function PaymentDetailPage() {
  const can = usePermission('payment:read');
  const { id = '' } = useParams<{ id: string }>();
  const q = useAdminPaymentDetail(id);

  if (!can) return <ErrorBanner message="You need payment:read permission" />;
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} />;
  if (!q.data) return <div className="text-sm text-ink-500">Loading…</div>;

  const { payment, purchaseOrder, business, supplier, refunds, chargebacks, ledger } = q.data;

  const timeline: Array<{ when: number; label: string; detail?: string }> = [];
  timeline.push({ when: payment.createdAt, label: 'Created' });
  if (payment.paidAt) timeline.push({ when: payment.paidAt, label: 'Paid' });
  if (payment.confirmedAt) {
    timeline.push({
      when: payment.confirmedAt,
      label: 'Confirmed',
      detail: payment.confirmedByUserId ? `by ${payment.confirmedByUserId}` : undefined,
    });
  }
  for (const r of refunds) {
    timeline.push({
      when: r.createdAt,
      label: `Refund ${r.status}`,
      detail: `${fmtCents(r.amountCents, payment.currency)} — ${r.reason ?? 'no reason'}`,
    });
    if (r.processedAt) timeline.push({ when: r.processedAt, label: `Refund processed` });
  }
  for (const cb of chargebacks) {
    timeline.push({ when: cb.createdAt, label: `Chargeback ${cb.status}`, detail: cb.reason });
    if (cb.resolvedAt) timeline.push({ when: cb.resolvedAt, label: 'Chargeback resolved' });
  }
  timeline.sort((a, b) => a.when - b.when);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payment ${payment.id.slice(0, 16)}…`}
        sub={`${fmtCents(payment.amountCents, payment.currency)} • fee ${fmtCents(payment.feeCents, payment.currency)} • net ${fmtCents(payment.netCents, payment.currency)}`}
        actions={
          <div className="flex gap-2 text-xs">
            <Link className="text-volt underline" to="/admin/payments">← All payments</Link>
          </div>
        }
      />

      {/* Header chips */}
      <Surface className="p-3 flex flex-wrap gap-3 text-xs">
        <span className="font-mono">{payment.id}</span>
        <span>PO: {purchaseOrder ? <Link className="text-copper underline" to={`/orders/${purchaseOrder.id}`}>{purchaseOrder.poNumber}</Link> : '—'}</span>
        {business ? <span>Business: <Link className="text-copper underline" to={`/admin/businesses/${business.id}`}>{business.name}</Link></span> : null}
        {supplier ? <span>Supplier: <Link className="text-copper underline" to={`/admin/suppliers/${supplier.id}`}>{supplier.name}</Link></span> : null}
        <span>Method: {payment.method}</span>
        <span>Status: <strong>{payment.status}</strong></span>
        {payment.transactionReference ? <span>Txn: {payment.transactionReference}</span> : null}
        {payment.gatewayRef ? <span>Gateway: {payment.gatewayRef}</span> : null}
      </Surface>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Timeline */}
        <Surface className="p-4">
          <h3 className="text-sm font-medium mb-2">Timeline</h3>
          <ol className="space-y-2 text-xs">
            {timeline.map((e, i) => (
              <li key={i} className="border-l-2 border-volt pl-2">
                <div className="text-ink-500">{fmtTs(e.when)}</div>
                <div className="font-medium">{e.label}</div>
                {e.detail ? <div className="text-ink-400">{e.detail}</div> : null}
              </li>
            ))}
            {!timeline.length ? <li className="text-ink-500">No events</li> : null}
          </ol>
        </Surface>

        {/* Linked entities */}
        <Surface className="p-4">
          <h3 className="text-sm font-medium mb-2">Linked</h3>
          <div className="space-y-2 text-xs">
            {purchaseOrder ? (
              <div>
                <div className="font-medium">{purchaseOrder.poNumber}</div>
                <div className="text-ink-500">{purchaseOrder.status} • {fmtCents(purchaseOrder.totalCents, payment.currency)}</div>
                <div className="text-ink-400">Delivered {fmtTs(purchaseOrder.deliveryAt)}</div>
              </div>
            ) : <div className="text-ink-500">No PO linked</div>}
          </div>
        </Surface>

        <Surface className="p-4">
          <h3 className="text-sm font-medium mb-2">Parties</h3>
          <div className="space-y-2 text-xs">
            {business ? <div><div className="font-medium">{business.name}</div><div className="text-ink-400">{business.email ?? '—'}</div></div> : <div className="text-ink-500">No business</div>}
            {supplier ? <div className="mt-2"><div className="font-medium">{supplier.name}</div><div className="text-ink-400">{supplier.email ?? '—'}</div></div> : null}
          </div>
        </Surface>
      </div>

      {/* Gateway payload */}
      {payment.gatewayPayload ? (
        <Surface className="p-4">
          <details>
            <summary className="text-sm font-medium cursor-pointer">Gateway response (masked)</summary>
            <pre className="mt-2 text-xs whitespace-pre-wrap break-all bg-ink/5 p-2 rounded">
              {maskPayload(payment.gatewayPayload)}
            </pre>
          </details>
        </Surface>
      ) : null}

      {/* Refunds */}
      <Surface className="p-4">
        <h3 className="text-sm font-medium mb-2">Refunds</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500"><th>ID</th><th>Amount</th><th>Status</th><th>Reason</th><th>Created</th><th>Processed</th><th /></tr></thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id} className="border-t border-ink/10">
                <td className="font-mono text-xs">{r.id}</td>
                <td>{fmtCents(r.amountCents, payment.currency)}</td>
                <td>{r.status}</td>
                <td className="text-xs">{r.reason ?? '—'}</td>
                <td className="text-xs">{fmtTs(r.createdAt)}</td>
                <td className="text-xs">{fmtTs(r.processedAt)}</td>
                <td>{r.status === 'requested' ? <Link className="text-volt underline text-xs" to="/admin/money?tab=refunds">Open in refund queue →</Link> : null}</td>
              </tr>
            ))}
            {!refunds.length ? <tr><td colSpan={7} className="py-2 text-center text-ink-500">No refunds</td></tr> : null}
          </tbody>
        </table>
      </Surface>

      {/* Chargebacks */}
      <Surface className="p-4">
        <h3 className="text-sm font-medium mb-2">Chargebacks</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500"><th>ID</th><th>Reason</th><th>Status</th><th>Created</th><th>Resolved</th><th>Notes</th></tr></thead>
          <tbody>
            {chargebacks.map((cb) => (
              <tr key={cb.id} className="border-t border-ink/10">
                <td className="font-mono text-xs">{cb.id}</td>
                <td className="text-xs">{cb.reason}</td>
                <td>{cb.status}</td>
                <td className="text-xs">{fmtTs(cb.createdAt)}</td>
                <td className="text-xs">{fmtTs(cb.resolvedAt)}</td>
                <td className="text-xs">{cb.notes ?? '—'}</td>
              </tr>
            ))}
            {!chargebacks.length ? <tr><td colSpan={6} className="py-2 text-center text-ink-500">No chargebacks</td></tr> : null}
          </tbody>
        </table>
      </Surface>

      {/* Ledger */}
      <Surface className="p-4">
        <h3 className="text-sm font-medium mb-2">Ledger entries</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500"><th>When</th><th>Account</th><th>Direction</th><th>Amount</th><th>Ref</th><th>Description</th></tr></thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id} className="border-t border-ink/10">
                <td className="text-xs">{fmtTs(l.createdAt)}</td>
                <td className="text-xs">{l.accountType}:{l.accountId}</td>
                <td className="text-xs">{l.direction}</td>
                <td className="text-right tabular-nums">{fmtCents(l.amountCents, l.currency)}</td>
                <td className="text-xs font-mono">{l.refType}:{l.refId}</td>
                <td className="text-xs">{l.description}</td>
              </tr>
            ))}
            {!ledger.length ? <tr><td colSpan={6} className="py-2 text-center text-ink-500">No ledger entries</td></tr> : null}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @vyro/web exec vitest run src/admin/PaymentDetailPage.test.tsx`
Expected: PASS

Run: `pnpm typecheck`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/admin/PaymentDetailPage.tsx \
        apps/web/src/admin/PaymentDetailPage.test.tsx
git commit -m "feat(web): admin Payment detail page with timeline + linked bundle"
```

---

## Task 7: Final smoke + runbook + full test

**Files:**
- Modify: `docs/runbook.md`

- [ ] **Step 1: Run all tests + typecheck across monorepo**

Run: `pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 2: Build SPA + Worker dry-run**

Run: `pnpm build`
Expected: exit 0.

- [ ] **Step 3: Append runbook note**

Open `docs/runbook.md`. Append:

````markdown
## Admin payment search + detail

Two routes behind `payment:read` permission:

- `/admin/payments` — cross-tenant list with filter bar (q / status chips / method / business / supplier / amount range / sort).
- `/admin/payments/:id` — single payment bundle: header chips, timeline, linked PO/business/supplier, masked gateway payload, refunds, chargebacks, ledger entries.

Detail views emit `admin_audit_logs` rows with action `payment.view` and target `{type:'payment', id}`.

Ledger linkage uses `ledger_entries.refType + refId` (`refType='payment', refId=<payment.id>` plus `refType='refund', refId IN refunds of this payment`). No new columns needed.
````

- [ ] **Step 4: Commit**

```bash
git add docs/runbook.md
git commit -m "docs: admin payment search + detail runbook"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Architecture → Tasks 1, 2, 3
  - Data shape → Task 1 (PaymentRow, DetailBundle match spec; ledger uses refType+refId not LIKE; refunds match real schema fields)
  - API contracts → Task 3 (3 GET endpoints, RBAC, cursor, audit on detail)
  - Permissions → Task 3 (reuses payment:read)
  - UI list page → Task 5 (filter bar, results table, URL params)
  - UI detail page → Task 6 (header, timeline, linked entities, gateway mask, refunds, chargebacks, ledger)
  - Audit → Task 3 (payment.view on detail)
  - Testing → Tasks 1, 2, 3, 5, 6 (unit + integration + page tests)
  - Migration plan → Task 7 (no schema change; only docs + tests)
  - Open risks — ledger refType+refId chosen (better than LIKE from spec); gateway masking implemented; q prefix LIKE documented
- [x] **Placeholder scan:** No `TODO`/`TBD`/`implement later` in steps.
- [x] **Type consistency:** `PaymentRow` shape identical across repo (Task 1), service (Task 2), hooks (Task 4), pages (Tasks 5, 6). `DetailBundle` exported from repo and re-exported via service.
- [x] **RBAC:** All three routes gated by `requirePermission('payment:read')` (Task 3). Tested.
- [x] **Audit:** `payment.view` written on detail GET success (Task 3).
- [x] **No new tables/indexes/permissions:** Confirmed across all tasks.
- [x] **Filter coercion:** csv `status`, numeric clamps, sort enum handled in service (Task 2) + zod-style validation in repo (Task 1).
- [x] **Cursor stability:** base64url(createdAt:id), tie-breaker on id (Task 1).

End of plan.
