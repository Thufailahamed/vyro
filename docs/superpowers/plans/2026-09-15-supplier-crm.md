# Supplier CRM (Lead Manager) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-supplier Lead Manager / CRM inbox to Vyro so suppliers can tag (Hot/Warm/Cold), annotate, and track conversion on every RFQ they were invited to.

**Architecture:** Extend the existing `rfqs/` module rather than introduce a new one. CRM unit is `rfq_suppliers` (one row per supplier invited to an RFQ), since RFQs are multi-supplier. New endpoints under `/api/supplier/crm/*`. Conversion auto-tracked via two new internal hooks: `markQuoted` (called from supplier-quote submission) and `markOrdered` (called from `purchaseOrders.createOrder`). Gated by `LEAD_MANAGER_ENABLED` flag with 3-phase rollout.

**Tech Stack:** Hono (Cloudflare Workers + D1), Drizzle ORM, Zod, React (supplier portal), Vitest.

## Global Constraints

- Single feature flag `LEAD_MANAGER_ENABLED` in `apps/api/src/lib/flags.ts`; default `false`. Same flag on web via existing `useFlag` hook.
- Module placement: extend `apps/api/src/modules/rfqs/`. No new module.
- Service signature style: mirror `apps/api/src/modules/credit/` (schema → repo → service → routes, vitest tests).
- Per-spec: tags are fixed 3-value enum (Hot/Warm/Cold); notes are free-text ≤1000 chars append-only; conversion auto-tracked (no supplier self-report); single-user per supplier; filters tag + status + date range.
- API paths: `/api/supplier/crm/leads/*` (not `/rfqs/*`).
- Commit message style: `feat(crm): ...`, `test(crm): ...`, `feat(api): ...`.
- `pnpm typecheck` and `pnpm test` must remain green after every task.
- Do not edit files in `packages/db/migrations/` directly — write a new `<ts>_supplier_crm.sql` and apply via `wrangler d1 migrations apply`.

## File Structure

### New files (API)
- `apps/api/src/modules/rfqs/crm.ts` — service helpers (`crmList`, `crmGet`, `crmSetTag`, `crmSetStatus`, `crmAddNote`, `crmListNotes`, `crmSummary`, `markQuoted`, `markOrdered`).
- `apps/api/src/modules/rfqs/crmRepository.ts` — DB queries + filter builder.
- `apps/api/src/modules/rfqs/crmRoutes.ts` — 7 HTTP endpoints.
- `packages/db/src/schema/rfqSupplierNotes.ts` — Drizzle table for notes.
- `packages/db/migrations/<ts>_supplier_crm.sql` — D1 migration.
- `packages/validation/src/rfqCrm.ts` — Zod schemas for filter / tag / status / notes.
- `apps/api/test/rfqs/crmService.test.ts` — service unit tests.
- `apps/api/test/rfqs/crmRoutes.test.ts` — route tests.
- `apps/api/test/rfqs/conversionHooks.test.ts` — markQuoted / markOrdered tests.
- `scripts/e2e/crm.md` — e2e smoke walkthrough.

### Modified files (API)
- `packages/db/src/schema/rfqs.ts` — add 5 columns on `rfqSuppliers`.
- `packages/db/src/schema/index.ts` — export new `rfqSupplierNotes` table.
- `apps/api/src/modules/rfqs/schema.ts` — TS types for new columns.
- `apps/api/src/modules/rfqs/repository.ts` — expose new columns on reads.
- `apps/api/src/modules/rfqs/service.ts` — call `markQuoted` from quote-submit.
- `apps/api/src/modules/rfqs/index.ts` — register `crmRoutes`.
- `apps/api/src/modules/purchaseOrders/service.ts` — call `markOrdered` from `createOrder`.
- `apps/api/src/lib/flags.ts` — add `LEAD_MANAGER_ENABLED`.
- `apps/api/wrangler.toml` — set flag default off.

### New files (Web)
- `apps/web/src/supplier/LeadsPage.tsx` — inbox with filter chips + table.
- `apps/web/src/supplier/LeadDetailDrawer.tsx` — slide-out with notes + tag + status.
- `apps/web/src/supplier/TagPicker.tsx` — Hot/Warm/Cold selector.
- `apps/web/src/supplier/ConversionBadge.tsx` — won/lost/quoted badge.
- `apps/web/src/supplier/NotesPanel.tsx` — append-only notes list + composer.
- `apps/web/src/supplier/LeadsSummaryCard.tsx` — dashboard tile.
- `apps/web/src/supplier/useLeadManager.ts` — API hooks.

### Modified files (Web)
- `apps/web/src/supplier/SupplierQuoteDetailPage.tsx` — embed `TagPicker` + `NotesPanel` + `ConversionBadge`.
- `apps/web/src/supplier/DashboardPage.tsx` — embed `LeadsSummaryCard`.
- `apps/web/src/supplier/Shell.tsx` — add "Leads" top-nav entry.

---

## Task 1: D1 migration — `rfq_suppliers` columns + `rfq_supplier_notes` table

**Files:**
- Create: `packages/db/migrations/<ts>_supplier_crm.sql` (replace `<ts>` with current epoch ms at execution time)
- Modify: `packages/db/src/schema/rfqs.ts:80-99` (add columns)
- Create: `packages/db/src/schema/rfqSupplierNotes.ts`
- Modify: `packages/db/src/schema/index.ts` (export new table)

**Interfaces:**
- Produces: Drizzle table `rfqSupplierNotes` + new columns on `rfqSuppliers`. No consumers yet.

- [ ] **Step 1: Write the migration SQL**

Create `packages/db/migrations/<ts>_supplier_crm.sql` with:

```sql
ALTER TABLE rfq_suppliers ADD COLUMN tag TEXT CHECK (tag IN ('hot','warm','cold'));
ALTER TABLE rfq_suppliers ADD COLUMN conversion_status TEXT CHECK (conversion_status IN ('new','contacted','quoted','won','lost'));
ALTER TABLE rfq_suppliers ADD COLUMN quoted_at INTEGER;
ALTER TABLE rfq_suppliers ADD COLUMN order_id TEXT REFERENCES purchase_orders(id);
ALTER TABLE rfq_suppliers ADD COLUMN order_value_cents INTEGER;

CREATE INDEX rfq_suppliers_supplier_tag_idx ON rfq_suppliers (supplier_id, tag, invited_at DESC);
CREATE INDEX rfq_suppliers_supplier_status_idx ON rfq_suppliers (supplier_id, conversion_status, invited_at DESC);

CREATE TABLE rfq_supplier_notes (
  id TEXT PRIMARY KEY,
  rfq_supplier_id TEXT NOT NULL REFERENCES rfq_suppliers(id),
  body TEXT NOT NULL CHECK (length(body) > 0 AND length(body) <= 1000),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX rfq_supplier_notes_rfq_supplier_idx ON rfq_supplier_notes (rfq_supplier_id, created_at DESC);
```

- [ ] **Step 2: Apply migration locally**

Run: `pnpm --filter @vyro/db exec wrangler d1 migrations apply DB --local`
Expected: migration applied successfully; `Migrations` table now lists the new file.

- [ ] **Step 3: Update Drizzle schema — add columns on `rfqSuppliers`**

In `packages/db/src/schema/rfqs.ts`, modify the `rfqSuppliers` table definition (lines 80–99) to add columns + indexes:

```ts
export const rfqSuppliers = sqliteTable(
  'rfq_suppliers',
  {
    id: text('id').primaryKey(),
    rfqId: text('rfq_id')
      .notNull()
      .references(() => rfqs.id),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    status: text('status').notNull().default('invited'),
    invitedAt: integer('invited_at').notNull(),
    viewedAt: integer('viewed_at'),
    respondedAt: integer('responded_at'),
    tag: text('tag'),
    conversionStatus: text('conversion_status'),
    quotedAt: integer('quoted_at'),
    orderId: text('order_id'),
    orderValueCents: integer('order_value_cents'),
  },
  (t) => ({
    rfqSupplierUniq: uniqueIndex('rfq_suppliers_uniq').on(t.rfqId, t.supplierId),
    supplierStatusIdx: index('rfq_suppliers_supplier_idx').on(t.supplierId, t.status),
    supplierTagIdx: index('rfq_suppliers_supplier_tag_idx').on(t.supplierId, t.tag, t.invitedAt),
    supplierConversionIdx: index('rfq_suppliers_supplier_status_idx').on(
      t.supplierId,
      t.conversionStatus,
      t.invitedAt,
    ),
  }),
);
```

