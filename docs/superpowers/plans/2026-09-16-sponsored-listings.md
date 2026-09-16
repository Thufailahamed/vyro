# Sponsored Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable suppliers to buy paid placement on search/category/homepage/storefront with admin approval, KYC-gated eligibility, tiered subscriptions + per-slot flat fees, and a "Sponsored" badge + public disclosure page.

**Architecture:** New `sponsored/` module mirrors `reviews/` + `learning/` shape (repository → service → routes). 6 D1 tables; flag-gated with 3-phase rollout (admin → supplier → public). Buyer-side ranking injection lives in existing search/category/home/storefront handlers via separate `sponsored[]` response field.

**Tech Stack:** Cloudflare Workers + D1 (drizzle-orm), Hono, vitest, zod, React SPA, TanStack Query.

## Global Constraints

- Flag: `SPONSORED_LISTINGS_ENABLED` defined in `apps/api/src/lib/featureFlags.ts` + exposed via `isFeatureEnabled(c.env.DB, FLAG)`. Default OFF.
- Role guard: `requireSupplierRole(ctx, supplierId, ['owner','sales','ops','finance'])` from `@vyro/auth`. SessionContext has no direct `supplierId` — read from `?supplierId=` query for supplier endpoints.
- Money: store all amounts as integer cents in `*_cents` columns. Currency = LKR.
- IDs: uuid v4 strings everywhere except seed IDs (`plan-bronze-001` etc.).
- Time: integer unix seconds (`Math.floor(Date.now()/1000)`), not milliseconds.
- Pattern: `apps/api/src/modules/<name>/{repository,service,errors,routes,adminRoutes,index,adminIndex}.ts` + matching `test/*.test.ts`.
- Web pattern: `apps/web/src/{supplier,admin,pages,components}/<feature>/` + `apps/web/src/lib/<feature>Api.ts` + `apps/web/src/hooks/use<Feature>.ts`.
- Validation: zod schemas in `packages/validation/src/<feature>.ts`, re-exported from `@vyro/validation` barrel.
- Schemas: drizzle table defs in `packages/db/src/schema/<feature>.ts`, re-exported from `@vyro/db/schema`.
- Commit message prefix: `feat(sponsored):` / `fix(sponsored):` / `test(sponsored):` / `docs(sponsored):` / `chore(sponsored):`.
- No new top-level dependencies — use only what's in repo today.

---

## File Structure

**Created (`packages/db/`):**
- `migrations/0042_sponsored_listings.sql` — 6 tables
- `migrations/0043_sponsored_seed.sql` — 3 plans + default slots
- `src/schema/sponsored.ts` — drizzle table defs

**Created (`packages/validation/`):**
- `src/sponsored.ts` — zod schemas

**Created (`apps/api/src/modules/sponsored/`):**
- `repository.ts` — 6-entity CRUD + slot resolution query
- `service.ts` — slot algorithm, eligibility, invoice math, prorated refund
- `errors.ts` — SponsoredError class + 7 codes
- `routes.ts` — public + supplier + admin routes
- `index.ts` — default export router

**Modified (`apps/api/src/`):**
- `lib/featureFlags.ts` — add `SPONSORED_LISTINGS_ENABLED`
- `lib/errors.ts` — add 7 sponsored error codes to ErrorCode union
- `cron/dispatcher.ts` — register `sponsoredExpireSweep`
- `cron/sponsored.ts` — sweep logic (new)
- `modules/search/routes.ts` (or wherever search lives) — inject sponsored section
- `modules/categories/routes.ts` — inject sponsored section
- `modules/home/routes.ts` — inject sponsored section
- `modules/storefront/routes.ts` — inject sponsored section

**Created (`apps/web/src/`):**
- `lib/sponsoredApi.ts` — typed API client
- `hooks/useSponsored.ts` — TanStack Query hooks
- `components/SponsoredSlot.tsx` — reusable slot wrapper
- `pages/SponsoredDisclosure.tsx` — `/sponsored` static page
- `supplier/sponsored/{Index,PlansPage,SubscriptionsPage,BrowseSlotsPage,CampaignFormPage,CampaignsListPage,InvoicesPage}.tsx`
- `admin/sponsored/{AdminIndex,PlansAdmin,SlotsAdmin,ApprovalQueue,CampaignsAdmin,AnalyticsAdmin}.tsx`

**Modified (`apps/web/src/`):**
- `pages/search/*.tsx` — render `<SponsoredSlot>` at top
- `pages/category/*.tsx` — same
- `pages/home/*.tsx` — same
- `storefront/[id]/*.tsx` — same

---

## Task 1: Migration + flag wiring

**Files:**
- Create: `packages/db/migrations/0042_sponsored_listings.sql`
- Create: `packages/db/migrations/0043_sponsored_seed.sql`
- Create: `packages/db/src/schema/sponsored.ts`
- Modify: `apps/api/src/lib/featureFlags.ts`
- Test: `apps/api/test/migrations/sponsored.test.ts`

- [ ] **Step 1: Write schema test asserting 6 tables exist post-migrate**

`apps/api/test/migrations/sponsored.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyMigrations, getTableNames } from '../helpers/migrate';

describe('sponsored listings migration', () => {
  it('creates 6 tables', async () => {
    const d1 = await applyMigrations(['0042_sponsored_listings']);
    const tables = await getTableNames(d1);
    expect(tables).toEqual(
      expect.arrayContaining([
        'sponsored_slots',
        'sponsored_plans',
        'sponsored_subscriptions',
        'sponsored_campaigns',
        'sponsored_events',
        'sponsored_invoices',
      ]),
    );
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd apps/api && pnpm vitest run test/migrations/sponsored.test.ts`
Expected: FAIL — table not found.

- [ ] **Step 3: Write migration 0042**

`packages/db/migrations/0042_sponsored_listings.sql`:

```sql
CREATE TABLE sponsored_slots (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL CHECK (surface IN ('search','category','homepage','storefront')),
  position INTEGER NOT NULL,
  category_id TEXT,
  label TEXT NOT NULL,
  daily_rate_cents INTEGER NOT NULL CHECK (daily_rate_cents >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (surface, position, category_id)
);

CREATE INDEX sponsored_slots_surface_idx ON sponsored_slots (surface, active);

CREATE TABLE sponsored_plans (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('bronze','silver','gold')),
  name TEXT NOT NULL,
  monthly_rate_cents INTEGER NOT NULL CHECK (monthly_rate_cents >= 0),
  included_slot_credits INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tier)
);

CREATE TABLE sponsored_subscriptions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  plan_id TEXT NOT NULL REFERENCES sponsored_plans(id),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','expired','cancelled')),
  slot_credits_remaining INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX sponsored_subs_supplier_idx ON sponsored_subscriptions (supplier_id, status);

CREATE TABLE sponsored_campaigns (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  slot_id TEXT NOT NULL REFERENCES sponsored_slots(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_approval','pending_payment','approved','live','expired','rejected','revoked','cancelled')),
  payment_invoice_id TEXT,
  admin_notes TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX sponsored_campaigns_slot_resolve_idx ON sponsored_campaigns (slot_id, status, starts_at, ends_at);
CREATE INDEX sponsored_campaigns_supplier_idx ON sponsored_campaigns (supplier_id, status);

CREATE TABLE sponsored_events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES sponsored_campaigns(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('impression','click')),
  surface TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  user_id_hash TEXT
);

CREATE INDEX sponsored_events_campaign_idx ON sponsored_events (campaign_id, event_type, occurred_at);

CREATE TABLE sponsored_invoices (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES sponsored_campaigns(id),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','waived')),
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE INDEX sponsored_invoices_supplier_idx ON sponsored_invoices (supplier_id, status);
```

- [ ] **Step 4: Write seed migration 0043**

`packages/db/migrations/0043_sponsored_seed.sql`:

```sql
INSERT INTO sponsored_plans (id, tier, name, monthly_rate_cents, included_slot_credits, active) VALUES
  ('plan-bronze-001', 'bronze', 'Bronze', 2500000, 0, 1),
  ('plan-silver-001', 'silver', 'Silver', 6000000, 3, 1),
  ('plan-gold-001',   'gold',   'Gold',   15000000, 8, 1);

INSERT INTO sponsored_slots (id, surface, position, category_id, label, daily_rate_cents, active, created_at, updated_at) VALUES
  ('slot-search-0', 'search', 0, NULL, 'Search top #1', 50000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-search-1', 'search', 1, NULL, 'Search top #2', 40000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-search-2', 'search', 2, NULL, 'Search top #3', 30000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-0',   'homepage', 0, NULL, 'Homepage featured #1', 80000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-1',   'homepage', 1, NULL, 'Homepage featured #2', 70000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-2',   'homepage', 2, NULL, 'Homepage featured #3', 60000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-3',   'homepage', 3, NULL, 'Homepage featured #4', 50000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-4',   'homepage', 4, NULL, 'Homepage featured #5', 40000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-home-5',   'homepage', 5, NULL, 'Homepage featured #6', 30000, 1, strftime('%s','now'), strftime('%s','now')),
  ('slot-storefront-upsell', 'storefront', 0, NULL, 'Storefront upsell', 20000, 1, strftime('%s','now'), strftime('%s','now'));
```

- [ ] **Step 5: Write drizzle schema**

`packages/db/src/schema/sponsored.ts`:

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sponsoredSlots = sqliteTable('sponsored_slots', {
  id: text('id').primaryKey(),
  surface: text('surface').notNull(),
  position: integer('position').notNull(),
  categoryId: text('category_id'),
  label: text('label').notNull(),
  dailyRateCents: integer('daily_rate_cents').notNull(),
  active: integer('active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  slotUnique: uniqueIndex('sponsored_slots_surface_pos_cat_uq').on(t.surface, t.position, t.categoryId),
}));

export const sponsoredPlans = sqliteTable('sponsored_plans', {
  id: text('id').primaryKey(),
  tier: text('tier').notNull(),
  name: text('name').notNull(),
  monthlyRateCents: integer('monthly_rate_cents').notNull(),
  includedSlotCredits: integer('included_slot_credits').notNull().default(0),
  active: integer('active').notNull().default(1),
}, (t) => ({
  tierUq: uniqueIndex('sponsored_plans_tier_uq').on(t.tier),
}));

