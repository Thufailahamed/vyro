# Supplier Storefront — Design

**Date:** 2026-09-13
**Owner:** Growth
**Status:** Draft

## Goal

Public, indexable supplier landing pages at `/suppliers/:slug` so buyers can
discover, evaluate, and contact a single supplier outside the marketplace
flow. Boosts SEO surface area and gives suppliers a shareable link for
social/WhatsApp.

## In scope (v1)

- Public route `/suppliers/:slug` — anyone, no auth.
- New column `suppliers.slug` (nullable text, unique when present).
- Backfill migration derives slug from `city + name`, dedupes with numeric suffix.
- API: `GET /api/suppliers/by-slug/:slug` returns `{ supplier, publishedOffers }`.
- Hero block: name, city, verification badge, RatingStars aggregate, Contact CTA.
- Product grid: all offers where `availabilityStatus = 'published'`. Each card
  links to the existing generic PDP `/products/:productId`.
- Reviews panel: reuses `<SupplierReviewsPanel>` built in reviews feature.
- Client-side SEO: `<title>` + `og:title/description/image` via portal head injection.
- Optional supplier onboarding: dashboard exposes slug field; supplier edits or accepts generated value.

## Out of scope (v1)

- Supplier-authored story / about / gallery / hours (deferred).
- Featured/promoted product curation (all published shown).
- Storefront-locked PDP variant.
- JSON-LD Organization/LocalBusiness structured data (deferred).
- WhatsApp CTA (sub-project skipped by product).
- Public supplier edit form for slug (changes routed through dashboard for v1).

## URL strategy

- Slug format: lowercase kebab-case, max 60 chars. Validated: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
- Examples: `colombo-fresh-dairy`, `kandy-spice-co`, `galle-fish-mart-2` (dedupe).
- Backfill: `{city}-{name}`, lowercase, replace non-alphanumerics with `-`,
  collapse repeats, trim to 60 chars, append `-{n}` if collision.
- Slug null is OK; storefront returns 404 for null slug (supplier chose not to publish).

## Data model

Migration `0034_supplier_storefront.sql`:

```sql
ALTER TABLE suppliers ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX suppliers_slug_unique ON suppliers(slug)
  WHERE slug IS NOT NULL;

-- Backfill (pseudo-code; real migration uses UPDATE ... WHERE id = ...)
UPDATE suppliers
SET slug = LOWER(REPLACE(REPLACE(REPLACE(city || '-' || name, ' ', '-'), '.', ''), ',', ''))
WHERE slug IS NULL AND status = 'verified';
```

Final slug uniqueness enforced by unique partial index; UI surfaces collisions
via dashboard validation.

## API

`GET /api/suppliers/by-slug/:slug`

Response 200:
```json
{
  "supplier": {
    "id": "...",
    "name": "...",
    "city": "...",
    "district": "...",
    "verificationStatus": "verified",
    "businessTypeName": "...",
    "ratingCount": 12,
    "ratingAvg": 4.6,
    "slug": "..."
  },
  "offers": [
    {
      "id": "...",
      "productId": "...",
      "productName": "...",
      "productImage": "...",
      "unit": "kg",
      "packSize": "25kg",
      "priceCents": 450000,
      "leadTimeDays": 2
    }
  ]
}
```

Response 404 when slug unknown or supplier not verified.
Response 200 with empty offers array when verified but no published offers.

## Web components

- `apps/web/src/storefront/SupplierHero.tsx` — name, city, district, VerificationBadge, RatingStars, contact CTA (mailto link using supplier email from settings).
- `apps/web/src/storefront/SupplierProductGrid.tsx` — responsive grid using existing offer card styling; link to `/products/:productId`.
- `apps/web/src/storefront/StorefrontPage.tsx` — composes hero + grid + reviews; loads via useQuery to `/api/suppliers/by-slug/:slug`; renders head meta tags.
- `apps/web/src/storefront/useStorefrontMeta.ts` — sets document.title + meta tags via head portal.

## Routing

Add lazy route in `apps/web/src/App.tsx`:
```ts
const StorefrontPage = lazy(() => import('./storefront/StorefrontPage').then((m) => ({ default: m.StorefrontPage })));
// public, no guard:
<Route path="/suppliers/:slug" element={<StorefrontPage />} />
```

## Onboarding

In `SupplierDashboardPage`, add a section "Storefront" with:
- Display current slug (read-only preview link).
- Edit button → modal with input + validation (kebab, ≤60, unique via API check).
- `PATCH /api/suppliers/me/slug` saves; re-renders preview.

Slug validation runs on the server via shared validator.

## SEO

Client-side only for v1. `usePageTitle` sets document.title to
`{supplier.name} — Vyro Wholesale Supplier`. Meta tags via portal:
- `og:title`, `og:description` (city + product count), `og:image` (placeholder brand asset for v1).
- Generic keywords meta tag.

Caveat: Workers SPA sends initial HTML without these tags; crawlers that
execute JS will pick them up. Good enough for v1; SSR variant deferred.

## Tests

- `packages/validation`: `supplierSlugSchema` (kebab + length + uniqueness-shape).
- `apps/api/test/storefront/repository.test.ts`: shape tests for `findBySlug`.
- `apps/api/test/storefront/service.test.ts`: slug generator + dedupe cases.
- `apps/api/test/storefront/e2e.test.ts`: API surface smoke.
- `apps/web/test/storefront/StorefrontPage.test.tsx`: renders hero text from props.

## Rollout

`docs/superpowers/rollouts/2026-09-13-supplier-storefront.md` covers migration,
pre-flight, manual smoke (load `/suppliers/colombo-fresh-dairy`, check hero,
products, reviews, contact CTA), rollback (drop column + index), and deferred
work.

## Risks

- Slug churn: changing slug breaks share links. Mitigated by dashboard
  showing warning before save.
- Public exposure of supplier data: limit to verified suppliers only.
- Crawler indexing of pre-launch slug changes: 404 returns proper status code.
