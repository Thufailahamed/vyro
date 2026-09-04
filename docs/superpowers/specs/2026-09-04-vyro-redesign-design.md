# VYRO Platform — Premium UI Redesign Design

**Date:** 2026-09-04
**Status:** Approved (brainstorm), pending spec review
**Owner:** VYRO engineering

## Goal

Make VYRO look and feel like a world-class premium technology product, not a generic B2B SaaS dashboard. Redesign the entire application (business portal, supplier portal, admin portal, public marketing) on a single cohesive design system while preserving every existing route, every existing API endpoint, every existing business rule, and every existing piece of functionality.

The product must feel intentional at every touchpoint, with one brand voice, one type system, one color story, and one motion vocabulary.

## Locked decisions

| Decision | Choice |
|---|---|
| Brand personality | **Cinematic Tech** — confident, premium, slightly futuristic |
| Theme strategy | **Light default with cinematic dark sections** (hero, dashboards, supplier inbox, checkout success). Pearl ground by default; midnight reserved for cinematic moments. Cyan accent used sparingly, never decoratively. |
| Font system | **Geist Sans** (400/500/600/700) + **Geist Mono** (400/500) via Google Fonts CDN. Geist for display + UI; Geist Mono for SKUs, prices, IDs, timestamps. Tabular numerals on all numeric cells. |
| Logo | **Sharp V monogram tile.** Geometric V glyph carved into midnight square with a single cyan inner notch. Wordmark "VYRO" in Geist Semibold set tight beside it. Three SVG files: `/public/brand/logo.svg`, `/public/brand/logo-dark.svg`, `/public/brand/favicon.svg`. |
| Component library home | `packages/ui` (currently an empty stub with Radix + CVA + lucide-react + tailwind-merge declared but unused). Resurrected as the single source of truth for variants. |
| Icon library | `lucide-react` (already declared in `packages/ui`). Replaces the two parallel handwritten `icons.tsx` files. |
| Dark sections vs dark mode | Section-level dark contrast (not full-app dark mode). Reduces surface area, keeps B2B-appropriate default, delivers WOW through section drama. |
| Backend changes | None. UI-only project. Frontend/backend endpoint mismatches observed in source (e.g., `/auth/sign-in` vs `/auth/sign-up`) are out of scope for this design and flagged in §14 as observations. |

## Out of scope

- Backend, API, DB schema, auth implementation
- New product features (e.g., adding new order statuses, new roles)
- Mobile native apps
- i18n / l10n beyond what already exists
- Analytics instrumentation beyond what already exists
- Full light/dark mode parity (dark sections only — no manual toggle of the whole app)

## 1. Brand foundations

### 1.1 Personality

**Cinematic Tech.** The product reads like a modern fintech or premium commerce platform — confident, sharp, slightly futuristic. Not "tech-bro SaaS" — every gradient earns its place, every glow has a job.

### 1.2 Palette (light surface tokens)

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#0A0B10` | Primary headings |
| `--ink-2` | `#1A1D26` | Body text |
| `--ink-3` | `#5A606E` | Muted text, captions |
| `--ink-4` | `#9098A4` | Placeholder, disabled |
| `--pearl` | `#F6F7F9` | App background |
| `--paper` | `#FFFFFF` | Cards, raised surfaces |
| `--line` | `#E6E8EE` | Borders, dividers |
| `--line-soft` | `#EFF1F5` | Subtle separators |
| `--cyan` | `#5EE2FF` | Primary accent: CTA fill, focus ring, live data |
| `--cyan-deep` | `#0FB5D7` | Cyan hover, pressed, cyan borders |
| `--cyan-glow` | `rgba(94,226,255,0.20)` | Halo behind focus, primary CTA hover |
| `--cyan-glow-strong` | `rgba(94,226,255,0.40)` | Active accent outline |
| `--amber` | `#F5B544` | Warning, pending |
| `--rose` | `#F25C6A` | Danger, dispute |
| `--mint` | `#1FB28A` | Success, delivered, completed |
| `--violet` | `#9B7EF5` | In-transit, processing, preparing |
| `--midnight` | `#0A0B10` | Dark section ground |
| `--midnight-2` | `#12141A` | Dark section surface (raised) |
| `--midnight-3` | `#1A1D26` | Dark card on dark ground |

### 1.3 Dark sections

Used on: Home hero, supplier inbox primary state, admin shell, checkout success, login/signup marketing panel, dashboard cinematic moments. Ground = `--midnight`. Surface = `--midnight-2`. Text = `#F6F7F9` (pearl). Subdued text = `#9098A4` (ink-4). Borders = `--midnight-3`. Accent = `--cyan` (slightly brighter on dark, `--cyan` works fine — luminance is high enough).

### 1.4 Typography

**Families:**

