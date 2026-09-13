# Supplier Storefront — Rollout

**Feature:** Public, indexable supplier landing pages at `/suppliers/:slug` with hero, product grid, reviews, and contact CTA.
**Date:** 2026-09-13
**Owner:** Growth

## What ships

- Schema: `suppliers.slug` column + partial unique index.
- Migration: `0034_supplier_storefront.sql` (hand-written, statement-breakpointed). Backfills slugs for verified suppliers from `city + name`.
- Validation: `supplierSlugSchema`, `updateSupplierSlugSchema`.
- API: `apps/api/src/modules/storefront/{repository,service,routes}.ts`. Two routes:
  - `GET /api/suppliers/by-slug/:slug` — public, returns 404 for unknown or unverified.
  - `PATCH /api/suppliers/me/slug` — supplier-authenticated, validates kebab-case + uniqueness.
- Web: `apps/web/src/storefront/{SupplierHero,SupplierProductGrid,StorefrontPage,useStorefrontMeta}.tsx` + `apps/web/src/components/SeoHead.tsx` + `apps/web/src/supplier/StorefrontSettingsSection.tsx`.
- Route: `/suppliers/:slug` (public, lazy-loaded).
- SEO: client-side `<title>` + `og:title/description` via head portal.
- Default contact CTA: `mailto:` link to supplier email (contact email already exposed to authenticated buyers via existing routes).

## Pre-flight

1. Apply migration `0034_supplier_storefront.sql` to D1 (prod + preview). Verified suppliers get auto-generated slugs.
2. Run typecheck + tests:
   - `pnpm --filter @vyro/db typecheck`
   - `pnpm --filter @vyro/validation test -- suppliers` (8 tests)
   - `pnpm --filter @vyro/api typecheck && pnpm --filter @vyro/api test -- storefront` (16 tests)
   - `pnpm --filter @vyro/web typecheck && pnpm --filter @vyro/web test -- storefront` (6 tests)
3. Smoke a known slug via curl: `curl https://api.example.com/api/suppliers/by-slug/colombo-fresh-dairy`.

## Manual smoke checklist

**Public visitor**
- [ ] Visit `/suppliers/{any-backfilled-slug}` — hero shows name + city + verified badge + stars.
- [ ] Product grid shows active offers with images, prices, lead times.
- [ ] Click product → routes to `/products/:productId` (generic PDP).
- [ ] Reviews panel renders (reuses reviews module).
- [ ] View source: `<title>` = `{Supplier Name} — Vyro Wholesale Supplier`. `og:title` and `og:description` set.
- [ ] Visit `/suppliers/does-not-exist` — 404 page.

**Supplier (logged in)**
- [ ] Dashboard → Storefront section shows current slug + URL preview.
- [ ] Edit slug to invalid (uppercase, spaces) → save button disabled.
- [ ] Edit slug to valid kebab → save succeeds, dashboard preview updates.
- [ ] Try to set slug taken by another supplier → 409 error displayed.
- [ ] Open new slug URL in incognito → public page renders.

**Edge**
- [ ] Supplier changes slug from `foo` to `bar`. Old URL `/suppliers/foo` returns 404 (no redirect). Acceptable for v1; documented.
- [ ] Supplier with no published offers → grid shows empty state, hero still renders.

## Feature flag — disable

No flag wired for v1. Rollback via revert if a critical bug is found.

## Rollback

1. Revert commits in reverse order (10 commits total).
2. Drop `slug` column + index only if no production slugs exist:
   ```sql
   DROP INDEX suppliers_slug_unique;
   ALTER TABLE suppliers DROP COLUMN slug;
   ```
3. Frontend route removal happens automatically on revert.

## Outstanding / deferred

- **SSR + JSON-LD** — Workers SPA doesn't SSR initial HTML; crawlers that execute JS will index. Add `@vyro/ssr` variant later.
- **Slug redirect map** — store previous slugs, redirect 301 to new. Add `slug_history` table when needed.
- **Public slug edit form** — currently dashboard-only; if suppliers want self-serve onboarding tweaks, surface in KYC/onboarding.
- **Supplier story / about block** — author-controlled markdown content. Deferred per spec.
- **Storefront-locked PDP variant** — same supplier context for cart-add. Deferred.
- **WhatsApp CTA** — sub-project skipped by product decision.
- **Crawler detection** — no `robots.txt` carve-out; will be added by marketing if needed.