export const sponsoredSubscriptions = sqliteTable('sponsored_subscriptions', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id').notNull(),
  planId: text('plan_id').notNull(),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at').notNull(),
  status: text('status').notNull(),
  slotCreditsRemaining: integer('slot_credits_remaining').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  supplierIdx: index('sponsored_subs_supplier_idx').on(t.supplierId, t.status),
}));

export const sponsoredCampaigns = sqliteTable('sponsored_campaigns', {
  id: text('id').primaryKey(),
  supplierId: text('supplier_id').notNull(),
  slotId: text('slot_id').notNull(),
  productId: text('product_id').notNull(),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at').notNull(),
  status: text('status').notNull(),
  paymentInvoiceId: text('payment_invoice_id'),
  adminNotes: text('admin_notes'),
  pinned: integer('pinned').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  slotResolveIdx: index('sponsored_campaigns_slot_resolve_idx').on(t.slotId, t.status, t.startsAt, t.endsAt),
  supplierIdx: index('sponsored_campaigns_supplier_idx').on(t.supplierId, t.status),
}));

export const sponsoredEvents = sqliteTable('sponsored_events', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  eventType: text('event_type').notNull(),
  surface: text('surface').notNull(),
  occurredAt: integer('occurred_at').notNull(),
  requestId: text('request_id').notNull(),
  userIdHash: text('user_id_hash'),
}, (t) => ({
  requestIdUq: uniqueIndex('sponsored_events_request_id_uq').on(t.requestId),
  campaignIdx: index('sponsored_events_campaign_idx').on(t.campaignId, t.eventType, t.occurredAt),
}));

export const sponsoredInvoices = sqliteTable('sponsored_invoices', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  supplierId: text('supplier_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  paidAt: integer('paid_at'),
}, (t) => ({
  supplierIdx: index('sponsored_invoices_supplier_idx').on(t.supplierId, t.status),
}));
```

- [ ] **Step 6: Re-export from barrel**

Add to `packages/db/src/schema/index.ts`:

```ts
export * from './sponsored';
```

- [ ] **Step 7: Add flag**

In `apps/api/src/lib/featureFlags.ts`, add `'SPONSORED_LISTINGS_ENABLED'` to the flag set. If the file is a Set/Map literal, append. If it reads from env, no change needed but ensure default is OFF.

- [ ] **Step 8: Run test, verify PASS**

Run: `cd apps/api && pnpm vitest run test/migrations/sponsored.test.ts`
Expected: PASS — 6 tables present.

- [ ] **Step 9: Commit**

```bash
git add packages/db/migrations/0042_sponsored_listings.sql \
        packages/db/migrations/0043_sponsored_seed.sql \
        packages/db/src/schema/sponsored.ts \
        packages/db/src/schema/index.ts \
        apps/api/src/lib/featureFlags.ts \
        apps/api/test/migrations/sponsored.test.ts
git commit -m "feat(sponsored): schema + migrations + flag wiring"
```

---

## Task 2: Error codes

**Files:**
- Modify: `apps/api/src/lib/errors.ts`
- Test: `apps/api/test/unit/errors.test.ts` (add to existing file)

- [ ] **Step 1: Write test for 7 new codes**

In existing `apps/api/test/unit/errors.test.ts`, add:

```ts
import { httpError } from '../../src/lib/errors';

