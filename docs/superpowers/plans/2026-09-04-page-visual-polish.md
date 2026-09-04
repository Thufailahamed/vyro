# VYRO Page Visual Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page in `apps/web` (16 files) and `apps/web/src/admin` (5 files) match the VYRO brandkit recipe established in the recent "polish" commits. No new routes, no API changes.

**Architecture:** Add 4 page-level composables (`PageHeader`, `PageSection`, `MetricStack`, `StatusDots`) to `apps/web/src/components/ui.tsx`. Sweep all pages in 5 phases — workspace → catalog → marketing/onboarding → auth → admin — replacing ad-hoc headers/typography with the new primitives and standardizing empty/loading/error states.

**Tech Stack:** React 18, react-router-dom, @tanstack/react-query, Tailwind CSS, class-variance-authority, Radix primitives (Dialog/Select/Tabs), lucide-react icons. Brand tokens defined in `apps/web/tailwind.config.ts` and `apps/web/src/index.css` (`vyro-kicker`, `vyro-display`, `vyro-metric`).

## Global Constraints

- No new files in `apps/web/src/pages/` or `apps/web/src/admin/`. Only `components/ui.tsx` gets new exports.
- No new dependencies.
- Only brand color tokens: `ink`, `paper`, `bone`, `volt`, `copper`, `mint`, `amber`, `rose`, `violet`, `cyan`. No raw `text-gray-*`, `bg-white`, `text-black`, raw `font-bold`.
- Type classes only: `vyro-display`, `vyro-ui`, `vyro-metric`, `vyro-kicker`.
- Dark surface rule: when parent surface is `bg-ink`/`bg-midnight-*`, `vyro-kicker` color is `text-volt` (not copper).
- Page-level imports: named imports from `@/components/ui`. `BrandMark`/`FlowLine`/`FlowPathMini` from `@/components/brand/*`.
- One commit per page sweep.
- `pnpm -w typecheck` and `pnpm -w build` must pass after each task.
- **Working directory:** `/Users/thufailahamed/Downloads/project-5`. Repo root.

---

## File Structure

| File | Role | Touched |
|---|---|---|
| `apps/web/src/components/ui.tsx` | Local UI primitives + new `PageHeader`, `PageSection`, `MetricStack`, `StatusDots` | Add 4 exports |
| `apps/web/src/pages/DashboardPage.tsx` | Workspace home | Phase A |
| `apps/web/src/pages/OrdersPage.tsx` | Workspace home | Phase A |
| `apps/web/src/pages/OrderDetailPage.tsx` | Workspace home (bespoke header retained) | Phase A |
| `apps/web/src/pages/SupplierOrdersPage.tsx` | Workspace home | Phase A |
| `apps/web/src/pages/NotificationsPage.tsx` | Workspace home | Phase A |
| `apps/web/src/pages/ProfilePage.tsx` | Workspace home | Phase A |
| `apps/web/src/pages/CartPage.tsx` | Workspace home | Phase A |
| `apps/web/src/pages/CheckoutPage.tsx` | Workspace home | Phase A |
| `apps/web/src/pages/SearchPage.tsx` | Catalog | Phase B (token audit) |
| `apps/web/src/pages/ProductDetailPage.tsx` | Catalog | Phase B |
| `apps/web/src/pages/HomePage.tsx` | Marketing | Phase C (hero retained; sub-sections standardized) |
| `apps/web/src/pages/MarketingPages.tsx` | Marketing | Phase C |
| `apps/web/src/pages/BusinessOnboardingPage.tsx` | Marketing | Phase C (token audit) |
| `apps/web/src/pages/SupplierOnboardingPage.tsx` | Marketing | Phase C (token audit) |
| `apps/web/src/pages/LoginPage.tsx` | Auth | Phase D |
| `apps/web/src/pages/SignupPage.tsx` | Auth | Phase D |
| `apps/web/src/admin/HomePage.tsx` | Admin | Phase E |
| `apps/web/src/admin/Lists.tsx` | Admin | Phase E |
| `apps/web/src/admin/DisputedAndAudit.tsx` | Admin | Phase E |
| `apps/web/src/admin/LoginPage.tsx` | Admin | Phase E |
| `apps/web/src/admin/Shell.tsx` | Admin chrome | Phase E (token audit) |

