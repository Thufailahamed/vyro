# VYRO Page Visual Polish — Design

**Date:** 2026-09-04
**Status:** Draft (brainstorm), pending review
**Owner:** VYRO engineering

## Goal

Every page in `apps/web` and `apps/web/src/admin` matches the VYRO brandkit at first glance. No raw tokens, no inconsistent headers, no half-applied recipes. No new routes, no API changes, no DB changes.

The recent commits ("polish SearchPage", "polish BusinessOnboarding", "polish SupplierOnboarding") established a recipe. This sweep propagates it across the remaining pages.

## Locked decisions

| Decision | Choice |
|---|---|
| Scope | Visual / UX polish only. No new routes, no new features, no API or DB changes. |
| Recipe source | Recent "polish" commits (SearchPage, BusinessOnboarding, SupplierOnboarding) define the canonical pattern. Replicate. |
| Primitive home | `apps/web/src/components/ui.tsx` (local app shell). `packages/ui` stays generic / primitive-only. |
| Color & type tokens | Brand tokens only: `ink`, `paper`, `bone`, `volt`, `copper`, `mint`, `amber`, `rose`, `violet`, `cyan`. No raw `text-gray-*`, `bg-white`, `text-black`. |
| Type classes | `vyro-display` (display headings), `vyro-ui` (UI body), `vyro-metric` (numeric), `vyro-kicker` (eyebrow). |
| Fonts | Already loaded via `--font-display` (Syne) + `--font-ui` (IBM Plex Sans) + `--font-mono` (IBM Plex Mono). No new font adds. |
| New primitives | 4 added to local `ui.tsx`: `PageHeader`, `PageSection`, `MetricStack`, `StatusDots`. |
| Sweep order | Workspace → Catalog → Marketing/onboarding → Auth → Admin. |

## Out of scope

- Backend, API, DB schema, auth flow logic
- New product features, new order statuses, new roles
- New routes
- Mobile native apps, i18n, analytics
- Full light/dark mode parity
- Refactoring `packages/ui` (intentionally untouched — keeps reusable primitives isolated)
- Renaming existing files or exports

## 1. Page recipe (canonical)

```
<PageHeader
  kicker="Orders"
  title="Everything in motion."
  sub="Track each purchase from confirmation to delivery."
  actions={<Button>New order</Button>}
/>
```

- `kicker` rendered with `.vyro-kicker` (uppercase, copper, 11px, tracked).
- `title` rendered with `vyro-display text-4xl sm:text-5xl text-balance text-ink-1`.
- `sub` rendered with `text-body-lg text-ink-3 max-w-2xl`.
- `actions` slot aligned right on `md+`, stacked below on mobile.

## 2. New primitives

### 2.1 `PageHeader` — `apps/web/src/components/ui.tsx`

| Prop | Type | Notes |
|---|---|---|
| `kicker` | `ReactNode` | eyebrow text |
| `title` | `ReactNode` | display heading |
| `sub` | `ReactNode?` | subheading paragraph |
| `actions` | `ReactNode?` | right-aligned action slot |
| `className` | `string?` | optional extra classes |

Returns a header block with vertical rhythm: `space-y-3` between kicker → title → sub. Actions slot absolutely positioned right at md+.

### 2.2 `PageSection` — `apps/web/src/components/ui.tsx`

| Prop | Type | Notes |
|---|---|---|
| `eyebrow` | `ReactNode?` | section eyebrow |
| `title` | `ReactNode?` | section heading (display-md) |
| `actions` | `ReactNode?` | section-level actions |
| `children` | `ReactNode` | content |

Renders a section wrapper: `space-y-5`, top-aligned eyebrow + heading row with optional actions, children in `mt-2`. No card chrome — caller decides if it needs a surface.

### 2.3 `MetricStack` — `apps/web/src/components/ui.tsx`

| Prop | Type | Notes |
|---|---|---|
| `items` | `Array<{ label: string; value: string; accent?: 'mint'\|'amber'\|'rose'\|'volt'\|'ink' }>` | rows |
| `compact` | `boolean?` | tightens padding |

Renders each row with `vyro-metric text-2xl` value + small uppercase label above. `accent` colors the value.

### 2.4 `StatusDots` — `apps/web/src/components/ui.tsx`

