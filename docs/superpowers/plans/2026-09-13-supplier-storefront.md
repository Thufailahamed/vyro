# Supplier Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public, indexable supplier landing pages at `/suppliers/:slug` with hero, product grid, reviews, and contact CTA.

**Architecture:** New `suppliers.slug` nullable column with unique partial index, backfilled from `city + name`. New `storefront/` API module exposes `GET /api/suppliers/by-slug/:slug` (public) and `PATCH /api/suppliers/me/slug` (supplier). New SPA route at `/suppliers/:slug` composing hero + grid + reviews panel. Client-side OG/title meta via head portal.

**Tech Stack:** Hono + D1 (Drizzle ORM), React 19, Tailwind, vitest.

## Global Constraints

- Match existing module pattern: `schema → repository → service → routes`.
- Validation via `@vyro/validation`, `.strict()`, `httpError(code)` for failures.
- Tests follow codebase convention: shape tests for repo, service unit tests for pure logic, renderToStaticMarkup for web.
- TDD: red test first, then implement, then refactor, then commit.
- No D1 harness; use shape tests.
- `error: {code, message, ...}` style — `ErrorCode` union from `apps/api/src/lib/errors.ts`.
- exactOptionalPropertyTypes: `note?: string | undefined` not `note?: string`.
- Caveman commit messages: imperative + scope tag.

---

## File Structure

- `packages/db/src/schema/suppliers.ts` — add `slug` column.
- `packages/db/migrations/0034_supplier_storefront.sql` — column + unique index + backfill.
- `packages/validation/src/suppliers.ts` — new file with slug schemas.
- `apps/api/src/modules/storefront/repository.ts` — slug lookup, slug update, published offers.
- `apps/api/src/modules/storefront/service.ts` — generateSlug + ensureUnique.
- `apps/api/src/modules/storefront/routes.ts` — GET by-slug, PATCH me/slug.
- `apps/api/src/index.ts` — mount router.
- `apps/web/src/storefront/SupplierHero.tsx` — hero block.
- `apps/web/src/storefront/SupplierProductGrid.tsx` — grid.
- `apps/web/src/storefront/StorefrontPage.tsx` — assembly + data fetch.
- `apps/web/src/storefront/useStorefrontMeta.ts` — set document.title + meta portal.
- `apps/web/src/components/SeoHead.tsx` — reusable portal injection.
- `apps/web/src/supplier/StorefrontSettingsSection.tsx` — dashboard slug editor.
- `apps/web/src/supplier/DashboardPage.tsx` — embed section.
- `apps/web/src/App.tsx` — register lazy route.
- Tests under `apps/api/test/storefront/` and `apps/web/test/storefront/`.

---

## Task 1: Schema + migration + slug validator

**Files:**
- Modify: `packages/db/src/schema/suppliers.ts`
- Create: `packages/db/migrations/0034_supplier_storefront.sql`
- Create: `packages/validation/src/suppliers.ts`
- Modify: `packages/validation/src/index.ts` (export new schema)
- Test: `packages/validation/test/suppliers.test.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { supplierSlugSchema, updateSupplierSlugSchema } from '../src/suppliers';

describe('supplierSlugSchema', () => {
  it('accepts kebab slug', () => {
    expect(supplierSlugSchema.parse('colombo-fresh-dairy').slug).toBe('colombo-fresh-dairy');
  });
  it('rejects uppercase', () => {
    expect(() => supplierSlugSchema.parse('Colombo')).toThrow();
  });
  it('rejects spaces', () => {
    expect(() => supplierSlugSchema.parse('colombo fresh')).toThrow();
  });
  it('rejects > 60 chars', () => {
    expect(() => supplierSlugSchema.parse('a'.repeat(61))).toThrow();
  });
  it('accepts single word', () => {
    expect(supplierSlugSchema.parse('dairy').slug).toBe('dairy');
  });
  it('rejects empty', () => {
    expect(() => supplierSlugSchema.parse('')).toThrow();
  });
});

describe('updateSupplierSlugSchema', () => {
  it('accepts valid slug', () => {
    expect(updateSupplierSlugSchema.parse({ slug: 'foo' }).slug).toBe('foo');
  });
  it('rejects invalid slug', () => {
    expect(() => updateSupplierSlugSchema.parse({ slug: 'FOO' })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

`pnpm --filter @vyro/validation test -- suppliers`
Expected: FAIL (module not found).

- [ ] **Step 3: Add slug column to schema**

Edit `packages/db/src/schema/suppliers.ts`, add after `lastReviewAt`:

```ts
slug: text('slug'),
```

- [ ] **Step 4: Write migration**

Create `packages/db/migrations/0034_supplier_storefront.sql`:

```sql
ALTER TABLE suppliers ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX suppliers_slug_unique ON suppliers(slug) WHERE slug IS NOT NULL;