---

## Task 1: Add `PageHeader` primitive

**Files:**
- Modify: `apps/web/src/components/ui.tsx` (append after existing `EmptyState` export block, before `Table`)

**Interfaces:**
- Produces: `PageHeader` React component, exported from `ui.tsx`. Consumed by every workspace, catalog, auth page in later tasks.

**Step 1:** Append the following to `apps/web/src/components/ui.tsx` directly after the closing of the `EmptyState` component (before `// TABLE` comment):

```tsx
// ============================================
// PAGE HEADER
// ============================================
export interface PageHeaderProps {
  kicker?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
}
export function PageHeader({ kicker, title, sub, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="max-w-3xl">
        {kicker && <div className="vyro-kicker">{kicker}</div>}
        <h1 className="mt-2 vyro-display text-4xl sm:text-5xl text-balance text-ink-1">{title}</h1>
        {sub && <p className="mt-3 text-body-lg text-ink-3 max-w-2xl">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 md:shrink-0">{actions}</div>}
    </header>
  );
}
PageHeader.displayName = 'PageHeader';

// ============================================
// PAGE SECTION
// ============================================
export interface PageSectionProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}
export function PageSection({ eyebrow, title, actions, className, children }: PageSectionProps) {
  return (
    <section className={cn('space-y-5', className)}>
      {(eyebrow || title || actions) && (
        <div className="flex items-end justify-between gap-4 border-b border-line-soft pb-3">
          <div>
            {eyebrow && <div className="vyro-kicker">{eyebrow}</div>}
            {title && <h2 className="mt-1 vyro-display text-2xl text-ink-1">{title}</h2>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
PageSection.displayName = 'PageSection';

// ============================================
// METRIC STACK
// ============================================
export interface MetricStackItem {
  label: string;
  value: string;
  accent?: 'mint' | 'amber' | 'rose' | 'volt' | 'ink';
}
export interface MetricStackProps {
  items: MetricStackItem[];
  compact?: boolean;
  className?: string;
}
const accentClass: Record<NonNullable<MetricStackItem['accent']>, string> = {
  mint: 'text-mint',
  amber: 'text-amber',
  rose: 'text-rose',
  volt: 'text-volt-deep',
  ink: 'text-ink-1',
};
export function MetricStack({ items, compact, className }: MetricStackProps) {
  return (
    <dl className={cn('divide-y divide-line-soft', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn('flex items-baseline justify-between gap-4', compact ? 'py-2' : 'py-3')}
        >
          <dt className="text-caption uppercase tracking-wider text-ink-3">{item.label}</dt>
          <dd className={cn('vyro-metric text-2xl', accentClass[item.accent ?? 'ink'])}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
MetricStack.displayName = 'MetricStack';

// ============================================
// STATUS DOTS
// ============================================
const statusPalette: Record<OrderStatus, { dot: string; label: string }> = {
  draft: { dot: 'bg-ink-5', label: 'Draft' },
  pending: { dot: 'bg-amber', label: 'Pending' },
  preparing: { dot: 'bg-violet', label: 'Preparing' },
  in_transit: { dot: 'bg-cyan-deep', label: 'In transit' },
  delivered: { dot: 'bg-mint', label: 'Delivered' },
  completed: { dot: 'bg-mint', label: 'Completed' },
  cancelled: { dot: 'bg-ink-5', label: 'Cancelled' },
  disputed: { dot: 'bg-rose', label: 'Disputed' },
  returning: { dot: 'bg-amber', label: 'Returning' },
  returned: { dot: 'bg-amber', label: 'Returned' },
  refunded: { dot: 'bg-amber', label: 'Refunded' },
  paid: { dot: 'bg-mint', label: 'Paid' },
  unpaid: { dot: 'bg-ink-5', label: 'Unpaid' },
};
export function StatusDots({ status }: { status: OrderStatus }) {
  const s = statusPalette[status];
  return (
    <span className="inline-flex items-center gap-2 text-body-sm text-ink-2">
      <span className={cn('size-1.5 rounded-full', s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}
StatusDots.displayName = 'StatusDots';
```

