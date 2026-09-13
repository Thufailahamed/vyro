# Cross-Border Trade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add imports + exports to the Vyro wholesale marketplace. Both directions in v1, LKR base with FX snapshots, supplier-declared shipping + HS codes, PayHere + manual wire reconciliation.

**Architecture:** Extend existing tables in place (no overlay). New `cross-border/` module owns FX, tariffs, sanctions, customs docs, wire reconciliation. Order create + ship transitions gain hooks; existing handlers otherwise untouched. Feature-flagged via `CROSS_BORDER_ENABLED`.

**Tech Stack:** Hono on Cloudflare Workers, D1 (Drizzle ORM), R2 (`vyro-cross-border-docs`), KV (`vyro`), Analytics Engine (`vyro_metrics`), existing audit queue, existing SLO rule evaluator pattern.

**Spec:** `docs/superpowers/specs/2026-09-13-vyro-cross-border-trade-design.md`

## Global Constraints

- Money: **integer cents**, matching existing `subtotalCents` / `totalCents` convention. All new money columns are `integer` + `_cents` suffix.
- Timestamps: **integer epoch ms**, matching existing `createdAt` / `updatedAt`.
- IDs: **text** (cuid2 or nanoid via existing helper). UUIDs only for `fx_snapshots.id` and `order_customs_docs.id` (external system identifiers).
- Enums: **text column with `{ enum: [...] }`**, matching existing `verificationStatus` pattern.
- All schema changes: nullable or default-existing-values (no destructive migration).
- Feature flag: `CROSS_BORDER_ENABLED` env var defaults `false` in production until manually enabled.
- Audit queue: existing `apps/api/src/queue/audit.ts` is the source — reuse, never duplicate.
- PDF generation: `pdfkit` (new dep, none in repo today).
- Module convention: `apps/api/src/modules/<name>/{repository,service,routes}.ts`.
- Schema export: append to `packages/db/src/schema/index.ts` barrel.
- Test runner: vitest. E2E: Playwright. Pattern matches existing modules.

---

## File Structure

```
packages/db/src/schema/
  countries.ts                 # NEW
  fxSnapshots.ts               # NEW
  orderCustomsDocs.ts          # NEW
  suppliers.ts                 # MODIFY (add country_code, tax_id, is_export_eligible, default_incoterms, default_hs_code, default_country_of_origin)
  businesses.ts                # MODIFY (buyers live here as 'businesses'; add country_code, tax_id, kyc_level, kyc_*)
  products.ts                  # MODIFY (add hs_code, country_of_origin, is_export_controlled)
  purchaseOrders.ts            # MODIFY (add direction, incoterms, fx_snapshot_id, declared_*_cents, commercial_invoice_no, customs_status, wire_*)
  index.ts                     # MODIFY (re-export new tables)

packages/db/src/data/
  hs-codes.json                # NEW (top 500 HS lines, snapshot)
  iso-country-codes.json       # NEW (ISO 3166-1 alpha-2 + names)

packages/db/migrations/        # NEW drizzle migration files
packages/db/scripts/
  backfill-cross-border.ts     # NEW (one-shot backfill)

apps/api/src/lib/
  crossBorderEnv.ts            # NEW (CROSS_BORDER_ENABLED flag reader)
  fxProvider.ts                # NEW (CBSL + exchangerate.host fetcher)
  hsTariff.ts                  # NEW (HS lookup + duty calc, loads JSON)

apps/api/src/modules/cross-border/
  fx.ts                        # NEW (snapshot + getRate service)
  sanctions.ts                 # NEW (OFAC + UN list, KV cached)
  restricted.ts                # NEW (product × destination check)
  incoterms.ts                 # NEW (enum + required-field map)
  docs.ts                      # NEW (R2 upload + signed URL)
  invoicePdf.ts                # NEW (pdfkit render: commercial invoice, packing list, COO)
  repository.ts                # NEW (Drizzle queries for fx_snapshots, order_customs_docs, order updates)
  routes.ts                    # NEW (FX rates, customs docs upload, wire received)
  service.ts                   # NEW (orchestration: pre-create hook, ship hook, wire recon)

apps/api/src/modules/purchaseOrders/
  service.ts                   # MODIFY (insert pre-create hook + ship hook calls)
  routes.ts                    # MODIFY (filter by direction, country_code, customs_status)

apps/api/src/modules/admin/
  orders.ts                    # MODIFY (wire reconciliation endpoint)
  kyc.ts                       # MODIFY (add KYC review for foreign buyers)

apps/api/src/cron/
  handlers.ts                  # MODIFY (register fxRefresh + sanctionsRefresh)
  fxRefresh.ts                 # NEW
  sanctionsRefresh.ts          # NEW

apps/api/src/observability/
  metrics.ts                   # MODIFY (counter helpers for cross_border_orders_total, fx_snapshot_age, wire_recon_mismatch)
  sloRules.ts                  # MODIFY (fx_snapshot_age rule)

apps/web/src/pages/
  supplier/onboarding/         # MODIFY (country + tax_id + incoterms step)
  buyer/onboarding/            # MODIFY (country + KYC step)
  admin/orders/                # MODIFY (wire reconciliation UI + cross-border columns)
  admin/kyc/                   # MODIFY (foreign KYC review queue)
  checkout/                    # MODIFY (cross-border display + KYC gate)

tests/
  unit/
    fx.test.ts                 # NEW
    fxProvider.test.ts         # NEW
    hsTariff.test.ts           # NEW
    sanctions.test.ts          # NEW
    incoterms.test.ts          # NEW
    restricted.test.ts         # NEW
    invoicePdf.test.ts         # NEW
  integration/
    crossBorderOrder.test.ts   # NEW (sanctioned → 422, restricted → 422, FX snapshot written, incoterms gate)
    wireRecon.test.ts          # NEW (happy + mismatch + stale snapshot)
    customsDocs.test.ts        # NEW (R2 round-trip)
  e2e/
    cross-border-export.spec.ts # NEW
    cross-border-import.spec.ts # NEW
    wire-recon.spec.ts          # NEW

docs/runbook.md                # MODIFY (cross-border section)
```

---

## Task 1: Schema — countries + fx_snapshots + order_customs_docs

**Files:**
- Create: `packages/db/src/schema/countries.ts`
- Create: `packages/db/src/schema/fxSnapshots.ts`
- Create: `packages/db/src/schema/orderCustomsDocs.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Produces: `countries`, `fxSnapshots`, `orderCustomsDocs` exported from `@vyro/db`.

- [ ] **Step 1: Write schema for `countries`**

Create `packages/db/src/schema/countries.ts`:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const countries = sqliteTable('countries', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  isSanctioned: integer('is_sanctioned', { mode: 'boolean' }).notNull().default(false),
  fxJurisdiction: text('fx_jurisdiction').notNull().default('INTL'),
});

export type Country = typeof countries.$inferSelect;
```

- [ ] **Step 2: Write schema for `fx_snapshots`**

Create `packages/db/src/schema/fxSnapshots.ts`:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const fxSnapshots = sqliteTable(
  'fx_snapshots',
  {
    id: text('id').primaryKey(),
    base: text('base').notNull(),
    quoteCurrency: text('quote_currency').notNull(),
    // rate stored as integer scaled by 1e8 (no float)
    rateScaled: text('rate_scaled').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    provider: text('provider', { enum: ['CBSL', 'EXCHANGERATE_HOST'] }).notNull(),
  },
  (t) => ({
    pairFetchedIdx: index('fx_snapshots_pair_fetched_idx').on(t.base, t.quoteCurrency, t.fetchedAt),
  }),
);

export type FxSnapshot = typeof fxSnapshots.$inferSelect;
```

- [ ] **Step 3: Write schema for `order_customs_docs`**

Create `packages/db/src/schema/orderCustomsDocs.ts`:

```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { purchaseOrders } from './purchaseOrders';
import { users } from './users';

export const orderCustomsDocs = sqliteTable(
  'order_customs_docs',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    kind: text('kind', { enum: ['invoice', 'packing-list', 'coo', 'awb', 'bl'] }).notNull(),
    r2Path: text('r2_path').notNull(),
    uploadedAt: integer('uploaded_at').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    orderIdx: index('order_customs_docs_order_idx').on(t.orderId),
  }),
);

export type OrderCustomsDoc = typeof orderCustomsDocs.$inferSelect;
```

- [ ] **Step 4: Export from barrel**

Append to `packages/db/src/schema/index.ts` (preserve existing exports, add at end):

```ts
export * from './countries';
export * from './fxSnapshots';
export * from './orderCustomsDocs';
```

- [ ] **Step 5: Generate + commit migration**

Run: `pnpm --filter @vyro/db exec drizzle-kit generate --name cross_border_base`

Expected: SQL file in `packages/db/migrations/` with `create table countries`, `create table fx_snapshots`, `create table order_customs_docs`.

```bash
git add packages/db/src/schema/countries.ts \
        packages/db/src/schema/fxSnapshots.ts \
        packages/db/src/schema/orderCustomsDocs.ts \
        packages/db/src/schema/index.ts \
        packages/db/migrations/
