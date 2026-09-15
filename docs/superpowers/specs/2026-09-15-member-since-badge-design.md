# Member Since Badge on Storefront — Design

Date: 2026-09-15
Status: Approved (brainstorming §§1–4)
Source gap: `2026-09-15-competitor-audit.md` §2.1 row 14 "Member since badge on storefront" (Partial); extends `2026-09-15-trustseal-design.md` + `2026-09-13-supplier-storefront-design.md`.

## 1. Goal

Fully implement generic supplier tenure on the storefront hero, matching Alibaba/IndiaMART pattern: every verified supplier shows platform tenure, paid TrustSEAL members additionally show TrustSEAL tenure.

Non-goals (v1): PDP offer rows, search results, SEO description changes, tiered perks, buyer membership.

User choices locked:
- Scope: both badges (generic for all + TrustSEAL SINCE for paid)
- Format: `Member since YYYY · N yrs`
- Surface: storefront hero only (`/suppliers/:slug`)

## 2. Definition + rule (§1 approved)

- `supplierSinceYear = UTC year of suppliers.createdAt`. Null if missing/invalid/future.
- `supplierMemberYears = floor((now - createdAt) / 365d)`. Clamped >= 0. Null when year is null.
- `supplierSinceDate = ISO date of createdAt` for tooltip. Null when year is null.
- Existing TrustSEAL fields (`trustSealed`, `trustSealExpiresAt`, `memberSinceYear` from `trust_seal_subscriptions.startedAt`) unchanged. No semantic overload.
- Storefront `by-slug` only serves `verificationStatus == 'verified'` (existing 404 guard preserved).

Alternatives rejected:
- B (fallback overload of `memberSinceYear` to `createdAt`): destroys paid-vs-free distinction, mislabels free suppliers.
- C (tenure service + PDP/search/SEO now): violates storefront-only scope, extra churn.

## 3. Data + API (§1 approved)

`GET /api/suppliers/by-slug/:slug` response `supplier` adds:

```ts
supplierSinceYear: number | null;
supplierSinceDate: string | null; // ISO
supplierMemberYears: number | null;
```

Computation in `apps/api/src/modules/storefront/routes.ts` (no migration, `findBySlug` already returns full supplier row including `createdAt`):
- Parse `supplier.createdAt` (ms epoch). If null/NaN/future → all three null.
- Else year via `getUTCFullYear()`, years via floor diff, date via `toISOString()`.
- Trust map lookup unchanged. Missing sub → TrustSEAL inactive, generic tenure still present.

## 4. UI surfaces (§2 approved)

New `apps/web/src/components/MemberSinceBadge.tsx`:
- Neutral style (ink/border, Calendar icon) to contrast gold TrustSEAL.
- Label: `Member since YYYY · N yrs` (if years == 0 → `Member since YYYY · New`).
- Props: `{ sinceYear, memberYears, sinceDate }`. Renders nothing when `sinceYear == null`.
- `title="Supplier on Vyro since {date}"`, `aria-label="Member since {year}"`.

`SupplierHero.tsx`:
- Extends props with `supplierSinceYear?`, `supplierMemberYears?`, `supplierSinceDate?`.
- Renders `<MemberSinceBadge>` beside `<TrustSealBadge>` in hero meta line.
- `TrustSealBadge` untouched.

`StorefrontPage.tsx`:
- Extends `StorefrontData.supplier` interface with three new optional fields.
- Passes through to `SupplierHero`. No fetch logic change.

SEO (`useStorefrontMeta`) unchanged in v1.

## 5. Data flow + error handling (§3 approved)

Flow: `by-slug` → `findBySlug` → compute generic tenure + `trustSealRepository.batchStatus` → JSON → `StorefrontPage` → `SupplierHero` → `MemberSinceBadge` + `TrustSealBadge`.

- Unverified/missing supplier → existing 404, no badge.
- Null/future `createdAt` → generic badge hidden, TrustSEAL unaffected.
- Never expose paymentId, amount, PayHere raw (unchanged privacy).
- No N+1 (single supplier lookup + single batchStatus call).

## 6. Testing (§4 approved)

- API unit: year/years calc (known timestamp → year + floor years), null-safety (null/NaN/future → nulls), TrustSEAL fields preserved.
- Web render: `MemberSinceBadge` shows `2021` + `5 yrs`, `New` variant when 0, hidden when null.
- Regression: existing `storefront/*`, `trustSealBadge` tests stay green.
- Manual QA: `/suppliers/:slug` for free verified (generic only) vs TrustSEAL active (both badges).

## 7. Files touched (expected)

- `apps/api/src/modules/storefront/routes.ts` (tenure derivation)
- `apps/web/src/components/MemberSinceBadge.tsx` (new)
- `apps/web/src/storefront/SupplierHero.tsx`, `StorefrontPage.tsx` (props + render)
- Tests: `apps/api/test/storefront/memberSince.test.ts` (new), `apps/web/test/memberSinceBadge.test.tsx` (new)

## 8. Rollout

No flag (additive). No backfill (derived from `createdAt`). No migration.