**Step 2:** Verify the file compiles.

Run from repo root: `pnpm --filter web typecheck 2>&1 | tail -20`
Expected: `Done` with no errors. If `typecheck` script missing, run `pnpm -w build` and check web app build.

**Step 3:** Commit.

```bash
git add apps/web/src/components/ui.tsx
git commit -m "feat(web): add PageHeader, PageSection, MetricStack, StatusDots primitives"
```

---

## Task 2: Sweep `DashboardPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`

**Step 1:** Read current file to understand its sections.

Run: `Read apps/web/src/pages/DashboardPage.tsx`

**Step 2:** Add `PageHeader` import. Locate the import line for `@/components/ui` and add `PageHeader, MetricStack, StatusDots` to the named imports list (preserve existing imports).

**Step 3:** Replace the top-level page heading block (typically the first non-loader `<div>` or `<header>` with an `<h1>`). If the file opens with `<h1 className="...">`, wrap the kicker + h1 + sub into a `<PageHeader kicker=... title=... sub=... actions={...} />` block.

- If there is no existing sub-text, omit the `sub` prop.
- If the file has top-right action buttons (e.g. "New order"), wrap them in a `<div>` and pass as `actions`.

**Step 4:** Replace any ad-hoc metric rows (text + number pairs) inside the page with `<MetricStack items={[...]} />`.

**Step 5:** Replace any ad-hoc status text (e.g. raw `<span>` with order status string) with `<StatusDots status={...} />`.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`
Expected: clean build.

**Step 7:** Commit.

```bash
git add apps/web/src/pages/DashboardPage.tsx
git commit -m "polish(web): Dashboard — PageHeader + MetricStack + StatusDots"
```

---

## Task 3: Sweep `OrdersPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/OrdersPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/OrdersPage.tsx`

**Step 2:** Add `PageHeader`, `StatusDots` to existing `@/components/ui` import.

**Step 3:** Replace the top heading with `<PageHeader kicker="Orders" title="..." sub="..." />`. Title should describe what the page shows (e.g. "Every order, end to end."). Sub can describe filters/sort if present.

**Step 4:** Replace ad-hoc status badge spans with `<StatusDots status={order.status} />`.

**Step 5:** If the file has a `<Table>` or list with raw token classes (`text-gray-*`, `bg-white`), replace with brand tokens (`text-ink-3`, `bg-paper`).

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/pages/OrdersPage.tsx
git commit -m "polish(web): Orders — PageHeader + StatusDots"
```

---

## Task 4: Sweep `OrderDetailPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/OrderDetailPage.tsx`

**Constraint:** This page has a **bespoke header** (per spec §6). Do NOT replace with `PageHeader`. Apply token audit + standardize the bespoke block instead.

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/OrderDetailPage.tsx`

**Step 2:** Identify the bespoke header region (likely first `<div>` after loading guard). Apply token audit only:
- Replace `text-gray-*` → `text-ink-*`
- Replace `bg-white` → `bg-paper`
- Replace `font-bold` on display headings → `vyro-display`
- Add `vyro-kicker` above the heading if missing (kicker text: "Order" or matching context).

**Step 3:** Replace any ad-hoc status pill with `<StatusDots status={order.status} />`.

**Step 4:** If the page has a timeline/event list, ensure each row uses `text-ink-2` body + `text-caption` timestamps.

**Step 5:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 6:** Commit.

```bash
git add apps/web/src/pages/OrderDetailPage.tsx
git commit -m "polish(web): OrderDetail — token audit + StatusDots (bespoke header retained)"
```

---

## Task 5: Sweep `SupplierOrdersPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/SupplierOrdersPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/SupplierOrdersPage.tsx`

**Step 2:** Add `PageHeader`, `StatusDots` to `@/components/ui` import.

**Step 3:** Replace top heading with `<PageHeader kicker="Supplier inbox" title="Incoming orders." sub="..." />`.

**Step 4:** Replace ad-hoc status pills with `<StatusDots status={order.status} />`.

**Step 5:** Token audit: any raw `text-gray-*` / `bg-white` / `font-bold` → brand tokens / `vyro-display`.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/pages/SupplierOrdersPage.tsx
git commit -m "polish(web): SupplierOrders — PageHeader + StatusDots"
```

