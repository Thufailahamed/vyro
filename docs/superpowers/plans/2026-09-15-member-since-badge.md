# Member Since Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show generic `Member since YYYY · N yrs` badge on the storefront hero for every verified supplier, alongside the existing TrustSEAL badge.

**Architecture:** Derive tenure from `suppliers.createdAt` in the `by-slug` route via a pure helper in `storefront/service.ts`; add a neutral `MemberSinceBadge` web component rendered by `SupplierHero`. No migration, additive fields only.

**Tech Stack:** Hono + Drizzle/D1 (API), React 19 + Tailwind + Vitest + react-dom/server `renderToStaticMarkup` (web), TypeScript throughout.

## Global Constraints

- Storefront hero only (`/suppliers/:slug`) — no PDP, no search, no SEO changes in v1.
- Keep existing TrustSEAL fields (`trustSealed`, `trustSealExpiresAt`, `memberSinceYear`) untouched and semantics unchanged.
- Generic badge format is `Member since YYYY · N yrs`, and `Member since YYYY · New` when years == 0.
- Null-safe everywhere: missing/invalid/future `createdAt` → badge hidden, never throws.
- No migration, no backfill (derived from `suppliers.createdAt`).
- Never expose paymentId, amount, or PayHere raw data.
- TDD: failing test first for every task; frequent commits.

---

## File Structure

- `apps/api/src/modules/storefront/service.ts` — add pure `getSupplierTenure(createdAt, now)` + `SupplierTenure` interface. One responsibility: tenure math (UTC year, floor years, ISO date, null-safety).
- `apps/api/src/modules/storefront/routes.ts` — import helper, add `supplierSinceYear`, `supplierSinceDate`, `supplierMemberYears` to `by-slug` supplier payload. No other route changes.
- `apps/web/src/components/MemberSinceBadge.tsx` — new neutral badge (Calendar icon). Props `{ sinceYear, memberYears, sinceDate }`. Renders nothing when `sinceYear == null`.
- `apps/web/src/storefront/SupplierHero.tsx` — extend props with three optional tenure fields, render `MemberSinceBadge` beside `TrustSealBadge`.
- `apps/web/src/storefront/StorefrontPage.tsx` — extend `StorefrontData.supplier` interface, pass through to hero.
- Tests (new files, existing files untouched):
  - `apps/api/test/storefront/memberSince.test.ts`
  - `apps/web/test/memberSinceBadge.test.tsx`
  - `apps/web/test/storefront/memberSinceHero.test.tsx`

---

### Task 1: API tenure derivation

**Files:**
- Modify: `apps/api/src/modules/storefront/service.ts`
- Modify: `apps/api/src/modules/storefront/routes.ts`
- Test: `apps/api/test/storefront/memberSince.test.ts`