| Prop | Type | Notes |
|---|---|---|
| `status` | `OrderStatus` (already exported from ui.tsx) | maps to dot color + label |

Returns a 6px dot + label pair. Color comes from `statusMap` already defined in `ui.tsx` (statuses: draft, pending, preparing, in_transit, delivered, completed, cancelled, disputed, returning, returned, refunded, paid, unpaid).

## 3. Empty / loading / error standards

- **Empty**: use existing `<EmptyState>` (already in `ui.tsx`). Icon + title + description + optional action.
- **Loading**: replace ad-hoc `bg-mist animate-pulse` boxes with `<Skeleton>` (already in `ui.tsx`). Long lists: render 3-6 skeletons in the same grid as real items.
- **Spinner**: `<Spinner>` (already in `ui.tsx`) for inline actions. Don't introduce custom spinners.
- **Error**: standardize on `<ErrorBanner>` (already used by SupplierOnboarding). Replace any custom error markup with this primitive.

## 4. Sweep order & per-page scope

### Phase A — Workspace chrome-bearing pages (8)
- `DashboardPage.tsx`
- `OrdersPage.tsx`
- `OrderDetailPage.tsx`
- `SupplierOrdersPage.tsx`
- `NotificationsPage.tsx`
- `ProfilePage.tsx`
- `CartPage.tsx`
- `CheckoutPage.tsx`

For each: top of page becomes `<PageHeader>` (where appropriate). Replace raw tokens. Add `EmptyState` where data is empty. Use `Skeleton` for loading.

### Phase B — Catalog (2)
- `SearchPage.tsx` — already polished; only token audit.
- `ProductDetailPage.tsx` — apply `PageHeader` for product title block, replace any raw tokens.

### Phase C — Marketing & onboarding (5)
- `HomePage.tsx` — already partially polished; hero stays bespoke (designed moment), but standardize any sub-sections with `PageSection` + `MetricStack`.
- `MarketingPages.tsx` (About, HowItWorks) — apply `PageHeader`.
- `BusinessOnboardingPage.tsx` — already polished; token audit only.
- `SupplierOnboardingPage.tsx` — already polished; token audit only.

### Phase D — Auth shell (2)
- `LoginPage.tsx`, `SignupPage.tsx` — replace top heading blocks with `PageHeader`. Currently uses raw `<h1>`/`<p>`.

### Phase E — Admin (5)
- `admin/HomePage.tsx`
- `admin/Lists.tsx` (Suppliers, Businesses)
- `admin/DisputedAndAudit.tsx`
- `admin/LoginPage.tsx`
- `admin/Shell.tsx` (chrome — keep intact, audit tokens)

Admin shell uses darker cinematic palette — adapt kicker color to volt instead of copper where it sits on dark surfaces.

## 5. File-level rules

- **Imports**: prefer named imports from `@/components/ui`. Import `BrandMark`/`FlowLine` from `@/components/brand/*`.
- **Class composition**: use `cn()` from `@vyro/ui` when mixing variants.
- **No new files** in `pages/` or `admin/`. Only `components/ui.tsx` gets new exports.
- **No new dependencies**.
- **Dark surfaces**: when on `bg-ink`/`bg-midnight-*`, swap `vyro-kicker` color from `text-copper` to `text-volt` for legibility.

## 6. Acceptance criteria

- All 16 web page files + 5 admin files use either `<PageHeader>` or a deliberately-bespoke hero (HomePage hero, OrderDetail page header).
- Grep confirms zero occurrences of `text-gray-`, `bg-white`, `text-black`, raw `font-bold` in `pages/` and `admin/`.
- `pnpm -w build` succeeds. `pnpm -w typecheck` succeeds.
- Visual: each page renders with kicker + display heading + body rhythm consistent with SearchPage / SupplierOnboarding.

## 7. Testing

No new automated tests. Build + typecheck + manual visual sweep per page. Smoke test: load `/`, `/search`, `/dashboard`, `/orders`, `/admin` and confirm no console errors.

## 8. Risk & rollback

- Risk: removing raw tokens could break a page with edge styling. Mitigation: per-page diff reviewed against prior behavior; the sweep is mechanical.
- Rollback: each page edit is a single commit; `git revert <commit>` restores the previous page state without touching others.

## 9. Open items

- None at design time. Spec review may surface gaps.