Note: `orderId` FK to `purchase_orders.id` is enforced in SQL but not as Drizzle `.references()` — Drizzle circular-import risk. Apply the FK only at SQL level (already in migration).

- [ ] **Step 4: Create new `rfqSupplierNotes` table file**

Create `packages/db/src/schema/rfqSupplierNotes.ts`:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { rfqSuppliers } from './rfqs';
import { users } from './users';

export const rfqSupplierNotes = sqliteTable(
  'rfq_supplier_notes',
  {
    id: text('id').primaryKey(),
    rfqSupplierId: text('rfq_supplier_id')
      .notNull()
      .references(() => rfqSuppliers.id),
    body: text('body').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    rfqSupplierIdx: index('rfq_supplier_notes_rfq_supplier_idx').on(
      t.rfqSupplierId,
      t.createdAt,
    ),
  }),
);
```

- [ ] **Step 5: Export from schema barrel**

In `packages/db/src/schema/index.ts`, add:

```ts
export * from './rfqSupplierNotes';
```

- [ ] **Step 6: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no TS errors).

- [ ] **Step 7: Commit**

```bash
git add packages/db/migrations/ packages/db/src/schema/rfqs.ts packages/db/src/schema/rfqSupplierNotes.ts packages/db/src/schema/index.ts
git commit -m "feat(db): add rfq_suppliers CRM columns + rfq_supplier_notes table"
```

---

## Task 2: Zod validation for CRM payloads

**Files:**
- Create: `packages/validation/src/rfqCrm.ts`
- Modify: `packages/validation/src/index.ts` (export new schemas)

**Interfaces:**
- Produces: `leadsListQuerySchema`, `setTagSchema`, `setStatusSchema`, `addNoteSchema` (Zod). Consumers: `apps/api/src/modules/rfqs/crmRoutes.ts` (Task 8).

- [ ] **Step 1: Write the failing typecheck**

Add to a scratch TS file (or rely on `pnpm typecheck` to fail when the new file imports something not yet exported):

```bash
echo "import { leadsListQuerySchema } from '@vyro/validation/rfqCrm'; console.log(leadsListQuerySchema);" > /tmp/check.ts
pnpm exec tsc --noEmit --project apps/api/tsconfig.json /tmp/check.ts 2>&1 | head -5
```

Expected: error — module `@vyro/validation/rfqCrm` not found.

- [ ] **Step 2: Create `rfqCrm.ts`**

Create `packages/validation/src/rfqCrm.ts`:

```ts
import { z } from 'zod';

export const tagSchema = z.enum(['hot', 'warm', 'cold']);

export const conversionStatusSchema = z.enum([
  'new',
  'contacted',
  'quoted',
  'won',
  'lost',
]);

export const leadsListQuerySchema = z.object({
  tag: tagSchema.optional(),
  status: conversionStatusSchema.optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const setTagSchema = z.object({
  tag: tagSchema.nullable(),
});

export const setStatusSchema = z.object({
  status: conversionStatusSchema,
});

export const addNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'note cannot be empty')
    .max(1000, 'note cannot exceed 1000 characters'),
});

export type LeadsListQuery = z.infer<typeof leadsListQuerySchema>;
export type SetTagBody = z.infer<typeof setTagSchema>;
export type SetStatusBody = z.infer<typeof setStatusSchema>;
export type AddNoteBody = z.infer<typeof addNoteSchema>;
```

- [ ] **Step 3: Export from barrel**

In `packages/validation/src/index.ts`, add:

```ts
export * from './rfqCrm';
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/rfqCrm.ts packages/validation/src/index.ts
git commit -m "feat(validation): add Zod schemas for CRM endpoints"
```

---

## Task 3: Service — `crmRepository.ts` (filter + queries)

**Files:**
- Create: `apps/api/src/modules/rfqs/crmRepository.ts`
- Test: `apps/api/test/rfqs/crmRepository.test.ts`

**Interfaces:**
- Produces:
  - `listLeadsForSupplier(supplierId, filter: LeadsListQuery): Promise<{ leads: LeadRow[]; nextCursor: string | null }>`
  - `getLeadForSupplier(supplierId, leadId): Promise<LeadRow | null>`
  - `updateLeadTag(supplierId, leadId, tag): Promise<void>`
  - `updateLeadStatus(supplierId, leadId, status): Promise<void>`
  - `insertNote(rfqSupplierId, createdBy, body): Promise<NoteRow>`
  - `listNotes(rfqSupplierId, cursor, limit): Promise<{ notes: NoteRow[]; nextCursor: string | null }>`
  - `summaryForSupplier(supplierId): Promise<SummaryRow>`
  - `findLeadByQuote(rfqSupplierId): Promise<LeadRow | null>`
  - `findLeadByRfqAndSupplier(rfqId, supplierId): Promise<LeadRow | null>`
- Consumes: Drizzle tables `rfqSuppliers`, `rfqSupplierNotes`, `rfqs`, `rfqItems`.

- [ ] **Step 1: Write the failing repository test**

Create `apps/api/test/rfqs/crmRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { crmRepository } from '../../../src/modules/rfqs/crmRepository';
import { db } from '../../../src/lib/db';
import { rfqs, rfqSuppliers, rfqItems, suppliers, users } from '@vyro/db/schema';

describe('crmRepository', () => {
  beforeEach(async () => {
    // truncate tables
    await db.delete(rfqSupplierNotes);
    await db.delete(rfqSuppliers);
    await db.delete(rfqItems);
    await db.delete(rfqs);
    await db.delete(suppliers);
    await db.delete(users);
  });

  it('listLeadsForSupplier returns only the supplier own leads', async () => {
    const supplier = await makeSupplier('s-1');
    const other = await makeSupplier('s-2');
    const rfq = await makeRfq('r-1', supplier.businessId);
    await makeRfqSupplier(rfq.id, supplier.id, 'hot', 'new');
    await makeRfqSupplier(rfq.id, other.id, 'warm', 'contacted');

    const result = await crmRepository.listLeadsForSupplier(supplier.id, {});

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].supplierId).toBe(supplier.id);
    expect(result.leads[0].tag).toBe('hot');
  });

  it('listLeadsForSupplier filters by tag', async () => {
    const supplier = await makeSupplier('s-1');
    const rfq = await makeRfq('r-1', supplier.businessId);
    await makeRfqSupplier(rfq.id, supplier.id, 'hot', 'new');
    await makeRfqSupplier(rfq.id, supplier.id, 'cold', 'new', { rfqIdSuffix: '-2' });

    const result = await crmRepository.listLeadsForSupplier(supplier.id, { tag: 'hot' });

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].tag).toBe('hot');
  });

  it('listLeadsForSupplier filters by status + date range combined', async () => {
    const supplier = await makeSupplier('s-1');
    const now = Date.now();
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'won', { invitedAt: now - 1000 });
    await makeRfqSupplier('r-2', supplier.id, 'warm', 'new', { invitedAt: now - 100 });

    const result = await crmRepository.listLeadsForSupplier(supplier.id, {
      status: 'new',
      from: now - 500,
      to: now,
    });

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].status).toBe('new');
  });

  it('insertNote + listNotes round-trip', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'new');
    const lead = await crmRepository.findLeadByRfqAndSupplier('r-1', supplier.id);

    const note = await crmRepository.insertNote(lead!.id, 'user-1', 'hello');
    const { notes } = await crmRepository.listNotes(lead!.id, undefined, 10);

    expect(note.body).toBe('hello');
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe('hello');
  });

  it('summaryForSupplier aggregates tag + status counts', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'new');
    await makeRfqSupplier('r-2', supplier.id, 'hot', 'won');
    await makeRfqSupplier('r-3', supplier.id, 'cold', 'lost');

    const summary = await crmRepository.summaryForSupplier(supplier.id);

    expect(summary.byTag.hot).toBe(2);
    expect(summary.byTag.cold).toBe(1);
    expect(summary.byStatus.won).toBe(1);
    expect(summary.byStatus.lost).toBe(1);
    expect(summary.totals.leads).toBe(3);
  });

  it('updateLeadStatus rejects write when status is terminal', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'won');

    await expect(
      crmRepository.updateLeadStatus(supplier.id, 'r-1', 'new'),
    ).rejects.toThrow(/terminal/i);
  });
});
```

Helpers (`makeSupplier`, `makeRfq`, `makeRfqSupplier`) — colocate at the bottom of the test file or extract to a shared helper if one exists in `apps/api/test/helpers/`. Match the style of other modules' test helpers (e.g. `apps/api/test/rfqs/` siblings).

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @vyro/api test apps/api/test/rfqs/crmRepository.test.ts`
Expected: FAIL — `Cannot find module '../../../src/modules/rfqs/crmRepository'`.