---

## Task 6: Sweep `NotificationsPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/NotificationsPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/NotificationsPage.tsx`

**Step 2:** Add `PageHeader`, `EmptyState` to `@/components/ui` import (skip `EmptyState` if already imported).

**Step 3:** Replace top heading with `<PageHeader kicker="Signals" title="What's moving." sub="..." />`.

**Step 4:** If the page renders an empty list, replace any hand-rolled "No notifications" markup with `<EmptyState icon={<BellIcon size={20} />} title="Nothing in the flow yet." description="..." />`.

**Step 5:** Token audit.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/pages/NotificationsPage.tsx
git commit -m "polish(web): Notifications — PageHeader + EmptyState"
```

---

## Task 7: Sweep `ProfilePage.tsx`

**Files:**
- Modify: `apps/web/src/pages/ProfilePage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/ProfilePage.tsx`

**Step 2:** Add `PageHeader`, `PageSection` to `@/components/ui` import.

**Step 3:** Replace top heading with `<PageHeader kicker="Account" title={user.name ?? 'Your account.'} sub={user.email} />`.

**Step 4:** If the page has grouped fields (e.g. "Identity", "Addresses"), wrap each group in `<PageSection eyebrow="..." title="...">...</PageSection>`.

**Step 5:** Token audit.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/pages/ProfilePage.tsx
git commit -m "polish(web): Profile — PageHeader + PageSection"
```

---

## Task 8: Sweep `CartPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/CartPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/CartPage.tsx`

**Step 2:** Add `PageHeader`, `EmptyState`, `MetricStack` to `@/components/ui` import.

**Step 3:** Replace top heading with `<PageHeader kicker="Cart" title="Review before you place." sub="..." />`.

**Step 4:** If the page renders an empty cart, replace any hand-rolled empty markup with `<EmptyState icon={<ShoppingCartIcon size={20} />} title="Your cart is empty." description="..." action={<Link to='/search'><Button>Browse catalog</Button></Link>} />`.

**Step 5:** If the page has a summary block (subtotal / delivery / total), render with `<MetricStack items={[{label:'Subtotal', value: formatLKR(...), ...}]} />`.

**Step 6:** Token audit.

**Step 7:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 8:** Commit.

```bash
git add apps/web/src/pages/CartPage.tsx
git commit -m "polish(web): Cart — PageHeader + EmptyState + MetricStack"
```

---

## Task 9: Sweep `CheckoutPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/CheckoutPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/CheckoutPage.tsx`

**Step 2:** Add `PageHeader`, `PageSection`, `MetricStack` to `@/components/ui` import.

**Step 3:** Replace top heading with `<PageHeader kicker="Checkout" title="Confirm and pay." sub="..." />`.

**Step 4:** Wrap delivery form in `<PageSection eyebrow="Delivery" title="Where to">...</PageSection>`. Wrap payment form in `<PageSection eyebrow="Payment" title="How">...</PageSection>`.

**Step 5:** Render summary block with `<MetricStack items={[...]} />`.

**Step 6:** Token audit.

**Step 7:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 8:** Commit.

```bash
git add apps/web/src/pages/CheckoutPage.tsx
git commit -m "polish(web): Checkout — PageHeader + PageSection + MetricStack"
```

---

## Task 10: Token audit `SearchPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/SearchPage.tsx`