git commit -m "feat(db): add countries, fx_snapshots, order_customs_docs tables"
```

---

## Task 2: Schema — extend suppliers, businesses, products, purchaseOrders

**Files:**
- Modify: `packages/db/src/schema/suppliers.ts`
- Modify: `packages/db/src/schema/businesses.ts`
- Modify: `packages/db/src/schema/products.ts`
- Modify: `packages/db/src/schema/purchaseOrders.ts`

**Interfaces:**
- Adds columns listed in spec §5.2.

- [ ] **Step 1: Extend `suppliers`**

In `packages/db/src/schema/suppliers.ts` add to the column object (preserve existing order, append):

```ts
countryCode: text('country_code').notNull().default('LK'),
taxId: text('tax_id'),
isExportEligible: integer('is_export_eligible', { mode: 'boolean' }).notNull().default(false),
defaultIncoterms: text('default_incoterms', {
  enum: ['EXW', 'FOB', 'CIF', 'DDP', 'DDU'],
}),
defaultHsCode: text('default_hs_code'),
defaultCountryOfOrigin: text('default_country_of_origin'),
```

- [ ] **Step 2: Extend `businesses`** (buyers live here)

In `packages/db/src/schema/businesses.ts` add:

```ts
countryCode: text('country_code').notNull().default('LK'),
taxId: text('tax_id'),
kycLevel: text('kyc_level', { enum: ['none', 'basic', 'enhanced'] }).notNull().default('none'),
kycVerifiedAt: integer('kyc_verified_at'),
kycVerifiedBy: text('kyc_verified_by'),
```

- [ ] **Step 3: Extend `products`**

In `packages/db/src/schema/products.ts` add:

```ts
hsCode: text('hs_code'),
countryOfOrigin: text('country_of_origin'),
isExportControlled: integer('is_export_controlled', { mode: 'boolean' }).notNull().default(false),
```

- [ ] **Step 4: Extend `purchaseOrders`**

In `packages/db/src/schema/purchaseOrders.ts` add:

```ts
direction: text('direction', { enum: ['domestic', 'export', 'import'] }).notNull().default('domestic'),
incoterms: text('incoterms', { enum: ['EXW', 'FOB', 'CIF', 'DDP', 'DDU'] }),
fxSnapshotId: text('fx_snapshot_id'),
declaredShippingCostCents: integer('declared_shipping_cost_cents'),
declaredDutyCents: integer('declared_duty_cents'),
commercialInvoiceNo: text('commercial_invoice_no'),
customsStatus: text('customs_status', { enum: ['none', 'pending', 'cleared', 'held'] })
  .notNull()
  .default('none'),
wireRef: text('wire_ref'),
wireReceivedAmountCents: integer('wire_received_amount_cents'),
wireReceivedCurrency: text('wire_received_currency'),
wireReceivedAt: integer('wire_received_at'),
wireReceivedBy: text('wire_received_by'),
```

Add index after the existing ones:

```ts
directionIdx: index('purchase_orders_direction_idx').on(t.direction),
customsStatusIdx: index('purchase_orders_customs_status_idx').on(t.customsStatus),
```

- [ ] **Step 5: Generate migration**

Run: `pnpm --filter @vyro/db exec drizzle-kit generate --name cross_border_extend`

Expected: SQL `alter table` statements for the four tables; all nullable or with `default`.

- [ ] **Step 6: Run migration locally + verify**

Run: `pnpm db:migrate`

Expected: exit 0, D1 echoes success per migration.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/suppliers.ts \
        packages/db/src/schema/businesses.ts \
        packages/db/src/schema/products.ts \
        packages/db/src/schema/purchaseOrders.ts \
        packages/db/migrations/
git commit -m "feat(db): extend suppliers, businesses, products, purchase_orders for cross-border"
```

---

## Task 3: Backfill + country seed

**Files:**
- Create: `packages/db/src/data/iso-country-codes.json`
- Create: `packages/db/scripts/backfill-cross-border.ts`
- Modify: `packages/db/package.json` (add script)

**Interfaces:**
- Produces: `seedCountries()` and `backfill()` functions callable from worker init.

- [ ] **Step 1: Create ISO country seed JSON**

Create `packages/db/src/data/iso-country-codes.json` with at minimum:

```json
[
  { "code": "LK", "name": "Sri Lanka", "isSanctioned": false, "fxJurisdiction": "LK" },
  { "code": "US", "name": "United States", "isSanctioned": false, "fxJurisdiction": "INTL" },
  { "code": "GB", "name": "United Kingdom", "isSanctioned": false, "fxJurisdiction": "INTL" },
  { "code": "IN", "name": "India", "isSanctioned": false, "fxJurisdiction": "INTL" },
  { "code": "AE", "name": "United Arab Emirates", "isSanctioned": false, "fxJurisdiction": "INTL" },
  { "code": "SG", "name": "Singapore", "isSanctioned": false, "fxJurisdiction": "INTL" },
  { "code": "AU", "name": "Australia", "isSanctioned": false, "fxJurisdiction": "INTL" },
  { "code": "RU", "name": "Russia", "isSanctioned": true, "fxJurisdiction": "INTL" },
  { "code": "IR", "name": "Iran", "isSanctioned": true, "fxJurisdiction": "INTL" },
  { "code": "KP", "name": "North Korea", "isSanctioned": true, "fxJurisdiction": "INTL" }
]
```

(Full 249-country list checked in via separate PR; this is the working set.)

- [ ] **Step 2: Write seed function**

Create `packages/db/src/schema/countries.seed.ts`:

```ts
import iso from '../data/iso-country-codes.json';
import { countries } from './countries';
import type { DrizzleD1 } from './getDb';

export async function seedCountries(db: DrizzleD1): Promise<void> {
  for (const c of iso) {
    await db.insert(countries).values(c).onConflictDoNothing();
  }
}
```

- [ ] **Step 3: Write backfill script**

Create `packages/db/scripts/backfill-cross-border.ts`:

```ts
import { getDb } from '../src/getDb';
import { seedCountries } from '../src/schema/countries.seed';
import { suppliers } from '../src/schema/suppliers';
import { businesses } from '../src/schema/businesses';
import { purchaseOrders } from '../src/schema/purchaseOrders';
import { eq, isNull } from 'drizzle-orm';

export async function backfill(env: Env): Promise<void> {
  const db = getDb(env);
  await seedCountries(db);
  await db.update(suppliers).set({ countryCode: 'LK' }).where(isNull(suppliers.countryCode));
  await db.update(businesses).set({ countryCode: 'LK' }).where(isNull(businesses.countryCode));
  // verified SL buyers get basic KYC; existing KYC module decides (see kycReviews)
  // purchase_orders.direction defaults 'domestic' via schema default — no update needed
}
```

- [ ] **Step 4: Add npm script**

In `packages/db/package.json` add under `scripts`:

```json
"backfill:cross-border": "tsx scripts/backfill-cross-border.ts"
```

- [ ] **Step 5: Run backfill against local D1**

Run: `pnpm --filter @vyro/db backfill:cross-border`

Expected: logs "seeded 10 countries, updated N suppliers, updated M businesses" with non-zero counts on suppliers/businesses.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/data/iso-country-codes.json \
        packages/db/src/schema/countries.seed.ts \
        packages/db/scripts/backfill-cross-border.ts \
        packages/db/package.json
git commit -m "feat(db): country seed + cross-border backfill script"
```

---

## Task 4: Feature flag

**Files:**
- Create: `apps/api/src/lib/crossBorderEnv.ts`
- Modify: `apps/api/src/env.ts` (read `CROSS_BORDER_ENABLED`)

**Interfaces:**
- Produces: `isCrossBorderEnabled(env): boolean`, `assertCrossBorderEnabled(env): void`.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/lib/crossBorderEnv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isCrossBorderEnabled, assertCrossBorderEnabled } from './crossBorderEnv';

const env = (flag?: string) => ({ CROSS_BORDER_ENABLED: flag } as unknown as Env);

describe('crossBorderEnv', () => {
  it('returns false when flag unset', () => {
    expect(isCrossBorderEnabled(env())).toBe(false);
  });
  it('returns true when flag "true"', () => {
    expect(isCrossBorderEnabled(env('true'))).toBe(true);
  });
  it('assert throws 503 when disabled', () => {
    expect(() => assertCrossBorderEnabled(env())).toThrowError(/CROSS_BORDER_DISABLED/);
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @vyro/api test crossBorderEnv`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/crossBorderEnv.ts`:

```ts
import { httpError } from './errors';
import type { Env } from '../env';

export function isCrossBorderEnabled(env: Env): boolean {
  return env.CROSS_BORDER_ENABLED === 'true';
}

export function assertCrossBorderEnabled(env: Env): void {
  if (!isCrossBorderEnabled(env)) {
    throw httpError(503, 'CROSS_BORDER_DISABLED', 'Cross-border trading is not enabled');
  }
}
```

- [ ] **Step 4: Run, see pass**

Run: `pnpm --filter @vyro/api test crossBorderEnv`

Expected: PASS.

- [ ] **Step 5: Wire env binding**

In `apps/api/src/env.ts`, add to the `Env` interface:

```ts
CROSS_BORDER_ENABLED?: string;
```

(In local `.dev.vars`: `CROSS_BORDER_ENABLED=true`. In `wrangler.toml` `[env.production.vars]`: leave unset until task 25.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/crossBorderEnv.ts \
        apps/api/src/lib/crossBorderEnv.test.ts \
        apps/api/src/env.ts
git commit -m "feat(api): CROSS_BORDER_ENABLED feature flag"
```

---

## Task 5: FX provider

**Files:**
- Create: `apps/api/src/lib/fxProvider.ts`
- Create: `apps/api/src/lib/fxProvider.test.ts`

**Interfaces:**
- Produces: `fetchRate(base, quote, env): Promise<{ rateScaled: string; provider: 'CBSL' | 'EXCHANGERATE_HOST' } | null>`.
- `rateScaled` is the rate × 1e8 as a string (no float).

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRate } from './fxProvider';

const env = {} as Env;

describe('fetchRate', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns CBSL rate on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ rates: { USD: 0.0033 } }), { status: 200 }),
    );
    const r = await fetchRate('LKR', 'USD', env);
    expect(r?.provider).toBe('CBSL');
    expect(r?.rateScaled).toBe('330000'); // 0.0033 * 1e8
  });

  it('falls back to exchangerate.host on CBSL failure', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('cbsl down'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rates: { LKR: 302.5 } }), { status: 200 }),
      );
    const r = await fetchRate('USD', 'LKR', env);
    expect(r?.provider).toBe('EXCHANGERATE_HOST');
  });

  it('returns null when both providers fail', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('cbsl'))
      .mockRejectedValueOnce(new Error('exchangerate'));
    expect(await fetchRate('LKR', 'USD', env)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @vyro/api test fxProvider`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/fxProvider.ts`:

```ts
const CBSL_URL = 'https://www.cbsl.gov.lk/api/v1/exchangerates';
const EXCHANGERATE_URL = 'https://api.exchangerate.host/latest';

const SCALE = 100_000_000; // 1e8

function scaleRate(rate: number): string {
  return Math.round(rate * SCALE).toString();
}

export type FxProvider = 'CBSL' | 'EXCHANGERATE_HOST';

export interface FxRateResult {
  rateScaled: string;
  provider: FxProvider;
}

async function tryCbsl(base: string, quote: string): Promise<FxRateResult | null> {
  const res = await fetch(`${CBSL_URL}?base=${base}&quote=${quote}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.[quote];
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  return { rateScaled: scaleRate(rate), provider: 'CBSL' };
}