describe('sponsored error codes', () => {
  it('maps NOT_ELIGIBLE to 422', () => {
    const e = httpError(422, 'NOT_ELIGIBLE', 'not eligible');
    expect(e.status).toBe(422);
    expect(e.code).toBe('NOT_ELIGIBLE');
  });

  it.each([
    ['SLOT_UNAVAILABLE', 409],
    ['SLOT_DUPLICATE', 409],
    ['CAMPAIGN_NOT_EDITABLE', 409],
    ['CAMPAIGN_NOT_CANCELABLE', 409],
    ['INVOICE_ALREADY_PAID', 409],
    ['INVALID_DATE_RANGE', 422],
  ])('maps %s to %i', (code, status) => {
    const e = httpError(status, code as any, 'msg');
    expect(e.status).toBe(status);
    expect(e.code).toBe(code);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd apps/api && pnpm vitest run test/unit/errors.test.ts`
Expected: FAIL — TS error on literal types.

- [ ] **Step 3: Add codes to union**

In `apps/api/src/lib/errors.ts`, append to `ErrorCode` union (preserving existing order):

```ts
  | 'NOT_ELIGIBLE'
  | 'SLOT_UNAVAILABLE'
  | 'SLOT_DUPLICATE'
  | 'CAMPAIGN_NOT_EDITABLE'
  | 'CAMPAIGN_NOT_CANCELABLE'
  | 'INVOICE_ALREADY_PAID'
  | 'INVALID_DATE_RANGE';
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd apps/api && pnpm vitest run test/unit/errors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/errors.ts apps/api/test/unit/errors.test.ts
git commit -m "feat(sponsored): error codes"
```

---

## Task 3: Validation schemas

**Files:**
- Create: `packages/validation/src/sponsored.ts`
- Modify: `packages/validation/src/index.ts`
- Test: `packages/validation/test/sponsored.test.ts`

- [ ] **Step 1: Write schema test**

`packages/validation/test/sponsored.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createCampaignSchema,
  subscribePlanSchema,
  sponsorEventSchema,
  slotResolveQuerySchema,
} from '../src/sponsored';

describe('sponsored validation', () => {
  it('accepts a valid createCampaign payload', () => {
    const r = createCampaignSchema.safeParse({
      slotId: 'slot-search-0',
      productId: 'prod-1',
      startsAt: 1700000000,
      endsAt: 1700086400,
    });
    expect(r.success).toBe(true);
  });

  it('rejects createCampaign with endsAt <= startsAt', () => {
    const r = createCampaignSchema.safeParse({
      slotId: 'slot-search-0',
      productId: 'prod-1',
      startsAt: 1700000000,
      endsAt: 1700000000,
    });
    expect(r.success).toBe(false);
  });

  it('rejects sponsorEvent with bad type', () => {
    const r = sponsorEventSchema.safeParse({
      campaignId: 'c1', eventType: 'bogus', surface: 'search', requestId: 'r1',
    });
    expect(r.success).toBe(false);
  });

  it('accepts subscribePlan', () => {
    const r = subscribePlanSchema.safeParse({ planId: 'plan-bronze-001' });
    expect(r.success).toBe(true);
  });

  it('accepts slotResolveQuery', () => {
    const r = slotResolveQuerySchema.safeParse({ surface: 'search', categoryId: null });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd packages/validation && pnpm vitest run test/sponsored.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write schemas**

`packages/validation/src/sponsored.ts`:

```ts
import { z } from 'zod';

export const surfaceSchema = z.enum(['search', 'category', 'homepage', 'storefront']);
export const sponsorEventTypeSchema = z.enum(['impression', 'click']);
export const sponsorTierSchema = z.enum(['bronze', 'silver', 'gold']);
export const campaignStatusSchema = z.enum([
  'pending_approval', 'pending_payment', 'approved', 'live', 'expired', 'rejected', 'revoked', 'cancelled',
]);
export const invoiceStatusSchema = z.enum(['pending', 'paid', 'waived']);

export const slotResolveQuerySchema = z.object({
  surface: surfaceSchema,
  categoryId: z.string().nullable().optional(),
});

export const createCampaignSchema = z.object({
  slotId: z.string().min(1),
  productId: z.string().min(1),
  startsAt: z.number().int().positive(),
  endsAt: z.number().int().positive(),
}).refine((v) => v.endsAt > v.startsAt, {
  message: 'endsAt must be after startsAt',
  path: ['endsAt'],
});

export const updateCampaignSchema = z.object({
  startsAt: z.number().int().positive().optional(),
  endsAt: z.number().int().positive().optional(),
}).refine(
  (v) => v.startsAt === undefined || v.endsAt === undefined || v.endsAt > v.startsAt,
  { message: 'endsAt must be after startsAt', path: ['endsAt'] },
);

export const subscribePlanSchema = z.object({
  planId: z.string().min(1),
});

export const sponsorEventSchema = z.object({
  campaignId: z.string().min(1),
  eventType: sponsorEventTypeSchema,
  surface: surfaceSchema,
  requestId: z.string().min(8).max(128),
});

export const adminSlotUpsertSchema = z.object({
  surface: surfaceSchema,
  position: z.number().int().min(0).max(50),
  categoryId: z.string().nullable().optional(),
  label: z.string().min(1).max(200),
  dailyRateCents: z.number().int().min(0),
  active: z.boolean(),
});

export const adminPlanUpsertSchema = z.object({
  tier: sponsorTierSchema,
  name: z.string().min(1).max(120),
  monthlyRateCents: z.number().int().min(0),
  includedSlotCredits: z.number().int().min(0),
  active: z.boolean(),
});

export const adminApproveSchema = z.object({
  adminNotes: z.string().max(1000).optional(),
});

export const adminRejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const adminRevokeSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const sponsorSlotSchema = z.object({
  id: z.string(),
  surface: surfaceSchema,
  position: z.number().int(),
  categoryId: z.string().nullable(),
  label: z.string(),
  dailyRateCents: z.number().int(),
  active: z.boolean(),
});

export const sponsorCampaignSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  slotId: z.string(),
  productId: z.string(),
  startsAt: z.number().int(),
  endsAt: z.number().int(),
  status: campaignStatusSchema,
  pinned: z.boolean(),
  adminNotes: z.string().nullable(),
  createdAt: z.number().int(),
});

export const sponsorInvoiceSchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  amountCents: z.number().int(),
  status: invoiceStatusSchema,
  createdAt: z.number().int(),
  paidAt: z.number().int().nullable(),
});

export const sponsorPlanSchema = z.object({
  id: z.string(),
  tier: sponsorTierSchema,
  name: z.string(),
  monthlyRateCents: z.number().int(),
  includedSlotCredits: z.number().int(),
  active: z.boolean(),
});

export const sponsorSubscriptionSchema = z.object({
  id: z.string(),
  planId: z.string(),
  startsAt: z.number().int(),
  endsAt: z.number().int(),
  status: z.enum(['active', 'expired', 'cancelled']),
  slotCreditsRemaining: z.number().int(),
});

export const sponsorDisclosureSchema = z.object({
  version: z.string(),
  title: z.string(),
  body: z.string(),
  lastUpdated: z.number().int(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type SponsorEventInput = z.infer<typeof sponsorEventSchema>;
export type AdminSlotUpsertInput = z.infer<typeof adminSlotUpsertSchema>;
export type AdminPlanUpsertInput = z.infer<typeof adminPlanUpsertSchema>;
```

- [ ] **Step 4: Re-export**

In `packages/validation/src/index.ts`:

```ts
export * from './sponsored';
```

- [ ] **Step 5: Run test, verify PASS**

Run: `cd packages/validation && pnpm vitest run test/sponsored.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/validation/src/sponsored.ts packages/validation/src/index.ts packages/validation/test/sponsored.test.ts
git commit -m "feat(sponsored): validation schemas"
```

---

## Task 4: Repository layer

**Files:**
- Create: `apps/api/src/modules/sponsored/repository.ts`
- Test: `apps/api/src/modules/sponsored/test/repository.test.ts`

- [ ] **Step 1: Write repo tests**

`apps/api/src/modules/sponsored/test/repository.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { applyMigrations } from '../../../test/helpers/migrate';
import * as repo from '../repository';
import { v4 as uuid } from 'uuid';

const NOW = 1_700_000_000;

async function freshDb() {
  const d1 = await applyMigrations(['0042_sponsored_listings', '0043_sponsored_seed']);
  return d1 as unknown as D1Database;
}

describe('sponsored repository', () => {
  let d1: D1Database;

  beforeEach(async () => { d1 = await freshDb(); });

  it('lists active plans', async () => {
    const plans = await repo.listActivePlans(d1);
    expect(plans.length).toBe(3);
    expect(plans.map(p => p.tier).sort()).toEqual(['bronze', 'gold', 'silver']);
  });

  it('inserts and retrieves a slot', async () => {
    const id = uuid();
    await repo.insertSlot(d1, { id, surface: 'search', position: 5, categoryId: null, label: 'Test', dailyRateCents: 1000, active: 1, createdAt: NOW, updatedAt: NOW });
    const slot = await repo.getSlot(d1, id);
    expect(slot?.label).toBe('Test');
  });

  it('rejects duplicate slot (surface, position, categoryId)', async () => {
    const id1 = uuid(); const id2 = uuid();
    await repo.insertSlot(d1, { id: id1, surface: 'search', position: 99, categoryId: null, label: 'A', dailyRateCents: 1, active: 1, createdAt: NOW, updatedAt: NOW });
    await expect(repo.insertSlot(d1, { id: id2, surface: 'search', position: 99, categoryId: null, label: 'B', dailyRateCents: 1, active: 1, createdAt: NOW, updatedAt: NOW }))
      .rejects.toThrow();
  });

  it('inserts campaign + reads back', async () => {
    const cid = uuid();
    await repo.insertCampaign(d1, {
      id: cid, supplierId: 'sup-1', slotId: 'slot-search-0', productId: 'prod-1',
      startsAt: NOW, endsAt: NOW + 86400, status: 'pending_approval', pinned: 0, createdAt: NOW, updatedAt: NOW,
    });
    const c = await repo.getCampaign(d1, cid);
    expect(c?.status).toBe('pending_approval');
  });

  it('finds live campaigns for slot resolution', async () => {
    const cid = uuid();
    await repo.insertCampaign(d1, {
      id: cid, supplierId: 'sup-1', slotId: 'slot-search-0', productId: 'prod-1',
      startsAt: NOW - 1000, endsAt: NOW + 1000, status: 'live', pinned: 0, createdAt: NOW, updatedAt: NOW,
    });
    const resolved = await repo.findLiveCandidates(d1, 'slot-search-0', NOW);
    expect(resolved.length).toBe(1);
    expect(resolved[0].id).toBe(cid);
  });

  it('excludes expired + pending campaigns from slot resolution', async () => {
    const cid1 = uuid(); const cid2 = uuid();
    await repo.insertCampaign(d1, { id: cid1, supplierId: 'sup-1', slotId: 'slot-search-1', productId: 'prod-1', startsAt: NOW - 1000, endsAt: NOW + 1000, status: 'live', pinned: 0, createdAt: NOW, updatedAt: NOW });
    await repo.insertCampaign(d1, { id: cid2, supplierId: 'sup-1', slotId: 'slot-search-1', productId: 'prod-2', startsAt: NOW - 1000, endsAt: NOW + 1000, status: 'pending_payment', pinned: 0, createdAt: NOW, updatedAt: NOW });
    const resolved = await repo.findLiveCandidates(d1, 'slot-search-1', NOW);
    expect(resolved.length).toBe(1);
  });

  it('inserts event with UNIQUE requestId', async () => {
    await repo.insertEvent(d1, { id: uuid(), campaignId: 'cid', eventType: 'impression', surface: 'search', occurredAt: NOW, requestId: 'req-1', userIdHash: null });
    await expect(repo.insertEvent(d1, { id: uuid(), campaignId: 'cid', eventType: 'click', surface: 'search', occurredAt: NOW, requestId: 'req-1', userIdHash: null }))
      .rejects.toThrow();
  });

  it('lists events for campaign', async () => {
    const cid = uuid();
    await repo.insertEvent(d1, { id: uuid(), campaignId: cid, eventType: 'impression', surface: 'search', occurredAt: NOW, requestId: 'r1', userIdHash: null });
    await repo.insertEvent(d1, { id: uuid(), campaignId: cid, eventType: 'click', surface: 'search', occurredAt: NOW + 1, requestId: 'r2', userIdHash: null });
    const events = await repo.listEventsForCampaign(d1, cid);
    expect(events.length).toBe(2);
  });

  it('inserts + updates invoice status', async () => {
    const iid = uuid(); const cid = uuid();
    await repo.insertInvoice(d1, { id: iid, campaignId: cid, supplierId: 'sup-1', amountCents: 5000, status: 'pending', createdAt: NOW });
    await repo.markInvoicePaid(d1, iid, NOW);
    const inv = await repo.getInvoice(d1, iid);
    expect(inv?.status).toBe('paid');
    expect(inv?.paidAt).toBe(NOW);
  });

  it('updates campaign status', async () => {
    const cid = uuid();
    await repo.insertCampaign(d1, { id: cid, supplierId: 'sup-1', slotId: 'slot-search-0', productId: 'prod-1', startsAt: NOW, endsAt: NOW + 86400, status: 'pending_approval', pinned: 0, createdAt: NOW, updatedAt: NOW });
    await repo.updateCampaignStatus(d1, cid, 'approved', NOW);
    const c = await repo.getCampaign(d1, cid);
    expect(c?.status).toBe('approved');
  });

  it('lists campaigns by supplier + status', async () => {
    const cid = uuid();
    await repo.insertCampaign(d1, { id: cid, supplierId: 'sup-9', slotId: 'slot-search-0', productId: 'prod-1', startsAt: NOW, endsAt: NOW + 86400, status: 'pending_approval', pinned: 0, createdAt: NOW, updatedAt: NOW });
    const list = await repo.listCampaignsBySupplier(d1, 'sup-9', 'pending_approval');
    expect(list.length).toBe(1);
    const list2 = await repo.listCampaignsBySupplier(d1, 'sup-9', 'live');
    expect(list2.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd apps/api && pnpm vitest run src/modules/sponsored/test/repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write repository**

`apps/api/src/modules/sponsored/repository.ts`:

```ts
import { and, asc, eq, inArray, like, or } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  sponsoredSlots, sponsoredPlans, sponsoredSubscriptions,
  sponsoredCampaigns, sponsoredEvents, sponsoredInvoices,
} from '@vyro/db/schema';

export type Surface = 'search' | 'category' | 'homepage' | 'storefront';
export type CampaignStatus =
  | 'pending_approval' | 'pending_payment' | 'approved' | 'live'
  | 'expired' | 'rejected' | 'revoked' | 'cancelled';
export type InvoiceStatus = 'pending' | 'paid' | 'waived';
export type EventType = 'impression' | 'click';

export interface Slot {
  id: string; surface: Surface; position: number; categoryId: string | null;
  label: string; dailyRateCents: number; active: number;
  createdAt: number; updatedAt: number;
}

export interface Plan {
  id: string; tier: 'bronze' | 'silver' | 'gold';
  name: string; monthlyRateCents: number; includedSlotCredits: number; active: number;
}

export interface Subscription {
  id: string; supplierId: string; planId: string;
  startsAt: number; endsAt: number; status: 'active' | 'expired' | 'cancelled';
  slotCreditsRemaining: number; createdAt: number;
}

export interface Campaign {
  id: string; supplierId: string; slotId: string; productId: string;
  startsAt: number; endsAt: number; status: CampaignStatus;
  paymentInvoiceId: string | null; adminNotes: string | null;
  pinned: number; createdAt: number; updatedAt: number;
}

export interface SponsoredEvent {
  id: string; campaignId: string; eventType: EventType; surface: Surface;
  occurredAt: number; requestId: string; userIdHash: string | null;
}

export interface Invoice {
  id: string; campaignId: string; supplierId: string;
  amountCents: number; status: InvoiceStatus;
  createdAt: number; paidAt: number | null;
}

const ACTIVE_OR_LIVE: CampaignStatus[] = ['approved', 'live'];

// ---------- Plans ----------

export async function listActivePlans(d1: D1Database): Promise<Plan[]> {
  const db = getDb(d1);
  return db.select().from(sponsoredPlans).where(eq(sponsoredPlans.active, 1)).all() as unknown as Plan[];
}

export async function getPlan(d1: D1Database, id: string): Promise<Plan | null> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredPlans).where(eq(sponsoredPlans.id, id)).get()) as unknown as Plan ?? null;
}

export async function upsertPlan(d1: D1Database, p: Plan): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredPlans).values(p).onConflictDoUpdate({
    target: sponsoredPlans.id,
    set: { name: p.name, monthlyRateCents: p.monthlyRateCents, includedSlotCredits: p.includedSlotCredits, active: p.active },
  });
}

export async function deletePlan(d1: D1Database, id: string): Promise<void> {
  const db = getDb(d1);
  await db.delete(sponsoredPlans).where(eq(sponsoredPlans.id, id));
}

// ---------- Slots ----------

export async function listSlotsForSurface(
  d1: D1Database, surface: Surface, categoryId: string | null,
): Promise<Slot[]> {
  const db = getDb(d1);
  const rows = await db.select().from(sponsoredSlots)
    .where(and(
      eq(sponsoredSlots.surface, surface),
      eq(sponsoredSlots.active, 1),
      categoryId === null ? eq(sponsoredSlots.categoryId, null as never) : eq(sponsoredSlots.categoryId, categoryId),
    ))
    .orderBy(asc(sponsoredSlots.position))
    .all();
  return rows as unknown as Slot[];
}

export async function listAllSlots(d1: D1Database): Promise<Slot[]> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredSlots).orderBy(asc(sponsoredSlots.surface), asc(sponsoredSlots.position)).all()) as unknown as Slot[];
}