**Constraint:** This page is already polished. Apply token audit only — do not restructure.

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/SearchPage.tsx`

**Step 2:** Run: `grep -nE "text-gray-|bg-white|font-bold" apps/web/src/pages/SearchPage.tsx` and capture matches.

**Step 3:** For each match, replace with the brand equivalent:
- `text-gray-500/600` → `text-ink-3` (muted body)
- `text-gray-700` → `text-ink-2`
- `bg-white` → `bg-paper`
- `font-bold` on headings → `vyro-display` class on the parent or the element

**Step 4:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 5:** Commit.

```bash
git add apps/web/src/pages/SearchPage.tsx
git commit -m "polish(web): Search — token audit"
```

---

## Task 11: Sweep `ProductDetailPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/ProductDetailPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/ProductDetailPage.tsx`

**Step 2:** Add `PageHeader`, `StatusDots` to `@/components/ui` import.

**Step 3:** Replace top heading block (product title + brand + unit) with `<PageHeader kicker={product.unit} title={product.name} sub={product.brand ?? undefined} actions={<Button>Add to cart</Button>} />`.

**Step 4:** If the page lists supplier offers, replace any ad-hoc status text with `<StatusDots status={offer.status} />`.

**Step 5:** Token audit.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/pages/ProductDetailPage.tsx
git commit -m "polish(web): ProductDetail — PageHeader + StatusDots"
```

---

## Task 12: Sweep `HomePage.tsx`

**Files:**
- Modify: `apps/web/src/pages/HomePage.tsx`

**Constraint:** Hero block (first big section) is bespoke and stays. Sub-sections below the hero get standardized.

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/HomePage.tsx`

**Step 2:** Add `PageSection`, `MetricStack` to `@/components/ui` import.

**Step 3:** For each `<section>` below the hero that has an `<h2>` and an optional subtitle, wrap content in `<PageSection eyebrow="..." title="...">...</PageSection>`. Preserve any custom chrome inside the section.

**Step 4:** If the page has a "stats" or "metrics" row near the hero, render with `<MetricStack items={[{label, value}, ...]} />`.

**Step 5:** Token audit outside the hero region.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/pages/HomePage.tsx
git commit -m "polish(web): Home — PageSection + MetricStack (hero retained)"
```

---

## Task 13: Sweep `MarketingPages.tsx`

**Files:**
- Modify: `apps/web/src/pages/MarketingPages.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/MarketingPages.tsx`

**Step 2:** Add `PageHeader`, `PageSection` to `@/components/ui` import.

**Step 3:** Replace top heading of `AboutPage` with `<PageHeader kicker="About" title="..." sub="..." />`. Same for `HowItWorksPage` with kicker="How it works".

**Step 4:** Wrap each subsequent step/explainer block in `<PageSection eyebrow="..." title="...">...</PageSection>`.

**Step 5:** Token audit.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/pages/MarketingPages.tsx
git commit -m "polish(web): MarketingPages — PageHeader + PageSection"
```

---

## Task 14: Token audit `BusinessOnboardingPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/BusinessOnboardingPage.tsx`

**Constraint:** Already polished. Token audit only.

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/BusinessOnboardingPage.tsx`

**Step 2:** Run: `grep -nE "text-gray-|bg-white|font-bold" apps/web/src/pages/BusinessOnboardingPage.tsx`. Capture matches.

**Step 3:** Replace each match per the same mapping as Task 10 Step 3.

**Step 4:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 5:** Commit.

```bash
git add apps/web/src/pages/BusinessOnboardingPage.tsx
git commit -m "polish(web): BusinessOnboarding — token audit"
```

---

## Task 15: Token audit `SupplierOnboardingPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/SupplierOnboardingPage.tsx`