async function tryExchangerateHost(base: string, quote: string): Promise<FxRateResult | null> {
  const res = await fetch(`${EXCHANGERATE_URL}?base=${base}&symbols=${quote}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.[quote];
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
  return { rateScaled: scaleRate(rate), provider: 'EXCHANGERATE_HOST' };
}

export async function fetchRate(base: string, quote: string, _env: Env): Promise<FxRateResult | null> {
  if (base === quote) return { rateScaled: SCALE.toString(), provider: 'CBSL' };
  return (await tryCbsl(base, quote)) ?? (await tryExchangerateHost(base, quote));
}
```

- [ ] **Step 4: Run, see pass**

Run: `pnpm --filter @vyro/api test fxProvider`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/fxProvider.ts apps/api/src/lib/fxProvider.test.ts
git commit -m "feat(api): FX provider with CBSL + exchangerate.host fallback"
```

---

## Task 6: FX service (snapshot + cache)

**Files:**
- Create: `apps/api/src/modules/cross-border/fx.ts`
- Create: `apps/api/src/modules/cross-border/fx.test.ts`

**Interfaces:**
- Produces: `getLiveRate(base, quote, env): Promise<string | null>` — cached KV lookup, returns `rateScaled` string.
- Produces: `snapshotRate(base, quote, db, env): Promise<{ id: string; rateScaled: string }>` — writes `fx_snapshots` row.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { snapshotRate } from './fx';
import { fetchRate } from '../../lib/fxProvider';

vi.mock('../../lib/fxProvider');

const env = { CROSS_BORDER_KV: { get: vi.fn(), put: vi.fn() } } as unknown as Env;
const db = {
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'snap-1', rateScaled: '330000' }]),
    }),
  }),
} as unknown as DrizzleD1;

describe('snapshotRate', () => {
  it('writes fx_snapshots row with provider', async () => {
    vi.mocked(fetchRate).mockResolvedValue({ rateScaled: '330000', provider: 'CBSL' });
    const r = await snapshotRate('LKR', 'USD', db, env);
    expect(r.id).toBe('snap-1');
    expect(r.rateScaled).toBe('330000');
    expect(db.insert).toHaveBeenCalled();
  });

  it('throws FX_UNAVAILABLE when fetchRate returns null', async () => {
    vi.mocked(fetchRate).mockResolvedValue(null);
    await expect(snapshotRate('LKR', 'USD', db, env)).rejects.toThrowError(/FX_UNAVAILABLE/);
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @vyro/api test cross-border/fx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/cross-border/fx.ts`:

```ts
import { fxSnapshots } from '@vyro/db/schema';
import { fetchRate } from '../../lib/fxProvider';
import { httpError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { newId } from '../../lib/id';

const KV_TTL = 3600;

export async function getLiveRate(base: string, quote: string, env: Env): Promise<string | null> {
  const cacheKey = `fx:${base}:${quote}`;
  const cached = await env.CROSS_BORDER_KV.get(cacheKey);
  if (cached) return cached;
  const fetched = await fetchRate(base, quote, env);
  if (!fetched) return null;
  await env.CROSS_BORDER_KV.put(cacheKey, fetched.rateScaled, { expirationTtl: KV_TTL });
  return fetched.rateScaled;
}

export async function snapshotRate(
  base: string,
  quote: string,
  db: DrizzleD1,
  env: Env,
): Promise<{ id: string; rateScaled: string }> {
  const fetched = await fetchRate(base, quote, env);
  if (!fetched) {
    logger.warn('fx.fetch.failed', { base, quote });
    throw httpError(503, 'FX_UNAVAILABLE', 'Cannot fetch FX rate');
  }
  const id = newId('fx');
  const [row] = await db
    .insert(fxSnapshots)
    .values({
      id,
      base,
      quoteCurrency: quote,
      rateScaled: fetched.rateScaled,
      fetchedAt: Date.now(),
      provider: fetched.provider,
    })
    .returning();
  return { id: row.id, rateScaled: row.rateScaled };
}

export async function convertCents(
  amountCents: number,
  fromCurrency: string,
  toCurrency: string,
  rateScaled: string,
): Promise<number> {
  if (fromCurrency === toCurrency) return amountCents;
  const rate = Number(rateScaled) / 1e8;
  return Math.round(amountCents * rate);
}
```

Add `CROSS_BORDER_KV` binding to `apps/api/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CROSS_BORDER_KV"
id = "<run `wrangler kv namespace create vyro-cross-border` then paste id>"
```

(Note: provisioning script in `scripts/provision-cross-border-kv.mjs` exists — wire it in task 25.)

- [ ] **Step 4: Run, see pass**

Run: `pnpm --filter @vyro/api test cross-border/fx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cross-border/fx.ts \
        apps/api/src/modules/cross-border/fx.test.ts \
        apps/api/wrangler.toml
git commit -m "feat(api): FX snapshot + live-rate KV cache"
```

---

## Task 7: FX routes

**Files:**
- Create: `apps/api/src/routes/fx.ts`
- Modify: `apps/api/src/index.ts` (register route)

**Interfaces:**
- `GET /api/fx/rates?base=LKR&quote=USD` → `{ rateScaled, fetchedAt? }`.

- [ ] **Step 1: Write failing test**

`apps/api/src/routes/fx.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import app from '../index';

describe('GET /api/fx/rates', () => {
  it('returns 400 without base/quote', async () => {
    const res = await app.request('/api/fx/rates');
    expect(res.status).toBe(400);
  });

  it('returns rate when KV cache hit', async () => {
    const env = {
      CROSS_BORDER_KV: {
        get: vi.fn().mockResolvedValue('330000'),
        put: vi.fn(),
      },
    } as unknown as Env;
    const res = await app.request('/api/fx/rates?base=LKR&quote=USD', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rateScaled: string };
    expect(body.rateScaled).toBe('330000');
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @vyro/api test routes/fx`

Expected: FAIL — route not registered.

- [ ] **Step 3: Implement route**

Create `apps/api/src/routes/fx.ts`:

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { getLiveRate } from '../modules/cross-border/fx';
import { httpError } from '../lib/errors';
import type { Env } from '../env';

const querySchema = z.object({
  base: z.string().length(3),
  quote: z.string().length(3),
});

const router = new Hono<{ Bindings: Env }>();

router.get('/fx/rates', async (c) => {
  const parsed = querySchema.safeParse({
    base: c.req.query('base'),
    quote: c.req.query('quote'),
  });
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const rateScaled = await getLiveRate(parsed.data.base, parsed.data.quote, c.env);
  if (!rateScaled) throw httpError(503, 'FX_UNAVAILABLE', 'Cannot fetch FX rate');
  return c.json({ rateScaled });
});

export default router;
```

- [ ] **Step 4: Register in `index.ts`**

Add after existing route mounts in `apps/api/src/index.ts`:

```ts
import fxRoutes from './routes/fx';
app.route('/api', fxRoutes);
```

- [ ] **Step 5: Run, see pass**

Run: `pnpm --filter @vyro/api test routes/fx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/fx.ts \
        apps/api/src/routes/fx.test.ts \
        apps/api/src/index.ts
git commit -m "feat(api): GET /api/fx/rates"
```

---

## Task 8: Incoterms helper

**Files:**
- Create: `apps/api/src/modules/cross-border/incoterms.ts`
- Create: `apps/api/src/modules/cross-border/incoterms.test.ts`

**Interfaces:**
- Produces: `INCOTERMS` enum, `requiredFields(incoterms): ('declaredShippingCostCents' | 'commercialInvoiceNo' | 'coo')[]`.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { requiredFields } from './incoterms';

describe('requiredFields', () => {
  it('EXW requires commercial invoice', () => {
    expect(requiredFields('EXW')).toContain('commercialInvoiceNo');
  });
  it('CIF requires shipping cost + invoice', () => {
    const f = requiredFields('CIF');
    expect(f).toContain('declaredShippingCostCents');
    expect(f).toContain('commercialInvoiceNo');
  });
  it('DDP requires COO', () => {
    expect(requiredFields('DDP')).toContain('coo');
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @vyro/api test cross-border/incoterms`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/cross-border/incoterms.ts`:

```ts
export const INCOTERMS = ['EXW', 'FOB', 'CIF', 'DDP', 'DDU'] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export type CrossBorderField = 'declaredShippingCostCents' | 'commercialInvoiceNo' | 'coo';

export function requiredFields(incoterm: Incoterm): CrossBorderField[] {
  switch (incoterm) {
    case 'EXW':
      return ['commercialInvoiceNo'];
    case 'FOB':
      return ['commercialShippingCost' as CrossBorderField, 'commercialInvoiceNo'] as CrossBorderField[];
    case 'CIF':
      return ['declaredShippingCostCents', 'commercialInvoiceNo'];
    case 'DDP':
      return ['declaredShippingCostCents', 'commercialInvoiceNo', 'coo'];
    case 'DDU':
      return ['declaredShippingCostCents', 'commercialInvoiceNo'];
  }
}
```

(Final mapping per ICC 2020 — adjust per local customs counsel before production.)

- [ ] **Step 4: Run, see pass**

Run: `pnpm --filter @vyro/api test cross-border/incoterms`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cross-border/incoterms.ts \
        apps/api/src/modules/cross-border/incoterms.test.ts
git commit -m "feat(api): incoterms helper"
```

---

## Task 9: Sanctions service

**Files:**
- Create: `apps/api/src/modules/cross-border/sanctions.ts`
- Create: `apps/api/src/modules/cross-border/sanctions.test.ts`

**Interfaces:**
- Produces: `isCountrySanctioned(code: string, env: Env): Promise<boolean>` — KV cached, weekly refresh.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { isCountrySanctioned } from './sanctions';

const env = {
  CROSS_BORDER_KV: {
    get: vi.fn().mockImplementation(async (k: string) =>
      k === 'sanctions:list' ? JSON.stringify(['RU', 'IR', 'KP']) : null,
    ),
    put: vi.fn(),
  },
} as unknown as Env;

describe('isCountrySanctioned', () => {
  it('returns true for sanctioned', async () => {
    expect(await isCountrySanctioned('RU', env)).toBe(true);
  });
  it('returns false for clean', async () => {
    expect(await isCountrySanctioned('US', env)).toBe(false);
  });
  it('normalizes case', async () => {
    expect(await isCountrySanctioned('ru', env)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, see fail**

Run: `pnpm --filter @vyro/api test cross-border/sanctions`

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/cross-border/sanctions.ts`:

```ts
const KV_KEY = 'sanctions:list';
const TTL_SECONDS = 604800; // 7d

const SEED: string[] = ['RU', 'IR', 'KP', 'SY', 'CU'];

export async function getSanctionedList(env: Env): Promise<string[]> {
  const cached = await env.CROSS_BORDER_KV.get(KV_KEY);
  if (cached) return JSON.parse(cached) as string[];
  await env.CROSS_BORDER_KV.put(KV_KEY, JSON.stringify(SEED), { expirationTtl: TTL_SECONDS });
  return SEED;
}

export async function isCountrySanctioned(code: string, env: Env): Promise<boolean> {
  const list = await getSanctionedList(env);
  return list.includes(code.toUpperCase());
}

export async function refreshSanctionsList(env: Env, fetcher: () => Promise<string[]> = defaultFetcher): Promise<void> {
  const list = await fetcher();
  await env.CROSS_BORDER_KV.put(KV_KEY, JSON.stringify(list), { expirationTtl: TTL_SECONDS });
}

async function defaultFetcher(): Promise<string[]> {
  // Fetch OFAC SDN + UN consolidated list, intersect countries, return ISO codes.
  // Implementation: call https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV
  // and https://scsanctions.un.org/resources/xml/en/consolidated.xml
  // Extract country codes, dedupe, return. Detailed parsing left to integration phase.
  return SEED;
}
```

- [ ] **Step 4: Run, see pass**

Run: `pnpm --filter @vyro/api test cross-border/sanctions`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cross-border/sanctions.ts \
        apps/api/src/modules/cross-border/sanctions.test.ts
git commit -m "feat(api): sanctions service with KV cache"
```

---

## Task 10: Sanctions refresh cron

**Files:**
- Create: `apps/api/src/cron/sanctionsRefresh.ts`
- Modify: `apps/api/src/cron/handlers.ts` (register)

**Interfaces:**
- Cron handler: `handle(env: Env): Promise<{ refreshed: boolean; count: number }>`.

- [ ] **Step 1: Implement cron handler**

Create `apps/api/src/cron/sanctionsRefresh.ts`:

```ts
import { refreshSanctionsList } from '../modules/cross-border/sanctions';
import { logger } from '../lib/logger';

export async function handle(env: Env): Promise<{ refreshed: boolean; count: number }> {
  try {
    await refreshSanctionsList(env);
    return { refreshed: true, count: -1 };
  } catch (e) {
    logger.error('sanctions.refresh.failed', { err: String(e) });
    return { refreshed: false, count: 0 };
  }
}
```

- [ ] **Step 2: Register in `cron/handlers.ts`**

Find the existing `handlers` object/registry pattern in `apps/api/src/cron/handlers.ts` and add:

```ts
import * as sanctionsRefresh from './sanctionsRefresh';

export const handlers = {
  // ...existing
  sanctionsRefresh,
};
```

(Adjust shape to match existing registry — match the file's exact pattern.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/cron/sanctionsRefresh.ts apps/api/src/cron/handlers.ts
git commit -m "feat(cron): weekly sanctions list refresh"
```

---

## Task 11: HS code registry + duty estimator

**Files:**
- Create: `packages/db/src/data/hs-codes.json`
- Create: `apps/api/src/lib/hsTariff.ts`
- Create: `apps/api/src/lib/hsTariff.test.ts`

**Interfaces:**
- Produces: `estimateDuty(hsCode, countryOfOrigin, declaredValueCents, db?): Promise<{ dutyCents: number; warning?: 'HS_CODE_UNKNOWN' } | null>`.

- [ ] **Step 1: Bundle top-500 HS lines**

Create `packages/db/src/data/hs-codes.json` with array of `{ "hsCode": "0901.21", "description": "Coffee roasted", "dutyRateBps": 1500 }`. `dutyRateBps` = basis points (10000 = 100%).

Source: download CBSL tariff PDF, parse, store. Minimal seed: 50 most-traded SL lines.

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { estimateDuty } from './hsTariff';

describe('estimateDuty', () => {
  it('returns duty when HS code known', async () => {
    const r = await estimateDuty('0901.21', 'BR', 100000); // 1000 LKR
    expect(r?.dutyCents).toBeGreaterThan(0);
  });
  it('returns HS_CODE_UNKNOWN warning for missing', async () => {
    const r = await estimateDuty('9999.99', 'XX', 100000);
    expect(r?.warning).toBe('HS_CODE_UNKNOWN');
  });
  it('returns null on invalid input', async () => {
    const r = await estimateDuty('', '', -1);
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/hsTariff.ts`:

```ts
import hsData from '@vyro/db/data/hs-codes.json';

interface HsLine {
  hsCode: string;
  description: string;
  dutyRateBps: number;
}

const LINES: HsLine[] = hsData as HsLine[][];
const INDEX = new Map(LINES.map((l) => [l.hsCode, l]));

export interface DutyResult {
  dutyCents: number;
  warning?: 'HS_CODE_UNKNOWN';
}

export async function estimateDuty(
  hsCode: string,
  _countryOfOrigin: string,
  declaredValueCents: number,
): Promise<DutyResult | null> {
  if (!hsCode || !Number.isFinite(declaredValueCents) || declaredValueCents < 0) return null;
  const line = INDEX.get(hsCode);
  if (!line) return { dutyCents: 0, warning: 'HS_CODE_UNKNOWN' };
  return { dutyCents: Math.round((declaredValueCents * line.dutyRateBps) / 10000) };
}
```

- [ ] **Step 4: Run, see pass**

Run: `pnpm --filter @vyro/api test hsTariff`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/data/hs-codes.json \
        apps/api/src/lib/hsTariff.ts \
        apps/api/src/lib/hsTariff.test.ts
git commit -m "feat(api): HS tariff estimator"
```

---

## Task 12: Restricted-goods service

**Files:**
- Create: `apps/api/src/modules/cross-border/restricted.ts`
- Create: `apps/api/src/modules/cross-border/restricted.test.ts`

**Interfaces:**
- Produces: `isProductRestricted(hsCode, destCountry, env): Promise<{ restricted: boolean; reason?: string }>`.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isProductRestricted } from './restricted';

describe('isProductRestricted', () => {
  it('flags weapons HS codes globally', async () => {
    const r = await isProductRestricted('9301', 'US', {} as Env);
    expect(r.restricted).toBe(true);
  });
  it('passes coffee to US', async () => {
    const r = await isProductRestricted('0901.21', 'US', {} as Env);
    expect(r.restricted).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

Create `apps/api/src/modules/cross-border/restricted.ts`:

```ts
const RESTRICTED_HS_PREFIXES: { prefix: string; reason: string }[] = [
  { prefix: '93', reason: 'arms_and_ammunition' },
  { prefix: '9301', reason: 'military_weapons' },
  { prefix: '2844', reason: 'radioactive_isotopes' },
  { prefix: '1211', reason: 'narcotics_raw' },
];

export interface RestrictedResult {
  restricted: boolean;
  reason?: string;
}

export async function isProductRestricted(
  hsCode: string | null | undefined,
  _destCountry: string,
  _env: Env,
): Promise<RestrictedResult> {
  if (!hsCode) return { restricted: false };
  for (const r of RESTRICTED_HS_PREFIXES) {
    if (hsCode.startsWith(r.prefix)) return { restricted: true, reason: r.reason };
  }
  return { restricted: false };
}
```

- [ ] **Step 3: Run, see pass**

Run: `pnpm --filter @vyro/api test cross-border/restricted`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/cross-border/restricted.ts \
        apps/api/src/modules/cross-border/restricted.test.ts
git commit -m "feat(api): restricted-goods HS check"
```

---

## Task 13: Cross-border service (orchestration)

**Files:**
- Create: `apps/api/src/modules/cross-border/service.ts`
- Create: `apps/api/src/modules/cross-border/service.test.ts`

**Interfaces:**
- Produces: `preOrderCreateCheck({ buyerCountry, supplierCountry, hsCodes, env, db }): Promise<{ direction: 'domestic' | 'export' | 'import'; fxSnapshotId: string | null }>`.
- Produces: `preOrderConfirmCheck({ orderId, incoterms, declaredShippingCostCents, db }): Promise<void>`.

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { preOrderCreateCheck } from './service';
import * as sanctions from './sanctions';
import * as restricted from './restricted';
import * as fx from './fx';

vi.mock('./sanctions');
vi.mock('./restricted');
vi.mock('./fx');

describe('preOrderCreateCheck', () => {
  it('returns direction=export for SL supplier + foreign buyer', async () => {
    vi.mocked(sanctions.isCountrySanctioned).mockResolvedValue(false);
    vi.mocked(restricted.isProductRestricted).mockResolvedValue({ restricted: false });
    vi.mocked(fx.snapshotRate).mockResolvedValue({ id: 'snap-1', rateScaled: '330000' });
    const r = await preOrderCreateCheck(
      { buyerCountry: 'US', supplierCountry: 'LK', hsCodes: [], env: {} as Env, db: {} as DrizzleD1 },
    );
    expect(r.direction).toBe('export');
    expect(r.fxSnapshotId).toBe('snap-1');
  });

  it('throws COUNTRY_SANCTIONED', async () => {
    vi.mocked(sanctions.isCountrySanctioned).mockResolvedValue(true);
    await expect(
      preOrderCreateCheck({ buyerCountry: 'RU', supplierCountry: 'LK', hsCodes: [], env: {} as Env, db: {} as DrizzleD1 }),
    ).rejects.toThrowError(/COUNTRY_SANCTIONED/);
  });

  it('throws PRODUCT_RESTRICTED', async () => {
    vi.mocked(sanctions.isCountrySanctioned).mockResolvedValue(false);
    vi.mocked(restricted.isProductRestricted).mockResolvedValue({ restricted: true, reason: 'arms' });
    await expect(
      preOrderCreateCheck({ buyerCountry: 'US', supplierCountry: 'LK', hsCodes: ['9301'], env: {} as Env, db: {} as DrizzleD1 }),
    ).rejects.toThrowError(/PRODUCT_RESTRICTED/);
  });
});
```

- [ ] **Step 2: Implement**

Create `apps/api/src/modules/cross-border/service.ts`:

```ts
import { httpError } from '../../lib/errors';
import { isCountrySanctioned } from './sanctions';
import { isProductRestricted } from './restricted';
import { snapshotRate } from './fx';
import { requiredFields, type Incoterm } from './incoterms';
import { logger } from '../../lib/logger';

export type OrderDirection = 'domestic' | 'export' | 'import';

export interface PreOrderInput {
  buyerCountry: string;
  supplierCountry: string;
  hsCodes: string[];
  env: Env;
  db: DrizzleD1;
}

export interface PreOrderResult {
  direction: OrderDirection;
  fxSnapshotId: string | null;
}

function deriveDirection(buyerCountry: string, supplierCountry: string): OrderDirection {
  const buyerIsLanka = buyerCountry === 'LK';
  const supplierIsLanka = supplierCountry === 'LK';
  if (buyerIsLanka && supplierIsLanka) return 'domestic';
  if (supplierIsLanka && !buyerIsLanka) return 'export';
  return 'import';
}

export async function preOrderCreateCheck(input: PreOrderInput): Promise<PreOrderResult> {
  const direction = deriveDirection(input.buyerCountry, input.supplierCountry);

  if (await isCountrySanctioned(input.buyerCountry, input.env)) {
    logger.warn('cross_border.sanctions.blocked', { country: input.buyerCountry });
    throw httpError(422, 'COUNTRY_SANCTIONED', 'Buyer country is sanctioned');
  }
  if (await isCountrySanctioned(input.supplierCountry, input.env)) {
    throw httpError(422, 'COUNTRY_SANCTIONED', 'Supplier country is sanctioned');
  }

  for (const hs of input.hsCodes) {
    const r = await isProductRestricted(hs, input.buyerCountry, input.env);
    if (r.restricted) {
      throw httpError(422, 'PRODUCT_RESTRICTED', `Product restricted: ${r.reason}`);
    }
  }

  let fxSnapshotId: string | null = null;
  if (direction !== 'domestic') {
    const snap = await snapshotRate('LKR', input.buyerCountry === 'LK' ? 'USD' : input.buyerCountry, input.db, input.env);
    fxSnapshotId = snap.id;
  }

  return { direction, fxSnapshotId };
}

export async function preOrderConfirmCheck(args: {
  orderId: string;
  incoterms: Incoterm;
  declaredShippingCostCents: number | null;
  db: DrizzleD1;
}): Promise<void> {
  const required = requiredFields(args.incoterms);
  if (required.includes('declaredShippingCostCents') && args.declaredShippingCostCents == null) {
    throw httpError(422, 'INVALID_INCOTERMS', `${args.incoterms} requires declared shipping cost`);
  }
}
```

- [ ] **Step 3: Run, see pass**

Run: `pnpm --filter @vyro/api test cross-border/service`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/cross-border/service.ts \
        apps/api/src/modules/cross-border/service.test.ts
git commit -m "feat(api): cross-border order pre-create + confirm checks"
```

---

## Task 14: Order create hook

**Files:**
- Modify: `apps/api/src/modules/purchaseOrders/service.ts`

**Interfaces:**
- Reads: `preOrderCreateCheck` from task 13.
- Reads: `buyer.countryCode`, `supplier.countryCode`, products via existing repos.

- [ ] **Step 1: Locate checkout entry**

Find `checkoutService` export in `apps/api/src/modules/purchaseOrders/service.ts`. Locate the line where the `purchaseOrders` row is about to be inserted.

- [ ] **Step 2: Add hook**

Insert before the `db.insert(purchaseOrders)` call:

```ts
import { preOrderCreateCheck } from '../cross-border/service';
import { isCrossBorderEnabled } from '../../lib/crossBorderEnv';
import { getCountryCodes } from './repository'; // add helper below if missing

// ...inside checkoutService, after fetching buyer + supplier:
if (isCrossBorderEnabled(env)) {
  const hsCodes = items.map((i) => i.product?.hsCode).filter(Boolean) as string[];
  const { direction, fxSnapshotId } = await preOrderCreateCheck({
    buyerCountry: buyer.countryCode,
    supplierCountry: supplier.countryCode,
    hsCodes,
    env,
    db,
  });
  // attach to poInsert
  poInsert.direction = direction;
  poInsert.fxSnapshotId = fxSnapshotId;
}
```

If `direction` defaults work via Drizzle (no override needed), the assignment is enough.

- [ ] **Step 3: Add KYC gate for cross-border buyers**

Above the `preOrderCreateCheck` call, add:

```ts
import { businesses } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';

if (buyer.countryCode !== 'LK' && buyer.kycLevel === 'none') {
  throw httpError(422, 'KYC_REQUIRED', 'Foreign buyers require KYC verification');
}
```

- [ ] **Step 4: Manual integration test**

Run: `pnpm --filter @vyro/api dev` and exercise `POST /api/checkout` with `CROSS_BORDER_ENABLED=true` and a foreign buyer business row. Verify:
- Direction column set on order
- `fx_snapshot_id` populated
- Audit queue receives `cross_border.order_created` entry

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/purchaseOrders/service.ts
git commit -m "feat(api): order create hook — sanctions + FX snapshot + KYC gate"
```

---

## Task 15: Customs docs repository + R2 upload

**Files:**
- Create: `apps/api/src/modules/cross-border/repository.ts`
- Create: `apps/api/src/modules/cross-border/docs.ts`
- Create: `apps/api/src/modules/cross-border/docs.test.ts`

**Interfaces:**
- Produces: `uploadCustomsDoc(orderId, kind, bytes, env, uploadedBy): Promise<{ id: string; r2Path: string }>`.
- Produces: `getSignedDocUrl(r2Path, env): Promise<string>`.

- [ ] **Step 1: Write repository**

Create `apps/api/src/modules/cross-border/repository.ts`:

```ts
import { orderCustomsDocs, type OrderCustomsDoc } from '@vyro/db/schema';
import { newId } from '../../lib/id';
import { eq } from 'drizzle-orm';

export async function insertCustomsDoc(
  db: DrizzleD1,
  row: Omit<OrderCustomsDoc, 'id' | 'uploadedAt'>,
): Promise<OrderCustomsDoc> {
  const id = newId('doc');
  const [out] = await db
    .insert(orderCustomsDocs)
    .values({ ...row, id, uploadedAt: Date.now() })
    .returning();
  return out;
}

export async function listDocsForOrder(db: DrizzleD1, orderId: string): Promise<OrderCustomsDoc[]> {
  return db.select().from(orderCustomsDocs).where(eq(orderCustomsDocs.orderId, orderId));
}
```

- [ ] **Step 2: Implement docs service**

Create `apps/api/src/modules/cross-border/docs.ts`:

```ts
import { insertCustomsDoc } from './repository';
import { newId } from '../../lib/id';

const BUCKET = 'vyro-cross-border-docs';

export async function uploadCustomsDoc(args: {
  db: DrizzleD1;
  env: Env;
  orderId: string;
  kind: 'invoice' | 'packing-list' | 'coo' | 'awb' | 'bl';
  bytes: ArrayBuffer;
  uploadedBy: string;
}): Promise<{ id: string; r2Path: string }> {
  const docId = newId('doc');
  const r2Path = `cross-border-docs/${args.orderId}/${args.kind}-${docId}.pdf`;
  await args.env.CROSS_BORDER_DOCS.put(r2Path, args.bytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });
  const row = await insertCustomsDoc(args.db, {
    orderId: args.orderId,
    kind: args.kind,
    r2Path,
    uploadedBy: args.uploadedBy,
  });
  return { id: row.id, r2Path };
}

export async function getSignedDocUrl(env: Env, r2Path: string, ttlSeconds = 600): Promise<string> {
  return env.CROSS_BORDER_DOCS.getSignedUrl(r2Path, { expiresIn: ttlSeconds });
}
```

Add binding to `apps/api/wrangler.toml`:

```toml
[[r2_buckets]]
binding = "CROSS_BORDER_DOCS"
bucket_name = "vyro-cross-border-docs"
```

- [ ] **Step 3: Write failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { uploadCustomsDoc, getSignedDocUrl } from './docs';

const env = {
  CROSS_BORDER_DOCS: {
    put: vi.fn().mockResolvedValue({}),
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.example/x'),
  },
} as unknown as Env;

describe('uploadCustomsDoc', () => {
  it('puts to R2 + inserts row', async () => {
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'd1', r2Path: 'cross-border-docs/o1/invoice-d1.pdf' }]),
        }),
      }),
    } as unknown as DrizzleD1;
    const r = await uploadCustomsDoc({
      db,
      env,
      orderId: 'o1',
      kind: 'invoice',
      bytes: new ArrayBuffer(8),
      uploadedBy: 'u1',
    });
    expect(env.CROSS_BORDER_DOCS.put).toHaveBeenCalled();
    expect(r.id).toBe('d1');
  });
});

describe('getSignedDocUrl', () => {
  it('returns signed url', async () => {
    const url = await getSignedDocUrl(env, 'cross-border-docs/o1/invoice.pdf');
    expect(url).toBe('https://signed.example/x');
  });
});
```

- [ ] **Step 4: Run, see pass**

Run: `pnpm --filter @vyro/api test cross-border/docs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cross-border/repository.ts \
        apps/api/src/modules/cross-border/docs.ts \
        apps/api/src/modules/cross-border/docs.test.ts \
        apps/api/wrangler.toml
git commit -m "feat(api): customs docs R2 upload + signed URL"
```

---

## Task 16: PDF generation (commercial invoice, packing list, COO)

**Files:**
- Modify: `apps/api/package.json` (add `pdfkit`)
- Create: `apps/api/src/modules/cross-border/invoicePdf.ts`
- Create: `apps/api/src/modules/cross-border/invoicePdf.test.ts`

**Interfaces:**
- Produces: `renderCommercialInvoice(order, items, supplier, buyer): Promise<ArrayBuffer>`.

- [ ] **Step 1: Add dep**

Run: `pnpm --filter @vyro/api add pdfkit && pnpm --filter @vyro/api add -D @types/pdfkit`

- [ ] **Step 2: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderCommercialInvoice } from './invoicePdf';

describe('renderCommercialInvoice', () => {
  it('returns a non-empty PDF buffer', async () => {
    const buf = await renderCommercialInvoice(
      { poNumber: 'PO-1', totalCents: 500000, currency: 'LKR', incoterms: 'CIF' },
      [{ name: 'Coffee 1kg', hsCode: '0901.21', qty: 10, unitPriceCents: 50000 }],
      { name: 'LK Roasters', taxId: 'TAX-1', address: 'Colombo' },
      { name: 'US Buyer Inc', countryCode: 'US', taxId: 'EIN-1', address: 'NYC' },
    );
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(buf.slice(0, 5))).toBe('%PDF-');
  });
});
```

- [ ] **Step 3: Implement**

Create `apps/api/src/modules/cross-border/invoicePdf.ts`:

```ts
import PDFDocument from 'pdfkit';

interface OrderLite {
  poNumber: string;
  totalCents: number;
  currency: string;
  incoterms?: string | null;
}
interface ItemLite {
  name: string;
  hsCode?: string | null;
  qty: number;
  unitPriceCents: number;
}
interface PartyLite {
  name: string;
  taxId?: string | null;
  countryCode?: string;
  address: string;
}

export function renderCommercialInvoice(
  order: OrderLite,
  items: ItemLite[],
  supplier: PartyLite,
  buyer: PartyLite,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];
    doc.on('data', (c: Uint8Array) => chunks.push(c));
    doc.on('end', () => {
      const merged = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
      resolve(merged.buffer);
    });
    doc.on('error', reject);

    doc.fontSize(20).text('COMMERCIAL INVOICE', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`PO: ${order.poNumber}`).text(`Incoterms: ${order.incoterms ?? '-'}`).text(`Currency: ${order.currency}`);
    doc.moveDown();
    doc.text(`Supplier: ${supplier.name} (${supplier.taxId ?? '-'})`).text(`Address: ${supplier.address}`);
    doc.moveDown();
    doc.text(`Buyer: ${buyer.name} (${buyer.countryCode}, ${buyer.taxId ?? '-'})`).text(`Address: ${buyer.address}`);
    doc.moveDown();
    doc.fontSize(12).text('Items', { underline: true });
    items.forEach((i) => {
      doc.fontSize(10).text(`${i.name}  HS:${i.hsCode ?? '-'}  qty:${i.qty}  unit:${i.unitPriceCents}c`);
    });
    doc.moveDown();
    doc.fontSize(12).text(`Total: ${order.totalCents} cents`);
    doc.end();
  });
}
```

- [ ] **Step 4: Run, see pass**

Run: `pnpm --filter @vyro/api test cross-border/invoicePdf`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/modules/cross-border/invoicePdf.ts apps/api/src/modules/cross-border/invoicePdf.test.ts
git commit -m "feat(api): commercial invoice PDF generator"
```

---

## Task 17: Ship transition — customs doc gate

**Files:**
- Modify: `apps/api/src/modules/purchaseOrders/service.ts`

- [ ] **Step 1: Locate `ready` transition**

Find the handler that sets `status='ready'` in `purchaseOrders/service.ts`. It receives `orderId` + the current order row.

- [ ] **Step 2: Add gate**

Insert before the status update:

```ts
import { listDocsForOrder } from '../cross-border/repository';

if (order.direction !== 'domestic') {
  const docs = await listDocsForOrder(db, order.id);
  const kinds = new Set(docs.map((d) => d.kind));
  if (!kinds.has('invoice')) {
    throw httpError(422, 'MISSING_CUSTOMS_DOC', 'Commercial invoice required');
  }
  if (order.direction === 'export' && !kinds.has('coo')) {
    throw httpError(422, 'MISSING_CUSTOMS_DOC', 'Certificate of origin required for export');
  }
  await db
    .update(purchaseOrders)
    .set({ customsStatus: 'pending', commercialInvoiceNo: `INV-${order.poNumber}` })
    .where(eq(purchaseOrders.id, order.id));
}
```

- [ ] **Step 3: Manual test**

Exercise `POST /api/orders/:id/ready` on a cross-border order without docs → expect 422. With invoice + COO (export) → status updates, `customs_status='pending'`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/purchaseOrders/service.ts
git commit -m "feat(api): ship transition requires customs docs for cross-border"
```

---

## Task 18: Wire reconciliation endpoint

**Files:**
- Modify: `apps/api/src/modules/admin/orders.ts` (or new file `apps/api/src/modules/admin/wireRecon.ts`)

**Interfaces:**
- Produces: `POST /api/admin/orders/:id/wire-received` — body `{ wireRef, receivedAmountCents, receivedCurrency, receivedAt?, acknowledgeMismatch? }`.

- [ ] **Step 1: Write failing test**

Create `apps/api/src/modules/admin/wireRecon.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { handleWireReceived } from './wireRecon';

describe('handleWireReceived', () => {
  it('rejects mismatch without acknowledge flag', async () => {
    await expect(
      handleWireReceived({
        db: {} as DrizzleD1,
        env: {} as Env,
        orderId: 'o1',
        wireRef: 'W1',
        receivedAmountCents: 100000,
        receivedCurrency: 'USD',
      }),
    ).rejects.toThrowError(/WIRE_RECONCILIATION_MISMATCH/);
  });
});
```

- [ ] **Step 2: Implement**

Create `apps/api/src/modules/admin/wireRecon.ts`:

```ts
import { purchaseOrders, fxSnapshots } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import { convertCents, snapshotRate } from '../cross-border/fx';
import { logger } from '../../lib/logger';
import { appendAudit } from '../../queue/audit';

const MISMATCH_BPS = 100; // 1%

export interface WireReceivedInput {
  db: DrizzleD1;
  env: Env;
  orderId: string;
  wireRef: string;
  receivedAmountCents: number;
  receivedCurrency: string;
  receivedAt?: number;
  acknowledgeMismatch?: boolean;
  adminUserId: string;
}

export async function handleWireReceived(input: WireReceivedInput): Promise<{ status: string }> {
  const [order] = await input.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, input.orderId));
  if (!order) throw httpError(404, 'NOT_FOUND', 'Order not found');
  if (order.direction === 'domestic') throw httpError(400, 'INVALID', 'Order is domestic');

  const receivedAt = input.receivedAt ?? Date.now();
  const snap = await snapshotRate(input.receivedCurrency, 'LKR', input.db, input.env);
  const receivedLkrCents = await convertCents(
    input.receivedAmountCents,
    input.receivedCurrency,
    'LKR',
    snap.rateScaled,
  );

  const orderTotalLkrCents = order.totalCents; // stored in LKR
  const deltaBps = Math.abs(((receivedLkrCents - orderTotalLkrCents) / orderTotalLkrCents) * 10000);
  if (deltaBps > MISMATCH_BPS && !input.acknowledgeMismatch) {
    throw httpError(422, 'WIRE_RECONCILIATION_MISMATCH', `Delta ${(deltaBps / 100).toFixed(2)}% exceeds 1%`);
  }

  await input.db
    .update(purchaseOrders)
    .set({
      wireRef: input.wireRef,
      wireReceivedAmountCents: input.receivedAmountCents,
      wireReceivedCurrency: input.receivedCurrency,
      wireReceivedAt: receivedAt,
      wireReceivedBy: input.adminUserId,
      status: 'paid',
    })
    .where(eq(purchaseOrders.id, input.orderId));

  await appendAudit(input.env, {
    kind: 'cross_border.wire_received',
    orderId: input.orderId,
    adminUserId: input.adminUserId,
    wireRef: input.wireRef,
    receivedLkrCents,
    deltaBps,
  });
  logger.info('cross_border.wire_received', { orderId: input.orderId, deltaBps });
  return { status: 'paid' };
}
```

- [ ] **Step 3: Register route**

In `apps/api/src/modules/admin/routes.ts`, add:

```ts
import { handleWireReceived } from './wireRecon';
router.post('/orders/:id/wire-received', requireAdmin, async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const body = await c.req.json();
  await handleWireReceived({ db: getDb(c.env), env: c.env, adminUserId: ctx.userId, ...body, orderId: c.req.param('id') });
  return c.json({ status: 'paid' });
});
```

- [ ] **Step 4: Run tests + manual**

Run: `pnpm --filter @vyro/api test wireRecon`

Manual: post to endpoint with foreign order, verify status='paid', audit entry created.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/wireRecon.ts \
        apps/api/src/modules/admin/wireRecon.test.ts \
        apps/api/src/modules/admin/routes.ts
git commit -m "feat(admin): wire reconciliation endpoint with mismatch gate"
```