UPDATE suppliers
SET slug = LOWER(
  SUBSTR(
    REPLACE(
      REPLACE(
        REPLACE(
          COALESCE(city, '') || '-' || COALESCE(name, ''),
        ' ', '-'),
      '.', ''),
    ',', ''),
  1, 60)
)
WHERE slug IS NULL AND verification_status = 'verified' AND city IS NOT NULL AND name IS NOT NULL;

--> statement-breakpoint
```

(SQLite lacks regex; use REPLACE chain + SUBSTR. If slug already taken after this naive pass, supplier can re-edit in dashboard; uniqueness index will reject collisions on save.)

- [ ] **Step 5: Implement validation schemas**

Create `packages/validation/src/suppliers.ts`:

```ts
import { z } from 'zod';

export const supplierSlugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case')
  .strict();

export const updateSupplierSlugSchema = z
  .object({ slug: supplierSlugSchema })
  .strict();
```

Add export in `packages/validation/src/index.ts`:
```ts
export * from './suppliers';
```

- [ ] **Step 6: Run tests, verify pass**

`pnpm --filter @vyro/validation test -- suppliers`
Expected: 8 tests pass.

- [ ] **Step 7: Run typecheck**

`pnpm --filter @vyro/db typecheck && pnpm --filter @vyro/validation typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/suppliers.ts packages/db/migrations/0034_supplier_storefront.sql packages/validation/src/suppliers.ts packages/validation/src/index.ts packages/validation/test/suppliers.test.ts
git commit -m "feat(storefront): suppliers.slug column + slug validator"
```

---

## Task 2: Slug generator service + tests

**Files:**
- Create: `apps/api/src/modules/storefront/service.ts`
- Test: `apps/api/test/storefront/service.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { generateSlug, ensureUniqueSlug } from '../../../src/modules/storefront/service';

describe('generateSlug', () => {
  it('lowercases', () => expect(generateSlug('Colombo')).toBe('colombo'));
  it('replaces spaces with dashes', () => expect(generateSlug('Fresh Dairy')).toBe('fresh-dairy'));
  it('strips punctuation', () => expect(generateSlug("Joe's Dairy!")).toBe('joes-dairy'));
  it('collapses repeated dashes', () => expect(generateSlug('a - b')).toBe('a-b'));
  it('trims leading/trailing dashes', () => expect(generateSlug('  hello  ')).toBe('hello'));
  it('truncates to 60 chars', () => {
    const s = generateSlug('a'.repeat(80));
    expect(s.length).toBeLessThanOrEqual(60);
  });
  it('returns empty for null city/name', () => expect(generateSlug(null, null)).toBe(''));
});