**Constraint:** Already polished. Token audit only.

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/SupplierOnboardingPage.tsx`

**Step 2:** Run: `grep -nE "text-gray-|bg-white|font-bold" apps/web/src/pages/SupplierOnboardingPage.tsx`. Capture matches.

**Step 3:** Replace per Task 10 mapping.

**Step 4:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 5:** Commit.

```bash
git add apps/web/src/pages/SupplierOnboardingPage.tsx
git commit -m "polish(web): SupplierOnboarding — token audit"
```

---

## Task 16: Sweep `LoginPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/LoginPage.tsx`

**Step 2:** Add `PageHeader` to `@/components/ui` import.

**Step 3:** Replace top heading block (logo + `<h1>` + sub) with a layout that uses `<PageHeader kicker="Sign in" title="Welcome back." sub="..." />`. Keep the brand logo as a sibling above the PageHeader if needed for visual identity.

**Step 4:** Token audit.

**Step 5:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 6:** Commit.

```bash
git add apps/web/src/pages/LoginPage.tsx
git commit -m "polish(web): Login — PageHeader"
```

---

## Task 17: Sweep `SignupPage.tsx`

**Files:**
- Modify: `apps/web/src/pages/SignupPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/pages/SignupPage.tsx`

**Step 2:** Add `PageHeader` to `@/components/ui` import.

**Step 3:** Replace top heading with `<PageHeader kicker="Start procuring" title="Create your workspace." sub="..." />`.

**Step 4:** Token audit.

**Step 5:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 6:** Commit.

```bash
git add apps/web/src/pages/SignupPage.tsx
git commit -m "polish(web): Signup — PageHeader"
```

---

## Task 18: Sweep `admin/HomePage.tsx`

**Files:**
- Modify: `apps/web/src/admin/HomePage.tsx`

**Constraint:** Admin surfaces are dark (`bg-ink`/`bg-midnight-*`). `vyro-kicker` color must be `text-volt` here.

**Step 1:** Read current file.

Run: `Read apps/web/src/admin/HomePage.tsx`

**Step 2:** Add `PageHeader`, `MetricStack`, `StatusDots` to `@/components/ui` import (admin pages import from same path).

**Step 3:** Replace top heading with `<PageHeader kicker="Admin" title="..." sub="..." />`. Ensure kicker color reads on dark — use `text-volt` if `PageHeader`'s default copper fails contrast. If override needed, wrap kicker manually: `<div className="vyro-kicker text-volt">Admin</div>`.

**Step 4:** Token audit (replace any `text-white` with `text-paper`, `text-black` with `text-ink-1`, raw `bg-black` with `bg-ink`).

**Step 5:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 6:** Commit.

```bash
git add apps/web/src/admin/HomePage.tsx
git commit -m "polish(admin): Home — PageHeader + MetricStack"
```

---

## Task 19: Sweep `admin/Lists.tsx`

**Files:**
- Modify: `apps/web/src/admin/Lists.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/admin/Lists.tsx`

**Step 2:** Add `PageHeader`, `StatusDots` to import.

**Step 3:** For `SuppliersPage`: `<PageHeader kicker="Admin · Suppliers" title="Supplier ledger." sub="..." />`. For `BusinessesPage`: `<PageHeader kicker="Admin · Businesses" title="Business ledger." sub="..." />`. Apply kicker color override (`text-volt`) if needed for dark surface.

**Step 4:** Replace any ad-hoc status pills with `<StatusDots status={...} />`.

**Step 5:** Token audit.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/admin/Lists.tsx
git commit -m "polish(admin): Lists — PageHeader + StatusDots"
```

---

## Task 20: Sweep `admin/DisputedAndAudit.tsx`

**Files:**
- Modify: `apps/web/src/admin/DisputedAndAudit.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/admin/DisputedAndAudit.tsx`

**Step 2:** Add `PageHeader`, `StatusDots` to import.

**Step 3:** For `DisputedPage`: `<PageHeader kicker="Admin · Disputes" title="Active disputes." sub="..." />` with `text-volt` kicker override.

For `AuditPage`: `<PageHeader kicker="Admin · Audit" title="Activity log." sub="..." />` with `text-volt` kicker override.