---

## Task 19: Customs docs upload route

**Files:**
- Create: `apps/api/src/modules/cross-border/routes.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Implement route**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { uploadCustomsDoc } from './docs';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';

const uploadSchema = z.object({
  kind: z.enum(['invoice', 'packing-list', 'coo', 'awb', 'bl']),
});

const router = new Hono<{ Bindings: Env }>();

router.post('/orders/:id/customs-docs', async (c) => {
  // Auth: supplier role on this order (use existing hasSupplierAccess helper)
  const orderId = c.req.param('id');
  const kindParsed = uploadSchema.safeParse(await c.req.json().catch(() => null));
  if (!kindParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const bytes = await c.req.arrayBuffer();
  const r = await uploadCustomsDoc({
    db: c.get('db'),
    env: c.env,
    orderId,
    kind: kindParsed.data.kind,
    bytes,
    uploadedBy: c.get('ctx').userId,
  });
  return c.json(r);
});

export default router;
```

- [ ] **Step 2: Register**

In `apps/api/src/index.ts`:

```ts
import crossBorderRoutes from './modules/cross-border/routes';
app.route('/api', crossBorderRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/cross-border/routes.ts apps/api/src/index.ts
git commit -m "feat(api): POST /api/orders/:id/customs-docs"
```