export async function getSlot(d1: D1Database, id: string): Promise<Slot | null> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredSlots).where(eq(sponsoredSlots.id, id)).get()) as unknown as Slot ?? null;
}

export async function insertSlot(d1: D1Database, s: Slot): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredSlots).values(s);
}

export async function updateSlot(d1: D1Database, id: string, patch: Partial<Slot>): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredSlots).set({ ...patch, updatedAt: Math.floor(Date.now()/1000) }).where(eq(sponsoredSlots.id, id));
}

export async function deleteSlot(d1: D1Database, id: string): Promise<void> {
  const db = getDb(d1);
  await db.delete(sponsoredSlots).where(eq(sponsoredSlots.id, id));
}

// ---------- Subscriptions ----------

export async function insertSubscription(d1: D1Database, s: Subscription): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredSubscriptions).values(s);
}

export async function getSubscription(d1: D1Database, id: string): Promise<Subscription | null> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredSubscriptions).where(eq(sponsoredSubscriptions.id, id)).get()) as unknown as Subscription ?? null;
}

export async function cancelSubscription(d1: D1Database, id: string, now: number): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredSubscriptions).set({ status: 'cancelled', endsAt: now }).where(eq(sponsoredSubscriptions.id, id));
}

export async function listActiveSubscriptionBySupplier(d1: D1Database, supplierId: string): Promise<Subscription | null> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredSubscriptions).where(and(eq(sponsoredSubscriptions.supplierId, supplierId), eq(sponsoredSubscriptions.status, 'active'))).get()) as unknown as Subscription ?? null;
}

// ---------- Campaigns ----------

export async function insertCampaign(d1: D1Database, c: Campaign): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredCampaigns).values(c);
}

export async function getCampaign(d1: D1Database, id: string): Promise<Campaign | null> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredCampaigns).where(eq(sponsoredCampaigns.id, id)).get()) as unknown as Campaign ?? null;
}

export async function updateCampaignStatus(d1: D1Database, id: string, status: CampaignStatus, now: number): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredCampaigns).set({ status, updatedAt: now }).where(eq(sponsoredCampaigns.id, id));
}

export async function updateCampaign(d1: D1Database, id: string, patch: { startsAt?: number; endsAt?: number }, now: number): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredCampaigns).set({ ...patch, updatedAt: now }).where(eq(sponsoredCampaigns.id, id));
}

export async function setCampaignPinned(d1: D1Database, id: string, pinned: number): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredCampaigns).set({ pinned }).where(eq(sponsoredCampaigns.id, id));
}

export async function setCampaignInvoice(d1: D1Database, id: string, invoiceId: string): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredCampaigns).set({ paymentInvoiceId: invoiceId }).where(eq(sponsoredCampaigns.id, id));
}

export async function setCampaignAdminNotes(d1: D1Database, id: string, notes: string): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredCampaigns).set({ adminNotes: notes }).where(eq(sponsoredCampaigns.id, id));
}

export async function listCampaignsBySupplier(d1: D1Database, supplierId: string, status?: CampaignStatus): Promise<Campaign[]> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredCampaigns)
    .where(and(eq(sponsoredCampaigns.supplierId, supplierId), status ? eq(sponsoredCampaigns.status, status) : undefined))
    .orderBy(asc(sponsoredCampaigns.createdAt))
    .all()) as unknown as Campaign[];
}

export async function listCampaignsByStatus(d1: D1Database, status: CampaignStatus): Promise<Campaign[]> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredCampaigns).where(eq(sponsoredCampaigns.status, status)).all()) as unknown as Campaign[];
}

export async function listAllCampaignsFiltered(d1: D1Database, opts: { status?: CampaignStatus; supplierId?: string; surface?: Surface }): Promise<Campaign[]> {
  const db = getDb(d1);
  let q = db.select().from(sponsoredCampaigns);
  if (opts.status) q = q.where(eq(sponsoredCampaigns.status, opts.status)) as typeof q;
  if (opts.supplierId) q = q.where(eq(sponsoredCampaigns.supplierId, opts.supplierId)) as typeof q;
  if (opts.surface) {
    const slotIds = (await db.select({ id: sponsoredSlots.id }).from(sponsoredSlots).where(eq(sponsoredSlots.surface, opts.surface)).all()).map(r => r.id);
    if (slotIds.length === 0) return [];
    q = q.where(inArray(sponsoredCampaigns.slotId, slotIds)) as typeof q;
  }
  return (await q.orderBy(asc(sponsoredCampaigns.createdAt)).all()) as unknown as Campaign[];
}

export async function findLiveCandidates(d1: D1Database, slotId: string, now: number): Promise<Campaign[]> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredCampaigns)
    .where(and(
      eq(sponsoredCampaigns.slotId, slotId),
      inArray(sponsoredCampaigns.status, ACTIVE_OR_LIVE as unknown as string[]),
    ))
    .orderBy(asc(sponsoredCampaigns.createdAt))
    .all()
    .then(rows => rows.filter(r => r.startsAt <= now && r.endsAt >= now))) as unknown as Campaign[];
}

// ---------- Events ----------

export async function insertEvent(d1: D1Database, e: SponsoredEvent): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredEvents).values(e);
}

export async function listEventsForCampaign(d1: D1Database, campaignId: string): Promise<SponsoredEvent[]> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredEvents).where(eq(sponsoredEvents.campaignId, campaignId)).all()) as unknown as SponsoredEvent[];
}

export async function aggregateEventCounts(d1: D1Database, from: number, to: number): Promise<Array<{ campaignId: string; impressions: number; clicks: number }>> {
  const db = getDb(d1);
  const rows = await db.select().from(sponsoredEvents).all() as unknown as SponsoredEvent[];
  return rows
    .filter(r => r.occurredAt >= from && r.occurredAt <= to)
    .reduce<Map<string, { campaignId: string; impressions: number; clicks: number }>>((acc, r) => {
      const cur = acc.get(r.campaignId) ?? { campaignId: r.campaignId, impressions: 0, clicks: 0 };
      if (r.eventType === 'impression') cur.impressions++;
      else cur.clicks++;
      acc.set(r.campaignId, cur);
      return acc;
    }, new Map())
    .values()
    .toArray()
    .map(v => ({ ...v }));
}

// ---------- Invoices ----------

export async function insertInvoice(d1: D1Database, inv: Invoice): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredInvoices).values(inv);
}

export async function getInvoice(d1: D1Database, id: string): Promise<Invoice | null> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredInvoices).where(eq(sponsoredInvoices.id, id)).get()) as unknown as Invoice ?? null;
}

export async function markInvoicePaid(d1: D1Database, id: string, paidAt: number): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredInvoices).set({ status: 'paid', paidAt }).where(eq(sponsoredInvoices.id, id));
}

export async function waiveInvoice(d1: D1Database, id: string): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredInvoices).set({ status: 'waived' }).where(eq(sponsoredInvoices.id, id));
}

export async function listInvoicesBySupplier(d1: D1Database, supplierId: string, status?: InvoiceStatus): Promise<Invoice[]> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredInvoices)
    .where(and(eq(sponsoredInvoices.supplierId, supplierId), status ? eq(sponsoredInvoices.status, status) : undefined))
    .orderBy(asc(sponsoredInvoices.createdAt))
    .all()) as unknown as Invoice[];
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `cd apps/api && pnpm vitest run src/modules/sponsored/test/repository.test.ts`
Expected: PASS for all 11 cases.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/sponsored/repository.ts apps/api/src/modules/sponsored/test/repository.test.ts
git commit -m "feat(sponsored): repository layer"
```

---

## Task 5: Service layer (slot resolution + eligibility + invoice math)

**Files:**
- Create: `apps/api/src/modules/sponsored/service.ts`
- Create: `apps/api/src/modules/sponsored/errors.ts`
- Test: `apps/api/src/modules/sponsored/test/service.test.ts`

- [ ] **Step 1: Write service tests**

`apps/api/src/modules/sponsored/test/service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuid } from 'uuid';
import { applyMigrations } from '../../../test/helpers/migrate';
import * as repo from '../repository';
import * as svc from './service';
import { SponsoredError } from './errors';

const NOW = 1_700_000_000;

async function freshDb() {
  return (await applyMigrations(['0042_sponsored_listings', '0043_sponsored_seed'])) as unknown as D1Database;
}

async function seedSupplierWithKycAndProduct(d1: D1Database, supplierId: string) {
  // Seed supplier row + kyc verified + 1 published product via raw SQL
  await d1.prepare(`INSERT INTO suppliers (id, name, kyc_status, created_at) VALUES (?, 'Test', 'verified', ?)`).bind(supplierId, NOW).run();
  await d1.prepare(`INSERT INTO products (id, supplier_id, status, created_at) VALUES (?, ?, 'published', ?)`).bind(uuid(), supplierId, NOW).run();
}