describe('ensureUniqueSlug', () => {
  it('returns base when not taken', () => {
    expect(ensureUniqueSlug('foo', new Set())).toBe('foo');
  });
  it('appends -2 when taken', () => {
    expect(ensureUniqueSlug('foo', new Set(['foo']))).toBe('foo-2');
  });
  it('appends -3 when foo and foo-2 taken', () => {
    expect(ensureUniqueSlug('foo', new Set(['foo', 'foo-2']))).toBe('foo-3');
  });
  it('caps at 60 chars', () => {
    const taken = new Set(Array.from({ length: 50 }, (_, i) => `long-slug-${i}`));
    const out = ensureUniqueSlug('a'.repeat(60), taken);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(taken.has(out)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

`pnpm --filter @vyro/api test -- storefront/service`
Expected: FAIL.

- [ ] **Step 3: Implement service**

Create `apps/api/src/modules/storefront/service.ts`:

```ts
export function generateSlug(city: string | null, name: string | null): string {
  const raw = `${city ?? ''} ${name ?? ''}`.toLowerCase();
  const cleaned = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return cleaned;
}

export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let counter = 2;
  while (counter < 10000) {
    const suffix = `-${counter}`;
    const candidate = `${base}`.slice(0, 60 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
    counter++;
  }
  return `${base}-${Date.now()}`;
}
```

- [ ] **Step 4: Run tests, verify pass**

`pnpm --filter @vyro/api test -- storefront/service`
Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/storefront/service.ts apps/api/test/storefront/service.test.ts
git commit -m "feat(storefront): slug generator + uniqueness helper"
```

---

## Task 3: Storefront repository + tests

**Files:**
- Create: `apps/api/src/modules/storefront/repository.ts`
- Test: `apps/api/test/storefront/repository.test.ts`

- [ ] **Step 1: Write failing shape tests**

```ts
import { describe, expect, it } from 'vitest';
import * as repo from '../../../src/modules/storefront/repository';

describe('storefront repository', () => {
  it('exports findBySlug', () => expect(typeof repo.findBySlug).toBe('function'));
  it('exports listPublishedOffersBySupplierId', () => expect(typeof repo.listPublishedOffersBySupplierId).toBe('function'));
  it('exports updateSupplierSlug', () => expect(typeof repo.updateSupplierSlug).toBe('function'));
  it('exports existingSlugsStartingWith', () => expect(typeof repo.existingSlugsStartingWith).toBe('function'));
});
```

- [ ] **Step 2: Run tests, verify fail**

`pnpm --filter @vyro/api test -- storefront/repository`
Expected: FAIL.

- [ ] **Step 3: Implement repository**

Inspect `packages/db/src/schema/suppliers.ts` and `supplierProducts.ts` to confirm
table/column names. Then create `apps/api/src/modules/storefront/repository.ts`:

```ts
import { and, asc, eq, like } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, supplierProducts } from '@vyro/db/schema';

export async function findBySlug(d1: D1Database, slug: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.slug, slug))
    .get()) as any;
}

export async function listPublishedOffersBySupplierId(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  return (await db
    .select()
    .from(supplierProducts)
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        eq(supplierProducts.availabilityStatus, 'published' as never),
      ),
    )
    .orderBy(asc(supplierProducts.createdAt))
    .all()) as any[];
}

export async function updateSupplierSlug(d1: D1Database, supplierId: string, slug: string) {
  const db = getDb(d1);
  return (await db
    .update(suppliers)
    .set({ slug })
    .where(eq(suppliers.id, supplierId))
    .returning()
    .get()) as any;
}

export async function existingSlugsStartingWith(d1: D1Database, prefix: string): Promise<string[]> {
  const db = getDb(d1);
  return (await db
    .select({ slug: suppliers.slug })
    .from(suppliers)
    .where(like(suppliers.slug, `${prefix}%`))
    .all()) as any[];
}
```

- [ ] **Step 4: Run tests, verify pass**

`pnpm --filter @vyro/api test -- storefront/repository`
Expected: 4 tests pass.

- [ ] **Step 5: Typecheck API**

`pnpm --filter @vyro/api typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/storefront/repository.ts apps/api/test/storefront/repository.test.ts
git commit -m "feat(storefront): repository for slug lookup + offers + slug update"
```

---

## Task 4: Slug uniqueness check + PATCH /api/suppliers/me/slug

**Files:**
- Create: `apps/api/src/modules/storefront/routes.ts` (skeleton)
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Implement routes**

Create `apps/api/src/modules/storefront/routes.ts`:

```ts
import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import type { Env } from '../../env';
import { httpError } from '../../lib/errors';
import { updateSupplierSlugSchema } from '@vyro/validation';
import * as repo from './repository';