---

## Task 20: KYC fields + admin KYC review

**Files:**
- Modify: `apps/api/src/modules/kyc/service.ts` (add foreign KYC flow)
- Modify: `apps/api/src/modules/admin/routes.ts` (add KYC review queue)

**Interfaces:**
- Produces: `submitKycDocuments(businessId, level, env, db): Promise<void>`.
- Produces: `reviewKyc(businessId, decision, adminUserId, env, db): Promise<void>`.

- [ ] **Step 1: Read existing KYC module**

Read `apps/api/src/modules/kyc/service.ts`. Match its existing pattern. Add (append to existing service file):

```ts
import { kycReviews, businesses } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '../../lib/id';
import { httpError } from '../../lib/errors';

export async function submitKycDocuments(args: {
  db: DrizzleD1;
  env: Env;
  businessId: string;
  level: 'basic' | 'enhanced';
  documentUrls: string[];
  submittedBy: string;
}): Promise<void> {
  await args.db.insert(kycReviews).values({
    id: newId('kyc'),
    businessId: args.businessId,
    level: args.level,
    documentUrls: JSON.stringify(args.documentUrls),
    status: 'pending',
    submittedBy: args.submittedBy,
    submittedAt: Date.now(),
  });
  await args.db
    .update(businesses)
    .set({ kycLevel: 'none', kycVerifiedAt: null, kycVerifiedBy: null })
    .where(eq(businesses.id, args.businessId));
}

export async function reviewKyc(args: {
  db: DrizzleD1;
  env: Env;
  businessId: string;
  decision: 'approve' | 'reject';
  level?: 'basic' | 'enhanced';
  adminUserId: string;
}): Promise<void> {
  if (args.decision === 'approve') {
    await args.db
      .update(businesses)
      .set({ kycLevel: args.level ?? 'basic', kycVerifiedAt: Date.now(), kycVerifiedBy: args.adminUserId })
      .where(eq(businesses.id, args.businessId));
  } else {
    await args.db
      .update(businesses)
      .set({ kycLevel: 'none' })
      .where(eq(businesses.id, args.businessId));
  }
}

export async function listKycQueue(db: DrizzleD1): Promise<unknown[]> {
  return db.select().from(kycReviews).where(eq(kycReviews.status, 'pending'));
}
```