```css
--font-sans: 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

**Loading:** Google Fonts `<link rel="preconnect">` + `<link rel="stylesheet" href="...&display=swap">`. Single request covers all weights needed. `display=swap` for performance.

**Scale:**

| Token | rem | line-height | weight | tracking | use |
|---|---|---|---|---|---|
| `display-xl` | 4.5rem (72px) | 1.05 | 600 | -0.03em | Hero (Home, login split) |
| `display-lg` | 3rem (48px) | 1.08 | 600 | -0.025em | Page heroes |
| `display-md` | 2rem (32px) | 1.1 | 600 | -0.02em | Section heads |
| `display-sm` | 1.5rem (24px) | 1.2 | 600 | -0.015em | Large stat values |
| `h1` | 1.5rem | 1.2 | 600 | -0.015em | Page titles |
| `h2` | 1.25rem | 1.3 | 600 | -0.01em | Card titles |
| `h3` | 1.0625rem | 1.4 | 600 | -0.005em | Subsections |
| `body` | 0.9375rem | 1.55 | 400 | 0 | Default body |
| `body-sm` | 0.8125rem | 1.5 | 400 | 0 | Secondary text |
| `caption` | 0.6875rem | 1.4 | 500 | 0.04em | UPPERCASE labels, eyebrow text |
| `mono-md` | 0.9375rem | 1.4 | 500 | 0 | Prices, quantities (font-mono) |
| `mono-sm` | 0.8125rem | 1.4 | 500 | 0 | IDs, timestamps, SKUs |

`font-variant-numeric: tabular-nums` enforced on every cell/element rendering numerics.

### 1.5 Spacing

4px base. Used directly in Tailwind arbitrary values `[--space-N]` where N maps to the scale below, and exposed as utility classes via Tailwind `theme.extend.spacing`. Scale: `0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128`.

Container widths (Tailwind `theme.extend.maxWidth`): `xs:480, sm:640, md:768, lg:1024, xl:1200, 2xl:1400, 3xl:1600`. Default app container: `2xl` (1400px). Marketing hero can break out to `3xl`.

### 1.6 Radius

| Token | px | Use |
|---|---|---|
| `--r-xs` | 6 | Badges, chips, small tags |
| `--r-sm` | 10 | Inputs, sm buttons, table cells |
| `--r-md` | 14 | Cards, md buttons, default surface |
| `--r-lg` | 20 | Panels, large cards, sidebars |
| `--r-xl` | 28 | Section containers, dark cards, modals |
| `--r-full` | 9999 | Pills, avatars, status dots |

### 1.7 Shadows

| Token | Definition | Use |
|---|---|---|
| `--shadow-1` | `0 1px 0 rgba(10,11,16,0.04), 0 1px 2px rgba(10,11,16,0.04)` | Resting cards |
| `--shadow-2` | `0 2px 4px rgba(10,11,16,0.04), 0 8px 24px rgba(10,11,16,0.06)` | Raised cards, popovers, hover state |
| `--shadow-3` | `0 12px 40px rgba(10,11,16,0.10), 0 4px 12px rgba(10,11,16,0.06)` | Modals, drawers |
| `--shadow-glow` | `0 0 0 1px rgba(94,226,255,0.40), 0 8px 32px rgba(94,226,255,0.18)` | Cyan focus halo, primary CTA hover |
| `--shadow-inset-line` | `inset 0 -1px 0 rgba(10,11,16,0.06)` | Sticky bar bottom edge |

Exposed via Tailwind `theme.extend.boxShadow`.

### 1.8 Motion

| Token | Value | Use |
|---|---|---|
| `--dur-instant` | 80ms | Press/active feedback |
| `--dur-fast` | 140ms | Hover state swaps, focus rings |
| `--dur-base` | 200ms | Most transitions |
| `--dur-slow` | 320ms | Page enter, modal enter |
| `--dur-slower` | 480ms | One-shot cinematic reveals |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Default for everything |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Enter |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exit |

Exposed via Tailwind `theme.extend.transitionDuration` and `theme.extend.transitionTimingFunction`.

**Motion rules:**
- Hover lift = `translateY(-1px)` + shadow-1 → shadow-2, 140ms ease-standard
- Press = `scale(0.98)`, 80ms ease-out
- Page enter = `opacity 0→1` + `translateY 8px→0`, 320ms ease-out, stagger 40ms for first 6 children
- Modal enter = `opacity 0→1` + `scale 0.96→1`, 200ms ease-out
- Toast enter = `translateX 16px→0` + `opacity 0→1`, 200ms ease-out (right-anchored)
- Skeleton shimmer = cyan-tinted linear gradient sweep, 1.6s linear infinite
- Status badge change = cross-fade 140ms

**No bouncing. No parallax. No scroll-jacking. No spinning logos.**

`@media (prefers-reduced-motion: reduce)` kills all non-essential transitions and animations; opacity transitions kept at 80ms.

### 1.9 Iconography

- Library: `lucide-react` (declared in `packages/ui`, currently unused — now imported).
- Stroke: 1.5, rounded caps and joins, `viewBox="0 0 24 24"`.
- Sizes: `16, 20, 24` (Tailwind `size-4, size-5, size-6`).
- Color: `currentColor` everywhere. Single V monogram icon (`VLogo`) custom-built.

### 1.10 Logo SVG files

Three files in `/apps/web/public/brand/`:

1. `logo.svg` — midnight ground (`#0A0B10`), cyan notch, pearl V. For light surfaces.
2. `logo-dark.svg` — pearl ground (`#F6F7F9`), cyan notch, midnight V. For dark sections.
3. `favicon.svg` — mark only, 32×32 viewBox, midnight ground, pearl V with cyan notch.

Header lockup uses `logo.svg` with `<img>` + wordmark text in Geist Semibold beside it. Footer uses `logo-dark.svg`. Favicon in `index.html`.

The existing gradient block in `apps/web/src/components/Layout.tsx` (lines 47–65) is removed and replaced with the new SVG.

## 2. Token system implementation

Tokens are defined once and consumed everywhere. No page-level hex codes.

### 2.1 Where tokens live

| Token class | File | Format |
|---|---|---|
| CSS variables | `apps/web/src/styles/tokens.css` | `--token-name: value` |
| Tailwind theme | `apps/web/tailwind.config.ts` (extends) | References tokens, exposes utilities |
| TS types | `packages/ui/src/tokens.ts` | Re-exports for TS consumers |
| Shared brand | `packages/shared/src/branding.ts` | Updated to reference tokens (not redefined) |

### 2.2 Tailwind config additions