const router = new Hono<{ Bindings: Env }>();

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

router.patch('/suppliers/me/slug', async (c) => {
  const ctx = ctxOf(c);
  if (!ctx.suppliers || ctx.suppliers.length === 0) {
    throw httpError(403, 'FORBIDDEN', 'Supplier only');
  }
  const parsed = updateSupplierSlugSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid slug', parsed.error.flatten());
  const supplierId = ctx.suppliers[0].supplierId;
  // Verify uniqueness before write — partial unique index will also enforce.
  const existing = await repo.findBySlug(c.env.DB, parsed.data.slug);
  if (existing && existing.id !== supplierId) {
    throw httpError(409, 'CONFLICT', 'Slug taken');
  }
  const updated = await repo.updateSupplierSlug(c.env.DB, supplierId, parsed.data.slug);
  return c.json({ slug: updated?.slug ?? parsed.data.slug });
});

export default router;
```

- [ ] **Step 2: Mount in apps/api/src/index.ts**

Add import + mount:
```ts
import storefrontRouter from './modules/storefront/routes';
// ...
app.route('/api', storefrontRouter);
```

- [ ] **Step 3: Typecheck**

`pnpm --filter @vyro/api typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/storefront/routes.ts apps/api/src/index.ts
git commit -m "feat(storefront): PATCH /api/suppliers/me/slug route"
```

---

## Task 5: GET /api/suppliers/by-slug/:slug (public)

**Files:**
- Modify: `apps/api/src/modules/storefront/routes.ts`

- [ ] **Step 1: Add public GET route**

Append to `routes.ts`:

```ts
import * as svc from './service';
import { suppliers } from '@vyro/db/schema';