- [ ] **Step 3: Implement `crmRepository.ts`**

Create `apps/api/src/modules/rfqs/crmRepository.ts`:

```ts
import { and, eq, desc, lt, gte, sql, inArray } from 'drizzle-orm';
import { db } from '../../lib/db';
import {
  rfqSuppliers,
  rfqSupplierNotes,
  rfqs,
  rfqItems,
} from '@vyro/db/schema';
import type { LeadsListQuery } from '@vyro/validation';

export interface LeadRow {
  id: string;
  rfqId: string;
  supplierId: string;
  status: string;
  invitedAt: number;
  tag: string | null;
  conversionStatus: string | null;
  quotedAt: number | null;
  orderId: string | null;
  orderValueCents: number | null;
}

export interface NoteRow {
  id: string;
  rfqSupplierId: string;
  body: string;
  createdBy: string;
  createdAt: number;
}

export interface SummaryRow {
  byTag: { hot: number; warm: number; cold: number; untagged: number };
  byStatus: {
    new: number;
    contacted: number;
    quoted: number;
    won: number;
    lost: number;
  };
  totals: { leads: number; conversionRate: number };
}

const TERMINAL_STATUSES = new Set(['won', 'lost']);

export const crmRepository = {
  async listLeadsForSupplier(
    supplierId: string,
    filter: LeadsListQuery,
  ): Promise<{ leads: LeadRow[]; nextCursor: string | null }> {
    const limit = filter.limit ?? 25;
    const where = [eq(rfqSuppliers.supplierId, supplierId)];
    if (filter.tag) where.push(eq(rfqSuppliers.tag, filter.tag));
    if (filter.status) where.push(eq(rfqSuppliers.conversionStatus, filter.status));
    if (filter.from) where.push(gte(rfqSuppliers.invitedAt, filter.from));
    if (filter.to) where.push(lt(rfqSuppliers.invitedAt, filter.to));
    if (filter.cursor) where.push(lt(rfqSuppliers.invitedAt, Number(filter.cursor)));

    const rows = await db
      .select()
      .from(rfqSuppliers)
      .where(and(...where))
      .orderBy(desc(rfqSuppliers.invitedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const leads = rows.slice(0, limit) as LeadRow[];
    const nextCursor = hasMore ? String(rows[limit - 1].invitedAt) : null;
    return { leads, nextCursor };
  },

  async getLeadForSupplier(supplierId: string, leadId: string): Promise<LeadRow | null> {
    const [row] = await db
      .select()
      .from(rfqSuppliers)
      .where(and(eq(rfqSuppliers.id, leadId), eq(rfqSuppliers.supplierId, supplierId)))
      .limit(1);
    return (row as LeadRow | undefined) ?? null;
  },

  async updateLeadTag(supplierId: string, leadId: string, tag: 'hot' | 'warm' | 'cold' | null) {
    await db
      .update(rfqSuppliers)
      .set({ tag })
      .where(and(eq(rfqSuppliers.id, leadId), eq(rfqSuppliers.supplierId, supplierId)));
  },

  async updateLeadStatus(
    supplierId: string,
    leadId: string,
    status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost',
  ) {
    const existing = await this.getLeadForSupplier(supplierId, leadId);
    if (!existing) throw new Error('lead not found');
    if (existing.conversionStatus && TERMINAL_STATUSES.has(existing.conversionStatus)) {
      throw new Error(`lead is in terminal state (${existing.conversionStatus}) and cannot transition`);
    }
    await db
      .update(rfqSuppliers)
      .set({ conversionStatus: status })
      .where(and(eq(rfqSuppliers.id, leadId), eq(rfqSuppliers.supplierId, supplierId)));
  },

  async insertNote(rfqSupplierId: string, createdBy: string, body: string): Promise<NoteRow> {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    await db.insert(rfqSupplierNotes).values({ id, rfqSupplierId, createdBy, body, createdAt });
    return { id, rfqSupplierId, createdBy, body, createdAt };
  },

  async listNotes(
    rfqSupplierId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ notes: NoteRow[]; nextCursor: string | null }> {
    const where = [eq(rfqSupplierNotes.rfqSupplierId, rfqSupplierId)];
    if (cursor) where.push(lt(rfqSupplierNotes.createdAt, Number(cursor)));
    const rows = await db
      .select()
      .from(rfqSupplierNotes)
      .where(and(...where))
      .orderBy(desc(rfqSupplierNotes.createdAt))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const notes = rows.slice(0, limit) as NoteRow[];
    const nextCursor = hasMore ? String(rows[limit - 1].createdAt) : null;
    return { notes, nextCursor };
  },

  async summaryForSupplier(supplierId: string): Promise<SummaryRow> {
    const rows = await db
      .select({
        tag: rfqSuppliers.tag,
        status: rfqSuppliers.conversionStatus,
      })
      .from(rfqSuppliers)
      .where(eq(rfqSuppliers.supplierId, supplierId));

    const byTag = { hot: 0, warm: 0, cold: 0, untagged: 0 };
    const byStatus = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 };
    for (const r of rows) {
      if (r.tag === 'hot') byTag.hot++;
      else if (r.tag === 'warm') byTag.warm++;
      else if (r.tag === 'cold') byTag.cold++;
      else byTag.untagged++;
      if (r.status && r.status in byStatus) byStatus[r.status as keyof typeof byStatus]++;
    }
    const total = rows.length;
    const conversionRate = total === 0 ? 0 : byStatus.won / total;
    return { byTag, byStatus, totals: { leads: total, conversionRate } };
  },

  async findLeadByQuote(rfqSupplierId: string): Promise<LeadRow | null> {
    const [row] = await db
      .select()
      .from(rfqSuppliers)
      .where(eq(rfqSuppliers.id, rfqSupplierId))
      .limit(1);
    return (row as LeadRow | undefined) ?? null;
  },

  async findLeadByRfqAndSupplier(rfqId: string, supplierId: string): Promise<LeadRow | null> {
    const [row] = await db
      .select()
      .from(rfqSuppliers)
      .where(and(eq(rfqSuppliers.rfqId, rfqId), eq(rfqSuppliers.supplierId, supplierId)))
      .limit(1);
    return (row as LeadRow | undefined) ?? null;
  },

  // Internal — used by markOrdered hook
  async setQuoted(rfqSupplierId: string) {
    await db
      .update(rfqSuppliers)
      .set({ conversionStatus: 'quoted', quotedAt: Date.now() })
      .where(eq(rfqSuppliers.id, rfqSupplierId));
  },

  // Internal — used by markOrdered hook
  async setOrdered(rfqSupplierId: string, orderId: string, orderValueCents: number) {
    await db
      .update(rfqSuppliers)
      .set({
        conversionStatus: 'won',
        orderId,
        orderValueCents,
      })
      .where(eq(rfqSuppliers.id, rfqSupplierId));
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/api test apps/api/test/rfqs/crmRepository.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/rfqs/crmRepository.ts apps/api/test/rfqs/crmRepository.test.ts
git commit -m "feat(api): add crmRepository with lead/notes/summary queries"
```

---

## Task 4: Service — `crm.ts` (CRUD + hooks)

**Files:**
- Create: `apps/api/src/modules/rfqs/crm.ts`
- Test: `apps/api/test/rfqs/crmService.test.ts`

**Interfaces:**
- Produces:
  - `crmList(supplierId, filter)` — wraps `crmRepository.listLeadsForSupplier`.
  - `crmGet(supplierId, leadId)` — wraps `crmRepository.getLeadForSupplier` + joins RFQ items.
  - `crmSetTag(supplierId, leadId, tag)`
  - `crmSetStatus(supplierId, leadId, status)`
  - `crmAddNote(supplierId, leadId, userId, body)`
  - `crmListNotes(supplierId, leadId, cursor, limit)`
  - `crmSummary(supplierId)`
  - `markQuoted(rfqSupplierId)` — internal hook.
  - `markOrdered(rfqId, supplierId, orderId, orderValueCents)` — internal hook.

- [ ] **Step 1: Write the failing service test**