```ts
theme: {
  extend: {
    colors: {
      ink: { 1: '#0A0B10', 2: '#1A1D26', 3: '#5A606E', 4: '#9098A4' },
      pearl: '#F6F7F9',
      paper: '#FFFFFF',
      line: { DEFAULT: '#E6E8EE', soft: '#EFF1F5' },
      cyan: { DEFAULT: '#5EE2FF', deep: '#0FB5D7' },
      amber: '#F5B544',
      rose: '#F25C6A',
      mint: '#1FB28A',
      violet: '#9B7EF5',
      midnight: { 1: '#0A0B10', 2: '#12141A', 3: '#1A1D26' },
    },
    fontFamily: {
      sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      mono: ['Geist Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
    },
    fontSize: {
      'display-xl': ['4.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '600' }],
      'display-lg': ['3rem', { lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600' }],
      'display-md': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
      'display-sm': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '600' }],
      'caption': ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.04em', fontWeight: '500' }],
    },
    borderRadius: {
      'xs': '6px',
      'sm': '10px',
      'md': '14px',
      'lg': '20px',
      'xl': '28px',
    },
    boxShadow: {
      '1': '0 1px 0 rgba(10,11,16,0.04), 0 1px 2px rgba(10,11,16,0.04)',
      '2': '0 2px 4px rgba(10,11,16,0.04), 0 8px 24px rgba(10,11,16,0.06)',
      '3': '0 12px 40px rgba(10,11,16,0.10), 0 4px 12px rgba(10,11,16,0.06)',
      'glow': '0 0 0 1px rgba(94,226,255,0.40), 0 8px 32px rgba(94,226,255,0.18)',
      'inset-line': 'inset 0 -1px 0 rgba(10,11,16,0.06)',
    },
    transitionDuration: { '80': '80ms', '140': '140ms', '200': '200ms', '320': '320ms', '480': '480ms' },
    transitionTimingFunction: { 'standard': 'cubic-bezier(0.2, 0, 0, 1)' },
    maxWidth: { 'xs': '480px', '2xl': '1400px', '3xl': '1600px' },
  },
},
```

Old `brand-50…950` slate ramp is removed (replaced by the new palette; if any page still references `brand-*` it gets migrated in this redesign).

### 2.3 `index.css`

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: light;
    --ink: #0A0B10;
    /* …all tokens from §1.2–1.7 */
  }
  html, body { @apply bg-pearl text-ink-2 antialiased font-sans; }
  body {
    font-feature-settings: "cv02", "cv03", "cv04", "cv11", "ss01";
    text-rendering: optimizeLegibility;
  }
  ::selection { @apply bg-cyan/30 text-ink-1; }
  *:focus-visible { @apply outline-none ring-2 ring-cyan ring-offset-2 ring-offset-pearl; }
}