**Step 4:** Replace any ad-hoc status text with `<StatusDots status="disputed" />` etc.

**Step 5:** Token audit.

**Step 6:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 7:** Commit.

```bash
git add apps/web/src/admin/DisputedAndAudit.tsx
git commit -m "polish(admin): Disputed + Audit — PageHeader + StatusDots"
```

---

## Task 21: Sweep `admin/LoginPage.tsx`

**Files:**
- Modify: `apps/web/src/admin/LoginPage.tsx`

**Step 1:** Read current file.

Run: `Read apps/web/src/admin/LoginPage.tsx`

**Step 2:** Add `PageHeader` to import.

**Step 3:** Replace top heading with `<PageHeader kicker="Admin · Sign in" title="Restricted area." sub="..." />` with kicker color override `text-volt` if on dark surface.

**Step 4:** Token audit.

**Step 5:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 6:** Commit.

```bash
git add apps/web/src/admin/LoginPage.tsx
git commit -m "polish(admin): Login — PageHeader"
```

---

## Task 22: Token audit `admin/Shell.tsx`

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`

**Constraint:** Admin chrome. Token audit only — do not restructure layout.

**Step 1:** Read current file.

Run: `Read apps/web/src/admin/Shell.tsx`

**Step 2:** Run: `grep -nE "text-gray-|bg-white|font-bold|text-black" apps/web/src/admin/Shell.tsx`. Capture matches.

**Step 3:** Replace per mapping:
- `text-gray-*` → `text-paper/70` (muted on dark)
- `bg-white` → `bg-paper`
- `font-bold` on display headings → `vyro-display`
- `text-black` → `text-ink-1`

**Step 4:** Verify.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`

**Step 5:** Commit.

```bash
git add apps/web/src/admin/Shell.tsx
git commit -m "polish(admin): Shell — token audit"
```

---

## Task 23: Final verification

**Step 1:** Repo-wide raw-token grep.

Run:
```bash
grep -rnE "text-gray-|bg-white|font-bold|text-black" \
  apps/web/src/pages apps/web/src/admin apps/web/src/components/ui.tsx 2>&1
```

Expected: zero matches. If matches exist, fix the offending file before continuing.

**Step 2:** Typecheck.

Run: `pnpm --filter web typecheck 2>&1 | tail -20`
Expected: clean.

**Step 3:** Build.

Run: `pnpm -w build 2>&1 | tail -30`
Expected: build succeeds for `web`.

**Step 4:** Manual smoke test checklist (read-only verification — no code change). For each page below, confirm the brandkit recipe is visible:
- `/` — Home (hero retained, sub-sections use PageSection)
- `/search` — Search (kicker + display heading)
- `/dashboard` — Dashboard (PageHeader + MetricStack + StatusDots)
- `/orders` — Orders (PageHeader + StatusDots)
- `/cart` — Cart (PageHeader + EmptyState)
- `/admin` — Admin (PageHeader + MetricStack on dark)

If any visual issue is observed, open the affected page file and fix in a new commit.

**Step 5:** Final commit (no code change — only confirms spec acceptance).

```bash
git status
```
Expected: clean working tree.

---

## Self-Review

**1. Spec coverage:**
- §1 recipe → Task 1 (`PageHeader`).
- §2.1 PageHeader → Task 1.
- §2.2 PageSection → Task 1.
- §2.3 MetricStack → Task 1.
- §2.4 StatusDots → Task 1.
- §3 empty/loading/error → sprinkled across Tasks 2, 6, 8.
- §4 sweep phases → Tasks 2-22 cover all listed files.
- §5 file-level rules → embedded as constraints in each task.
- §6 acceptance → Task 23 final verification.
- §7 testing → Task 23 (build + typecheck + smoke).

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "similar to Task N" present.

**3. Type consistency:** `PageHeader`, `PageSection`, `MetricStack`, `StatusDots` defined once in Task 1 with stable prop signatures. All later tasks consume those same names. `OrderStatus` type reused from existing `ui.tsx` export.