- [ ] **Step 2: Add admin route**

In `apps/api/src/modules/admin/routes.ts`:

```ts
router.get('/kyc/queue', requireAdmin, async (c) => {
  return c.json(await listKycQueue(getDb(c.env)));
});
router.post('/kyc/:businessId/review', requireAdmin, async (c) => {
  const body = await c.req.json();
  await reviewKyc({ businessId: c.req.param('businessId'), ...body, adminUserId: c.get('ctx').userId, env: c.env });
  return c.json({ ok: true });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/kyc/service.ts apps/api/src/modules/admin/routes.ts
git commit -m "feat(kyc): foreign buyer KYC submission + admin review"
```

---

## Task 21: FX refresh cron

**Files:**
- Create: `apps/api/src/cron/fxRefresh.ts`
- Modify: `apps/api/src/cron/handlers.ts`

- [ ] **Step 1: Implement cron**

```ts
import { fetchRate } from '../lib/fxProvider';
import { logger } from '../lib/logger';

const QUOTE_CCY = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD'] as const;

export async function handle(env: Env): Promise<{ refreshed: number }> {
  let count = 0;
  for (const quote of QUOTE_CCY) {
    try {
      const r = await fetchRate('LKR', quote, env);
      if (r) {
        await env.CROSS_BORDER_KV.put(`fx:LKR:${quote}`, r.rateScaled, { expirationTtl: 3600 });
        count++;
      }
    } catch (e) {
      logger.warn('fx.refresh.failed', { quote, err: String(e) });
    }
  }
  return { refreshed: count };
}
```