@layer utilities {
  .num-tabular { font-variant-numeric: tabular-nums; }
  .text-balance { text-wrap: balance; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 80ms !important;
    transition-duration: 80ms !important;
  }
}
```

## 3. Component system (`packages/ui`)

`packages/ui` becomes the single source of truth for primitives. It exports a barrel from `src/index.ts`. All components are built on Radix primitives where behavior matters. Variants are declared with `class-variance-authority`. Composed with `tailwind-merge` and `clsx`.

### 3.1 Inventory

| Component | Built on | Notes |
|---|---|---|
| `Button` | Radix Slot | 7 variants × 5 sizes + icon-only |
| `IconButton` | Radix Slot | Square sm/md/lg |
| `Input` | native | Label + error + help composition |
| `Textarea` | native | Same composition as Input |
| `Select` | Radix Select | Custom trigger, listbox, item, separator |
| `Checkbox` | Radix Checkbox | Custom indicator |
| `Switch` | Radix Switch | Used in settings |
| `RadioGroup` | Radix RadioGroup | Used in checkout payment selector |
| `Label` | Radix Label | Uppercase caption style |
| `Field` | composed | Label + Input/Textarea/Select + error/help wrapper |
| `Card` | div | 5 variants |
| `SectionCard` | div | Larger variant for hero/dashboard panels |
| `Badge` | span | 7 variants + optional dot |
| `StatusBadge` | Badge | Maps order status → variant |
| `Table` | table | Sticky header, hairline rows, hover |
| `Tabs` | Radix Tabs | Underline + pill variants |
| `Dialog` (modal) | Radix Dialog | Centered, scale-in |
| `Drawer` | Radix Dialog (with vaul or sheet primitive) | Right-side slide-in |
| `Popover` | Radix Popover | Anchored floating content |
| `Tooltip` | Radix Tooltip | Midnight bg, paper text |
| `DropdownMenu` | Radix DropdownMenu | Used in avatar menu, row actions |
| `Toast` + `ToastProvider` | Radix Toast + custom | Top-right stack |
| `EmptyState` | composed | Cyan disc icon + headline + body + CTA |
| `Skeleton` | div | Cyan-tinted shimmer, 6 size variants |
| `Avatar` | div | Initials + 6-tone color cycle |
| `Chip` | button | Filter/selectable pill |
| `Stat` | div | Eyebrow + display-md value + delta + sparkline slot |
| `MetricTile` | Stat | 2-col dashboard tile |
| `CommandMenu` | composed (cmdk-style) | Cmd+K global search/palette |
| `Logo` | img/SVG | Renders logo.svg or logo-dark.svg by mode |
| `VMark` | SVG | 28/40/64/96 size |
| `Spinner` | SVG | Cyan stroke spinner, used in Button loading |
| `Divider` | hr | Hairline, optional label slot |

### 3.2 Component contracts (selected)

**Button** — `variant: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success' | 'link'`; `size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'`; `loading: boolean`; `asChild: boolean`. Sizes map to `h-7/8/10/12/14` and `px-2.5/3/4/5/6`. Primary uses cyan fill, paper text, shadow-glow on hover.

**Card** — `variant: 'default' | 'elevated' | 'outlined' | 'dark' | 'interactive'`; `padding: 'none' | 'sm' | 'md' | 'lg'`. Default = paper bg, 1px line border, rounded-lg, shadow-1, p-6. Interactive adds hover lift + cyan border on hover.

**StatusBadge** — accepts `status: 'pending' | 'accepted' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'in_transit' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'rejected' | 'disputed'`. Maps to Badge variant. Disputed has pulsing dot.

**Tabs** — `variant: 'underline' | 'pill'`. Underline = bottom 1px line border, active 2px cyan underline 8px wide. Pill = rounded-full background, active cyan bg/cyan-deep text.

**Table** — `<Table>` `<THead>` `<TBody>` `<TR>` `<TH>` `<TD>` subcomponents. Sticky header, tabular nums enforced on `<TD>`, hover row tint (`bg-pearl/60`), row click handler for navigation.

**Toast** — `<ToastProvider>` mounted at app root. Imperative API `toast.success(message)`, `toast.error(message)`, `toast.info(message)`, `toast.warning(message)`. Auto-dismiss 5s, hover-to-pause, swipe-to-dismiss on touch.

**EmptyState** — props: `icon: LucideIcon`, `title`, `description?`, `action?: ReactNode`, `tone: 'neutral' | 'dark'`. Cyan disc behind icon.

**Skeleton** — props: `size: 'text' | 'heading' | 'button' | 'avatar' | 'card' | 'tile'`, `className?`. Cyan-tinted shimmer gradient sweep, 1.6s loop.

**Stat** — props: `label`, `value`, `delta?: { value, direction: 'up' | 'down' | 'flat', tone }`, `sparkline?: number[]`. Sparkline renders as inline SVG polyline.

### 3.3 Icon migration

The two parallel `icons.tsx` files (web + admin) are deleted. All consumers import from `lucide-react` directly, OR use named imports from `packages/ui` (`<VMark>`, `<Logo>`) for brand-specific glyphs only.

## 4. Layout & navigation

### 4.1 Public app shell (`apps/web/src/components/Layout.tsx`)

Replaces current sticky header.

**Header (h-16, sticky top):**
- Background: `bg-paper/85 backdrop-blur-xl border-b border-line`
- Left: `Logo` (28px) + wordmark "VYRO" in Geist Semibold text-ink, h-16 flex items-center
- Center (md+): horizontal nav — Search, Orders, [Inbox if supplierMembership], [Admin if isAdmin]. Underline-style active state.
- Right (md+): search icon button (opens CommandMenu), cart icon button with cyan count badge if items > 0, avatar dropdown (Profile, Settings, Sign out)
- Right (mobile): cart icon, avatar dropdown, hamburger button → opens Drawer (Search, Orders, Profile, Sign out)

**Main:**
- `max-w-[1400px] mx-auto px-6 lg:px-10 py-10` (or 16 on dense pages, 24 on hero pages)
- Page-level transitions handled by a route wrapper that triggers page enter animation on path change

**Footer:**
- On marketing pages (Home, Login, Signup, Onboarding): midnight ground, 4-col grid (Product, Company, Resources, Legal), monogram + tagline above, copyright + social row below
- On app pages (Search, Product, Cart, Checkout, Orders, Profile): pearl ground, single row of links + monogram + small print
- Mobile: footer collapses to stacked accordion

### 4.2 Admin shell (`apps/web/src/admin/Shell.tsx`)

Restyled to match:
- Header: midnight ground, paper text, monogram + "Admin" eyebrow tag
- Nav: same underline-style but with cyan accent
- Main container: `max-w-[1400px] mx-auto px-6 lg:px-10 py-10`
- Background: `--pearl`
- Tables and list views use the redesigned Table + Skeleton components

### 4.3 Mobile

Below md (768px):
- Header collapses: monogram + cart + hamburger only
- Hamburger opens right-side Drawer with all nav + account actions
- Search bar becomes a single search input below the header
- Tables become stacked card lists (data still accessible, layout switches)
- Sidebar filters (Search page) collapse to top-of-page accordion sections

## 5. Page-by-page direction

### 5.1 Business portal

**Home (`/`) — marketing landing + search entry**
- Above the fold: midnight ground, `display-xl` headline ("Procurement without the noise."), `body` subtitle, large cyan-bordered search input, floating product chips below ("Steel pipes", "Office supplies", "Packaging", …)
- Stats strip: midnight ground continues, 4-metric row (Businesses, Suppliers, GMV, Avg savings) in pearl text
- Category grid (light surface): "Explore the catalog" — 6 category tiles, each with a custom SVG product glyph + name + count of products
- How it works: 3-column step strip with numbered cyan circles
- Supplier recruitment CTA: midnight banner ("Sell on VYRO — reach 12,000+ verified businesses"), eyebrow + body + CTA
- Footer

**Login (`/login`) and Signup (`/signup`)**
- lg+: split layout — left marketing panel (midnight, display-md headline + 3 trust props + small SVG product collage), right form (paper card, max-w-440, --r-xl, shadow-2, 32px padding)
- md and below: stacked — marketing panel above (compact), form below
- Form fields: Email, Password ([Name] on signup)
- Submit: primary Button, full-width
- Footer link: "Already have an account? Sign in"

**Business onboarding (`/onboarding/business`)** and **Supplier onboarding (`/onboarding/supplier`)**
- Single-column wizard
- Step indicator: numbered circles connected by cyan line, active step cyan-filled
- Generous vertical spacing between fields (24px)
- Field labels: caption style (UPPERCASE tracked)
- Help text below input in ink-3 body-sm
- Submit: primary Button at bottom, "Continue" or "Finish"

**Search (`/search?q=`)**
- Header strip: result count (body-sm ink-3) + sort dropdown (right)
- Filter rail (left, 240px wide on lg+): Category chips, Price range slider, MOQ range, Delivery time, Supplier rating, Location. Apply button + clear all.
- Grid (right): 3-col lg, 2-col md, 1-col sm. Product cards. Mobile: filter rail collapses to top accordion.
- Empty state: large EmptyState with "No products match your filters" + "Clear filters" CTA
- Loading: 9 Skeleton cards in the grid

**Product detail (`/products/:id`)**
- lg+: 2-col layout — left gallery (1 large + 4 thumbnail SVG product glyphs on pearl ground, --r-md), right info column
- Info column: H1 product title, supplier row (logo placeholder avatar + name + verified badge), price (mono-md display-sm), MOQ + lead time chips, quantity stepper, "Add to cart" primary Button (cyan, glow-glow hover), secondary "Save for later"
- Supplier comparison table directly below: rows = Price, MOQ, Stock, Lead time, Rating, Location, Past orders; cols = each supplier offering this product; best-value cell gets cyan tint background + "Best" Badge
- Below comparison: product description (prose body), specifications table, related products (4-card grid)

**Cart (`/cart`)**
- Header: "Your cart" H1 + items count
- Items grouped by supplier (multi-supplier split visible) — each group is a Card with supplier header (avatar + name + verified badge), line items below, group subtotal
- Line item row: SVG product thumbnail (64px), title + supplier (body-sm), qty stepper, line total (mono-md), remove icon button
- Right sidebar (sticky on lg+): summary Card with --r-lg, items count, subtotal mono-md display-sm, "Proceed to checkout" primary Button, secondary "Continue shopping"
- Empty state: large EmptyState with shopping cart disc icon + "Your cart is empty" + "Browse catalog" primary CTA

**Checkout (`/checkout`)**
- 2-col on lg+: left form (delivery notes textarea, payment method radio cards), right sticky summary (items grouped, totals, "Place orders" primary Button)
- Radio cards: paper bg, --r-md, 1px line, hover cyan border, selected cyan border + cyan-glow + cyan checkmark
- Submit: posts `/purchase-orders/checkout`, navigates to first created PO
- On submit success: midnight celebration Card with check animation, PO numbers listed, "View orders" CTA

**Orders list (`/orders`)**
- Header: H1 "Purchase orders" + status filter Tabs (All, Pending, In progress, Delivered, Disputed)
- List: each row a Card with order id (mono-sm), supplier (avatar + name), item count, total (mono-md display-sm), StatusBadge, created timestamp (caption), chevron-right for detail
- Mobile: card stack with same info, full-width tappable
- Empty state: large EmptyState with "No orders yet" + "Browse catalog" CTA

**Order detail (`/orders/:id`)**
- Header strip: order id (mono-md), StatusBadge, back link
- 2-col on lg+: left content (line items Table, status timeline, transition controls), right sticky summary (supplier info Card + actions)
- Status timeline: vertical timeline, current state node cyan-filled + cyan-glow, completed states filled mint, future states hollow, each with timestamp (mono-sm)
- Transition controls: depends on role + current status; primary Button + secondary cancel

**Supplier orders (`/supplier/orders`)** — same pattern as Orders list but for the supplier inbox
- Empty state: "No incoming orders yet"
- Row cards include accept/reject quick actions inline (visible on hover on desktop, always visible on mobile)

**Profile (`/profile`)**
- H1 "Account"
- User info Card: avatar (large), name, email, phone, edit button
- Business memberships section: list of businesses user belongs to (Card per business, role Badge)
- Supplier memberships section: same pattern
- Settings link Card (placeholder for future settings page)
- Sign out: danger ghost Button at bottom

**Settings (`/profile/settings`) — NEW placeholder page**
- Tabs: Profile, Notifications, Security, Billing (placeholder content per tab)
- Form fields use Field component

### 5.2 Supplier portal pages that don't exist yet

Pages listed in the brief that aren't currently routed. They are designed as full layouts with realistic seeded data shapes from the schema. Where the backend doesn't expose data, the page shows an EmptyState with a clear "Add first product" CTA. No new API routes are added in this redesign.

**Supplier products (`/supplier/products`) — NEW**
- H1 "Products"
- Toolbar: search input, "Add product" primary Button
- Table: rows = product thumbnail, title, category, base price (mono-md), MOQ, stock indicator (progress bar), status, row actions (edit, archive)
- Empty state: "No products yet" + "Add your first product" CTA

**Supplier add/edit product (`/supplier/products/new`, `/supplier/products/:id/edit`) — NEW**
- 2-col form: left fields (title, category select, description textarea, base price, MOQ, lead time, stock), right preview Card (live-updates as user types, shows what the product card will look like in search)

**Supplier pricing (`/supplier/pricing`) — NEW**
- H1 "Pricing"
- Bulk price editor: Table of products, each row editable price + MOQ + lead time
- "Apply changes" sticky bottom bar appears when any cell edited

**Supplier inventory (`/supplier/inventory`) — NEW**
- H1 "Inventory"
- Low stock alert Card at top (if any products below threshold)
- Table: product, on-hand, reserved, available, threshold, status (in stock / low / out)
- Status colors: mint / amber / rose

**Supplier analytics (`/supplier/analytics`) — NEW**
- H1 "Analytics"
- Top metric row: Revenue (30d), Orders (30d), Avg order value, Repeat customer rate
- Two charts side-by-side: Revenue trend line (cyan) + Order volume bar (mint)
- Top products table (top 10 by revenue)
- Customer geography placeholder (textual list of top regions)

**Supplier customers (`/supplier/customers`) — NEW**
- H1 "Business customers"
- Table: business name, contact, orders count, lifetime spend (mono-md display-sm), last order date, status

**Supplier deliveries (`/supplier/deliveries`) — NEW**
- H1 "Deliveries"
- Tabs: Scheduled, In transit, Delivered
- Table per tab with delivery date, PO, business, address, status

**Supplier payments (`/supplier/payments`) — NEW**
- H1 "Payments"
- Summary metric row: Outstanding, Paid (30d), Refunds
- Table: PO id, business, amount (mono-md), status (pending / processing / paid / failed), actions

**Supplier settings (`/supplier/settings`) — NEW**
- Tabs: Company, Warehouse, Payouts, Notifications
- Form fields per tab

### 5.3 Admin portal

**Admin login (`/admin/login`)**
- Same split layout as business login. Left marketing panel reads "Administer VYRO." Right form: email + password + sign in.

**Admin dashboard (`/admin`) — NEW (replaces the currently-unrouted AdminHomePage)**
- Midnight ground stats strip (4 metrics: Active businesses, Active suppliers, GMV this month, Disputes open)
- Below: 3-col metric tiles (signups 7d trend, order volume 7d, dispute rate)
- Below: 2-col (Recent activity table + Action required list with rose stripe for disputes)
- All charts use cyan strokes, mint fills, no rainbow

**Admin businesses (`/admin/businesses`)**
- Header: H1 "Businesses" + search + filter chips (status, region, verified)
- Table: business name, contact, owner, member count, GMV (mono-md), status Badge, joined date, row actions (View, Verify, Suspend)
- Empty state: "No businesses registered yet"

**Admin suppliers (`/admin/suppliers`)**
- Header: H1 "Suppliers" + search + filter chips (status, category, verified)
- Table: supplier name, category, contact, product count, GMV (mono-md), rating (5 stars), status Badge, joined date, row actions
- Empty state: "No suppliers registered yet"

**Admin products (`/admin/products`) — NEW**
- Table: product, category, supplier, base price, offers, status
- Empty state

**Admin categories (`/admin/categories`) — NEW**
- Table of categories with product counts and active state
- "Add category" modal with name + parent select

**Admin orders (`/admin/orders`) — NEW**
- Table: PO id, business, supplier, total (mono-md), status, created
- Filter by status, date range, business, supplier

**Admin deliveries (`/admin/deliveries`) — NEW**
- Table: delivery id, PO, business, supplier, status, ETA, delivered at

**Admin payments (`/admin/payments`) — NEW**
- Table: payment id, PO, business, supplier, amount (mono-md), status, processed at

**Admin disputes (`/admin/disputed`)** — current `DisputedAndAudit.tsx` disputed section
- Header: H1 "Disputed orders" + count Badge (rose)
- Each disputed order a Card with rose left stripe, order info, business + supplier, dispute reason, last activity timestamp, "Open dispute" Button → Drawer with full timeline and resolution actions

**Admin users (`/admin/users`) — NEW**
- Table: name, email, memberships count, is platform admin, status, joined
- Filter by role, status

**Admin platform analytics (`/admin/analytics`) — NEW**
- Same structure as supplier analytics but platform-wide: GMV, take rate, active buyers, active suppliers, top categories, top regions, churn indicators

**Admin audit log (`/admin/audit`)** — current `DisputedAndAudit.tsx` audit section
- Vertical timeline: actor avatar, action description, target resource, timestamp (mono-sm), IP (caption)
- Filter by actor, action type, date range
- Search by resource ID

**Admin settings (`/admin/settings`) — NEW**
- Tabs: Platform, Branding, Fees, Integrations
- Branding tab: brand name input, logo upload (placeholder), primary color picker, accent color picker (locked to current cyan for brand consistency, but visible)

### 5.4 Public marketing pages currently missing

None required — current routes cover public surface. Future expansion (About, Pricing, Blog) would follow the marketing pattern from §5.1.

## 6. Dashboards (exceptional treatment)

Dashboards avoid the "collection of boring cards" trap. Each dashboard uses asymmetric grids, intentional visual hierarchy, charts, and contextual quick actions.

### 6.1 Business dashboard (new, would be `/dashboard`)

- **Top metric row:** 4 Stat tiles — Spend this month (mono-md display-sm value + delta vs last month + sparkline), Orders in flight, Saved vs list price, Active suppliers
- **Procurement activity:** Large Card with stacked area chart (last 90 days, cyan stroke, mint fill at 20% opacity). Eyebrow label "Procurement activity" + date range chips (7d / 30d / 90d)
- **Top suppliers:** Card with ranked list — supplier avatar + name, GMV mono-md, sparkline
- **Recent orders:** Table — order id, supplier, status, total, created
- **Pending actions:** Card with checklist (accept quote, confirm delivery, approve invoice) — each row has primary action Button
- All charts use cyan strokes, mint fills, no rainbow colors

### 6.2 Supplier dashboard (new, would be `/supplier/dashboard`)

- **Top metric row:** 4 Stat tiles — Revenue this month, Orders to fulfill, Inventory alerts (rose if > 0), Avg lead time
- **Incoming orders inbox:** large Card with rows (cyan dot for new, order id mono-sm, business, items count, total mono-md, time-ago, accept/reject inline)
- **Revenue trend:** Card with line chart — cyan + mint dual line (this month vs last month)
- **Low stock:** Card with amber stripe per row — product, on-hand, threshold, restock CTA
- **Top customers:** small Table

### 6.3 Admin dashboard (new, see §5.3)

## 7. Product discovery — premium commerce treatment

Per brief: "Make browsing products feel similar to a premium modern commerce experience."

- Search (§5.1) delivers the experience
- Product cards are the hero of the experience. Custom SVG product glyphs replace stock photos. Each glyph is category-specific (geometric form: hexagonal nut for hardware, layered box for packaging, ruled page for office supplies, etc.)
- Card structure: 1:1 image area (pearl ground with centered SVG glyph, --r-md), supplier row (avatar + caption name + verified Badge if applicable), H3 product title, mono-md price, MOQ + lead time chips, "+ Add" Button
- Hover: lift + cyan border + show quick actions (Compare, Save)
- Comparison (§5.1) is the standout VYRO feature — best-value cell cyan-tinted with "Best" Badge, cheapest, fastest, highest-rated all visually obvious without clutter

## 8. Supplier comparison feature

Already detailed in §5.1 Product detail. Highlights:

- Rows = attributes, columns = suppliers (or rows = suppliers, columns = attributes; the spec uses rows = attributes)
- Best-value highlight: cyan tint background + "Best" Badge on the winning cell for each attribute category
- Sortable columns (sort by price, lead time, rating)
- "Add to cart from this supplier" CTA on each supplier column
- Hairline borders, no zebra striping, tabular numerals

## 9. Micro-interactions

| Element | Interaction | Detail |
|---|---|---|
| Button hover | Lift + shadow | 140ms, shadow-1 → shadow-2 + glow for primary |
| Button press | Scale | 0.98, 80ms |
| Button loading | Spinner | Cyan stroke, replaces content |
| Input focus | Border + halo | 140ms, border ink → cyan-deep + cyan-glow ring |
| Card hover (interactive) | Lift + border | 200ms, translateY(-1px) + shadow-1 → shadow-2 + line → cyan border |
| Cart add | Pulse | Count badge scales 1 → 1.2 → 1, 200ms; cart count +1 with roll animation |
| Cart remove | Slide out | 200ms, height + opacity collapse |
| Page transition | Fade in up | 320ms, opacity + translateY 8px, stagger 40ms first 6 children |
| Modal enter | Scale | opacity 0→1 + scale 0.96→1, 200ms ease-out |
| Modal exit | Reverse | 140ms ease-in |
| Toast | Slide in right | 200ms, auto-dismiss 5s with progress bar |
| Skeleton | Shimmer | cyan-tinted linear gradient sweep, 1.6s linear infinite |
| Status change | Cross-fade | 140ms opacity swap |
| Dropdown open | Slide down | 160ms, opacity + translateY(-4px) |
| Tabs switch | Underline slide | 240ms ease-standard |
| Filter apply | Fade | 200ms grid content cross-fade |
| Sort change | Reorder | FLIP animation (240ms per item) |
| Search input | Debounce + loading | Cyan spinner in trailing slot while debounced fetch in flight |
| Avatar menu open | Fade + slide | 160ms |
| Drawer open | Slide in right | 240ms, paper surface |

## 10. Responsive behavior

Breakpoints: sm 640, md 768, lg 1024, xl 1200 (used selectively). Existing project uses sm/md/lg only; new code may use xl where dense tables need it.

| Surface | Desktop (lg+) | Tablet (md) | Mobile (sm and below) |
|---|---|---|---|
| Header | full nav inline | monogram + cart + hamburger | monogram + cart + hamburger |
| Search page | filter rail + 3-col grid | filter rail collapses + 2-col grid | filter rail becomes top accordion + 1-col stack |
| Product detail | 2-col gallery + info | stacked, gallery full-width | stacked |
| Cart | items + sticky summary | items + sticky summary bottom | items stacked + sticky bottom CTA bar |
| Checkout | 2-col form + sticky summary | stacked | stacked + sticky bottom CTA |
| Orders list | row cards | row cards | row cards (full-width tappable) |
| Order detail | 2-col content + sticky summary | stacked | stacked |
| Tables | full table | horizontal scroll wrapper | card list replacement |
| Dashboards | 4-col stats + 2-col charts | 2-col stats + stacked charts | 1-col stack |
| Admin lists | full table | horizontal scroll | card list |
| Modal | max-w-lg centered | max-w-md | sheet (bottom or full-screen on mobile) |
| Drawer | right side, 480px | right side, 400px | full-screen |

`overflow-x-auto` on tables for tablet; explicit card-list renderer for mobile.

## 11. Accessibility

- WCAG AA contrast on all text/bg pairs
- Focus visible everywhere (cyan ring via `:focus-visible`)
- Keyboard nav on every interactive element (Radix gives this free)
- Reduced motion respected (see §1.8)
- Screen-reader labels on icon-only buttons
- Form fields associated with labels (Radix Label)
- Modals trap focus and restore on close
- Toasts announced via aria-live polite
- Tables use proper `<thead>`, `<tbody>`, `<th scope>` semantics
- Skip-to-content link in header

## 12. Performance

- Fonts: single Google Fonts request with `display=swap`, preconnect
- No raster images in design system — all glyphs and decorative elements are inline SVG
- Charts: simple inline SVG polyline paths (no chart library needed for our 4 chart types)
- Animations use transform + opacity (GPU-accelerated)
- Backdrop blur limited to header (one element, narrow footprint)
- Lucide icons are tree-shaken per import

## 13. Testing

- Vitest unit tests for `packages/ui` components (variants, interactions, a11y attributes)
- Visual regression not in scope (no tooling set up). Rely on manual review against the design tokens.
- Playwright smoke test for one critical flow (add to cart → checkout → order placed) — already in `apps/web/test/` per the existing repo

## 14. Known observations (out of scope, do not fix here)

Flagged during exploration. Document so they are not mistaken for design issues:

- Frontend calls `/auth/sign-in` but backend exposes `/auth/sign-up` (no sign-in route). Better Auth handler not mounted in API `/Users/.../apps/api/src/index.ts`.
- Frontend onboarding pages call `/businesses/types` and `/suppliers/types`; backend exposes `/businesses` (POST) and `/suppliers` (POST), no `/types` endpoints.
- Frontend `SessionUser` types include `memberships`, `supplierMemberships`, `isAdmin`; backend `/auth/me` returns Better Auth session user directly. Backend middleware enriches context separately.
- `packages/ui/package.json` declares Radix, CVA, lucide-react, tailwind-merge, clsx — but `packages/ui/src/index.ts` is empty. All UI currently lives in `apps/web/src/components/ui.tsx`.
- Admin Audit page links to `/audit/:id` but no such route exists.
- `packages/shared/src/branding.ts` declares oklch tokens that are not imported anywhere; this design replaces it with the new token system in §2.
- `tailwindcss-animate` plugin is not installed but `animate-in fade-in-50` and `zoom-in-75` utilities are referenced in current code — those references are removed in this redesign (we use explicit transitions instead).

## 15. Risks & tradeoffs

- **Section-level dark vs full dark mode** — limited dark surface means we don't get full-app dark. Acceptable for B2B but a power user may want full dark. Not in scope; revisit if requested.
- **No real product photography** — keeps the bundle lean but loses some commerce warmth. Mitigated by bespoke SVG glyphs per category.
- **lucide-react adoption** — if lucide ever changes API, migration cost. Mitigated by wrapping in `packages/ui` icons where it adds value.
- **Google Fonts dependency** — one external request. Self-hosting is possible but adds complexity; Google Fonts is reliable and preconnect makes it fast.
- **New supplier/admin pages without backend** — pages will show EmptyState for data not exposed. Acceptable since backend is out of scope.
- **Existing endpoints + auth flows have unresolved mismatches** (see §14) — UI redesign will use the frontend's intended calls. If backend is fixed, no UI changes needed; if backend is left as-is, the affected flows (login, signup, onboarding) will continue to fail in the same way they do today. Out of scope for this design.

## 16. Acceptance criteria

The redesign is complete when:

1. Every existing route renders a redesigned page consistent with the tokens in §1
2. Every page listed in §5.1 exists and uses the layout patterns in §5.1
3. Every page listed in §5.2 exists as a new page with realistic seeded data shapes and clear EmptyStates
4. Every page listed in §5.3 exists with admin-appropriate density and the midnight shell treatment
5. Geist Sans + Geist Mono load from Google Fonts and apply across the app
6. The V monogram logo SVG files exist in `/apps/web/public/brand/` and are used by the header/footer/favicon
7. `packages/ui` exports a populated barrel with every component in §3.1
8. `lucide-react` replaces all handwritten icons; the two `icons.tsx` files are deleted
9. All buttons, inputs, cards, badges, tables, modals, toasts, dropdowns use the redesigned components
10. The supplier comparison feature (§5.1, §8) renders with cyan best-value highlight
11. All dashboard surfaces (§5.2, §6) render with charts, metric tiles, and contextual quick actions
12. Responsive behavior matches §10 on sm, md, lg viewports
13. WCAG AA contrast on all text/bg pairs
14. Reduced motion respected
15. `pnpm typecheck` passes
16. `pnpm build` succeeds
17. Smoke test for add-to-cart → checkout → order passes

## 17. Routes (final inventory)

### Existing routes — preserved, redesigned

Public (under `<Layout/>`):

- `/` HomePage
- `/login` LoginPage
- `/signup` SignupPage
- `/onboarding/business` BusinessOnboardingPage
- `/onboarding/supplier` SupplierOnboardingPage
- `/search` SearchPage
- `/products/:id` ProductDetailPage
- `/cart` CartPage
- `/checkout` CheckoutPage
- `/orders` OrdersPage
- `/orders/:id` OrderDetailPage
- `/supplier/orders` SupplierOrdersPage
- `/profile` ProfilePage

Admin (under `<AdminShell/>`):

- `/admin/login` admin LoginPage
- `/admin/suppliers` admin Lists.Suppliers
- `/admin/businesses` admin Lists.Businesses
- `/admin/disputed` admin Disputed
- `/admin/audit` admin Audit
- `/admin` (redirects to `/admin/suppliers`)
- `*` (redirects to `/admin`)

Wildcards preserved.

### New routes — added in this redesign

Public:

- `/profile/settings` Settings page

Supplier portal (nested under `<SupplierShell/>` if separated, or under public `<Layout/>` with role gate — implementation choice):

- `/supplier/dashboard` Supplier dashboard
- `/supplier/products` Product list
- `/supplier/products/new` Add product
- `/supplier/products/:id/edit` Edit product
- `/supplier/pricing` Bulk price editor
- `/supplier/inventory` Inventory
- `/supplier/analytics` Analytics
- `/supplier/customers` Business customers
- `/supplier/deliveries` Deliveries
- `/supplier/payments` Payments
- `/supplier/settings` Settings

Admin:

- `/admin` Dashboard (replaces redirect — current AdminHomePage was unrouted, gets routed here)
- `/admin/products` Products
- `/admin/categories` Categories
- `/admin/orders` Orders
- `/admin/deliveries` Deliveries
- `/admin/payments` Payments
- `/admin/users` Users
- `/admin/analytics` Platform analytics
- `/admin/settings` Settings

### Route gating

- Public routes: open
- `/profile`, `/cart`, `/checkout`, `/orders/*` — require session; redirect to `/login` if unauthenticated; show "Register your business" prompt if signed in but no business membership (existing pattern — preserved)
- `/supplier/*` — require session + supplierMembership; show "Register as supplier" prompt if signed in but no supplier membership
- `/admin/*` — require session + isAdmin (existing `RequireAdmin` wrapper preserved)

A new `<SupplierShell/>` component is added mirroring `<AdminShell/>` for the supplier sub-routes.

## 18. Implementation phases (preview — full breakdown in writing-plans phase)

1. **Foundation** — packages/ui scaffold, tokens (CSS vars + Tailwind + TS), Geist font load, V logo SVGs, base primitives (Button, Card, Badge, StatusBadge, Input, Field, Label, Skeleton, EmptyState, Avatar, Chip, Divider, Toast, Spinner, VMark, Logo)
2. **Layout + navigation** — redesigned Layout.tsx, AdminShell, mobile drawer, CommandMenu
3. **Public marketing** — Home, Login, Signup, Onboarding (business + supplier)
4. **Business app** — Search, Product detail, Cart, Checkout, Orders list, Order detail, Profile, Settings
5. **Supplier app** — Dashboard, Orders inbox (redesign), Products, Add/Edit, Pricing, Inventory, Analytics, Customers, Deliveries, Payments, Settings
6. **Admin app** — Login (redesign), Dashboard, Businesses, Suppliers, Products, Categories, Orders, Deliveries, Payments, Disputes, Users, Analytics, Audit, Settings
7. **Dashboards** — business + supplier + admin dashboards with charts
8. **Polish** — micro-interactions sweep, responsive QA, a11y audit, reduced-motion QA, performance pass

---

End of spec.