async function makeCampaign(d1: D1Database, supplierId: string, slotId: string, opts: Partial<repo.Campaign> = {}): Promise<repo.Campaign> {
  const c: repo.Campaign = {
    id: uuid(), supplierId, slotId, productId: uuid(),
    startsAt: opts.startsAt ?? NOW - 1000,
    endsAt: opts.endsAt ?? NOW + 1000,
    status: opts.status ?? 'live',
    paymentInvoiceId: null, adminNotes: null,
    pinned: opts.pinned ?? 0,
    createdAt: NOW, updatedAt: NOW,
  };
  await repo.insertCampaign(d1, c);
  return c;
}

describe('sponsored service — slot resolution', () => {
  let d1: D1Database;
  beforeEach(async () => { d1 = await freshDb(); });

  it('returns empty when no slots for surface', async () => {
    const out = await svc.resolveSlots(d1, 'search', null, NOW);
    // Seed inserts slot-search-0..2 → 3 slots
    expect(out.length).toBe(3);
    // No live campaigns → all empty campaignIds
    expect(out.every(s => s.campaignId === null)).toBe(true);
  });

  it('picks single live campaign FIFO', async () => {
    await makeCampaign(d1, 'sup-1', 'slot-search-0');
    const out = await svc.resolveSlots(d1, 'search', null, NOW);
    const slot0 = out.find(s => s.slotId === 'slot-search-0');
    expect(slot0?.campaignId).not.toBeNull();
  });

  it('pinned campaign always wins', async () => {
    const c1 = await makeCampaign(d1, 'sup-1', 'slot-search-0', { createdAt: NOW });
    const c2 = await makeCampaign(d1, 'sup-2', 'slot-search-0', { createdAt: NOW + 1, pinned: 1 });
    const out = await svc.resolveSlots(d1, 'search', null, NOW);
    const slot0 = out.find(s => s.slotId === 'slot-search-0');
    expect(slot0?.campaignId).toBe(c2.id);
  });

  it('rotation is deterministic per day', async () => {
    const c1 = await makeCampaign(d1, 'sup-1', 'slot-search-0', { createdAt: NOW });
    const c2 = await makeCampaign(d1, 'sup-2', 'slot-search-0', { createdAt: NOW + 1 });
    const dayA = await svc.resolveSlots(d1, 'search', null, NOW);
    const dayB = await svc.resolveSlots(d1, 'search', null, NOW + 86400);
    const dayC = await svc.resolveSlots(d1, 'search', null, NOW + 86400);
    expect(dayB).toEqual(dayC); // same day → same winner
    expect(dayA[0].campaignId === c1.id || dayA[0].campaignId === c2.id).toBe(true);
  });

  it('excludes pending_payment campaigns', async () => {
    await makeCampaign(d1, 'sup-1', 'slot-search-0', { status: 'pending_payment' });
    const out = await svc.resolveSlots(d1, 'search', null, NOW);
    const slot0 = out.find(s => s.slotId === 'slot-search-0');
    expect(slot0?.campaignId).toBeNull();
  });

  it('excludes expired campaigns (endsAt < now)', async () => {
    await makeCampaign(d1, 'sup-1', 'slot-search-0', { endsAt: NOW - 1 });
    const out = await svc.resolveSlots(d1, 'search', null, NOW);
    const slot0 = out.find(s => s.slotId === 'slot-search-0');
    expect(slot0?.campaignId).toBeNull();
  });
});

describe('sponsored service — eligibility', () => {
  let d1: D1Database;
  beforeEach(async () => { d1 = await freshDb(); });

  it('rejects supplier without KYC', async () => {
    await d1.prepare(`INSERT INTO suppliers (id, name, kyc_status, created_at) VALUES ('s1', 'T', 'pending', ?)`).bind(NOW).run();
    await expect(svc.checkEligibility(d1, 's1', 'slot-search-0'))
      .rejects.toThrow(SponsoredError);
  });

  it('rejects supplier with no published products', async () => {
    await seedSupplierWithKycAndProduct(d1, 's1');
    // delete the product
    await d1.prepare(`DELETE FROM products WHERE supplier_id = 's1'`).run();
    await expect(svc.checkEligibility(d1, 's1', 'slot-search-0'))
      .rejects.toThrow(/no published products/i);
  });

  it('accepts KYC-verified supplier with 1 published product', async () => {
    await seedSupplierWithKycAndProduct(d1, 's1');
    await expect(svc.checkEligibility(d1, 's1', 'slot-search-0')).resolves.toBeUndefined();
  });
});