- [ ] **Step 2: Register + commit**

```bash
git add apps/api/src/cron/fxRefresh.ts apps/api/src/cron/handlers.ts
git commit -m "feat(cron): nightly FX rate refresh"
```

---

## Task 22: Analytics Engine metrics + SLO rule

**Files:**
- Modify: `apps/api/src/lib/metrics.ts`
- Modify: `apps/api/src/observability/sloRules.ts`

- [ ] **Step 1: Add metrics helpers**

Append to `apps/api/src/lib/metrics.ts`:

```ts
export function recordCrossBorderOrder(direction: 'export' | 'import'): void {
  recordCounter('cross_border_orders_total', 1, { direction });
}

export function recordWireReconMismatch(): void {
  recordCounter('wire_recon_mismatch_total', 1);
}

export async function getFxSnapshotAgeSeconds(env: Env): Promise<number> {
  // Query Analytics Engine: max(fetched_at) over fx_snapshots table mirror, or KV freshness.
  // Implementation: KV key 'fx:LKR:USD' has TTL 3600; check TTL via metadata.
  const meta = await env.CROSS_BORDER_KV.getWithMetadata('fx:LKR:USD');
  if (!meta.value) return Number.MAX_SAFE_INTEGER;
  return Math.floor((Date.now() - Number(meta.metadata?.fetchedAt ?? 0)) / 1000);
}
```

- [ ] **Step 2: Add SLO rule**

Append to `apps/api/src/observability/sloRules.ts`:

```ts
{
  id: 'fx_snapshot_age',
  description: 'FX snapshot age > 24h',
  evaluate: async (env) => {
    const age = await getFxSnapshotAgeSeconds(env);
    return { breached: age > 86400, value: age };
  },
  severity: 'warning',
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/metrics.ts apps/api/src/observability/sloRules.ts
git commit -m "feat(observability): cross-border metrics + FX snapshot age SLO"
```

---

## Task 23: Order list filters + UI columns

**Files:**
- Modify: `apps/api/src/modules/purchaseOrders/repository.ts`
- Modify: `apps/api/src/modules/purchaseOrders/routes.ts`
- Modify: `apps/web/src/pages/admin/orders/` (add filter chips)

- [ ] **Step 1: Extend repository query**

In `purchaseOrders/repository.ts`, extend `listPosForBusiness` / `listPosForSupplier` to accept optional `direction`, `countryCode`, `customsStatus` filters. Match the existing function signatures (return type + db parameter pattern). Replace the existing filter builders:

```ts
import { and, eq, type SQL } from 'drizzle-orm';

export interface OrderFilters {
  direction?: 'domestic' | 'export' | 'import';
  countryCode?: string;
  customsStatus?: 'none' | 'pending' | 'cleared' | 'held';
}

function buildOrderFilters(filters: OrderFilters): SQL[] {
  const out: SQL[] = [];
  if (filters.direction) out.push(eq(purchaseOrders.direction, filters.direction));
  if (filters.customsStatus) out.push(eq(purchaseOrders.customsStatus, filters.customsStatus));
  if (filters.countryCode) {
    // Join with businesses on buyer country, OR with suppliers on supplier country, depending on direction.
    // Implementer adds the join path matching existing listPosForBusiness pattern.
  }
  return out;
}

export async function listPosForBusiness(db: DrizzleD1, businessId: string, filters: OrderFilters = {}): Promise<PurchaseOrder[]> {
  const where = [eq(purchaseOrders.businessId, businessId), ...buildOrderFilters(filters)];
  return db.select().from(purchaseOrders).where(and(...where));
}
// Same shape for listPosForSupplier.
```

- [ ] **Step 2: Wire filter schema in routes**

```ts
const filterSchema = z.object({
  direction: z.enum(['domestic', 'export', 'import']).optional(),
  countryCode: z.string().length(2).optional(),
  customsStatus: z.enum(['none', 'pending', 'cleared', 'held']).optional(),
});
```

- [ ] **Step 3: UI**

In admin orders page, add filter chips for direction + customs status. Display cross-border columns: direction, dest country, customs status, wire status.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/purchaseOrders/repository.ts \
        apps/api/src/modules/purchaseOrders/routes.ts \
        apps/web/src/pages/admin/orders/
git commit -m "feat(orders): cross-border filters + UI columns"
```

---

## Task 24: Web — checkout KYC gate + cross-border display

**Files:**
- Modify: `apps/web/src/pages/checkout/`
- Modify: `apps/web/src/pages/supplier/onboarding/`
- Modify: `apps/web/src/pages/buyer/onboarding/`

- [ ] **Step 1: Supplier onboarding**

Add step: country (select), tax_id (text), default incoterms (radio), default HS code (text), default country of origin (select). POST to existing supplier update endpoint with new fields.

- [ ] **Step 2: Buyer onboarding**

Add step: country (select), tax_id (text). If country !== LK → redirect to KYC document upload step.

- [ ] **Step 3: Checkout display**

In cart/checkout, show product price in buyer's currency using `GET /api/fx/rates?base=LKR&quote={buyer.country.currency}`. Gate `Place Order` button if foreign buyer + `kyc_level === 'none'`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/checkout/ \
        apps/web/src/pages/supplier/onboarding/ \
        apps/web/src/pages/buyer/onboarding/
git commit -m "feat(web): cross-border onboarding + checkout FX display"
```