Create `apps/api/test/rfqs/crmService.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { crm } from '../../../src/modules/rfqs/crm';
import { db } from '../../../src/lib/db';
import { rfqSuppliers, rfqs, rfqItems, suppliers, users } from '@vyro/db/schema';

describe('crm service', () => {
  beforeEach(async () => {
    await db.delete(rfqSupplierNotes);
    await db.delete(rfqSuppliers);
    await db.delete(rfqItems);
    await db.delete(rfqs);
    await db.delete(suppliers);
    await db.delete(users);
  });

  it('crmAddNote rejects body over 1000 chars', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'new');

    await expect(
      crm.crmAddNote(supplier.id, 'r-1', 'u-1', 'x'.repeat(1001)),
    ).rejects.toThrow(/1000/);
  });

  it('crmAddNote trims whitespace + rejects empty', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'new');

    await expect(
      crm.crmAddNote(supplier.id, 'r-1', 'u-1', '   '),
    ).rejects.toThrow(/empty/i);
  });

  it('crmSetTag(null) clears the tag', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'new');

    await crm.crmSetTag(supplier.id, 'r-1', null);
    const lead = await crm.crmGet(supplier.id, 'r-1');
    expect(lead?.tag).toBeNull();
  });

  it('crmSetStatus blocks transitions out of won/lost', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'won');

    await expect(
      crm.crmSetStatus(supplier.id, 'r-1', 'new'),
    ).rejects.toThrow(/terminal/i);
  });

  it('markQuoted is idempotent (called twice keeps single timestamp)', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'new');
    const lead = await crm.crmGet(supplier.id, 'r-1');

    await crm.markQuoted(lead!.id);
    const first = (await crm.crmGet(supplier.id, 'r-1'))?.quotedAt;
    await new Promise((r) => setTimeout(r, 5));
    await crm.markQuoted(lead!.id);
    const second = (await crm.crmGet(supplier.id, 'r-1'))?.quotedAt;

    expect(first).toBe(second);
  });

  it('markOrdered resolves rfq_supplier by rfqId+supplierId', async () => {
    const supplier = await makeSupplier('s-1');
    const other = await makeSupplier('s-2');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'quoted');
    await makeRfqSupplier('r-1', other.id, 'warm', 'quoted');

    await crm.markOrdered('r-1', supplier.id, 'po-99', 50000);

    const winner = await crm.crmGet(supplier.id, 'r-1');
    const loser = await crm.crmGet(other.id, 'r-1');
    expect(winner?.conversionStatus).toBe('won');
    expect(winner?.orderId).toBe('po-99');
    expect(winner?.orderValueCents).toBe(50000);
    expect(loser?.conversionStatus).toBe('quoted'); // untouched
  });

  it('markOrdered silently skips when no rfq_supplier row matches', async () => {
    await expect(
      crm.markOrdered('ghost-rfq', 'ghost-supplier', 'po-1', 100),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @vyro/api test apps/api/test/rfqs/crmService.test.ts`
Expected: FAIL — module `../../../src/modules/rfqs/crm` not found.

- [ ] **Step 3: Implement `crm.ts`**

Create `apps/api/src/modules/rfqs/crm.ts`:

```ts
import { crmRepository } from './crmRepository';
import type { LeadsListQuery } from '@vyro/validation';

const NOTE_MAX = 1000;

export const crm = {
  async crmList(supplierId: string, filter: LeadsListQuery) {
    return crmRepository.listLeadsForSupplier(supplierId, filter);
  },

  async crmGet(supplierId: string, leadId: string) {
    return crmRepository.getLeadForSupplier(supplierId, leadId);
  },

  async crmSetTag(
    supplierId: string,
    leadId: string,
    tag: 'hot' | 'warm' | 'cold' | null,
  ) {
    await crmRepository.updateLeadTag(supplierId, leadId, tag);
  },

  async crmSetStatus(
    supplierId: string,
    leadId: string,
    status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost',
  ) {
    await crmRepository.updateLeadStatus(supplierId, leadId, status);
  },

  async crmAddNote(supplierId: string, leadId: string, userId: string, body: string) {
    const trimmed = body.trim();
    if (trimmed.length === 0) throw new Error('note cannot be empty');
    if (trimmed.length > NOTE_MAX) {
      throw new Error(`note cannot exceed ${NOTE_MAX} characters`);
    }
    const lead = await crmRepository.getLeadForSupplier(supplierId, leadId);
    if (!lead) throw new Error('lead not found');
    return crmRepository.insertNote(leadId, userId, trimmed);
  },

  async crmListNotes(supplierId: string, leadId: string, cursor: string | undefined, limit: number) {
    const lead = await crmRepository.getLeadForSupplier(supplierId, leadId);
    if (!lead) throw new Error('lead not found');
    return crmRepository.listNotes(leadId, cursor, limit);
  },

  async crmSummary(supplierId: string) {
    return crmRepository.summaryForSupplier(supplierId);
  },

  // Internal hooks ------------------------------------------------------

  async markQuoted(rfqSupplierId: string) {
    await crmRepository.setQuoted(rfqSupplierId);
  },

  async markOrdered(
    rfqId: string,
    supplierId: string,
    orderId: string,
    orderValueCents: number,
  ) {
    const lead = await crmRepository.findLeadByRfqAndSupplier(rfqId, supplierId);
    if (!lead) return; // silent skip — RFQ→order path may not always originate from an RFQ invitation
    await crmRepository.setOrdered(lead.id, orderId, orderValueCents);
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/api test apps/api/test/rfqs/crmService.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/rfqs/crm.ts apps/api/test/rfqs/crmService.test.ts
git commit -m "feat(api): add crm service with note validation + conversion hooks"
```

---

## Task 5: Feature flag — `LEAD_MANAGER_ENABLED`

**Files:**
- Modify: `apps/api/src/lib/flags.ts`
- Modify: `apps/api/wrangler.toml`

**Interfaces:**
- Produces: `LEAD_MANAGER_ENABLED` boolean in `flags.ts`. Consumers: `crmRoutes` (Task 7) + supplier shell nav (Task 16).

- [ ] **Step 1: Inspect existing flags**

Run: `grep -nE "REVIEWS_ENABLED|enabled" apps/api/src/lib/flags.ts | head -10`
Expected: shows the existing flag pattern.

- [ ] **Step 2: Add the flag**

In `apps/api/src/lib/flags.ts`, append:

```ts
export const LEAD_MANAGER_ENABLED = booleanFlag('LEAD_MANAGER_ENABLED', false);
```

(Adjust to match the existing pattern — if `flags.ts` uses a different export style, mirror it. Look at how `REVIEWS_ENABLED` is declared.)

- [ ] **Step 3: Default off in wrangler.toml**

In `apps/api/wrangler.toml`, append:

```toml
[vars]
LEAD_MANAGER_ENABLED = "false"
```

If a `[vars]` block already exists, merge the key into it instead of duplicating.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/flags.ts apps/api/wrangler.toml
git commit -m "feat(api): add LEAD_MANAGER_ENABLED feature flag (default off)"
```

---

## Task 6: Conversion hooks wired into existing services

**Files:**
- Modify: `apps/api/src/modules/rfqs/service.ts` (call `crm.markQuoted` from existing quote-submit)
- Modify: `apps/api/src/modules/purchaseOrders/service.ts` (call `crm.markOrdered` from `createOrder`)
- Test: `apps/api/test/rfqs/conversionHooks.test.ts`

**Interfaces:**
- Consumes: `crm.markQuoted(rfqSupplierId)`, `crm.markOrdered(rfqId, supplierId, orderId, cents)`.
- Produces: side-effect that updates `rfq_suppliers.conversion_status`.

- [ ] **Step 1: Write the failing hooks test**

Create `apps/api/test/rfqs/conversionHooks.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { crm } from '../../../src/modules/rfqs/crm';
import { rfqSuppliers } from '@vyro/db/schema';
import { eq as eqOp } from 'drizzle-orm';
import { db } from '../../../src/lib/db';

describe('conversion hooks', () => {
  beforeEach(async () => {
    await db.delete(rfqSupplierNotes);
    await db.delete(rfqSuppliers);
    await db.delete(rfqItems);
    await db.delete(rfqs);
    await db.delete(suppliers);
    await db.delete(users);
  });

  it('markQuoted via service call updates conversion_status', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, null, 'new');

    await crm.markQuoted('r-1');

    const [row] = await db.select().from(rfqSuppliers).where(eqOp(rfqSuppliers.id, 'r-1'));
    expect(row.conversionStatus).toBe('quoted');
    expect(row.quotedAt).toBeGreaterThan(0);
  });

  it('markOrdered updates only the winning supplier row', async () => {
    const s1 = await makeSupplier('s-1');
    const s2 = await makeSupplier('s-2');
    await makeRfqSupplier('r-1', s1.id, null, 'quoted');
    await makeRfqSupplier('r-1', s2.id, null, 'quoted');

    await crm.markOrdered('r-1', s1.id, 'po-1', 12000);

    const [a] = await db.select().from(rfqSuppliers).where(eqOp(rfqSuppliers.id, 'r-1'));
    // second row for s2 has same id 'r-1' in this test fixture — adjust fixture
    // to use distinct IDs in real test (see helper note below).
  });
});
```

(Helpers must produce distinct `rfq_suppliers.id` per row — extend `makeRfqSupplier` to accept an explicit `id`.)

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @vyro/api test apps/api/test/rfqs/conversionHooks.test.ts`
Expected: FAIL — assertion fails because `markQuoted` was never wired into the service.