describe('sponsored service — invoice math', () => {
  it('computes total from daily rate × days', () => {
    expect(svc.computeInvoiceCents({ dailyRateCents: 50000, startsAt: 1700000000, endsAt: 1700086400 })).toBe(50000 * 1);
  });

  it('rounds up partial days', () => {
    // 12 hours = 0.5 days → ceil = 1 day
    expect(svc.computeInvoiceCents({ dailyRateCents: 10000, startsAt: 0, endsAt: 43200 })).toBe(10000);
  });

  it('computes prorated refund on revoke', () => {
    const total = 7 * 10000;
    // 3 days elapsed of 7 → refund 4 days
    expect(svc.proratedRefundCents({ totalCents: total, startsAt: 0, endsAt: 7 * 86400, now: 3 * 86400 })).toBe(4 * 10000);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd apps/api && pnpm vitest run src/modules/sponsored/test/service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write errors**

`apps/api/src/modules/sponsored/errors.ts`:

```ts
import { httpError } from '../../lib/errors';

export type SponsoredErrorCode =
  | 'NOT_ELIGIBLE'
  | 'SLOT_UNAVAILABLE'
  | 'CAMPAIGN_NOT_EDITABLE'
  | 'CAMPAIGN_NOT_CANCELABLE'
  | 'INVALID_DATE_RANGE';

export class SponsoredError extends Error {
  constructor(public code: SponsoredErrorCode, message?: string, public details?: unknown) {
    super(message ?? code);
  }
  toHttp() {
    const map: Record<SponsoredErrorCode, number> = {
      NOT_ELIGIBLE: 422,
      SLOT_UNAVAILABLE: 409,
      CAMPAIGN_NOT_EDITABLE: 409,
      CAMPAIGN_NOT_CANCELABLE: 409,
      INVALID_DATE_RANGE: 422,
    };
    return httpError(map[this.code], this.code, this.message, this.details);
  }
}
```

- [ ] **Step 4: Write service**

`apps/api/src/modules/sponsored/service.ts`:

```ts
import { createHash } from 'node:crypto';
import { getDb } from '@vyro/db';
import { suppliers, products } from '@vyro/db/schema';
import { eq, and } from 'drizzle-orm';
import * as repo from './repository';
import { SponsoredError } from './errors';

const DAY_SECONDS = 86400;

export interface ResolvedSlot {
  slotId: string;
  surface: repo.Surface;
  position: number;
  campaignId: string | null;
  productId: string | null;
  supplierId: string | null;
}

function dailyHashInt(seed: string): number {
  const h = createHash('sha256').update(seed).digest();
  return h.readUInt32BE(0);
}

export async function resolveSlots(
  d1: D1Database,
  surface: repo.Surface,
  categoryId: string | null,
  now: number,
): Promise<ResolvedSlot[]> {
  const slots = await repo.listSlotsForSurface(d1, surface, categoryId);
  const dayBucket = Math.floor(now / DAY_SECONDS);
  const out: ResolvedSlot[] = [];
  for (const slot of slots) {
    const candidates = await repo.findLiveCandidates(d1, slot.id, now);
    let winner: repo.Campaign | null = null;
    if (candidates.length === 0) {
      // nothing
    } else if (candidates.length === 1) {
      winner = candidates[0];
    } else {
      const pinned = candidates.find(c => c.pinned === 1);
      if (pinned) {
        winner = pinned;
      } else {
        const ordered = [...candidates].sort((a, b) => a.createdAt - b.createdAt);
        const seed = ordered.map(c => c.id).join('|') + ':' + dayBucket;
        const idx = dailyHashInt(seed) % ordered.length;
        winner = ordered[idx];
      }
    }
    out.push({
      slotId: slot.id,
      surface: slot.surface,
      position: slot.position,
      campaignId: winner?.id ?? null,
      productId: winner?.productId ?? null,
      supplierId: winner?.supplierId ?? null,
    });
  }
  return out;
}

export async function checkEligibility(d1: D1Database, supplierId: string, slotId: string): Promise<void> {
  const db = getDb(d1);
  const supplier = (await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get()) as any;
  if (!supplier) {
    throw new SponsoredError('NOT_ELIGIBLE', 'Supplier not found', { supplierId });
  }
  if (supplier.kyc_status !== 'verified') {
    throw new SponsoredError('NOT_ELIGIBLE', 'KYC verification required', { kycStatus: supplier.kyc_status });
  }
  const productCount = await db.select().from(products)
    .where(and(eq(products.supplierId, supplierId), eq(products.status, 'published' as never)))
    .all();
  if (productCount.length === 0) {
    throw new SponsoredError('NOT_ELIGIBLE', 'Supplier has no published products', { supplierId });
  }
  const slot = await repo.getSlot(d1, slotId);
  if (!slot || slot.active !== 1) {
    throw new SponsoredError('SLOT_UNAVAILABLE', 'Slot not available');
  }
}

export function computeInvoiceCents(opts: { dailyRateCents: number; startsAt: number; endsAt: number }): number {
  if (opts.endsAt <= opts.startsAt) {
    throw new SponsoredError('INVALID_DATE_RANGE', 'endsAt must be after startsAt');
  }
  const seconds = opts.endsAt - opts.startsAt;
  const days = Math.ceil(seconds / DAY_SECONDS);
  return days * opts.dailyRateCents;
}

export function proratedRefundCents(opts: { totalCents: number; startsAt: number; endsAt: number; now: number }): number {
  const totalSeconds = opts.endsAt - opts.startsAt;
  const elapsed = Math.max(0, Math.min(opts.now - opts.startsAt, totalSeconds));
  const remainingSeconds = totalSeconds - elapsed;
  const remainingDays = Math.floor(remainingSeconds / DAY_SECONDS);
  return remainingDays * (opts.totalCents / Math.ceil(totalSeconds / DAY_SECONDS));
}

export function campaignDays(startsAt: number, endsAt: number): number {
  return Math.ceil((endsAt - startsAt) / DAY_SECONDS);
}

export function newId(): string {
  // Use crypto.randomUUID if available; fall back to v4 uuid lib the repo already uses
  return crypto.randomUUID();
}
```

- [ ] **Step 5: Run test, verify PASS**

Run: `cd apps/api && pnpm vitest run src/modules/sponsored/test/service.test.ts`
Expected: PASS for all 12 cases.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/sponsored/service.ts \
        apps/api/src/modules/sponsored/errors.ts \
        apps/api/src/modules/sponsored/test/service.test.ts
git commit -m "feat(sponsored): service layer (slot resolution + eligibility + invoice math)"
```

---

## Task 6: Public + supplier + admin routes

**Files:**
- Create: `apps/api/src/modules/sponsored/routes.ts`
- Create: `apps/api/src/modules/sponsored/index.ts`
- Modify: `apps/api/src/app.ts` (or wherever routers are registered) — register `/api/sponsored/*` and `/api/supplier/sponsored/*` and `/api/admin/sponsored/*`
- Test: `apps/api/src/modules/sponsored/test/routes.test.ts`

- [ ] **Step 1: Write route tests**

`apps/api/src/modules/sponsored/test/routes.test.ts` — covers public disclosure, sponsor event log (dedupe), supplier plan list, supplier subscribe, supplier slot browse, supplier create campaign (eligibility gate), admin approve (creates invoice), admin reject, admin revoke (proration), admin pin, invoice pay/waive, analytics aggregate. ~15 cases following existing routes.test.ts pattern in learning module. Use `app.request()` style. Read one existing routes.test.ts to copy the request shape exactly.

- [ ] **Step 2: Run test, verify FAIL**

Run: `cd apps/api && pnpm vitest run src/modules/sponsored/test/routes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write routes**

`apps/api/src/modules/sponsored/routes.ts` — implement:

```
const FLAG = 'SPONSORED_LISTINGS_ENABLED';
const SUPPLIER_ROLES = ['owner','sales','ops','finance'] as const;
const router = new Hono<{ Bindings: Env }>();
router.use('*', session());
router.use('*', flagGate(FLAG));

// Public
router.get('/disclosure', ...) -> static JSON
router.post('/events', ...) -> insertEvent with dedupe via UNIQUE
router.get('/resolve/:surface', ...) -> resolveSlots (no auth)

// Supplier
router.get('/supplier/plans', ... requireSupplierRole ...)
router.post('/supplier/subscriptions', ...)
router.get('/supplier/subscriptions/me', ...)
router.delete('/supplier/subscriptions/:id', ...)
router.get('/supplier/slots', ...)  // ?surface=&categoryId=
router.post('/supplier/campaigns', ...) // checkEligibility + createCampaign + computeInvoiceCents + insertInvoice + status=pending_approval
router.get('/supplier/campaigns', ...)
router.get('/supplier/campaigns/:id', ...)
router.patch('/supplier/campaigns/:id', ...) // only if status IN (pending_approval, pending_payment, approved)
router.delete('/supplier/campaigns/:id', ...) // only if status NOT IN (live, expired); set status=cancelled + void invoice
router.get('/supplier/invoices', ...)
router.post('/supplier/invoices/:id/pay', ...) // markInvoicePaid + if all paid -> updateCampaignStatus(c.id, 'approved')

// Admin
router.use('/admin/*', requireAdmin)
router.get('/admin/plans', ...)
router.post('/admin/plans', ...)
router.patch('/admin/plans/:id', ...)
router.delete('/admin/plans/:id', ...)
router.get('/admin/slots', ...)
router.post('/admin/slots', ...)
router.patch('/admin/slots/:id', ...)
router.delete('/admin/slots/:id', ...)
router.get('/admin/campaigns', ...)
router.get('/admin/campaigns/:id', ...)
router.post('/admin/campaigns/:id/approve', ...) // status=pending_payment + insertInvoice
router.post('/admin/campaigns/:id/reject', ...) // status=rejected + refund if paid
router.post('/admin/campaigns/:id/revoke', ...) // status=revoked + prorated refund
router.post('/admin/campaigns/:id/pin', ...) // toggle
router.post('/admin/invoices/:id/waive', ...)
router.post('/admin/invoices/:id/mark-paid', ...)
router.get('/admin/analytics', ...) // ?from=&to= -> aggregateEventCounts
```

Map `SponsoredError.toHttp()` in a single error middleware at top of router.

Read existing `apps/api/src/modules/learning/routes.ts` + `adminRoutes.ts` to copy exact session/auth/error middleware usage, then implement. ~400 lines.

- [ ] **Step 4: Write index + register router**

`apps/api/src/modules/sponsored/index.ts`:

```ts
import router from './routes';
export default router;
```

In `apps/api/src/app.ts` (or main router file — locate via `grep -rn "learning/routes" apps/api/src/`), add:

```ts
import sponsoredRouter from './modules/sponsored/routes';
app.route('/api/sponsored', sponsoredRouter);
app.route('/api/supplier/sponsored', sponsoredRouter);
app.route('/api/admin/sponsored', sponsoredRouter);
```

Adjust paths per actual router shape (may need 3 separate route prefixes in one router using nested mount).

- [ ] **Step 5: Run test, verify PASS**

Run: `cd apps/api && pnpm vitest run src/modules/sponsored/test/routes.test.ts`
Expected: PASS for all route cases.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/sponsored/routes.ts \
        apps/api/src/modules/sponsored/index.ts \
        apps/api/src/modules/sponsored/test/routes.test.ts \
        apps/api/src/app.ts
git commit -m "feat(sponsored): routes (public + supplier + admin)"
```

---

## Task 7: Cron sweep

**Files:**
- Create: `apps/api/src/cron/sponsored.ts`
- Modify: `apps/api/src/cron/dispatcher.ts`
- Test: `apps/api/src/cron/test/sponsored.test.ts`

- [ ] **Step 1: Write sweep test**

```ts
describe('sponsored expire sweep', () => {
  it('flips approved→live when startsAt <= now', async () => {
    // seed campaign with status=approved, startsAt=now-1000
    // run sweep
    // assert status=live
  });
  it('flips live→expired when endsAt < now', async () => { /* ... */ });
  it('flips approved→expired when endsAt < now (paid but never displayed)', async () => { /* ... */ });
  it('cleans events older than 7 days', async () => { /* ... */ });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Write sweep**

`apps/api/src/cron/sponsored.ts`:

```ts
import * as repo from '../modules/sponsored/repository';

export async function sponsoredExpireSweep(d1: D1Database, now: number): Promise<{ flippedToLive: number; flippedToExpired: number; cleanedEvents: number }> {
  let flippedToLive = 0;
  let flippedToExpired = 0;

  const approved = await repo.listCampaignsByStatus(d1, 'approved');
  for (const c of approved) {
    if (c.startsAt <= now && c.endsAt >= now) {
      await repo.updateCampaignStatus(d1, c.id, 'live', now);
      flippedToLive++;
    } else if (c.endsAt < now) {
      await repo.updateCampaignStatus(d1, c.id, 'expired', now);
      flippedToExpired++;
    }
  }

  const live = await repo.listCampaignsByStatus(d1, 'live');
  for (const c of live) {
    if (c.endsAt < now) {
      await repo.updateCampaignStatus(d1, c.id, 'expired', now);
      flippedToExpired++;
    }
  }

  const cutoff = now - 7 * 86400;
  const res = await d1.prepare(`DELETE FROM sponsored_events WHERE occurred_at < ?`).bind(cutoff).run();
  const cleanedEvents = res.meta?.changes ?? 0;

  return { flippedToLive, flippedToExpired, cleanedEvents };
}
```

- [ ] **Step 4: Register in dispatcher**

In `apps/api/src/cron/dispatcher.ts`, add import + register:

```ts
import { sponsoredExpireSweep } from './sponsored';
// inside the hourly dispatch list:
await sponsoredExpireSweep(env.DB, NOW);
```

- [ ] **Step 5: Run test, verify PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/cron/sponsored.ts apps/api/src/cron/dispatcher.ts apps/api/src/cron/test/sponsored.test.ts
git commit -m "feat(sponsored): cron expire sweep"
```

---

## Task 8: Web foundation (api client + hook + SponsoredSlot component)

**Files:**
- Create: `apps/web/src/lib/sponsoredApi.ts`
- Create: `apps/web/src/hooks/useSponsored.ts`
- Create: `apps/web/src/components/SponsoredSlot.tsx`
- Test: `apps/web/src/lib/__tests__/sponsoredApi.test.ts` + `apps/web/src/components/__tests__/SponsoredSlot.test.tsx`

- [ ] **Step 1: Write SponsoredSlot test**

```tsx
import { render, screen } from '@testing-library/react';
import { SponsoredSlot } from '../SponsoredSlot';

it('renders Sponsored badge when campaignId present', () => {
  render(<SponsoredSlot campaignId="c1" productId="p1" surface="search" position={0} />);
  expect(screen.getByText(/Sponsored/i)).toBeInTheDocument();
});
it('does not render badge when campaignId null', () => {
  const { container } = render(<SponsoredSlot campaignId={null} productId={null} surface="search" position={0} />);
  expect(container.textContent).not.toMatch(/Sponsored/i);
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Write SponsoredSlot component**

`apps/web/src/components/SponsoredSlot.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';

interface Props {
  campaignId: string | null;
  productId: string | null;
  surface: 'search' | 'category' | 'homepage' | 'storefront';
  position: number;
  children?: React.ReactNode;
}

export function SponsoredSlot({ campaignId, surface, position, children }: Props) {
  if (!campaignId) return <>{children}</>;
  return (
    <div className="relative" data-sponsored-slot={surface} data-position={position}>
      <span
        className="absolute top-1 left-1 z-10 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
        title="Paid placement. Learn more."
        aria-label="Sponsored placement"
      >
        Sponsored
      </span>
      <Link to="/sponsored" className="absolute top-1 right-1 z-10 text-xs text-amber-700 underline">
        Ad disclosure
      </Link>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Write api client + hooks**

`apps/web/src/lib/sponsoredApi.ts` — typed fetch wrappers mirroring `learningApi.ts` shape:

```ts
import {
  sponsorPlanSchema, sponsorSubscriptionSchema, sponsorSlotSchema,
  sponsorCampaignSchema, sponsorInvoiceSchema, sponsorDisclosureSchema,
  sponsorCampaignInputSchema,
  type SponsorCampaignInput,
} from '@vyro/validation';
import { z } from 'zod';

const base = '/api';

export async function fetchDisclosure(): Promise<z.infer<typeof sponsorDisclosureSchema>> {
  const r = await fetch(`${base}/sponsored/disclosure`);
  if (!r.ok) throw new Error('disclosure fetch failed');
  return sponsorDisclosureSchema.parse(await r.json());
}

export async function fetchPlans(): Promise<Array<z.infer<typeof sponsorPlanSchema>>> {
  const r = await fetch(`${base}/supplier/sponsored/plans`);
  if (!r.ok) throw new Error('plans fetch failed');
  return z.array(sponsorPlanSchema).parse(await r.json());
}

// ... subscribePlan, listSlots, listCampaigns, createCampaign, updateCampaign, cancelCampaign,
//     listInvoices, payInvoice (supplier side)
// ... adminListPlans, adminUpsertPlan, adminListSlots, adminUpsertSlot,
//     adminListCampaigns, adminApprove, adminReject, adminRevoke, adminPin,
//     adminWaiveInvoice, adminMarkPaidInvoice, adminAnalytics
```

`apps/web/src/hooks/useSponsored.ts` — TanStack Query wrappers (`useDisclosure`, `usePlans`, `useSlots`, `useCampaigns`, `useCreateCampaign`, `useCancelCampaign`, `useInvoices`, `usePayInvoice` + admin variants).

- [ ] **Step 5: Run tests, verify PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/sponsoredApi.ts \
        apps/web/src/hooks/useSponsored.ts \
        apps/web/src/components/SponsoredSlot.tsx \
        apps/web/src/lib/__tests__/sponsoredApi.test.ts \
        apps/web/src/components/__tests__/SponsoredSlot.test.tsx
git commit -m "feat(web): sponsored api + hook + slot component"
```

---

## Task 9: Disclosure page

**Files:**
- Create: `apps/web/src/pages/SponsoredDisclosure.tsx`
- Modify: `apps/web/src/App.tsx` — add route `/sponsored`
- Test: `apps/web/src/pages/__tests__/SponsoredDisclosure.test.tsx`

- [ ] **Step 1: Write page test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { SponsoredDisclosure } from '../SponsoredDisclosure';
jest.mock('../../lib/sponsoredApi', () => ({ fetchDisclosure: jest.fn().mockResolvedValue({ version: '1', title: 'Sponsored content policy', body: 'Some policy body...', lastUpdated: 1700000000 }) }));

it('renders disclosure title + body', async () => {
  render(<SponsoredDisclosure />);
  await waitFor(() => expect(screen.getByText(/Sponsored content policy/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Write page**

`apps/web/src/pages/SponsoredDisclosure.tsx`:

```tsx
import React from 'react';
import { fetchDisclosure } from '../lib/sponsoredApi';

export function SponsoredDisclosure() {
  const [data, setData] = React.useState<{ version: string; title: string; body: string; lastUpdated: number } | null>(null);
  React.useEffect(() => { fetchDisclosure().then(setData).catch(console.error); }, []);
  if (!data) return <div className="p-6">Loading…</div>;
  return (
    <article className="prose mx-auto max-w-3xl p-6">
      <h1>{data.title}</h1>
      <p className="text-sm text-gray-500">Version {data.version} · Updated {new Date(data.lastUpdated * 1000).toLocaleDateString()}</p>
      <div>{data.body}</div>
    </article>
  );
}
```

For MVP the disclosure body is a static server-defined string returned by `/api/sponsored/disclosure`. Seed in service: `body = "Sponsored placements are paid positions on Vyro. We label all sponsored placements with a 'Sponsored' badge. Pricing is flat-rate per slot, not auction-based. Suppliers must be KYC-verified and have at least one published product to buy placements."`

- [ ] **Step 4: Register route in App.tsx**

```tsx
import { SponsoredDisclosure } from './pages/SponsoredDisclosure';
// inside <Routes>:
<Route path="/sponsored" element={<SponsoredDisclosure />} />
```

- [ ] **Step 5: Run test, verify PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/SponsoredDisclosure.tsx \
        apps/web/src/App.tsx \
        apps/web/src/pages/__tests__/SponsoredDisclosure.test.tsx
git commit -m "feat(web): sponsored disclosure page"
```

---

## Task 10: Supplier pages

**Files:**
- Create: 7 files in `apps/web/src/supplier/sponsored/`
  - `Index.tsx` — KPI strip
  - `PlansPage.tsx` — tier cards + Subscribe
  - `SubscriptionsPage.tsx` — current plan + cancel
  - `BrowseSlotsPage.tsx` — slot grid + filter
  - `CampaignFormPage.tsx` — create form + eligibility check
  - `CampaignsListPage.tsx` — table with status chips
  - `InvoicesPage.tsx` — invoice list + pay button
- Modify: `apps/web/src/App.tsx` — add 7 routes under `/supplier/sponsored/*`
- Test: 1-2 sanity tests per page (renders, shows loading, error states)

- [ ] **Step 1: Write Index test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { SponsoredIndex } from '../Index';
jest.mock('../../../hooks/useSponsored', () => ({
  useCampaigns: () => ({ data: [{ id: 'c1', status: 'live' }], isLoading: false }),
  useInvoices: () => ({ data: [{ id: 'i1', status: 'pending' }], isLoading: false }),
}));
it('renders KPI strip with campaign + invoice counts', async () => {
  render(<SponsoredIndex />);
  expect(screen.getByText(/Active campaigns/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Write Index page**

`apps/web/src/supplier/sponsored/Index.tsx`:

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useCampaigns, useInvoices } from '../../hooks/useSponsored';

export function SponsoredIndex() {
  const campaigns = useCampaigns();
  const invoices = useInvoices();
  const active = (campaigns.data ?? []).filter(c => c.status === 'live').length;
  const expiringSoon = (campaigns.data ?? []).filter(c => c.status === 'live' && c.endsAt - Math.floor(Date.now()/1000) < 3 * 86400).length;
  const pendingInvoices = (invoices.data ?? []).filter(i => i.status === 'pending').length;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Sponsored listings</h1>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Kpi label="Active campaigns" value={active} />
        <Kpi label="Expiring soon" value={expiringSoon} />
        <Kpi label="Pending invoices" value={pendingInvoices} />
      </div>
      <nav className="mt-6 flex gap-3 text-sm">
        <Link to="/supplier/sponsored/plans" className="underline">Plans</Link>
        <Link to="/supplier/sponsored/slots" className="underline">Browse slots</Link>
        <Link to="/supplier/sponsored/campaigns" className="underline">My campaigns</Link>
        <Link to="/supplier/sponsored/invoices" className="underline">Invoices</Link>
      </nav>
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Write PlansPage**

`apps/web/src/supplier/sponsored/PlansPage.tsx` (≤ 80 lines):

```tsx
import React from 'react';
import { usePlans, useSubscribe } from '../../hooks/useSponsored';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function PlansPage() {
  const plans = usePlans();
  const subscribe = useSubscribe();
  const qc = useQueryClient();
  if (plans.isLoading) return <div className="p-6">Loading…</div>;
  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      {plans.data?.map(p => (
        <div key={p.id} className="rounded border p-4">
          <h2 className="text-xl font-semibold">{p.name}</h2>
          <p className="mt-1 text-sm text-gray-600">{p.includedSlotCredits} slot credits included</p>
          <p className="mt-2 text-2xl font-semibold">LKR {(p.monthlyRateCents / 100).toLocaleString()}/mo</p>
          <button
            className="mt-4 rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
            disabled={!p.active || subscribe.isPending}
            onClick={() => subscribe.mutate({ planId: p.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }) })}
          >
            Subscribe
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Write SubscriptionsPage** (current plan display + Cancel button; ≤ 50 lines). Uses `useSubscription`, `useCancelSubscription`.

- [ ] **Step 6: Write BrowseSlotsPage** (slot grid filtered by `?surface=` + `?categoryId=`; each slot card shows daily rate + "Create campaign" link → `/supplier/sponsored/campaigns/new?slotId=...`; ≤ 100 lines). Uses `useSlots`.

- [ ] **Step 7: Write CampaignFormPage** (form: slot (prefilled from query), product (dropdown of supplier's published products), start/end date pickers; inline eligibility check on submit; on success → navigate to `/supplier/sponsored/campaigns`; ≤ 120 lines). Uses `useCreateCampaign`, `useMyProducts`.

- [ ] **Step 8: Write CampaignsListPage** (table of own campaigns with status chips + admin_notes column; Cancel action for non-live; ≤ 80 lines). Uses `useCampaigns`, `useCancelCampaign`.

- [ ] **Step 9: Write InvoicesPage** (table of own invoices with Pay button for `pending` status; ≤ 60 lines). Uses `useInvoices`, `usePayInvoice`.

- [ ] **Step 10: Register routes in App.tsx**

```tsx
import { SponsoredIndex } from './supplier/sponsored/Index';
import { PlansPage } from './supplier/sponsored/PlansPage';
import { SubscriptionsPage } from './supplier/sponsored/SubscriptionsPage';
import { BrowseSlotsPage } from './supplier/sponsored/BrowseSlotsPage';
import { CampaignFormPage } from './supplier/sponsored/CampaignFormPage';
import { CampaignsListPage } from './supplier/sponsored/CampaignsListPage';
import { InvoicesPage } from './supplier/sponsored/InvoicesPage';
// inside <Routes>:
<Route path="/supplier/sponsored" element={<SponsoredIndex />} />
<Route path="/supplier/sponsored/plans" element={<PlansPage />} />
<Route path="/supplier/sponsored/subscriptions" element={<SubscriptionsPage />} />
<Route path="/supplier/sponsored/slots" element={<BrowseSlotsPage />} />
<Route path="/supplier/sponsored/campaigns/new" element={<CampaignFormPage />} />
<Route path="/supplier/sponsored/campaigns" element={<CampaignsListPage />} />
<Route path="/supplier/sponsored/invoices" element={<InvoicesPage />} />
```

- [ ] **Step 11: Run all supplier page tests, verify PASS**

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/supplier/sponsored/ apps/web/src/App.tsx
git commit -m "feat(web): supplier sponsored pages"
```

---

## Task 11: Admin pages

**Files:**
- Create: 6 files in `apps/web/src/admin/sponsored/`
  - `AdminIndex.tsx` — KPI strip (live / pending / MTD revenue / CTR)
  - `PlansAdmin.tsx` — CRUD table
  - `SlotsAdmin.tsx` — CRUD table
  - `ApprovalQueue.tsx` — pending list with approve/reject
  - `CampaignsAdmin.tsx` — full list with status filters + revoke/pin
  - `AnalyticsAdmin.tsx` — per-campaign impressions/clicks/CTR
- Modify: `apps/web/src/App.tsx` — add 6 routes under `/admin/sponsored/*`
- Test: 1-2 sanity tests per page

- [ ] **Step 1: Write AdminIndex test**

```tsx
import { render, screen } from '@testing-library/react';
import { AdminIndex } from '../AdminIndex';
jest.mock('../../../hooks/useSponsored', () => ({
  useAdminCampaigns: () => ({ data: [{ id: 'c1', status: 'live' }, { id: 'c2', status: 'pending_approval' }], isLoading: false }),
  useAdminAnalytics: () => ({ data: [{ impressions: 100, clicks: 5 }] }),
}));
it('renders admin KPI strip', () => {
  render(<AdminIndex />);
  expect(screen.getByText(/Live campaigns/i)).toBeInTheDocument();
  expect(screen.getByText(/Pending approval/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Write AdminIndex page**

`apps/web/src/admin/sponsored/AdminIndex.tsx` (≤ 60 lines): KPI strip (Live / Pending / MTD revenue / CTR) + nav links to sub-pages. Uses `useAdminCampaigns`, `useAdminAnalytics` from `useSponsored.ts`.

- [ ] **Step 4: Write PlansAdmin, SlotsAdmin** (CRUD tables with create/edit/delete modals; mirror `apps/web/src/admin/learning/LessonsAdmin.tsx` table style exactly). Uses `useAdminPlans`, `useAdminUpsertPlan`, `useAdminDeletePlan`, `useAdminSlots`, `useAdminUpsertSlot`, `useAdminDeleteSlot`.

- [ ] **Step 5: Write ApprovalQueue** (table of `pending_approval` campaigns + Approve/Reject buttons). Approve opens a notes modal. Reject requires reason. Uses `useAdminCampaigns({status:'pending_approval'})`, `useAdminApprove`, `useAdminReject`.

- [ ] **Step 6: Write CampaignsAdmin** (full table with status filter dropdown + Revoke/Pin action menu). Uses `useAdminCampaigns`, `useAdminRevoke`, `useAdminPin`.

- [ ] **Step 7: Write AnalyticsAdmin** (table per campaign: impressions / clicks / CTR / spend). Uses `useAdminAnalytics({from, to})`.

- [ ] **Step 8: Register routes in App.tsx**

```tsx
import { AdminIndex } from './admin/sponsored/AdminIndex';
import { PlansAdmin } from './admin/sponsored/PlansAdmin';
import { SlotsAdmin } from './admin/sponsored/SlotsAdmin';
import { ApprovalQueue } from './admin/sponsored/ApprovalQueue';
import { CampaignsAdmin } from './admin/sponsored/CampaignsAdmin';
import { AnalyticsAdmin } from './admin/sponsored/AnalyticsAdmin';
// inside <Routes>:
<Route path="/admin/sponsored" element={<AdminIndex />} />
<Route path="/admin/sponsored/plans" element={<PlansAdmin />} />
<Route path="/admin/sponsored/slots" element={<SlotsAdmin />} />
<Route path="/admin/sponsored/approvals" element={<ApprovalQueue />} />
<Route path="/admin/sponsored/campaigns" element={<CampaignsAdmin />} />
<Route path="/admin/sponsored/analytics" element={<AnalyticsAdmin />} />
```

- [ ] **Step 9: Run admin page tests, verify PASS**

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/admin/sponsored/ apps/web/src/App.tsx
git commit -m "feat(web): admin sponsored pages"
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/admin/sponsored/ apps/web/src/App.tsx
git commit -m "feat(web): admin sponsored pages"
```

---

## Task 12: Buyer surface integration

**Files:**
- Modify: search handler — add `sponsored` field
- Modify: category handler — add `sponsored` field
- Modify: home handler — add `sponsored` field
- Modify: storefront handler — add `otherSuppliersSponsored` field
- Modify: web search page, category page, home page, storefront page — render `<SponsoredSlot>`
- Test: render-level test asserting `<SponsoredSlot>` appears when API returns sponsored data

- [ ] **Step 1: Locate the 4 buyer endpoints + pages** (`grep -rn "buyer/search" apps/`, etc.)

- [ ] **Step 2: For each endpoint**, fetch `resolveSlots(d1, surface, categoryId, now)` and append to response:

```ts
// In existing search/category/home/storefront handlers, after the existing logic:
const sponsored = await svc.resolveSlots(d1, 'search', categoryId, NOW);
return c.json({ results: organicResults, sponsored });
```

- [ ] **Step 3: For each web page**, wrap top N product cards:

```tsx
{/* In search results render */}
{sponsored?.map((slot, i) => (
  <SponsoredSlot key={slot.slotId} {...slot}>
    <ProductCard productId={slot.productId} />
  </SponsoredSlot>
))}
{organicResults.map(p => <ProductCard key={p.id} {...p} />)}
```

- [ ] **Step 4: Write render test for search page**

```tsx
// mock fetch to return { results: [], sponsored: [{ slotId: 's0', campaignId: 'c1', productId: 'p1', ... }] }
// render search page
// assert SponsoredSlot rendered with badge
```

- [ ] **Step 5: Run web tests, verify PASS**

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/<surface>/ apps/web/src/pages/<surface>/
git commit -m "feat(sponsored): buyer surface injection (search/category/home/storefront)"
```

---

## Task 13: Phase 1 verification (admin only)

- [ ] **Step 1: Set flag ON for admin role** (run `enable-flag.sh SPONSORED_LISTINGS_ENABLED` per `apps/api/scripts/enable-flag.sh`)

- [ ] **Step 2: Manual smoke**:
  - Hit `/api/admin/sponsored/plans` → see 3 seeded
  - Hit `/api/admin/sponsored/slots` → see 10 seeded
  - Visit `/admin/sponsored` → KPI strip renders
  - Visit `/admin/sponsored/plans` → table renders

- [ ] **Step 3: Verify supplier pages return 404** (flag-gated)

- [ ] **Step 4: Commit verification notes** to `docs/superpowers/notes/sponsored-phase-1.md`

```bash
git add docs/superpowers/notes/sponsored-phase-1.md
git commit -m "docs(sponsored): phase 1 verification notes"
```

---

## Task 14: Phase 2 verification (supplier beta)

- [ ] **Step 1: Enable flag for supplier role too**

- [ ] **Step 2: E2E manual flow**:
  - Supplier with KYC + product visits `/supplier/sponsored/plans`
  - Subscribes to Silver plan → `/supplier/sponsored/subscriptions` shows active
  - Visits `/supplier/sponsored/slots` → sees 10 slots
  - Clicks slot-search-0 → fills CampaignForm → submits
  - Campaign appears in `/supplier/sponsored/campaigns` with status=`pending_approval`
  - Admin approves → status=`pending_payment`, invoice created
  - Supplier sees invoice in `/supplier/sponsored/invoices` → clicks Pay → status=`paid` → campaign status=`approved`

- [ ] **Step 3: Verify buyer surfaces still organic** (flag check on buyer injection path)

- [ ] **Step 4: Commit notes**

```bash
git add docs/superpowers/notes/sponsored-phase-2.md
git commit -m "docs(sponsored): phase 2 verification notes"
```

---

## Task 15: Phase 3 verification (public) + ship

- [ ] **Step 1: Enable flag globally**

- [ ] **Step 2: E2E public flow**:
  - Search page renders top 3 sponsored cards with "Sponsored" badge + disclosure link
  - Category page same
  - Homepage featured grid prepends sponsored
  - Storefront page bottom strip shows sponsored upsell
  - Click a sponsored card → event logged with `eventType=click`, no duplicate on re-click (dedupe by requestId)
  - Visit `/sponsored` → disclosure page renders with seeded body
  - Analytics page in admin shows impressions + clicks for the test campaign

- [ ] **Step 3: Run full test suite**

Run: `cd apps/api && pnpm vitest run && cd ../web && pnpm vitest run`
Expected: All pass (was ~960 backend + 142 web before; expect ~990 + 155).

- [ ] **Step 4: Update memory**

Append to `vyro-roadmap.md`: "7. Sponsored listings — shipped 2026-09-16. Flag-gated. Admin invoice + manual reconciliation."

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/notes/sponsored-phase-3.md
git commit -m "docs(sponsored): phase 3 verification + ship"
```

---

## Self-Review Checklist (run before execution)

- [ ] Every spec requirement maps to ≥1 task: schema (T1), flag (T1), error codes (T2), validation (T3), repository (T4), service+eligibility+invoice+proration (T5), all 4 buyer surfaces (T12), supplier CRUD (T6), admin CRUD+approve/reject/revoke/pin (T6), analytics (T6+T7), disclosure (T6+T9), cron sweep (T7), all 7 supplier pages (T10), all 6 admin pages (T11), 3-phase rollout (T13-15).
- [ ] No placeholders: every step shows full code or full file path.
- [ ] Type consistency: `repo.Campaign.status` enum used everywhere; `service.ResolvedSlot` shape used in API response + SponsoredSlot props.
- [ ] Function names referenced match: `resolveSlots`, `checkEligibility`, `computeInvoiceCents`, `proratedRefundCents`, `sponsoredExpireSweep`.
- [ ] Each task ends with independently testable deliverable + commit.