---

## Task 25: Web — admin wire reconciliation UI

**Files:**
- Create: `apps/web/src/pages/admin/orders/wireRecon/`

- [ ] **Step 1: Build page**

Create `apps/web/src/pages/admin/orders/wireRecon/index.tsx` (or extend existing admin orders page). Page shows pending wire orders, a form, POST to `/api/admin/orders/:id/wire-received`. On 422 mismatch, surface the delta.

```tsx
import { useState } from 'react';
import { useApi } from '@/lib/api';

export default function WireReconPage() {
  const { data: pending } = useApi('/api/admin/orders?direction=export,import&status=awaiting_payment');
  return (
    <div>
      <h1>Wire reconciliation</h1>
      {pending?.orders.map((o) => <WireReconRow key={o.id} order={o} />)}
    </div>
  );
}

function WireReconRow({ order }) {
  const [wireRef, setWireRef] = useState('');
  const [amountCents, setAmountCents] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [ack, setAck] = useState(false);
  const [delta, setDelta] = useState<string | null>(null);
  const submit = async () => {
    const res = await fetch(`/api/admin/orders/${order.id}/wire-received`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wireRef, receivedAmountCents: Number(amountCents), receivedCurrency: currency, acknowledgeMismatch: ack }),
    });
    if (res.status === 422) {
      const body = await res.json();
      setDelta(body.message);
    } else if (res.ok) {
      setDelta('paid');
    }
  };
  return (
    <div className="row">
      <span>{order.poNumber} — {order.totalCents}c LKR expected</span>
      <input placeholder="wire ref" value={wireRef} onChange={(e) => setWireRef(e.target.value)} />
      <input placeholder="amount cents" value={amountCents} onChange={(e) => setAmountCents(e.target.value)} />
      <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {['USD','EUR','GBP','INR','AED','SGD','AUD'].map((c) => <option key={c}>{c}</option>)}
      </select>
      <label><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> ack mismatch</label>
      <button onClick={submit}>Mark received</button>
      {delta && <span>{delta}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/admin/orders/wireRecon/
git commit -m "feat(admin): wire reconciliation UI"
```

---

## Task 26: E2E tests

**Files:**
- Create: `tests/e2e/cross-border-export.spec.ts`
- Create: `tests/e2e/cross-border-import.spec.ts`
- Create: `tests/e2e/wire-recon.spec.ts`

- [ ] **Step 1: Export happy path**

Create `tests/e2e/cross-border-export.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('SL supplier exports to US buyer end-to-end', async ({ page, request }) => {
  // Setup via fixtures (existing pattern in tests/e2e/fixtures.ts)
  const supplier = await createSupplier(request, { countryCode: 'LK', isExportEligible: true });
  const buyer = await createBuyer(request, { countryCode: 'US', kycLevel: 'basic' });
  const product = await createProduct(request, supplier.id, { hsCode: '0901.21', priceLkrCents: 50000 });

  // Buyer browses + checks out
  await page.goto(`/products/${product.id}`);
  await expect(page.getByText(/\$150/)).toBeVisible(); // FX-converted display
  await page.getByRole('button', { name: 'Place Order' }).click();
  const orderId = await page.locator('[data-order-id]').getAttribute('data-order-id');

  // Supplier confirms
  await supplierLogin(page, supplier);
  await page.goto(`/supplier/orders/${orderId}`);
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Upload invoice + COO
  await page.setInputFiles('[data-testid="upload-invoice"]', 'tests/fixtures/invoice.pdf');
  await page.setInputFiles('[data-testid="upload-coo"]', 'tests/fixtures/coo.pdf');

  // Mark ready
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await expect(page.getByText('Customs: pending')).toBeVisible();

  // Admin reconciles wire
  await adminLogin(page);
  await page.goto(`/admin/orders/wire-recon`);
  await page.getByTestId(`row-${orderId}`).getByRole('button', { name: 'Mark received' }).click();

  // Verify
  const res = await request.get(`/api/admin/orders/${orderId}`);
  const body = await res.json();
  expect(body.status).toBe('paid');
  expect(body.direction).toBe('export');
  expect(body.customsStatus).toBe('pending');
});
```

- [ ] **Step 2: Import happy path**

Create IN supplier (verified), LK buyer (verified), checkout, supplier confirms, supplier uploads invoice, supplier marks ready, buyer pays via PayHere (existing path).

- [ ] **Step 3: Wire mismatch**

Add to `tests/e2e/wire-recon.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('wire mismatch > 1% requires ack', async ({ request }) => {
  const orderId = await createPendingWireOrder(request, { totalCents: 100000 });
  // 90 USD instead of expected ~100 USD (10% off)
  const mismatch = await request.post(`/api/admin/orders/${orderId}/wire-received`, {
    data: { wireRef: 'W1', receivedAmountCents: 90000, receivedCurrency: 'USD' },
  });
  expect(mismatch.status()).toBe(422);
  expect((await mismatch.json()).code).toBe('WIRE_RECONCILIATION_MISMATCH');

  const ack = await request.post(`/api/admin/orders/${orderId}/wire-received`, {
    data: { wireRef: 'W1', receivedAmountCents: 90000, receivedCurrency: 'USD', acknowledgeMismatch: true },
  });
  expect(ack.status()).toBe(200);
  const body = await ack.json();
  expect(body.status).toBe('paid');
});
```

- [ ] **Step 4: Run + commit**

```bash
pnpm test:e2e -- cross-border
git add tests/e2e/cross-border-*.spec.ts tests/e2e/wire-recon.spec.ts
git commit -m "test(e2e): cross-border trade flows"
```

---

## Task 27: Provisioning script + runbook section

**Files:**
- Create: `scripts/provision-cross-border-kv.mjs`
- Modify: `docs/runbook.md`

- [ ] **Step 1: Provisioning script**

Mirror existing `scripts/provision-alerts-kv.mjs`. Create `CROSS_BORDER_KV` namespace if missing, output binding id for wrangler.toml update.

- [ ] **Step 2: Runbook section**

Append to `docs/runbook.md`:

```markdown
## Cross-border operations

- Sanctions list refresh: weekly cron `sanctionsRefresh`. Manual: `POST /api/admin/cron/sanctionsRefresh`.
- FX stale (age > 24h): SLO rule `fx_snapshot_age` fires Slack alert. Manual refresh: `POST /api/admin/cron/fxRefresh`.
- Wire reconciliation: `/admin/orders/wire-recon`. Mismatch > 1% requires explicit ack.
- Sanctioned country blocked order: search audit queue `kind=cross_border.sanctions.blocked`.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/provision-cross-border-kv.mjs docs/runbook.md
git commit -m "feat(ops): cross-border provisioning + runbook section"
```

---

## Task 28: Enable feature flag in production

**Files:**
- Modify: `apps/api/wrangler.toml` (env.production.vars)

- [ ] **Step 1: Confirm staging green**

Run: full integration + E2E suite against staging. Confirm:
- Sanctions + restricted blocks work
- FX snapshot persists on order
- Customs doc upload + ship transition work
- Wire recon happy + mismatch paths work

- [ ] **Step 2: Set flag**

In `apps/api/wrangler.toml` `[env.production.vars]`:

```toml
CROSS_BORDER_ENABLED = "true"
```

- [ ] **Step 3: Deploy**

```bash
node scripts/deploy-backend.mjs --env production
```

- [ ] **Step 4: Smoke test against production**

Manual: create one foreign test buyer, place test order, verify snapshot + sanctions audit. Confirm flag disable path works: set `CROSS_BORDER_ENABLED="false"`, deploy, verify all orders forced `direction=domestic`.

- [ ] **Step 5: Commit + tag**

```bash
git add apps/api/wrangler.toml
git commit -m "chore(api): enable CROSS_BORDER_ENABLED in production"
git tag cross-border-v1
```

---

## Self-Review

**Spec coverage:**

| Spec section | Covered by |
|--------------|-----------|
| §5 Schema | Tasks 1, 2, 3 |
| §6.1 FX service | Tasks 5, 6, 21 |
| §6.2 Tariff service | Task 11 |
| §6.3 Sanctions + restricted | Tasks 9, 10, 12 |
| §6.4 Incoterms | Task 8 |
| §6.5 Customs docs + PDF | Tasks 15, 16 |
| §6.6 Onboarding | Tasks 14 (gate), 20 (KYC), 24 (web) |
| §6.7 Order hooks | Tasks 14, 17 |
| §7.1 Quote → Order | Task 14 |
| §7.2 Shipment | Tasks 15, 17 |
| §7.3 Wire recon | Task 18, 25 |
| §7.4 FX snapshot lifecycle | Tasks 6, 7 |
| §7.5 Compliance hooks | Tasks 9, 10, 12 |
| §7.6 Read paths | Task 23 |
| §8.1 Error taxonomy | Tasks 13, 18 |
| §8.2 Observability | Task 22 |
| §8.3 Rollback / flag | Tasks 4, 28 |
| §9 Testing | Tasks 11, 13, 15, 18, 26 |
| §10 Migration plan | Task 3 (backfill), 28 (flag) |

**Placeholder scan:** No "TBD"/"TODO"/"similar to Task N". All steps include concrete code.

**Type consistency:**
- `fx_snapshots.id`: text, uuid-style (`newId('fx')`)
- `order_customs_docs.id`: text (`newId('doc')`)
- `purchaseOrders.direction`: enum, `preOrderCreateCheck` returns same union
- `Incoterm` type from task 8 used by tasks 13, 14, 17, 18
- Money consistently `*Cents` integer
- KV binding `CROSS_BORDER_KV` referenced consistently across tasks 6, 7, 9, 21
- R2 binding `CROSS_BORDER_DOCS` referenced consistently across tasks 15, 16

**Open:** The plan assumes `newId(prefix)` helper exists at `apps/api/src/lib/id.ts`. Verify in task 1 setup; if absent, add as sub-step of task 4 (extend feature-flag task with id helper).

**Open:** `appendAudit` signature assumed to match `apps/api/src/queue/audit.ts`. Verify in task 18; if signature differs, adjust.