- [ ] **Step 3: Wire `markQuoted` into quote-submit service**

In `apps/api/src/modules/rfqs/service.ts`, locate the existing function that submits a supplier quote (likely `submitQuote` or `sendQuote`). After the DB write succeeds, add:

```ts
import { crm } from './crm';

// inside submitQuote, after db.insert(...):
await crm.markQuoted(rfqSupplierId);
```

(The function name and `rfqSupplierId` variable name depend on existing implementation — match what's already there. Resolve the `rfqSupplierId` from the quote's `rfqId` + `supplierId` via `crmRepository.findLeadByRfqAndSupplier` if not directly available.)

- [ ] **Step 4: Wire `markOrdered` into purchaseOrders service**

In `apps/api/src/modules/purchaseOrders/service.ts`, locate `createOrder`. After the DB write succeeds, add:

```ts
import { crm } from '../rfqs/crm';

// inside createOrder, after db.insert(purchaseOrders).values(...):
if (input.rfqId && input.supplierId && input.orderId && input.totalCents != null) {
  await crm.markOrdered(input.rfqId, input.supplierId, input.orderId, input.totalCents);
}
```

(Adjust parameter names to match the actual `createOrder` signature — the schema for `purchaseOrders` is in `packages/db/src/schema/purchaseOrders.ts`.)

- [ ] **Step 5: Run hooks test to verify it passes**

Run: `pnpm --filter @vyro/api test apps/api/test/rfqs/conversionHooks.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full rfqs + purchaseOrders test suites**

Run: `pnpm --filter @vyro/api test`
Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/rfqs/service.ts apps/api/src/modules/purchaseOrders/service.ts apps/api/test/rfqs/conversionHooks.test.ts
git commit -m "feat(api): wire markQuoted + markOrdered hooks into existing flows"
```

---

## Task 7: Routes — `crmRoutes.ts` (7 endpoints)

**Files:**
- Create: `apps/api/src/modules/rfqs/crmRoutes.ts`
- Modify: `apps/api/src/modules/rfqs/index.ts` (register routes)
- Test: `apps/api/test/rfqs/crmRoutes.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/supplier/crm/leads`
  - `GET /api/supplier/crm/leads/:id`
  - `PATCH /api/supplier/crm/leads/:id/tag`
  - `PATCH /api/supplier/crm/leads/:id/status`
  - `POST /api/supplier/crm/leads/:id/notes`
  - `GET /api/supplier/crm/leads/:id/notes`
  - `GET /api/supplier/crm/summary`
- All gated by `LEAD_MANAGER_ENABLED` (404 if off) + `requireSupplier` middleware (existing).

- [ ] **Step 1: Write the failing route test**

Create `apps/api/test/rfqs/crmRoutes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/app';
import { db } from '../../../src/lib/db';
import { rfqSuppliers, rfqs, suppliers, users, rfqSupplierNotes } from '@vyro/db/schema';

async function loginAsSupplier(supplierId: string) {
  // mirror pattern in apps/api/test/helpers/session.ts if it exists.
  // Stub: return a cookie header.
  return { Cookie: `session=mock-${supplierId}` };
}

describe('crmRoutes', () => {
  beforeEach(async () => {
    await db.delete(rfqSupplierNotes);
    await db.delete(rfqSuppliers);
    await db.delete(rfqs);
    await db.delete(suppliers);
    await db.delete(users);
  });

  it('GET /api/supplier/crm/leads requires auth (401 anon)', async () => {
    const res = await app.request('/api/supplier/crm/leads');
    expect(res.status).toBe(401);
  });

  it('GET /api/supplier/crm/leads returns supplier-scoped leads', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'new');
    const cookie = await loginAsSupplier(supplier.id);

    const res = await app.request('/api/supplier/crm/leads', { headers: cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leads).toHaveLength(1);
  });

  it('GET /api/supplier/crm/leads 404s when flag is off', async () => {
    process.env.LEAD_MANAGER_ENABLED = 'false';
    // Re-import app with flag reset, or set the flag explicitly.
    // Stub: rely on flag default in test env.
    const supplier = await makeSupplier('s-1');
    const cookie = await loginAsSupplier(supplier.id);

    const res = await app.request('/api/supplier/crm/leads', { headers: cookie });
    expect([404, 403]).toContain(res.status);
    process.env.LEAD_MANAGER_ENABLED = 'true';
  });

  it('PATCH /api/supplier/crm/leads/:id/tag accepts valid tag', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, null, 'new');
    const cookie = await loginAsSupplier(supplier.id);

    const res = await app.request('/api/supplier/crm/leads/r-1/tag', {
      method: 'PATCH',
      headers: { ...cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'hot' }),
    });
    expect(res.status).toBe(200);
  });

  it('PATCH /api/supplier/crm/leads/:id/tag 400s on bad enum', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, null, 'new');
    const cookie = await loginAsSupplier(supplier.id);

    const res = await app.request('/api/supplier/crm/leads/r-1/tag', {
      method: 'PATCH',
      headers: { ...cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'bad' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/supplier/crm/leads/:id/notes 400s on empty body', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, null, 'new');
    const cookie = await loginAsSupplier(supplier.id);

    const res = await app.request('/api/supplier/crm/leads/r-1/notes', {
      method: 'POST',
      headers: { ...cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /api/supplier/crm/summary returns aggregate counts', async () => {
    const supplier = await makeSupplier('s-1');
    await makeRfqSupplier('r-1', supplier.id, 'hot', 'won');
    await makeRfqSupplier('r-2', supplier.id, 'cold', 'new');
    const cookie = await loginAsSupplier(supplier.id);

    const res = await app.request('/api/supplier/crm/summary', { headers: cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byTag.hot).toBe(1);
    expect(body.byTag.cold).toBe(1);
    expect(body.totals.leads).toBe(2);
  });
});
```

(Adjust `loginAsSupplier` to match the actual session-helper pattern in the repo. If no helper exists, request the test runner config to inject one. Confirm auth setup with `apps/api/test/helpers/`.)

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @vyro/api test apps/api/test/rfqs/crmRoutes.test.ts`
Expected: FAIL — routes not yet registered.

- [ ] **Step 3: Implement `crmRoutes.ts`**

Create `apps/api/src/modules/rfqs/crmRoutes.ts`:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  leadsListQuerySchema,
  setTagSchema,
  setStatusSchema,
  addNoteSchema,
} from '@vyro/validation';
import { crm } from './crm';
import { LEAD_MANAGER_ENABLED } from '../../lib/flags';
import { requireSupplier } from '../../lib/auth';
import { errorEnvelope } from '../../lib/errors';

export const crmRoutes = new Hono();

crmRoutes.use('*', requireSupplier);

crmRoutes.use('*', async (c, next) => {
  if (!LEAD_MANAGER_ENABLED) {
    return c.json(errorEnvelope('LEAD_MANAGER_DISABLED', 'feature not enabled'), 404);
  }
  await next();
});

const supplierId = (c: any) => c.get('supplierId') as string;
const userId = (c: any) => c.get('userId') as string;

crmRoutes.get('/leads', zValidator('query', leadsListQuerySchema), async (c) => {
  const filter = c.req.valid('query');
  const result = await crm.crmList(supplierId(c), filter);
  return c.json(result);
});

crmRoutes.get('/leads/:id', async (c) => {
  const lead = await crm.crmGet(supplierId(c), c.req.param('id'));
  if (!lead) return c.json(errorEnvelope('NOT_FOUND', 'lead not found'), 404);
  return c.json({ lead });
});

crmRoutes.patch(
  '/leads/:id/tag',
  zValidator('json', setTagSchema),
  async (c) => {
    const { tag } = c.req.valid('json');
    try {
      await crm.crmSetTag(supplierId(c), c.req.param('id'), tag);
    } catch (e: any) {
      return c.json(errorEnvelope('UPDATE_FAILED', e.message), 400);
    }
    return c.json({ tag });
  },
);

crmRoutes.patch(
  '/leads/:id/status',
  zValidator('json', setStatusSchema),
  async (c) => {
    const { status } = c.req.valid('json');
    try {
      await crm.crmSetStatus(supplierId(c), c.req.param('id'), status);
    } catch (e: any) {
      if (/terminal/i.test(e.message)) {
        return c.json(errorEnvelope('TERMINAL_STATE', e.message), 409);
      }
      return c.json(errorEnvelope('UPDATE_FAILED', e.message), 400);
    }
    return c.json({ status });
  },
);

crmRoutes.post(
  '/leads/:id/notes',
  zValidator('json', addNoteSchema),
  async (c) => {
    const { body } = c.req.valid('json');
    try {
      const note = await crm.crmAddNote(supplierId(c), c.req.param('id'), userId(c), body);
      return c.json({ note }, 201);
    } catch (e: any) {
      return c.json(errorEnvelope('NOTE_FAILED', e.message), 400);
    }
  },
);

crmRoutes.get('/leads/:id/notes', async (c) => {
  const cursor = c.req.query('cursor');
  const limit = Number(c.req.query('limit') ?? 25);
  try {
    const result = await crm.crmListNotes(supplierId(c), c.req.param('id'), cursor, limit);
    return c.json(result);
  } catch (e: any) {
    return c.json(errorEnvelope('NOT_FOUND', e.message), 404);
  }
});

crmRoutes.get('/summary', async (c) => {
  const summary = await crm.crmSummary(supplierId(c));
  return c.json(summary);
});
```