**Interfaces:**
- Consumes: `supplier.createdAt` (ms epoch, `number | null`) from `repo.findBySlug` result in `routes.ts`.
- Produces: `getSupplierTenure(createdAt: unknown, now?: number) => SupplierTenure` where `SupplierTenure = { supplierSinceYear: number | null; supplierSinceDate: string | null; supplierMemberYears: number | null }`. `routes.ts` spreads this into the `by-slug` JSON supplier object. Task 3 consumes the JSON shape only.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/storefront/memberSince.test.ts` with this exact content:

```ts
import { describe, expect, it } from 'vitest';
import { getSupplierTenure } from '../../src/modules/storefront/service';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('getSupplierTenure', () => {
  it('derives year, ISO date, and floor years', () => {
    const createdAt = new Date('2021-06-15T00:00:00Z').getTime();
    const now = new Date('2026-09-15T00:00:00Z').getTime();
    const out = getSupplierTenure(createdAt, now);
    expect(out.supplierSinceYear).toBe(2021);
    expect(out.supplierSinceDate).toBe(new Date(createdAt).toISOString());
    expect(out.supplierMemberYears).toBe(Math.floor((now - createdAt) / (365 * DAY_MS)));
  });
  it('returns nulls for null input', () => {
    expect(getSupplierTenure(null, 1000)).toEqual({
      supplierSinceYear: null,
      supplierSinceDate: null,
      supplierMemberYears: null,
    });
  });
  it('returns nulls for future createdAt', () => {
    expect(getSupplierTenure(2000, 1000)).toEqual({
      supplierSinceYear: null,
      supplierSinceDate: null,
      supplierMemberYears: null,
    });
  });
  it('clamps same-day tenure to 0 years (not negative)', () => {
    const now = new Date('2026-09-15T00:00:00Z').getTime();
    const out = getSupplierTenure(now, now);
    expect(out.supplierSinceYear).toBe(2026);
    expect(out.supplierMemberYears).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- memberSince`
Expected: FAIL with `getSupplierTenure is not a function` (or `Failed to resolve import`).

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/modules/storefront/service.ts`, append this exact code (keep existing `generateSlug`/`ensureUniqueSlug` untouched):

```ts
export interface SupplierTenure {
  supplierSinceYear: number | null;
  supplierSinceDate: string | null;
  supplierMemberYears: number | null;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function getSupplierTenure(createdAt: unknown, now: number = Date.now()): SupplierTenure {
  const nulls: SupplierTenure = { supplierSinceYear: null, supplierSinceDate: null, supplierMemberYears: null };
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return nulls;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return nulls;
  if (createdAt > now) return nulls;
  return {
    supplierSinceYear: d.getUTCFullYear(),
    supplierSinceDate: d.toISOString(),
    supplierMemberYears: Math.max(0, Math.floor((now - createdAt) / YEAR_MS)),
  };
}
```

In `apps/api/src/modules/storefront/routes.ts`, make exactly these two edits:

Edit 1 — add import (after line 6 `import * as repo from './repository';`):

```ts
import { getSupplierTenure } from './service';
```

Edit 2 — inside `router.get('/suppliers/by-slug/:slug', ...)` replace the `return c.json({ supplier: { ... } })` supplier object construction. Current block (lines 41-55):

```ts
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
      trustSealed: trust?.trustSealed ?? false,
      trustSealExpiresAt: trust?.trustSealExpiresAt ?? null,
      memberSinceYear: trust?.memberSinceYear ?? null,
    },
    offers,
  });
```

Replace with:

```ts
  const tenure = getSupplierTenure(supplier.createdAt, Date.now());
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
      trustSealed: trust?.trustSealed ?? false,
      trustSealExpiresAt: trust?.trustSealExpiresAt ?? null,
      memberSinceYear: trust?.memberSinceYear ?? null,
      supplierSinceYear: tenure.supplierSinceYear,
      supplierSinceDate: tenure.supplierSinceDate,
      supplierMemberYears: tenure.supplierMemberYears,
    },
    offers,
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/api test -- memberSince`
Expected: PASS (4 tests).

Then regression: `pnpm --filter @vyro/api test -- storefront`
Expected: PASS (existing 16+ tests plus new 4).

Then typecheck: `pnpm --filter @vyro/api typecheck`
Expected: PASS with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/storefront/service.ts apps/api/src/modules/storefront/routes.ts apps/api/test/storefront/memberSince.test.ts
git commit -m "feat(storefront): expose generic supplier tenure in by-slug"
```

---

### Task 2: MemberSinceBadge component

**Files:**
- Create: `apps/web/src/components/MemberSinceBadge.tsx`
- Test: `apps/web/test/memberSinceBadge.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 at code level (decoupled via JSON); uses existing `CalendarIcon` from `@/components/icons`.
- Produces: `MemberSinceBadge({ sinceYear, memberYears, sinceDate }: { sinceYear?: number | null; memberYears?: number | null; sinceDate?: string | null }) => JSX.Element | null`. Task 3 imports this exact name and prop names.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/memberSinceBadge.test.tsx` with this exact content:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemberSinceBadge } from '../src/components/MemberSinceBadge';

describe('MemberSinceBadge', () => {
  it('renders year and tenure', () => {
    const html = renderToStaticMarkup(
      createElement(MemberSinceBadge, { sinceYear: 2021, memberYears: 5, sinceDate: new Date('2021-06-15T00:00:00Z').toISOString() }),
    );
    expect(html).toMatch(/Member since/i);
    expect(html).toMatch(/2021/);
    expect(html).toMatch(/5 yrs/);
  });
  it('renders New when 0 years', () => {
    const html = renderToStaticMarkup(createElement(MemberSinceBadge, { sinceYear: 2026, memberYears: 0 }));
    expect(html).toMatch(/2026/);
    expect(html).toMatch(/New/);
  });
  it('renders nothing when sinceYear is null', () => {
    const html = renderToStaticMarkup(createElement(MemberSinceBadge, { sinceYear: null, memberYears: null }));
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web test -- memberSinceBadge`
Expected: FAIL with `Failed to resolve import ../src/components/MemberSinceBadge` (file does not exist).

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/components/MemberSinceBadge.tsx` with this exact content:

```tsx
import { CalendarIcon } from '@/components/icons';

interface Props {
  sinceYear?: number | null;
  memberYears?: number | null;
  sinceDate?: string | null;
}

export function MemberSinceBadge({ sinceYear, memberYears, sinceDate }: Props) {
  if (sinceYear == null) return null;
  const suffix = memberYears == null ? '' : memberYears <= 0 ? ' · New' : ` · ${memberYears} yrs`;
  const dateLabel = sinceDate ? new Date(sinceDate).toLocaleDateString() : null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold bg-ink/5 text-ink-2 border border-ink/15 rounded-full"
      title={dateLabel ? `Supplier on Vyro since ${dateLabel}` : `Member since ${sinceYear}`}
      aria-label={`Member since ${sinceYear}`}
    >
      <CalendarIcon size={12} />
      MEMBER SINCE {sinceYear}{suffix}
    </span>
  );
}
```

Do not modify `TrustSealBadge.tsx` or `icons.tsx` (`CalendarIcon` already exists at `apps/web/src/components/icons.tsx:439`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/web test -- memberSinceBadge`
Expected: PASS (3 tests).

Then regression: `pnpm --filter @vyro/web test -- trustSealBadge`
Expected: PASS (existing 2 tests still green).

Then typecheck: `pnpm --filter @vyro/web typecheck`
Expected: PASS with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/MemberSinceBadge.tsx apps/web/test/memberSinceBadge.test.tsx
git commit -m "feat(web): add MemberSinceBadge component"
```

---

### Task 3: Wire hero + page

**Files:**
- Modify: `apps/web/src/storefront/SupplierHero.tsx`
- Modify: `apps/web/src/storefront/StorefrontPage.tsx`
- Test: `apps/web/test/storefront/memberSinceHero.test.tsx`

**Interfaces:**
- Consumes: `MemberSinceBadge` from Task 2 (exact import path `@/components/MemberSinceBadge`, exact props `sinceYear`, `memberYears`, `sinceDate`); API JSON fields `supplierSinceYear`, `supplierSinceDate`, `supplierMemberYears` from Task 1 (as `number | null` / `string | null`).
- Produces: storefront hero showing both badges; no new exports (page route unchanged).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/storefront/memberSinceHero.test.tsx` with this exact content:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SupplierHero } from '../../src/storefront/SupplierHero';

describe('SupplierHero member since', () => {
  it('renders generic badge alongside TrustSEAL when both present', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'Fresh Dairy',
        city: 'Colombo',
        verificationStatus: 'verified',
        ratingAvg: 4.5,
        ratingCount: 12,
        email: null,
        trustSealed: true,
        trustSealExpiresAt: Date.now() + 1000,
        memberSinceYear: 2024,
        supplierSinceYear: 2021,
        supplierMemberYears: 5,
        supplierSinceDate: new Date('2021-06-15T00:00:00Z').toISOString(),
      }),
    );
    expect(html).toMatch(/Fresh Dairy/);
    expect(html).toMatch(/TRUSTSEAL/);
    expect(html).toMatch(/MEMBER SINCE 2021/);
    expect(html).toMatch(/5 yrs/);
  });
  it('renders generic badge even without TrustSEAL', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'Free Supplier',
        city: null,
        verificationStatus: 'verified',
        ratingAvg: null,
        ratingCount: 0,
        email: null,
        trustSealed: false,
        supplierSinceYear: 2025,
        supplierMemberYears: 1,
        supplierSinceDate: null,
      }),
    );
    expect(html).toMatch(/MEMBER SINCE 2025/);
    expect(html).not.toMatch(/TRUSTSEAL/);
  });
  it('hides generic badge when tenure is null', () => {
    const html = renderToStaticMarkup(
      createElement(SupplierHero, {
        name: 'No Tenure',
        city: null,
        verificationStatus: 'verified',
        ratingAvg: null,
        ratingCount: 0,
        email: null,
        supplierSinceYear: null,
        supplierMemberYears: null,
        supplierSinceDate: null,
      }),
    );
    expect(html).not.toMatch(/MEMBER SINCE/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web test -- memberSinceHero`
Expected: FAIL — rendered HTML lacks `MEMBER SINCE` (assertion failure on first test); `pnpm --filter @vyro/web typecheck` would additionally flag unknown `supplierSinceYear` prop.

- [ ] **Step 3: Write minimal implementation**

Edit `apps/web/src/storefront/SupplierHero.tsx` — make exactly these edits:

Edit 1 — add import after line 3 (`import { TrustSealBadge } from '@/components/TrustSealBadge';`):

```tsx
import { MemberSinceBadge } from '@/components/MemberSinceBadge';
```

Edit 2 — extend `SupplierHeroProps` interface (after `memberSinceYear` line):

```tsx
  memberSinceYear?: number | null | undefined;
  supplierSinceYear?: number | null | undefined;
  supplierMemberYears?: number | null | undefined;
  supplierSinceDate?: string | null | undefined;
```

Full interface after edit must read:

```tsx
export interface SupplierHeroProps {
  name: string;
  city: string | null | undefined;
  verificationStatus: string;
  ratingAvg: number | null;
  ratingCount: number;
  email: string | null | undefined;
  trustSealed?: boolean | undefined;
  trustSealExpiresAt?: number | null | undefined;
  memberSinceYear?: number | null | undefined;
  supplierSinceYear?: number | null | undefined;
  supplierMemberYears?: number | null | undefined;
  supplierSinceDate?: string | null | undefined;
}
```

Edit 3 — render badge beside TrustSealBadge. Current block:

```tsx
            <TrustSealBadge
              active={!!props.trustSealed}
              memberSinceYear={props.memberSinceYear ?? null}
              expiresAt={props.trustSealExpiresAt ?? null}
            />
```

Replace with:

```tsx
            <TrustSealBadge
              active={!!props.trustSealed}
              memberSinceYear={props.memberSinceYear ?? null}
              expiresAt={props.trustSealExpiresAt ?? null}
            />
            <MemberSinceBadge
              sinceYear={props.supplierSinceYear ?? null}
              memberYears={props.supplierMemberYears ?? null}
              sinceDate={props.supplierSinceDate ?? null}
            />
```

Edit `apps/web/src/storefront/StorefrontPage.tsx` — make exactly these edits:

Edit 1 — extend `StorefrontData.supplier` interface (after `memberSinceYear?: number | null;` line):

```tsx
    trustSealed?: boolean;
    trustSealExpiresAt?: number | null;
    memberSinceYear?: number | null;
    supplierSinceYear?: number | null;
    supplierSinceDate?: string | null;
    supplierMemberYears?: number | null;
```

Edit 2 — pass through to hero. Current block:

```tsx
        trustSealed={data.supplier.trustSealed}
        trustSealExpiresAt={data.supplier.trustSealExpiresAt}
        memberSinceYear={data.supplier.memberSinceYear}
```

Replace with:

```tsx
        trustSealed={data.supplier.trustSealed}
        trustSealExpiresAt={data.supplier.trustSealExpiresAt}
        memberSinceYear={data.supplier.memberSinceYear}
        supplierSinceYear={data.supplier.supplierSinceYear}
        supplierMemberYears={data.supplier.supplierMemberYears}
        supplierSinceDate={data.supplier.supplierSinceDate}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/web test -- memberSinceHero`
Expected: PASS (3 tests).

Then regression: `pnpm --filter @vyro/web test -- storefront`
Expected: PASS (existing `StorefrontPage`, `components`, `SeoHead` tests plus new hero tests).

Then regression: `pnpm --filter @vyro/web test -- memberSinceBadge`
Expected: PASS.

Then typecheck: `pnpm --filter @vyro/web typecheck`
Expected: PASS with no errors.

Manual QA (no code): visit `/suppliers/:slug` for a free verified supplier (generic badge only) and a TrustSEAL supplier (both badges).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/storefront/SupplierHero.tsx apps/web/src/storefront/StorefrontPage.tsx apps/web/test/storefront/memberSinceHero.test.tsx
git commit -m "feat(storefront): show Member since badge on hero"
```