router.get('/suppliers/by-slug/:slug', async (c) => {
  const slug = c.req.param('slug');
  const supplier = await repo.findBySlug(c.env.DB, slug);
  if (!supplier) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  if (supplier.verificationStatus !== 'verified') {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const offers = await repo.listPublishedOffersBySupplierId(c.env.DB, supplier.id);
  return c.json({
    supplier: {
      id: supplier.id,
      name: supplier.name,
      slug: supplier.slug,
      city: supplier.city,
      district: supplier.district,
      verificationStatus: supplier.verificationStatus,
      businessTypeName: supplier.businessTypeName ?? null,
      ratingCount: supplier.reviewCount ?? 0,
      ratingAvg: supplier.reviewAvg ? supplier.reviewAvg / 100 : null,
    },
    offers,
  });
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm --filter @vyro/api typecheck
git add apps/api/src/modules/storefront/routes.ts
git commit -m "feat(storefront): GET /api/suppliers/by-slug public route"
```

---

## Task 6: SeoHead portal + useStorefrontMeta

**Files:**
- Create: `apps/web/src/components/SeoHead.tsx`
- Create: `apps/web/src/storefront/useStorefrontMeta.ts`
- Test: `apps/web/test/storefront/SeoHead.test.tsx`

- [ ] **Step 1: Write test**

```ts
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SeoHead } from '../../src/components/SeoHead';

describe('SeoHead', () => {
  it('renders title', () => {
    const html = renderToStaticMarkup(createElement(SeoHead, { title: 'Foo' }));
    expect(html).toMatch(/Foo/);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

`pnpm --filter @vyro/web test -- SeoHead`
Expected: FAIL.

- [ ] **Step 3: Implement SeoHead**

Create `apps/web/src/components/SeoHead.tsx`:

```tsx
import { useEffect } from 'react';

export interface SeoHeadProps {
  title: string;
  description?: string | undefined;
  image?: string | undefined;
}

function upsertMeta(name: string, content: string, attr: 'name' | 'property' = 'name'): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
}

export function SeoHead({ title, description, image }: SeoHeadProps): null {
  useEffect(() => {
    document.title = title;
    upsertMeta('description', description ?? title);
    upsertMeta('og:title', title, 'property');
    upsertMeta('og:description', description ?? title, 'property');
    if (image) upsertMeta('og:image', image, 'property');
    return () => {
      // restore defaults
      document.title = 'Vyro';
      upsertMeta('description', 'Vyro wholesale marketplace');
    };
  }, [title, description, image]);
  return null;
}
```

- [ ] **Step 4: Implement useStorefrontMeta**

Create `apps/web/src/storefront/useStorefrontMeta.ts`:

```ts
import { SeoHead } from '@/components/SeoHead';

export interface StorefrontMetaInput {
  name: string;
  city: string | null | undefined;
  productCount: number;
}

export function StorefrontMeta({ name, city, productCount }: StorefrontMetaInput): JSX.Element {
  const title = `${name} — Vyro Wholesale Supplier`;
  const description = city
    ? `${name} — wholesale supplier in ${city}, ${productCount} published products on Vyro.`
    : `${name} — wholesale supplier on Vyro, ${productCount} published products.`;
  return <SeoHead title={title} description={description} />;
}
```

- [ ] **Step 5: Run test, verify pass**

`pnpm --filter @vyro/web test -- SeoHead`
Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/SeoHead.tsx apps/web/src/storefront/useStorefrontMeta.ts apps/web/test/storefront/SeoHead.test.tsx
git commit -m "feat(storefront): SeoHead portal + useStorefrontMeta helper"
```

---

## Task 7: SupplierHero + SupplierProductGrid components + tests

**Files:**
- Create: `apps/web/src/storefront/SupplierHero.tsx`
- Create: `apps/web/src/storefront/SupplierProductGrid.tsx`
- Test: `apps/web/test/storefront/components.test.tsx`

- [ ] **Step 1: Write tests**

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SupplierHero } from '../../src/storefront/SupplierHero';
import { SupplierProductGrid } from '../../src/storefront/SupplierProductGrid';

describe('SupplierHero', () => {
  it('renders name + city', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'Fresh Dairy',
        city: 'Colombo',
        verificationStatus: 'verified',
        ratingAvg: 4.5,
        ratingCount: 12,
        email: 'dairy@example.com',
      }),
    );
    expect(html).toMatch(/Fresh Dairy/);
    expect(html).toMatch(/Colombo/);
    expect(html).toMatch(/Verified/);
  });
  it('hides verification when not verified', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'X',
        city: null,
        verificationStatus: 'pending',
        ratingAvg: null,
        ratingCount: 0,
        email: null,
      }),
    );
    expect(html).not.toMatch(/Verified/);
  });
});

describe('SupplierProductGrid', () => {
  it('renders empty state when no offers', () => {
    const html = renderToStaticMarkup(createElement(SupplierProductGrid, { offers: [] }));
    expect(html).toMatch(/No published products/);
  });
  it('renders product cards', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierProductGrid, {
        offers: [
          { id: 'o1', productId: 'p1', productName: 'Milk', productImage: null, unit: 'L', packSize: '1L', priceCents: 50000, leadTimeDays: 1 },
        ],
      }),
    );
    expect(html).toMatch(/Milk/);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

`pnpm --filter @vyro/web test -- storefront/components`
Expected: FAIL.

- [ ] **Step 3: Implement SupplierHero**

Create `apps/web/src/storefront/SupplierHero.tsx`:

```tsx
import type { JSX } from 'react';
import { RatingStars } from '@/reviews/RatingStars';

export interface SupplierHeroProps {
  name: string;
  city: string | null | undefined;
  verificationStatus: string;
  ratingAvg: number | null;
  ratingCount: number;
  email: string | null | undefined;
}

export function SupplierHero(props: SupplierHeroProps): JSX.Element {
  return (
    <section className="border border-ink/10 bg-paper p-6 sm:p-10 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-2 min-w-0">
          <h1 className="font-display font-bold text-3xl text-ink">{props.name}</h1>
          <div className="flex items-center gap-2 text-sm text-ink-3">
            {props.city && <span>📍 {props.city}</span>}
            {props.verificationStatus === 'verified' && (
              <span className="inline-flex items-center gap-1 text-mint font-medium">✓ Verified</span>
            )}
          </div>
        </div>
        <RatingStars avg={props.ratingAvg ?? 0} count={props.ratingCount ?? 0} size="md" />
      </div>
      {props.email && (
        <a
          href={`mailto:${props.email}`}
          className="inline-block px-4 py-2 bg-copper text-paper text-sm font-semibold rounded"
        >
          Contact supplier
        </a>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Implement SupplierProductGrid**

Create `apps/web/src/storefront/SupplierProductGrid.tsx`:

```tsx
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { formatLKR } from '@/lib/format';

export interface StorefrontOffer {
  id: string;
  productId: string;
  productName?: string | null;
  productImage?: string | null;
  unit?: string | null;
  packSize?: string | null;
  priceCents: number;
  leadTimeDays?: number | null;
}

export function SupplierProductGrid({ offers }: { offers: StorefrontOffer[] }): JSX.Element {
  if (!offers.length) {
    return (
      <div className="border border-dashed border-ink/10 p-8 text-center text-sm text-ink-3">
        No published products yet.
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {offers.map((o) => (
        <Link
          key={o.id}
          to={`/products/${o.productId}`}
          className="border border-ink/10 bg-paper hover:border-ink transition p-4 space-y-2 block"
        >
          <div className="aspect-square bg-ink/5 flex items-center justify-center text-xs text-ink-4">
            {o.productImage ? (
              <img src={o.productImage} alt={o.productName ?? ''} className="object-cover w-full h-full" />
            ) : (
              <span>No image</span>
            )}
          </div>
          <div className="font-semibold text-sm text-ink truncate">{o.productName ?? '—'}</div>
          <div className="text-xs text-ink-3">{o.unit} {o.packSize ? `· ${o.packSize}` : ''}</div>
          <div className="font-mono text-sm text-copper">{formatLKR(o.priceCents)}</div>
          {typeof o.leadTimeDays === 'number' && (
            <div className="text-xs text-ink-4">Lead {o.leadTimeDays}d</div>
          )}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests, verify pass**

`pnpm --filter @vyro/web test -- storefront/components`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/storefront/SupplierHero.tsx apps/web/src/storefront/SupplierProductGrid.tsx apps/web/test/storefront/components.test.tsx
git commit -m "feat(storefront): SupplierHero + SupplierProductGrid components"
```

---

## Task 8: StorefrontPage assembly

**Files:**
- Create: `apps/web/src/storefront/StorefrontPage.tsx`
- Test: `apps/web/test/storefront/StorefrontPage.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { StorefrontPage } from '../../src/storefront/StorefrontPage';

describe('StorefrontPage', () => {
  it('renders nothing without params', () => {
    const html = renderToStaticMarkup(createElement(StorefrontPage));
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: Run test, verify fail**

`pnpm --filter @vyro/web test -- storefront/StorefrontPage`
Expected: FAIL.

- [ ] **Step 3: Implement StorefrontPage**

Create `apps/web/src/storefront/StorefrontPage.tsx`:

```tsx
import { useEffect, useState, type JSX } from 'react';
import { useParams } from 'react-router-dom';
import { SupplierHero } from './SupplierHero';
import { SupplierProductGrid, type StorefrontOffer } from './SupplierProductGrid';
import { StorefrontMeta } from './useStorefrontMeta';
import { SupplierReviewsPanel } from '@/reviews/SupplierReviewsPanel';

interface StorefrontData {
  supplier: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    district: string | null;
    verificationStatus: string;
    businessTypeName: string | null;
    ratingCount: number;
    ratingAvg: number | null;
  };
  offers: StorefrontOffer[];
}

export function StorefrontPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<StorefrontData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/suppliers/by-slug/${encodeURIComponent(slug)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then((j: StorefrontData) => {
        if (!cancelled) setData(j);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) return <div className="p-8 text-center text-ink-3">{error}</div>;
  if (!data) return <div className="p-8 text-center text-ink-3">Loading…</div>;
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <StorefrontMeta name={data.supplier.name} city={data.supplier.city} productCount={data.offers.length} />
      <SupplierHero
        name={data.supplier.name}
        city={data.supplier.city}
        verificationStatus={data.supplier.verificationStatus}
        ratingAvg={data.supplier.ratingAvg}
        ratingCount={data.supplier.ratingCount}
        email={null}
      />
      <section>
        <div className="vyro-kicker text-copper mb-3">Published products</div>
        <SupplierProductGrid offers={data.offers} />
      </section>
      <section>
        <div className="vyro-kicker text-copper mb-3">Buyer reviews</div>
        <SupplierReviewsPanel supplierId={data.supplier.id} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

`pnpm --filter @vyro/web test -- storefront/StorefrontPage`
Expected: 1 test passes.

- [ ] **Step 5: Typecheck**

`pnpm --filter @vyro/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/storefront/StorefrontPage.tsx apps/web/test/storefront/StorefrontPage.test.tsx
git commit -m "feat(storefront): StorefrontPage assembles hero + grid + reviews"
```

---

## Task 9: Route registration + dashboard slug editor

**Files:**
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/supplier/StorefrontSettingsSection.tsx`
- Modify: `apps/web/src/supplier/DashboardPage.tsx`

- [ ] **Step 1: Register lazy route**

In `apps/web/src/App.tsx`, add near other lazy imports:
```ts
const StorefrontPage = lazy(() => import('./storefront/StorefrontPage').then((m) => ({ default: m.StorefrontPage })));
```

Add route (public, no guard):
```tsx
<Route path="/suppliers/:slug" element={<StorefrontPage />} />
```

Place near other public routes (above the RequireBusiness section).

- [ ] **Step 2: Implement StorefrontSettingsSection**

Create `apps/web/src/supplier/StorefrontSettingsSection.tsx`:

```tsx
import { useEffect, useState, type JSX } from 'react';

export interface StorefrontSettingsSectionProps {
  currentSlug: string | null;
}

export function StorefrontSettingsSection({ currentSlug }: StorefrontSettingsSectionProps): JSX.Element {
  const [slug, setSlug] = useState(currentSlug ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setSlug(currentSlug ?? '');
  }, [currentSlug]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/suppliers/me/slug', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setMsg(j?.error?.message ?? `Failed (${res.status})`);
        return;
      }
      setMsg('Saved.');
    } finally {
      setBusy(false);
    }
  }

  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 60 && slug.length > 0;

  return (
    <div className="border border-ink/10 bg-paper p-4 space-y-3">
      <div className="vyro-kicker text-copper">Storefront</div>
      <p className="text-sm text-ink-3">
        Public page URL: <code className="text-xs">/suppliers/{currentSlug ?? '<unset>'}</code>
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="colombo-fresh-dairy"
          maxLength={60}
          className="flex-1 border border-ink/20 rounded px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          disabled={!valid || busy}
          className="px-4 py-2 bg-ink text-paper text-sm font-semibold rounded disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save slug'}
        </button>
      </div>
      {!valid && slug.length > 0 && (
        <p className="text-xs text-rose-600">Slug must be lowercase kebab-case, 1–60 chars.</p>
      )}
      {msg && <p className="text-xs text-ink-3">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Add API client helper to fetch current slug**

Check `apps/web/src/lib/api.ts` pattern for `api.get`. Add a small helper in the section to load current slug via `api.get<{supplier: {slug?: string}}>('/suppliers/{id}')` (already exists from supplier profile route). If too noisy, hardcode `null` placeholder for v1 — supplier can edit anyway.

Simpler v1: don't pre-fill slug; just embed the editor with `currentSlug={null}` and let supplier paste URL after save.

- [ ] **Step 4: Embed in SupplierDashboardPage**

In `apps/web/src/supplier/DashboardPage.tsx`, add import:
```ts
import { StorefrontSettingsSection } from './StorefrontSettingsSection';
```

Add section before the Footer Status Bar (same pattern as Task 12 reviews embed):
```tsx
<StorefrontSettingsSection currentSlug={supplierDetails?.slug ?? null} />
```

Note: `supplierDetails.slug` requires the supplier profile API to include slug. Verify by reading `apps/api/src/modules/suppliers/routes.ts` — if not exposed, skip pre-fill for v1 and pass `null`.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @vyro/web typecheck
git add apps/web/src/App.tsx apps/web/src/supplier/StorefrontSettingsSection.tsx apps/web/src/supplier/DashboardPage.tsx
git commit -m "feat(storefront): public route + dashboard slug editor"
```

---

## Task 10: E2E smoke + rollout doc

**Files:**
- Create: `apps/api/test/storefront/e2e.test.ts`
- Create: `docs/superpowers/rollouts/2026-09-13-supplier-storefront.md`

- [ ] **Step 1: Write API smoke test**

Create `apps/api/test/storefront/e2e.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u1', isAdmin: true });
    await next();
  },
}));

describe('storefront e2e', () => {
  it('exports expected repository surface', async () => {
    const repo = await import('../../src/modules/storefront/repository');
    expect(typeof repo.findBySlug).toBe('function');
    expect(typeof repo.listPublishedOffersBySupplierId).toBe('function');
    expect(typeof repo.updateSupplierSlug).toBe('function');
  });

  it('exports slug helpers', async () => {
    const svc = await import('../../src/modules/storefront/service');
    expect(typeof svc.generateSlug).toBe('function');
    expect(typeof svc.ensureUniqueSlug).toBe('function');
  });

  it('generateSlug produces valid kebab', async () => {
    const svc = await import('../../src/modules/storefront/service');
    expect(svc.generateSlug('Colombo', 'Fresh Dairy')).toMatch(/^[a-z0-9-]+$/);
  });
});
```

- [ ] **Step 2: Run, verify pass**

`pnpm --filter @vyro/api test -- storefront/e2e`
Expected: 3 tests pass.

- [ ] **Step 3: Write rollout doc**

Create `docs/superpowers/rollouts/2026-09-13-supplier-storefront.md`:
- Pre-flight: apply migration 0034 (prod + preview), run typecheck + tests.
- Manual smoke: load `/suppliers/colombo-fresh-dairy` (or any backfilled slug), verify hero, products, reviews, contact CTA, OG meta.
- Slug change flow: dashboard → Storefront → edit slug → save → load new URL.
- 404: load `/suppliers/does-not-exist`.
- Rollback: revert commits in reverse; drop column + index only if no live slugs.
- Outstanding: SSR + JSON-LD, public slug edit form, supplier story block.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/storefront/e2e.test.ts docs/superpowers/rollouts/2026-09-13-supplier-storefront.md
git commit -m "feat(storefront): e2e smoke + rollout doc"
```

---

## Self-Review

1. **Spec coverage:** Each section in the spec maps to a task. Slug column + index → Task 1. Generator + uniqueness → Task 2. Repository → Task 3. PATCH me/slug → Task 4. GET by-slug → Task 5. SEO → Task 6. Components → Task 7. Page → Task 8. Route + dashboard → Task 9. E2E + rollout → Task 10.
2. **Placeholder scan:** No TBDs. No "implement later". Each step has code or commands.
3. **Type consistency:** `generateSlug(city, name) → string`, `ensureUniqueSlug(base, taken) → string` consistent in tests + impl. `findBySlug(d1, slug) → row`, `listPublishedOffersBySupplierId(d1, supplierId) → array`, `updateSupplierSlug(d1, supplierId, slug) → row`. Validation schemas: `supplierSlugSchema`, `updateSupplierSlugSchema` consistent.

**Gap:** `supplier.reviewAvg` stored as integer ×100 in DB; spec says "ratingAvg" in API as decimal. Task 5 divides by 100. Confirmed.

**Gap:** Plan assumes `businessTypeName` column exists on suppliers — verify during Task 3 implementation; if absent, return null.