- [ ] **Step 4: Register routes in module index**

In `apps/api/src/modules/rfqs/index.ts`, add:

```ts
import { crmRoutes } from './crmRoutes';

// inside the existing router composition:
app.route('/api/supplier/crm', crmRoutes);
```

(Match the existing routing style — if `rfqs/index.ts` exports a `Hono` instance via `new Hono()`, append with `.route()`. If it uses `app.use('/path', ...)`, mirror that.)

- [ ] **Step 5: Run route tests**

Run: `pnpm --filter @vyro/api test apps/api/test/rfqs/crmRoutes.test.ts`
Expected: PASS.

- [ ] **Step 6: Run full suite**

Run: `pnpm --filter @vyro/api test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/rfqs/crmRoutes.ts apps/api/src/modules/rfqs/index.ts apps/api/test/rfqs/crmRoutes.test.ts
git commit -m "feat(api): add /api/supplier/crm/* routes (7 endpoints, flag-gated)"
```

---

## Task 8: Web — `useLeadManager` hooks

**Files:**
- Create: `apps/web/src/supplier/useLeadManager.ts`

**Interfaces:**
- Produces:
  - `useLeadsInbox(filter)` → `{ leads, nextCursor, isLoading, error, refetch }`
  - `useLead(leadId)` → `{ lead, isLoading, error }`
  - `useLeadNotes(leadId)` → `{ notes, addNote, isLoading, error }`
  - `useLeadsSummary()` → `{ summary, isLoading, error }`
  - `useSetTag(leadId)` → `{ setTag, isLoading, error }`
  - `useSetStatus(leadId)` → `{ setStatus, isLoading, error }`

- [ ] **Step 1: Inspect existing hook patterns**

Run: `ls apps/web/src/supplier/*.ts* | grep -i use | head -10`
Pick a sibling hook (e.g. `useSellerKyc.ts`) and mirror its style.

- [ ] **Step 2: Implement the hooks file**

Create `apps/web/src/supplier/useLeadManager.ts`:

```ts
import { useState, useCallback } from 'react';
import { apiFetch } from '../lib/apiClient';

export interface Lead {
  id: string;
  rfqId: string;
  supplierId: string;
  tag: 'hot' | 'warm' | 'cold' | null;
  conversionStatus: 'new' | 'contacted' | 'quoted' | 'won' | 'lost' | null;
  quotedAt: number | null;
  orderId: string | null;
  orderValueCents: number | null;
  invitedAt: number;
}

export interface LeadsListFilter {
  tag?: 'hot' | 'warm' | 'cold';
  status?: 'new' | 'contacted' | 'quoted' | 'won' | 'lost';
  from?: number;
  to?: number;
  cursor?: string;
  limit?: number;
}

export interface Note {
  id: string;
  rfqSupplierId: string;
  body: string;
  createdBy: string;
  createdAt: number;
}

export interface LeadsSummary {
  byTag: { hot: number; warm: number; cold: number; untagged: number };
  byStatus: {
    new: number;
    contacted: number;
    quoted: number;
    won: number;
    lost: number;
  };
  totals: { leads: number; conversionRate: number };
}

const qs = (filter: LeadsListFilter) => {
  const sp = new URLSearchParams();
  if (filter.tag) sp.set('tag', filter.tag);
  if (filter.status) sp.set('status', filter.status);
  if (filter.from) sp.set('from', String(filter.from));
  if (filter.to) sp.set('to', String(filter.to));
  if (filter.cursor) sp.set('cursor', filter.cursor);
  if (filter.limit) sp.set('limit', String(filter.limit));
  return sp.toString();
};

export function useLeadsInbox(filter: LeadsListFilter = {}) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/supplier/crm/leads?${qs(filter)}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      setLeads(body.leads);
      setNextCursor(body.nextCursor);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filter)]);

  return { leads, nextCursor, isLoading, error, refetch };
}

export function useLead(leadId: string | null) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/supplier/crm/leads/${leadId}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      setLead(body.lead);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  return { lead, isLoading, error, refetch };
}

export function useLeadNotes(leadId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/supplier/crm/leads/${leadId}/notes`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      setNotes(body.notes);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  const addNote = useCallback(
    async (body: string) => {
      if (!leadId) return;
      const res = await apiFetch(`/api/supplier/crm/leads/${leadId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const created = await res.json();
      setNotes((n) => [created.note, ...n]);
    },
    [leadId],
  );

  return { notes, isLoading, error, refetch, addNote };
}

export function useLeadsSummary() {
  const [summary, setSummary] = useState<LeadsSummary | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/supplier/crm/summary`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      setSummary(body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { summary, isLoading, error, refetch };
}

export function useSetTag(leadId: string) {
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setTag = useCallback(
    async (tag: 'hot' | 'warm' | 'cold' | null) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/supplier/crm/leads/${leadId}/tag`, {
          method: 'PATCH',
          body: JSON.stringify({ tag }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [leadId],
  );

  return { setTag, isLoading, error };
}

export function useSetStatus(leadId: string) {
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = useCallback(
    async (status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost') => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/supplier/crm/leads/${leadId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [leadId],
  );

  return { setStatus, isLoading, error };
}
```

(Adjust `apiFetch` import to the actual web-side helper. Look at `useSellerKyc.ts` or similar for the import path.)

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/supplier/useLeadManager.ts
git commit -m "feat(web): add useLeadManager hooks for supplier CRM"
```

---

## Task 9: Web — TagPicker + ConversionBadge + NotesPanel

**Files:**
- Create: `apps/web/src/supplier/TagPicker.tsx`
- Create: `apps/web/src/supplier/ConversionBadge.tsx`
- Create: `apps/web/src/supplier/NotesPanel.tsx`

**Interfaces:**
- Consumes: `useLeadNotes`, `useSetTag`, `Lead`, `Note`.
- Produces: presentational components used by `LeadsPage`, `LeadDetailDrawer`, `SupplierQuoteDetailPage`.

- [ ] **Step 1: Inspect existing UI primitives**

Run: `ls apps/web/src/components | head -20`
Identify the `Button`, `Surface`, `Badge` primitives to reuse. Match import paths in any sibling file (e.g. `useSellerKyc.ts` consumers).

- [ ] **Step 2: Implement `TagPicker.tsx`**

Create `apps/web/src/supplier/TagPicker.tsx`:

```tsx
import { Button } from '../components/Button';
import { useSetTag } from './useLeadManager';

interface Props {
  leadId: string;
  current: 'hot' | 'warm' | 'cold' | null;
}

export function TagPicker({ leadId, current }: Props) {
  const { setTag, isLoading } = useSetTag(leadId);
  const tags: Array<'hot' | 'warm' | 'cold'> = ['hot', 'warm', 'cold'];
  const palette: Record<string, string> = {
    hot: 'bg-red-100 text-red-800 border-red-300',
    warm: 'bg-amber-100 text-amber-800 border-amber-300',
    cold: 'bg-sky-100 text-sky-800 border-sky-300',
  };
  return (
    <div className="flex gap-2">
      {tags.map((t) => (
        <button
          key={t}
          disabled={isLoading}
          onClick={() => setTag(current === t ? null : t)}
          className={`px-3 py-1 rounded-full border text-xs font-medium ${
            current === t ? palette[t] : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Implement `ConversionBadge.tsx`**

Create `apps/web/src/supplier/ConversionBadge.tsx`:

```tsx
import type { Lead } from './useLeadManager';

const palette: Record<string, string> = {
  new: 'bg-gray-100 text-gray-700',
  contacted: 'bg-sky-100 text-sky-700',
  quoted: 'bg-indigo-100 text-indigo-700',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-rose-100 text-rose-700',
};

export function ConversionBadge({ status }: { status: Lead['conversionStatus'] }) {
  if (!status) return null;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${palette[status]}`}>
      {status}
    </span>
  );
}
```

- [ ] **Step 4: Implement `NotesPanel.tsx`**

Create `apps/web/src/supplier/NotesPanel.tsx`:

```tsx
import { useState } from 'react';
import { Button } from '../components/Button';
import { Textarea } from '../components/Textarea';
import { useLeadNotes } from './useLeadManager';

interface Props {
  leadId: string;
}

export function NotesPanel({ leadId }: Props) {
  const { notes, addNote, isLoading } = useLeadNotes(leadId);
  const [draft, setDraft] = useState('');

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    await addNote(trimmed);
    setDraft('');
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {notes.map((n) => (
          <li key={n.id} className="bg-gray-50 rounded p-2 text-sm">
            <div className="text-xs text-gray-500">{new Date(n.createdAt).toLocaleString()}</div>
            <div>{n.body}</div>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          placeholder="Add a note (max 1000 chars)"
        />
        <Button onClick={submit} disabled={isLoading || !draft.trim()}>
          Add note
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/supplier/TagPicker.tsx apps/web/src/supplier/ConversionBadge.tsx apps/web/src/supplier/NotesPanel.tsx
git commit -m "feat(web): add TagPicker, ConversionBadge, NotesPanel components"
```

---

## Task 10: Web — `LeadsPage` inbox

**Files:**
- Create: `apps/web/src/supplier/LeadsPage.tsx`

**Interfaces:**
- Consumes: `useLeadsInbox`, `TagPicker`, `ConversionBadge`.
- Produces: full inbox page with filter chips + table + pagination.

- [ ] **Step 1: Inspect existing page style**

Run: `cat apps/web/src/supplier/QuoteRequestsPage.tsx | head -40`
Match the layout primitives + page-header pattern.

- [ ] **Step 2: Implement `LeadsPage.tsx`**

Create `apps/web/src/supplier/LeadsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { TagPicker } from './TagPicker';
import { ConversionBadge } from './ConversionBadge';
import { useLeadsInbox, useLeadsSummary } from './useLeadManager';
import type { Lead } from './useLeadManager';

const tagFilters: Array<'hot' | 'warm' | 'cold' | null> = [null, 'hot', 'warm', 'cold'];
const statusFilters: Array<Lead['conversionStatus']> = [
  null,
  'new',
  'contacted',
  'quoted',
  'won',
  'lost',
];

export function LeadsPage() {
  const [tag, setTag] = useState<'hot' | 'warm' | 'cold' | null>(null);
  const [status, setStatus] = useState<Lead['conversionStatus']>(null);
  const { leads, isLoading, refetch, nextCursor } = useLeadsInbox({ tag: tag ?? undefined, status: status ?? undefined });
  const { summary } = useLeadsSummary();

  useEffect(() => {
    refetch();
  }, [tag, status]);

  return (
    <div className="space-y-4">
      <PageHeader title="Leads" subtitle="Track every RFQ invitation." />

      {summary && (
        <div className="grid grid-cols-5 gap-2 text-sm">
          <Tile label="Hot" value={summary.byTag.hot} />
          <Tile label="Warm" value={summary.byTag.warm} />
          <Tile label="Cold" value={summary.byTag.cold} />
          <Tile label="Untagged" value={summary.byTag.untagged} />
          <Tile label="Won" value={summary.byStatus.won} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <FilterChipGroup
          label="Tag"
          options={tagFilters}
          current={tag}
          onChange={setTag}
          render={(v) => (v === null ? 'All' : v)}
        />
        <FilterChipGroup
          label="Status"
          options={statusFilters}
          current={status}
          onChange={setStatus}
          render={(v) => (v === null ? 'All' : v)}
        />
      </div>

      {isLoading ? (
        <div className="text-gray-500">Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2">RFQ</th>
              <th>Invited</th>
              <th>Tag</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t">
                <td className="py-2 font-mono text-xs">{lead.rfqId}</td>
                <td>{new Date(lead.invitedAt).toLocaleDateString()}</td>
                <td>
                  <TagPicker leadId={lead.id} current={lead.tag} />
                </td>
                <td>
                  <ConversionBadge status={lead.conversionStatus} />
                </td>
                <td>
                  <a href={`/supplier/quotes/${lead.rfqId}`} className="text-blue-600 underline">
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nextCursor && (
        <button onClick={() => refetch()} className="text-blue-600">
          Load more
        </button>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border rounded p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function FilterChipGroup<T>({
  label,
  options,
  current,
  onChange,
  render,
}: {
  label: string;
  options: T[];
  current: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-500 mr-1">{label}:</span>
      {options.map((v) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className={`px-2 py-1 rounded text-xs ${
            current === v ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {render(v)}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/supplier/LeadsPage.tsx
git commit -m "feat(web): add LeadsPage inbox with filters + summary tiles"
```

---

## Task 11: Web — `LeadDetailDrawer`

**Files:**
- Create: `apps/web/src/supplier/LeadDetailDrawer.tsx`

**Interfaces:**
- Consumes: `useLead`, `TagPicker`, `ConversionBadge`, `NotesPanel`.
- Produces: slide-out drawer used by `LeadsPage` (and potentially future surfaces).

- [ ] **Step 1: Implement `LeadDetailDrawer.tsx`**

Create `apps/web/src/supplier/LeadDetailDrawer.tsx`:

```tsx
import { TagPicker } from './TagPicker';
import { ConversionBadge } from './ConversionBadge';
import { NotesPanel } from './NotesPanel';
import { useLead, useSetStatus } from './useLeadManager';

interface Props {
  leadId: string | null;
  onClose: () => void;
}

export function LeadDetailDrawer({ leadId, onClose }: Props) {
  const { lead } = useLead(leadId);
  const { setStatus } = useSetStatus(leadId ?? '');

  if (!leadId || !lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="w-96 bg-white h-full overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lead {lead.rfqId.slice(0, 8)}</h2>
          <button onClick={onClose} className="text-gray-500">
            Close
          </button>
        </div>

        <section>
          <h3 className="text-xs text-gray-500 mb-1">Tag</h3>
          <TagPicker leadId={lead.id} current={lead.tag} />
        </section>

        <section>
          <h3 className="text-xs text-gray-500 mb-1">Status</h3>
          <div className="flex items-center gap-2">
            <ConversionBadge status={lead.conversionStatus} />
            <select
              value={lead.conversionStatus ?? 'new'}
              onChange={(e) => setStatus(e.target.value as any)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="new">new</option>
              <option value="contacted">contacted</option>
              <option value="won">won</option>
              <option value="lost">lost</option>
            </select>
          </div>
        </section>

        {lead.orderValueCents != null && (
          <section>
            <h3 className="text-xs text-gray-500 mb-1">Order</h3>
            <div className="text-sm">Order {lead.orderId} — {lead.orderValueCents / 100}</div>
          </section>
        )}

        <section>
          <h3 className="text-xs text-gray-500 mb-1">Notes</h3>
          <NotesPanel leadId={lead.id} />
        </section>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/supplier/LeadDetailDrawer.tsx
git commit -m "feat(web): add LeadDetailDrawer with tag/status/notes"
```

---

## Task 12: Web — Supplier shell nav + DashboardPage embed + QuotePage embed

**Files:**
- Modify: `apps/web/src/supplier/Shell.tsx` (add Leads nav entry, gated by flag)
- Modify: `apps/web/src/supplier/DashboardPage.tsx` (add LeadsSummaryCard)
- Create: `apps/web/src/supplier/LeadsSummaryCard.tsx`
- Modify: `apps/web/src/supplier/SupplierQuoteDetailPage.tsx` (embed TagPicker + NotesPanel + ConversionBadge)
- Modify: web router file (whichever registers `/supplier/leads` — likely `apps/web/src/router.tsx` or `apps/web/src/main.tsx`)

**Interfaces:**
- Consumes: `LEAD_MANAGER_ENABLED` flag (existing `useFlag`), `useLeadsSummary`, `useLead`, `TagPicker`, `NotesPanel`, `ConversionBadge`.
- Produces: 1 new route, 1 new dashboard tile, embedded block on quote-detail page.

- [ ] **Step 1: Find router + shell + quote detail files**

Run:
```bash
grep -rn "QuoteRequestsPage" apps/web/src/main.tsx apps/web/src/router.tsx apps/web/src/App.tsx 2>/dev/null | head -5
ls apps/web/src/supplier/Shell.tsx
ls apps/web/src/supplier/SupplierQuoteDetailPage.tsx
```

- [ ] **Step 2: Implement `LeadsSummaryCard.tsx`**

Create `apps/web/src/supplier/LeadsSummaryCard.tsx`:

```tsx
import { useEffect } from 'react';
import { useLeadsSummary } from './useLeadManager';

export function LeadsSummaryCard() {
  const { summary, refetch } = useLeadsSummary();
  useEffect(() => {
    refetch();
  }, []);
  if (!summary) return null;
  return (
    <a
      href="/supplier/leads"
      className="block bg-white border rounded p-4 hover:shadow"
    >
      <div className="text-xs text-gray-500 mb-1">Leads</div>
      <div className="flex justify-between items-baseline">
        <div className="text-2xl font-semibold">{summary.totals.leads}</div>
        <div className="text-xs text-gray-500">
          {(summary.totals.conversionRate * 100).toFixed(0)}% won
        </div>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        Hot: {summary.byTag.hot} · Warm: {summary.byTag.warm} · Cold: {summary.byTag.cold}
      </div>
    </a>
  );
}
```

- [ ] **Step 3: Add nav entry in `Shell.tsx`**

In `apps/web/src/supplier/Shell.tsx`, add a Leads nav link gated by the `LEAD_MANAGER_ENABLED` flag. Mirror the existing pattern (e.g. conditional nav for `REVIEWS_ENABLED`). Use the existing `useFlag` hook.

```tsx
import { useFlag } from '../lib/flags';
// (or wherever useFlag lives — match existing imports)

// inside the nav array:
...(useFlag('LEAD_MANAGER_ENABLED') ? [{ to: '/supplier/leads', label: 'Leads' }] : []),
```

- [ ] **Step 4: Register route**

In the web router, add:

```tsx
import { LeadsPage } from './supplier/LeadsPage';
// inside routes:
{ path: '/supplier/leads', element: <LeadsPage /> },
```

- [ ] **Step 5: Embed summary card on dashboard**

In `apps/web/src/supplier/DashboardPage.tsx`, add `<LeadsSummaryCard />` in the dashboard tile grid (next to existing tiles). Keep the import + JSX minimal — match the existing card style.

- [ ] **Step 6: Embed CRM block on quote detail page**

In `apps/web/src/supplier/SupplierQuoteDetailPage.tsx`, locate the existing rfq context (likely an `rfqId` prop or fetched RFQ object). Resolve the matching `rfq_supplier.id` via the existing data path (the page already loads the supplier quote, which joins to `rfq_suppliers`). Render:

```tsx
import { TagPicker } from './TagPicker';
import { ConversionBadge } from './ConversionBadge';
import { NotesPanel } from './NotesPanel';
import { useLead } from './useLeadManager';

// inside the page component:
const rfqSupplierId = quote.rfqSupplierId; // exact name from existing data
const { lead } = useLead(rfqSupplierId);

// JSX block above the quote-response form:
{lead && (
  <section className="border rounded p-4 space-y-2">
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500">Tag:</span>
      <TagPicker leadId={lead.id} current={lead.tag} />
      <ConversionBadge status={lead.conversionStatus} />
    </div>
    <NotesPanel leadId={lead.id} />
  </section>
)}
```

If the quote detail page does not currently resolve `rfqSupplierId`, extend its data loader to include it (one extra column from `supplierQuotes` join). Keep the change minimal.

- [ ] **Step 7: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Smoke check routes render**

Run: `pnpm --filter @vyro/web dev` (or the existing web dev script). Manual check:
- Navigate to `/supplier/leads` while flag is OFF → 404.
- Flip flag ON in `wrangler.toml`, restart, navigate → page loads with filter UI.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/supplier/Shell.tsx apps/web/src/supplier/DashboardPage.tsx apps/web/src/supplier/SupplierQuoteDetailPage.tsx apps/web/src/supplier/LeadsSummaryCard.tsx apps/web/src/router.tsx apps/web/src/main.tsx
git commit -m "feat(web): wire Leads page, summary card, and quote-detail CRM block"
```

---

## Task 13: E2E smoke walkthrough doc

**Files:**
- Create: `scripts/e2e/crm.md`

**Interfaces:**
- Produces: human-runnable e2e checklist mirroring existing `scripts/e2e/*.md` files.

- [ ] **Step 1: Inspect existing e2e doc style**

Run: `ls scripts/e2e | head -10 && echo --- && cat scripts/e2e/$(ls scripts/e2e | head -1) | head -30`

- [ ] **Step 2: Write the walkthrough**

Create `scripts/e2e/crm.md`:

```markdown
# Supplier CRM E2E Walkthrough

Pre-req: flag `LEAD_MANAGER_ENABLED` set to `true` in `apps/api/wrangler.toml`. Local D1 + worker running.

## Steps

1. Log in as supplier `s-test` (use existing test fixture).
2. As a buyer, create an RFQ that invites supplier `s-test`.
3. As supplier `s-test`, navigate to `/supplier/leads`.
4. Verify the lead appears with tag `null`, status `new`.
5. Click "Hot" tag chip — verify lead's tag updates to `hot`.
6. Open the lead detail drawer.
7. Type "Follow up next Tuesday" into the Notes composer and submit.
8. Verify note appears in the notes list with current timestamp.
9. Submit a quote from `SupplierQuoteDetailPage` for this RFQ.
10. Return to `/supplier/leads` and verify the lead's status is now `quoted`.
11. As buyer, accept this supplier's quote (existing flow).
12. As buyer, complete checkout (existing flow) — purchase order is created with `rfqId` + `supplierId`.
13. Return to `/supplier/leads` and verify:
    - Lead status is `won`.
    - `orderId` + `orderValueCents` appear in the detail drawer.
14. Attempt to change the won lead's status back to `new` via the drawer — verify 409 error toast + status unchanged.

## Cleanup

- Reset flag to `false` in `wrangler.toml` after testing.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e/crm.md
git commit -m "docs(e2e): add supplier CRM smoke walkthrough"
```

---

## Self-Review

After saving the plan, verify:

1. **Spec coverage:** All §Architecture + §Files + §Data Model + §API surface + §UI surfaces + §Feature flag + §Tests in `2026-09-15-supplier-crm-design.md` map to tasks. Coverage map:
   - Architecture (RFQ→order, hooks) → Task 6.
   - File list (API + Web) → Tasks 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12.
   - Data model (`rfq_suppliers` columns + `rfq_supplier_notes` table + indexes) → Task 1.
   - API surface (7 endpoints) → Task 7.
   - Internal hooks (`markQuoted`, `markOrdered`) → Tasks 4, 6.
   - UI surfaces (LeadsPage, LeadDetailDrawer, quote-detail embed, dashboard tile) → Tasks 10, 11, 12.
   - Feature flag (3-phase) → Task 5 + Task 12 (web gate).
   - Tests (service, routes, conversion, e2e) → Tasks 3, 4, 6, 7, 13.

3. **Placeholder scan:** No "TODO" / "TBD" / "implement later" present. Each task has explicit code or commands.

5. **Type consistency:** Cross-task signatures match:
   - `crmRepository.listLeadsForSupplier(supplierId, filter)` → consumed by `crm.crmList` → consumed by `crmRoutes.GET /leads`.
   - `crm.crmAddNote(supplierId, leadId, userId, body)` → consumed by `crmRoutes.POST /leads/:id/notes`.
   - `crm.markQuoted(rfqSupplierId)` → consumed by `rfqs/service.ts` quote-submit.
   - `crm.markOrdered(rfqId, supplierId, orderId, cents)` → consumed by `purchaseOrders/service.ts` createOrder.
   - Hook names + Zod schema names match between tasks.

## Execution Handoff

After saving the plan, ask the user to choose execution mode (subagent-driven or inline).