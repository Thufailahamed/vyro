# VYRO Premium UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every page of the VYRO application with a premium, cohesive redesign built on a single design system (Cinematic Tech: light default + midnight sections, Geist + Geist Mono, cyan accent) while preserving all existing routes, APIs, and business logic.

**Architecture:** Design tokens drive everything. Single source of truth in `packages/ui` (resurrected from stub), built on Radix primitives + CVA variants + lucide-react icons. Two app shells (public Layout, Admin Shell) plus a new Supplier Shell. Section-level dark contrast for cinematic moments, not full-app dark mode. All routes preserved; new pages added for supplier and admin portals using existing API where available, realistic empty states where not.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vite, Tailwind (extended theme), Radix UI primitives, class-variance-authority, tailwind-merge, clsx, lucide-react, Geist + Geist Mono via Google Fonts CDN, vitest, @testing-library/react.

---

## Global Constraints

- **No backend changes.** UI-only project. Endpoint mismatches between frontend and API are documented in spec §14 and out of scope.
- **All routes preserved.** Existing `/`, `/login`, `/signup`, `/onboarding/{business,supplier}`, `/search`, `/products/:id`, `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/supplier/orders`, `/profile`, `/admin/*` continue to exist and route to redesigned components.
- **New routes added:** `/profile/settings`, `/supplier/{dashboard,products,products/new,products/:id/edit,pricing,inventory,analytics,customers,deliveries,payments,settings}`, `/admin` (dashboard, was a redirect), `/admin/{products,categories,orders,deliveries,payments,users,analytics,settings}`.
- **Design tokens live in** `apps/web/src/styles/tokens.css` (CSS vars) + `apps/web/tailwind.config.ts` (utilities) + `packages/ui/src/tokens.ts` (TS types).
- **Component source of truth:** `packages/ui`. `apps/web/src/components/ui.tsx` becomes a thin re-export barrel and is removed at the end of Phase 1.
- **Icons:** `lucide-react`. Delete `apps/web/src/components/icons.tsx` and `apps/web/src/admin/icons.tsx`. Brand-specific V mark lives in `packages/ui/src/components/VMark.tsx`.
- **Fonts:** Google Fonts CDN with `display=swap` and `<link rel="preconnect">`. Geist (400/500/600/700) + Geist Mono (400/500).
- **Color tokens** (verbatim from spec §1.2): `--ink:#0A0B10, --ink-2:#1A1D26, --ink-3:#5A606E, --ink-4:#9098A4, --pearl:#F6F7F9, --paper:#FFFFFF, --line:#E6E8EE, --line-soft:#EFF1F5, --cyan:#5EE2FF, --cyan-deep:#0FB5D7, --cyan-glow:rgba(94,226,255,0.20), --cyan-glow-strong:rgba(94,226,255,0.40), --amber:#F5B544, --rose:#F25C6A, --mint:#1FB28A, --violet:#9B7EF5, --midnight:#0A0B10, --midnight-2:#12141A, --midnight-3:#1A1D26`.
- **Radius scale:** xs 6, sm 10, md 14, lg 20, xl 28, full 9999.
- **Shadow scale:** `shadow-1` (resting), `shadow-2` (raised), `shadow-3` (modal), `shadow-glow` (cyan focus/CTA), `shadow-inset-line` (sticky edge).
- **Motion tokens:** instant 80ms, fast 140ms, base 200ms, slow 320ms, slower 480ms. Easings: `standard cubic-bezier(0.2,0,0,1)`, `ease-out cubic-bezier(0,0,0.2,1)`, `ease-in cubic-bezier(0.4,0,1,1)`. `prefers-reduced-motion` reduces everything to 80ms.
- **Tabular numerals** (`font-variant-numeric: tabular-nums`) on every numeric cell/element.
- **WCAG AA contrast** verified on every text/background pair.
- **Frequent commits:** one commit per task minimum, descriptive Conventional Commits messages.

---

## File Structure

### New files

**Assets**
- `apps/web/public/brand/logo.svg`
- `apps/web/public/brand/logo-dark.svg`
- `apps/web/public/brand/favicon.svg`

**Tokens + utils**
- `apps/web/src/styles/tokens.css`
- `apps/web/src/lib/cn.ts`
- `apps/web/src/lib/motion.ts`
- `apps/web/src/components/PageTransition.tsx`

**`packages/ui` (resurrected)**
- `packages/ui/src/lib/cn.ts`
- `packages/ui/src/tokens.ts`
- `packages/ui/src/components/Button.tsx`
- `packages/ui/src/components/IconButton.tsx`
- `packages/ui/src/components/Input.tsx`
- `packages/ui/src/components/Textarea.tsx`
- `packages/ui/src/components/Select.tsx`
- `packages/ui/src/components/Checkbox.tsx`
- `packages/ui/src/components/Switch.tsx`
- `packages/ui/src/components/RadioGroup.tsx`
- `packages/ui/src/components/Label.tsx`
- `packages/ui/src/components/Field.tsx`
- `packages/ui/src/components/Card.tsx`
- `packages/ui/src/components/SectionCard.tsx`
- `packages/ui/src/components/Badge.tsx`
- `packages/ui/src/components/StatusBadge.tsx`
- `packages/ui/src/components/Table.tsx`
- `packages/ui/src/components/Tabs.tsx`
- `packages/ui/src/components/Dialog.tsx`
- `packages/ui/src/components/Drawer.tsx`
- `packages/ui/src/components/Popover.tsx`
- `packages/ui/src/components/Tooltip.tsx`
- `packages/ui/src/components/DropdownMenu.tsx`
- `packages/ui/src/components/Toast.tsx`
- `packages/ui/src/components/EmptyState.tsx`
- `packages/ui/src/components/Skeleton.tsx`
- `packages/ui/src/components/Avatar.tsx`
- `packages/ui/src/components/Chip.tsx`
- `packages/ui/src/components/Stat.tsx`
- `packages/ui/src/components/MetricTile.tsx`
- `packages/ui/src/components/Divider.tsx`
- `packages/ui/src/components/Spinner.tsx`
- `packages/ui/src/components/CommandMenu.tsx`
- `packages/ui/src/components/VMark.tsx`
- `packages/ui/src/components/Logo.tsx`
- `packages/ui/src/components/charts/Sparkline.tsx`
- `packages/ui/src/components/charts/AreaChart.tsx`
- `packages/ui/src/components/charts/LineChart.tsx`
- `packages/ui/src/components/charts/BarChart.tsx`
- `packages/ui/src/index.ts` (barrel)
- `packages/ui/src/__tests__/*.test.tsx`

**`apps/web` new pages**
- `apps/web/src/pages/SettingsPage.tsx`
- `apps/web/src/pages/supplier/SupplierDashboardPage.tsx`
- `apps/web/src/pages/supplier/SupplierProductsPage.tsx`
- `apps/web/src/pages/supplier/SupplierAddProductPage.tsx`
- `apps/web/src/pages/supplier/SupplierEditProductPage.tsx`
- `apps/web/src/pages/supplier/SupplierPricingPage.tsx`
- `apps/web/src/pages/supplier/SupplierInventoryPage.tsx`
- `apps/web/src/pages/supplier/SupplierAnalyticsPage.tsx`
- `apps/web/src/pages/supplier/SupplierCustomersPage.tsx`
- `apps/web/src/pages/supplier/SupplierDeliveriesPage.tsx`
- `apps/web/src/pages/supplier/SupplierPaymentsPage.tsx`
- `apps/web/src/pages/supplier/SupplierSettingsPage.tsx`

**`apps/web` new admin pages**
- `apps/web/src/admin/AdminDashboardPage.tsx`
- `apps/web/src/admin/AdminProductsPage.tsx`
- `apps/web/src/admin/AdminCategoriesPage.tsx`
- `apps/web/src/admin/AdminOrdersPage.tsx`
- `apps/web/src/admin/AdminDeliveriesPage.tsx`
- `apps/web/src/admin/AdminPaymentsPage.tsx`
- `apps/web/src/admin/AdminDisputesPage.tsx` (split out)
- `apps/web/src/admin/AdminAuditPage.tsx` (split out)
- `apps/web/src/admin/AdminUsersPage.tsx`
- `apps/web/src/admin/AdminAnalyticsPage.tsx`
- `apps/web/src/admin/AdminSettingsPage.tsx`

**`apps/web` new shells + helpers**
- `apps/web/src/components/supplier/SupplierShell.tsx`
- `apps/web/src/components/Footer.tsx`
- `apps/web/src/components/MobileDrawer.tsx`
- `apps/web/src/lib/admin-mock.ts` (typed mock data for admin new pages)
- `apps/web/src/lib/supplier-mock.ts` (typed mock data for supplier new pages)
- `apps/web/src/lib/route-meta.ts`

### Modified files

- `apps/web/package.json` (add Radix + CVA + lucide + cmdk + tailwind-merge + clsx deps)
- `apps/web/tailwind.config.ts` (extend theme per spec §2.2)
- `apps/web/postcss.config.js` (no change unless tailwindcss-animate removed)
- `apps/web/index.html` (Google Fonts links, favicon, title)
- `apps/web/src/index.css` (replace per spec §2.3)
- `apps/web/src/main.tsx` (wrap ToastProvider, mount Geist font CSS)
- `apps/web/src/App.tsx` (add new routes)
- `apps/web/src/components/Layout.tsx` (full redesign)
- `apps/web/src/components/ui.tsx` (re-export barrel only, or delete after migration)
- `apps/web/src/components/icons.tsx` (delete)
- `apps/web/src/admin/Shell.tsx` (redesign)
- `apps/web/src/admin/icons.tsx` (delete)
- `apps/web/src/admin/LoginPage.tsx` (redesign)
- `apps/web/src/admin/HomePage.tsx` (delete — replaced by AdminDashboardPage routed at `/admin`)
- `apps/web/src/admin/Lists.tsx` (split into AdminBusinessesPage + AdminSuppliersPage)
- `apps/web/src/admin/DisputedAndAudit.tsx` (split into AdminDisputesPage + AdminAuditPage)
- `apps/web/src/pages/HomePage.tsx` (redesign)
- `apps/web/src/pages/LoginPage.tsx` (redesign)
- `apps/web/src/pages/SignupPage.tsx` (redesign)
- `apps/web/src/pages/BusinessOnboardingPage.tsx` (redesign)
- `apps/web/src/pages/SupplierOnboardingPage.tsx` (redesign)
- `apps/web/src/pages/SearchPage.tsx` (redesign)
- `apps/web/src/pages/ProductDetailPage.tsx` (redesign)
- `apps/web/src/pages/CartPage.tsx` (redesign)
- `apps/web/src/pages/CheckoutPage.tsx` (redesign)
- `apps/web/src/pages/OrdersPage.tsx` (redesign)
- `apps/web/src/pages/OrderDetailPage.tsx` (redesign)
- `apps/web/src/pages/SupplierOrdersPage.tsx` (redesign)
- `apps/web/src/pages/ProfilePage.tsx` (redesign)

### Deleted files

- `apps/web/src/components/icons.tsx`
- `apps/web/src/admin/icons.tsx`
- `apps/web/src/admin/HomePage.tsx`
- `apps/web/src/components/ui.tsx` (after migration to packages/ui)

---

## Phase 1 — Foundation

Tokens, fonts, logo, the entire `packages/ui` primitive library, and the consumer barrel in `apps/web`. After this phase, every later phase can consume components and tokens without re-implementing them.

### Task 1.1: Extend Tailwind theme with design tokens

**Files:**
- Modify: `apps/web/tailwind.config.ts` (full rewrite of theme block)

**Interfaces:**
- Produces: Tailwind utility classes for ink/pearl/paper/line/cyan/amber/rose/mint/violet/midnight colors; display-xl/lg/md/sm + caption font sizes; xs/sm/md/lg/xl border radii; shadow-1/2/3/glow/inset-line; 80/140/200/320/480 transition durations; standard easing; xs/2xl/3xl max widths.

- [ ] **Step 1: Read current tailwind config**

Run: `cat apps/web/tailwind.config.ts`

- [ ] **Step 2: Replace theme.extend block**

Replace the entire `theme.extend` block with the spec content below. Keep `content` array unchanged.

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 1: '#0A0B10', 2: '#1A1D26', 3: '#5A606E', 4: '#9098A4' },
        pearl: '#F6F7F9',
        paper: '#FFFFFF',
        line: { DEFAULT: '#E6E8EE', soft: '#EFF1F5' },
        cyan: { DEFAULT: '#5EE2FF', deep: '#0FB5D7', glow: 'rgba(94,226,255,0.20)', 'glow-strong': 'rgba(94,226,255,0.40)' },
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
        caption: ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.04em', fontWeight: '500' }],
      },
      borderRadius: { xs: '6px', sm: '10px', md: '14px', lg: '20px', xl: '28px' },
      boxShadow: {
        1: '0 1px 0 rgba(10,11,16,0.04), 0 1px 2px rgba(10,11,16,0.04)',
        2: '0 2px 4px rgba(10,11,16,0.04), 0 8px 24px rgba(10,11,16,0.06)',
        3: '0 12px 40px rgba(10,11,16,0.10), 0 4px 12px rgba(10,11,16,0.06)',
        glow: '0 0 0 1px rgba(94,226,255,0.40), 0 8px 32px rgba(94,226,255,0.18)',
        'inset-line': 'inset 0 -1px 0 rgba(10,11,16,0.06)',
      },
      transitionDuration: { 80: '80ms', 140: '140ms', 200: '200ms', 320: '320ms', 480: '480ms' },
      transitionTimingFunction: { standard: 'cubic-bezier(0.2, 0, 0, 1)' },
      maxWidth: { xs: '480px', '2xl': '1400px', '3xl': '1600px' },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Verify build still passes**

Run: `cd apps/web && pnpm typecheck`
Expected: typecheck succeeds (no consumer changes yet, but config must be valid).

- [ ] **Step 4: Commit**

```bash
git add apps/web/tailwind.config.ts
git commit -m "feat(design): extend tailwind theme with VYRO Cinematic Tech tokens"
```

### Task 1.2: Add Geist + Geist Mono via Google Fonts CDN

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/index.css`

**Interfaces:**
- Produces: `<link>` tags preconnecting Google Fonts and loading the Geist families. CSS preconnect optimization. Body font-feature settings for Geist.

- [ ] **Step 1: Update index.html**

In `apps/web/index.html`, in the `<head>` section, after the existing `<meta name="viewport" ...>` and before `<title>`, add the font links. Final head should look like:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/brand/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
    />
    <title>VYRO — B2B Procurement</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Replace index.css with token-driven base styles**

Replace the entire contents of `apps/web/src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    color-scheme: light;
    --ink: #0A0B10;
    --ink-2: #1A1D26;
    --ink-3: #5A606E;
    --ink-4: #9098A4;
    --pearl: #F6F7F9;
    --paper: #FFFFFF;
    --line: #E6E8EE;
    --line-soft: #EFF1F5;
    --cyan: #5EE2FF;
    --cyan-deep: #0FB5D7;
    --cyan-glow: rgba(94, 226, 255, 0.20);
    --cyan-glow-strong: rgba(94, 226, 255, 0.40);
    --amber: #F5B544;
    --rose: #F25C6A;
    --mint: #1FB28A;
    --violet: #9B7EF5;
    --midnight: #0A0B10;
    --midnight-2: #12141A;
    --midnight-3: #1A1D26;
    --r-xs: 6px;
    --r-sm: 10px;
    --r-md: 14px;
    --r-lg: 20px;
    --r-xl: 28px;
    --dur-instant: 80ms;
    --dur-fast: 140ms;
    --dur-base: 200ms;
    --dur-slow: 320ms;
    --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  }

  html,
  body {
    @apply bg-pearl text-ink-2 antialiased font-sans;
  }

  body {
    font-feature-settings: "cv02", "cv03", "cv04", "cv11", "ss01";
    text-rendering: optimizeLegibility;
    min-height: 100vh;
  }

  ::selection {
    background: var(--cyan-glow);
    color: var(--ink);
  }

  *:focus-visible {
    outline: none;
  }
}

@layer utilities {
  .num-tabular {
    font-variant-numeric: tabular-nums;
  }
  .text-balance {
    text-wrap: balance;
  }
  .text-pretty {
    text-wrap: pretty;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 80ms !important;
    transition-duration: 80ms !important;
  }
}
```

- [ ] **Step 3: Verify font request works in dev**

Run: `cd apps/web && pnpm dev` (background). Then: `curl -s http://localhost:5173/ | grep fonts.googleapis.com`
Expected: HTML response includes the Google Fonts `<link>`.
Stop the dev server: TaskStop the background task.

- [ ] **Step 4: Commit**

```bash
git add apps/web/index.html apps/web/src/index.css
git commit -m "feat(design): load Geist + Geist Mono via Google Fonts CDN"
```

### Task 1.3: Create V logo SVG files

**Files:**
- Create: `apps/web/public/brand/logo.svg`
- Create: `apps/web/public/brand/logo-dark.svg`
- Create: `apps/web/public/brand/favicon.svg`

**Interfaces:**
- Produces: Three SVG files referenced by Logo component, header, footer, index.html favicon.

- [ ] **Step 1: Create logo.svg (midnight tile, cyan notch)**

`apps/web/public/brand/logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
  <rect width="96" height="96" rx="20" fill="#0A0B10"/>
  <path d="M22 26 L46 70 L48 70 L72 26 L62 26 L48 56 L34 26 Z" fill="#F6F7F9"/>
  <rect x="44" y="52" width="8" height="22" rx="2" fill="#5EE2FF"/>
</svg>
```

- [ ] **Step 2: Create logo-dark.svg (pearl tile, cyan notch)**

`apps/web/public/brand/logo-dark.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" fill="none">
  <rect width="96" height="96" rx="20" fill="#F6F7F9"/>
  <path d="M22 26 L46 70 L48 70 L72 26 L62 26 L48 56 L34 26 Z" fill="#0A0B10"/>
  <rect x="44" y="52" width="8" height="22" rx="2" fill="#0FB5D7"/>
</svg>
```

- [ ] **Step 3: Create favicon.svg (mark only, 32x32)**

`apps/web/public/brand/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="7" fill="#0A0B10"/>
  <path d="M7 9 L15 23 L17 23 L25 9 L21 9 L16 19 L11 9 Z" fill="#F6F7F9"/>
  <rect x="14.5" y="17" width="3" height="7" rx="1" fill="#5EE2FF"/>
</svg>
```

- [ ] **Step 4: Verify SVGs render in browser**

Run: `cd apps/web && pnpm dev` (background). Visit `http://localhost:5173/brand/logo.svg`, `/brand/logo-dark.svg`, `/brand/favicon.svg` — each should render the SVG cleanly.
Stop the dev server.

- [ ] **Step 5: Commit**

```bash
mkdir -p apps/web/public/brand
git add apps/web/public/brand/
git commit -m "feat(brand): add V monogram logo SVGs (light, dark, favicon)"
```

### Task 1.4: Create cn() helper

**Files:**
- Create: `apps/web/src/lib/cn.ts`
- Create: `packages/ui/src/lib/cn.ts`

**Interfaces:**
- Produces: `cn(...inputs)` function that merges class names using clsx + tailwind-merge.

- [ ] **Step 1: Add dependencies to apps/web**

In `apps/web/package.json` `dependencies` block, add:

```json
"clsx": "^2.1.1",
"tailwind-merge": "^2.5.4"
```

Then run: `pnpm install`

- [ ] **Step 2: Create apps/web/src/lib/cn.ts**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Create packages/ui/src/lib/cn.ts**

Same as above — duplicate the file:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && pnpm typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/lib/cn.ts packages/ui/src/lib/cn.ts pnpm-lock.yaml
git commit -m "feat(design): add cn() helper using clsx + tailwind-merge"
```

### Task 1.5: Create packages/ui barrel + tokens.ts

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/src/index.ts`
- Create: `packages/ui/src/tokens.ts`

**Interfaces:**
- Produces: A real barrel export (replacing `export {};`). Tokens module re-exporting hex values for TS consumers.

- [ ] **Step 1: Update packages/ui/package.json**

Ensure the `dependencies` block has (add missing): `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-select`, `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `@radix-ui/react-tooltip`, `@radix-ui/react-popover`, `@radix-ui/react-checkbox`, `@radix-ui/react-switch`, `@radix-ui/react-radio-group`, `cmdk`. The file already declares these per spec §14; verify and add missing ones.

Final dependencies block:

```json
{
  "dependencies": {
    "@radix-ui/react-checkbox": "^1.1.2",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-popover": "^1.1.2",
    "@radix-ui/react-radio-group": "^1.2.1",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-tooltip": "^1.1.4",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "cmdk": "^1.0.4",
    "lucide-react": "^0.456.0",
    "tailwind-merge": "^2.5.4"
  }
}
```

- [ ] **Step 2: Run install**

Run: `pnpm install`

- [ ] **Step 3: Add @vyro/ui as dependency of apps/web**

In `apps/web/package.json` `dependencies`, add `"@vyro/ui": "workspace:*"`.

Run: `pnpm install`

- [ ] **Step 4: Create packages/ui/src/tokens.ts**

```ts
export const tokens = {
  color: {
    ink: { 1: '#0A0B10', 2: '#1A1D26', 3: '#5A606E', 4: '#9098A4' },
    pearl: '#F6F7F9',
    paper: '#FFFFFF',
    line: { DEFAULT: '#E6E8EE', soft: '#EFF1F5' },
    cyan: { DEFAULT: '#5EE2FF', deep: '#0FB5D7', glow: 'rgba(94,226,255,0.20)', glowStrong: 'rgba(94,226,255,0.40)' },
    amber: '#F5B544',
    rose: '#F25C6A',
    mint: '#1FB28A',
    violet: '#9B7EF5',
    midnight: { 1: '#0A0B10', 2: '#12141A', 3: '#1A1D26' },
  },
  radius: { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, full: 9999 },
  duration: { instant: 80, fast: 140, base: 200, slow: 320, slower: 480 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;

export type Tokens = typeof tokens;
```

- [ ] **Step 5: Create packages/ui/src/index.ts (placeholder barrel — fully populated in later tasks)**

```ts
// Components are added task-by-task. Final barrel exported at end of Phase 1.
export { tokens } from './tokens';
export type { Tokens } from './tokens';
export { cn } from './lib/cn';
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/package.json packages/ui/src/index.ts packages/ui/src/tokens.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(ui): scaffold packages/ui with tokens + barrel + deps"
```

### Task 1.6: Button component

**Files:**
- Create: `packages/ui/src/components/Button.tsx`
- Create: `packages/ui/src/__tests__/Button.test.tsx`

**Interfaces:**
- Produces: `<Button>` with variants: primary | secondary | ghost | outline | danger | success | link; sizes: xs | sm | md | lg | xl; loading: boolean; asChild: boolean.

- [ ] **Step 1: Write failing test**

`packages/ui/src/__tests__/Button.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '../components/Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies variant and size classes', () => {
    render(<Button variant="primary" size="md">Go</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-cyan');
    expect(btn.className).toContain('h-10');
  });

  it('shows spinner when loading and disables', () => {
    render(<Button loading>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('svg')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/ui && pnpm test Button`
Expected: FAIL — Button module not found.

- [ ] **Step 3: Implement Button**

`packages/ui/src/components/Button.tsx`:

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none transition-all duration-140 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-pearl disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-cyan text-ink-1 hover:bg-cyan-deep hover:text-paper hover:shadow-glow border border-transparent',
        secondary: 'bg-paper text-ink-1 border border-line hover:border-ink-3 hover:shadow-2',
        ghost: 'bg-transparent text-ink-3 hover:bg-line-soft hover:text-ink-1 border border-transparent shadow-none',
        outline: 'bg-transparent text-ink-1 border border-line hover:border-cyan-deep hover:bg-cyan/5',
        danger: 'bg-rose text-paper hover:bg-rose/90 hover:shadow-2 border border-transparent',
        success: 'bg-mint text-paper hover:bg-mint/90 hover:shadow-2 border border-transparent',
        link: 'bg-transparent text-ink-1 underline-offset-4 hover:underline hover:text-cyan-deep border border-transparent shadow-none px-0',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs rounded-xs',
        sm: 'h-8 px-3 text-xs rounded-sm',
        md: 'h-10 px-4 text-sm rounded-sm',
        lg: 'h-12 px-5 text-sm rounded-md',
        xl: 'h-14 px-6 text-base rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : children}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/ui && pnpm test Button`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Button.tsx packages/ui/src/__tests__/Button.test.tsx
git commit -m "feat(ui): Button primitive with 7 variants x 5 sizes + loading"
```

### Task 1.7: IconButton component

**Files:**
- Create: `packages/ui/src/components/IconButton.tsx`
- Create: `packages/ui/src/__tests__/IconButton.test.tsx`

**Interfaces:**
- Produces: `<IconButton>` square button for icon-only actions. Sizes sm 32, md 40, lg 48. Inherits variant from Button (without link variant).

- [ ] **Step 1: Write failing test**

`packages/ui/src/__tests__/IconButton.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import { IconButton } from '../components/IconButton';

describe('IconButton', () => {
  it('renders icon and applies aria-label', () => {
    render(<IconButton aria-label="Search"><Search /></IconButton>);
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  it('is square at given size', () => {
    render(<IconButton size="md" aria-label="X"><span /></IconButton>);
    expect(screen.getByRole('button').className).toContain('size-10');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd packages/ui && pnpm test IconButton`

- [ ] **Step 3: Implement IconButton**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const iconButtonVariants = cva(
  'inline-flex items-center justify-center rounded-sm transition-all duration-140 ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-pearl disabled:pointer-events-none disabled:opacity-50 active:scale-[0.96] [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-cyan text-ink-1 hover:bg-cyan-deep hover:text-paper hover:shadow-glow',
        secondary: 'bg-paper text-ink-2 border border-line hover:border-ink-3 hover:shadow-2',
        ghost: 'bg-transparent text-ink-3 hover:bg-line-soft hover:text-ink-1',
        outline: 'bg-transparent text-ink-2 border border-line hover:border-cyan-deep hover:bg-cyan/5',
      },
      size: {
        sm: 'size-8',
        md: 'size-10',
        lg: 'size-12',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  }
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(iconButtonVariants({ variant, size }), className)} {...props} />
  )
);
IconButton.displayName = 'IconButton';

export { iconButtonVariants };
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd packages/ui && pnpm test IconButton`

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/IconButton.tsx packages/ui/src/__tests__/IconButton.test.tsx
git commit -m "feat(ui): IconButton primitive (square, 3 sizes, 4 variants)"
```

### Task 1.8: Input component

**Files:**
- Create: `packages/ui/src/components/Input.tsx`
- Create: `packages/ui/src/__tests__/Input.test.tsx`

**Interfaces:**
- Produces: `<Input>` with sizes sm | md, error state, left/right slots.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from '../components/Input';

describe('Input', () => {
  it('renders with placeholder', () => {
    render(<Input placeholder="Email" />);
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
  });

  it('applies error styling', () => {
    render(<Input error aria-label="Field" />);
    expect(screen.getByLabelText('Field').className).toContain('border-rose');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd packages/ui && pnpm test Input`

- [ ] **Step 3: Implement Input**

```tsx
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  size?: 'sm' | 'md';
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, size = 'md', leftSlot, rightSlot, ...props }, ref) => {
    return (
      <div className={cn('relative w-full', leftSlot || rightSlot ? 'flex items-center' : '')}>
        {leftSlot && (
          <div className="pointer-events-none absolute left-3 flex items-center text-ink-3 [&>svg]:size-4">
            {leftSlot}
          </div>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full rounded-sm border bg-paper text-sm text-ink-1 placeholder:text-ink-4',
            'transition-all duration-140 ease-standard',
            'focus:outline-none focus:border-cyan-deep focus:ring-4 focus:ring-cyan-glow',
            'disabled:cursor-not-allowed disabled:bg-line-soft disabled:text-ink-3',
            size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-3.5 text-sm',
            error ? 'border-rose focus:border-rose focus:ring-rose/20' : 'border-line',
            leftSlot ? 'pl-10' : '',
            rightSlot ? 'pr-10' : '',
            'num-tabular',
            className
          )}
          aria-invalid={error || undefined}
          {...props}
        />
        {rightSlot && (
          <div className="pointer-events-none absolute right-3 flex items-center text-ink-3 [&>svg]:size-4">
            {rightSlot}
          </div>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd packages/ui && pnpm test Input`

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Input.tsx packages/ui/src/__tests__/Input.test.tsx
git commit -m "feat(ui): Input primitive with slots, error state, focus glow"
```

### Task 1.9: Textarea component

**Files:**
- Create: `packages/ui/src/components/Textarea.tsx`
- Create: `packages/ui/src/__tests__/Textarea.test.tsx`

**Interfaces:**
- Produces: `<Textarea>` with error state, min 3 rows default.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from '../components/Textarea';

describe('Textarea', () => {
  it('renders and applies error border', () => {
    render(<Textarea error placeholder="Note" />);
    expect(screen.getByPlaceholderText('Note').className).toContain('border-rose');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

- [ ] **Step 3: Implement Textarea**

```tsx
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full rounded-sm border bg-paper px-3.5 py-2.5 text-sm text-ink-1 placeholder:text-ink-4',
        'transition-all duration-140 ease-standard',
        'focus:outline-none focus:border-cyan-deep focus:ring-4 focus:ring-cyan-glow',
        'disabled:cursor-not-allowed disabled:bg-line-soft disabled:text-ink-3',
        'resize-y min-h-20',
        error ? 'border-rose focus:border-rose focus:ring-rose/20' : 'border-line',
        className
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
```

- [ ] **Step 4: Run test, expect pass**

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Textarea.tsx packages/ui/src/__tests__/Textarea.test.tsx
git commit -m "feat(ui): Textarea primitive"
```

### Task 1.10: Select component (Radix)

**Files:**
- Create: `packages/ui/src/components/Select.tsx`
- Create: `packages/ui/src/__tests__/Select.test.tsx`

**Interfaces:**
- Produces: `<Select.Root>`, `<Select.Trigger>`, `<Select.Value>`, `<Select.Content>`, `<Select.Item>`, `<Select.Separator>`, `<Select.Label>`. Styled to match Input.

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select } from '../components/Select';

describe('Select', () => {
  it('renders trigger with placeholder', () => {
    render(
      <Select>
        <Select.Trigger placeholder="Category">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="x">Option X</Select.Item>
        </Select.Content>
      </Select>
    );
    expect(screen.getByText('Category')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

- [ ] **Step 3: Implement Select**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';

export const Select = {
  Root: RxSelect.Root,
  Group: RxSelect.Group,
  Value: RxSelect.Value,
};

export const SelectTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RxSelect.Trigger> & { placeholder?: string }
>(({ className, children, placeholder, ...props }, ref) => (
  <RxSelect.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between gap-2 rounded-sm border border-line bg-paper px-3.5 text-sm text-ink-1',
      'transition-all duration-140 ease-standard',
      'focus:outline-none focus:border-cyan-deep focus:ring-4 focus:ring-cyan-glow',
      'data-[placeholder]:text-ink-4',
      '[&>svg]:size-4 [&>svg]:text-ink-3 [&>svg]:shrink-0',
      className
    )}
    {...props}
  >
    <RxSelect.Value placeholder={placeholder} />
    <RxSelect.Icon asChild>
      <ChevronDown />
    </RxSelect.Icon>
  </RxSelect.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxSelect.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <RxSelect.Portal>
    <RxSelect.Content
      ref={ref}
      position={position}
      sideOffset={6}
      className={cn(
        'z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line bg-paper text-ink-1 shadow-2',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    >
      <RxSelect.Viewport className="p-1">{children}</RxSelect.Viewport>
    </RxSelect.Content>
  </RxSelect.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxSelect.Item>
>(({ className, children, ...props }, ref) => (
  <RxSelect.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-xs py-2 pl-8 pr-2 text-sm outline-none',
      'focus:bg-cyan/15 focus:text-ink-1',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      <RxSelect.ItemIndicator>
        <Check className="size-4 text-cyan-deep" />
      </RxSelect.ItemIndicator>
    </span>
    <RxSelect.ItemText>{children}</RxSelect.ItemText>
  </RxSelect.Item>
));
SelectItem.displayName = 'SelectItem';

export const SelectLabel = RxSelect.Label;
export const SelectSeparator = RxSelect.Separator;
```

Note: replace the file's `Select.Trigger`/`Select.Content`/`Select.Item` shorthand with re-exports so consumers can use the namespace API. Append to bottom of file:

```tsx
(Select as unknown as { Trigger: typeof SelectTrigger }).Trigger = SelectTrigger;
(Select as unknown as { Content: typeof SelectContent }).Content = SelectContent;
(Select as unknown as { Item: typeof SelectItem }).Item = SelectItem;
```

- [ ] **Step 4: Run test, expect pass**

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/Select.tsx packages/ui/src/__tests__/Select.test.tsx
git commit -m "feat(ui): Select primitive on Radix, Input-style chrome"
```

### Task 1.11: Checkbox component (Radix)

**Files:**
- Create: `packages/ui/src/components/Checkbox.tsx`
- Create: `packages/ui/src/__tests__/Checkbox.test.tsx`

**Interfaces:**
- Produces: `<Checkbox>` styled with cyan check on focus + checked.

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Checkbox } from '../components/Checkbox';

describe('Checkbox', () => {
  it('renders and toggles via click', async () => {
    render(<Checkbox aria-label="Accept" />);
    const cb = screen.getByLabelText('Accept');
    expect(cb.getAttribute('data-state')).toBe('unchecked');
    cb.click();
    expect(cb.getAttribute('data-state')).toBe('checked');
  });
});
```

- [ ] **Step 2: Implement**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxCheckbox from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../lib/cn';

export const Checkbox = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RxCheckbox.Root>
>(({ className, ...props }, ref) => (
  <RxCheckbox.Root
    ref={ref}
    className={cn(
      'peer size-5 shrink-0 rounded-xs border border-line bg-paper',
      'transition-all duration-140 ease-standard',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-pearl',
      'data-[state=checked]:bg-cyan-deep data-[state=checked]:border-cyan-deep data-[state=checked]:text-paper',
      'data-[state=indeterminate]:bg-cyan-deep data-[state=indeterminate]:border-cyan-deep data-[state=indeterminate]:text-paper',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <RxCheckbox.Indicator className="flex items-center justify-center text-current">
      <RxCheckbox.CheckedIndicator>
        <Check className="size-3.5" strokeWidth={3} />
      </RxCheckbox.CheckedIndicator>
      <RxCheckbox.IndeterminateIndicator>
        <Minus className="size-3.5" strokeWidth={3} />
      </RxCheckbox.IndeterminateIndicator>
    </RxCheckbox.Indicator>
  </RxCheckbox.Root>
));
Checkbox.displayName = 'Checkbox';
```

- [ ] **Step 3: Run test, commit**

```bash
git add packages/ui/src/components/Checkbox.tsx packages/ui/src/__tests__/Checkbox.test.tsx
git commit -m "feat(ui): Checkbox primitive on Radix"
```

### Task 1.12: Switch component (Radix)

**Files:**
- Create: `packages/ui/src/components/Switch.tsx`
- Create: `packages/ui/src/__tests__/Switch.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Switch } from '../components/Switch';

describe('Switch', () => {
  it('toggles state', () => {
    render(<Switch aria-label="Notify" />);
    const sw = screen.getByLabelText('Notify');
    expect(sw.getAttribute('data-state')).toBe('unchecked');
    sw.click();
    expect(sw.getAttribute('data-state')).toBe('checked');
  });
});
```

- [ ] **Step 2: Implement**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxSwitch from '@radix-ui/react-switch';
import { cn } from '../lib/cn';

export const Switch = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RxSwitch.Root>
>(({ className, ...props }, ref) => (
  <RxSwitch.Root
    ref={ref}
    className={cn(
      'relative h-6 w-11 shrink-0 rounded-full bg-line',
      'transition-colors duration-200 ease-standard',
      'data-[state=checked]:bg-cyan-deep',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-pearl',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <RxSwitch.Thumb
      className={cn(
        'block size-5 rounded-full bg-paper shadow-1',
        'transition-transform duration-200 ease-standard',
        'translate-x-0.5 data-[state=checked]:translate-x-[22px]'
      )}
    />
  </RxSwitch.Root>
));
Switch.displayName = 'Switch';
```

- [ ] **Step 3: Run test, commit**

```bash
git add packages/ui/src/components/Switch.tsx packages/ui/src/__tests__/Switch.test.tsx
git commit -m "feat(ui): Switch primitive on Radix"
```

### Task 1.13: RadioGroup component (Radix)

**Files:**
- Create: `packages/ui/src/components/RadioGroup.tsx`

- [ ] **Step 1: Implement**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxRadioGroup from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';
import { cn } from '../lib/cn';

export const RadioGroup = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxRadioGroup.Root>
>(({ className, ...props }, ref) => (
  <RxRadioGroup.Root ref={ref} className={cn('flex flex-col gap-2', className)} {...props} />
));
RadioGroup.displayName = 'RadioGroup';

export const RadioGroupItem = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RxRadioGroup.Item>
>(({ className, ...props }, ref) => (
  <RxRadioGroup.Item
    ref={ref}
    className={cn(
      'size-5 shrink-0 rounded-full border border-line bg-paper text-cyan-deep',
      'transition-all duration-140 ease-standard',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-pearl',
      'data-[state=checked]:border-cyan-deep',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  >
    <RxRadioGroup.Indicator className="flex items-center justify-center">
      <Circle className="size-2.5 fill-current" />
    </RxRadioGroup.Indicator>
  </RxRadioGroup.Item>
));
RadioGroupItem.displayName = 'RadioGroupItem';
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/RadioGroup.tsx
git commit -m "feat(ui): RadioGroup primitive on Radix"
```

### Task 1.14: Label component (Radix)

**Files:**
- Create: `packages/ui/src/components/Label.tsx`

- [ ] **Step 1: Implement**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxLabel from '@radix-ui/react-label';
import { cn } from '../lib/cn';

export const Label = forwardRef<
  HTMLLabelElement,
  ComponentPropsWithoutRef<typeof RxLabel.Root>
>(({ className, ...props }, ref) => (
  <RxLabel.Root
    ref={ref}
    className={cn('block text-caption uppercase text-ink-3 mb-1.5', className)}
    {...props}
  />
));
Label.displayName = 'Label';
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/Label.tsx
git commit -m "feat(ui): Label primitive (caption style)"
```

### Task 1.15: Field component (composed wrapper)

- [ ] **Step 1: Implement**

```tsx
import type { ReactNode } from 'react';
import { Label } from './Label';
import { cn } from '../lib/cn';

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  error?: ReactNode;
  help?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, help, required, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-1 text-rose">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-rose">{error}</p>
      ) : help ? (
        <p className="mt-1.5 text-xs text-ink-3">{help}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/Field.tsx
git commit -m "feat(ui): Field composed primitive"
```

### Task 1.16: Card + SectionCard components

**Files:**
- Create: `packages/ui/src/components/Card.tsx`
- Create: `packages/ui/src/components/SectionCard.tsx`

- [ ] **Step 1: Implement Card**

```tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const cardVariants = cva(
  'rounded-md border bg-paper',
  {
    variants: {
      variant: {
        default: 'border-line shadow-1',
        elevated: 'border-line shadow-2',
        outlined: 'border-line shadow-none',
        dark: 'bg-midnight-1 border-midnight-3 text-paper',
        interactive: 'border-line shadow-1 transition-all duration-200 ease-standard hover:-translate-y-px hover:shadow-2 hover:border-cyan-deep',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: { variant: 'default', padding: 'md' },
  }
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant, padding }), className)} {...props} />
  )
);
Card.displayName = 'Card';
```

- [ ] **Step 2: Implement SectionCard**

```tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface SectionCardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'light' | 'dark';
}

export const SectionCard = forwardRef<HTMLDivElement, SectionCardProps>(
  ({ className, tone = 'light', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-xl p-8',
        tone === 'dark' ? 'bg-midnight-1 text-paper border border-midnight-3' : 'bg-paper border border-line shadow-1',
        className
      )}
      {...props}
    />
  )
);
SectionCard.displayName = 'SectionCard';
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Card.tsx packages/ui/src/components/SectionCard.tsx
git commit -m "feat(ui): Card + SectionCard primitives"
```

### Task 1.17: Badge component

- [ ] **Step 1: Implement**

```tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5 text-xs font-medium leading-tight whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'bg-paper text-ink-2 border-line',
        brand: 'bg-cyan/15 text-cyan-deep border-cyan/30',
        success: 'bg-mint/12 text-mint border-mint/25',
        warning: 'bg-amber/15 text-amber border-amber/30',
        danger: 'bg-rose/12 text-rose border-rose/25',
        violet: 'bg-violet/12 text-violet border-violet/25',
        ink: 'bg-midnight-1 text-paper border-midnight-3',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, dot, children, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className={cn('size-1.5 rounded-full bg-current')} aria-hidden />}
      {children}
    </span>
  )
);
Badge.displayName = 'Badge';
```

Note: Tailwind doesn't support arbitrary opacity syntax `bg-mint/12` reliably without extending opacity scale. Add this to tailwind config (already done via `opacity` defaults but `12` is non-standard; we'll use `bg-mint/15` in the badge styles). Adjust badge variants to use values from the default opacity scale:

```tsx
success: 'bg-mint/15 text-mint border-mint/30',
danger: 'bg-rose/15 text-rose border-rose/30',
violet: 'bg-violet/15 text-violet border-violet/30',
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/Badge.tsx
git commit -m "feat(ui): Badge primitive with 7 variants + dot"
```

### Task 1.18: StatusBadge component

- [ ] **Step 1: Implement**

```tsx
import { Badge, type BadgeProps } from './Badge';
import { cn } from '../lib/cn';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'in_transit'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'disputed';

const STATUS_MAP: Record<OrderStatus, { variant: BadgeProps['variant']; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  accepted: { variant: 'brand', label: 'Accepted' },
  confirmed: { variant: 'brand', label: 'Confirmed' },
  preparing: { variant: 'violet', label: 'Preparing' },
  ready_for_pickup: { variant: 'violet', label: 'Ready for pickup' },
  out_for_delivery: { variant: 'violet', label: 'Out for delivery' },
  in_transit: { variant: 'violet', label: 'In transit' },
  shipped: { variant: 'violet', label: 'Shipped' },
  delivered: { variant: 'success', label: 'Delivered' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'neutral', label: 'Cancelled' },
  rejected: { variant: 'neutral', label: 'Rejected' },
  disputed: { variant: 'danger', label: 'Disputed' },
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const cfg = STATUS_MAP[status];
  const isDisputed = status === 'disputed';
  return (
    <Badge variant={cfg.variant} className={className}>
      <span
        className={cn(
          'size-1.5 rounded-full bg-current',
          isDisputed && 'animate-pulse'
        )}
        aria-hidden
      />
      {cfg.label}
    </Badge>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/StatusBadge.tsx
git commit -m "feat(ui): StatusBadge mapping 13 order statuses"
```

### Task 1.19: Table component

- [ ] **Step 1: Implement**

```tsx
import { forwardRef, type HTMLAttributes, type ThHTMLAttributes, type TdHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto rounded-md border border-line bg-paper">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

export const THead = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        'sticky top-0 z-10 bg-paper/95 backdrop-blur-md border-b border-line',
        className
      )}
      {...props}
    />
  )
);
THead.displayName = 'THead';

export const TBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('', className)} {...props} />
);
TBody.displayName = 'TBody';

export const TR = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-line-soft last:border-b-0 transition-colors duration-140',
        'hover:bg-line-soft/60 data-[state=selected]:bg-cyan/10',
        className
      )}
      {...props}
    />
  )
);
TR.displayName = 'TR';

export const TH = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-4 text-left align-middle text-xs font-medium uppercase tracking-wide text-ink-3 num-tabular',
        className
      )}
      {...props}
    />
  )
);
TH.displayName = 'TH';

export const TD = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('px-4 py-3 align-middle text-sm text-ink-2 num-tabular', className)}
      {...props}
    />
  )
);
TD.displayName = 'TD';
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/Table.tsx
git commit -m "feat(ui): Table primitive with sticky header + tabular nums"
```

### Task 1.20: Tabs component (Radix)

- [ ] **Step 1: Implement**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxTabs from '@radix-ui/react-tabs';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

export const Tabs = RxTabs.Root;

const tabsListVariants = cva('flex items-center', {
  variants: {
    variant: {
      underline: 'gap-6 border-b border-line',
      pill: 'gap-1 p-1 rounded-md bg-line-soft',
    },
  },
  defaultVariants: { variant: 'underline' },
});

export const TabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxTabs.List> & VariantProps<typeof tabsListVariants>
>(({ className, variant, ...props }, ref) => (
  <RxTabs.List ref={ref} className={cn(tabsListVariants({ variant }), className)} {...props} />
));
TabsList.displayName = 'TabsList';

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 ease-standard focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        underline:
          'relative pb-3 text-sm font-medium text-ink-3 hover:text-ink-1 data-[state=active]:text-ink-1 data-[state=active]:after:absolute data-[state=active]:after:bottom-[-1px] data-[state=active]:after:left-0 data-[state=active]:after:right-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-cyan data-[state=active]:after:rounded-full',
        pill:
          'h-8 px-3 rounded-sm text-sm font-medium text-ink-3 hover:text-ink-1 data-[state=active]:bg-paper data-[state=active]:text-ink-1 data-[state=active]:shadow-1',
      },
    },
    defaultVariants: { variant: 'underline' },
  }
);

export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RxTabs.Trigger> & VariantProps<typeof tabsTriggerVariants>
>(({ className, variant, ...props }, ref) => (
  <RxTabs.Trigger ref={ref} className={cn(tabsTriggerVariants({ variant }), className)} {...props} />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxTabs.Content>
>(({ className, ...props }, ref) => (
  <RxTabs.Content
    ref={ref}
    className={cn('mt-4 focus-visible:outline-none animate-in fade-in-0 duration-200', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/Tabs.tsx
git commit -m "feat(ui): Tabs primitive (underline + pill variants)"
```

### Task 1.21: Dialog component (Radix modal)

- [ ] **Step 1: Implement**

```tsx
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import * as RxDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export const Dialog = {
  Root: RxDialog.Root,
  Trigger: RxDialog.Trigger,
  Close: RxDialog.Close,
  Portal: RxDialog.Portal,
};

export const DialogOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RxDialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-midnight-1/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof RxDialog.Content> {
  size?: 'sm' | 'md' | 'lg';
  title?: ReactNode;
  description?: ReactNode;
}

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, size = 'md', title, description, ...props }, ref) => {
    const widthClass = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
    return (
      <Dialog.Portal>
        <DialogOverlay />
        <RxDialog.Content
          ref={ref}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-line bg-paper p-6 shadow-3',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
            widthClass,
            className
          )}
          {...props}
        >
          {(title || description) && (
            <div className="flex flex-col gap-1.5">
              {title && (
                <RxDialog.Title className="text-h2 font-semibold text-ink-1">{title}</RxDialog.Title>
              )}
              {description && (
                <RxDialog.Description className="text-body-sm text-ink-3">{description}</RxDialog.Description>
              )}
            </div>
          )}
          {children}
          <RxDialog.Close
            className="absolute right-4 top-4 size-8 inline-flex items-center justify-center rounded-sm text-ink-3 transition-colors duration-140 hover:bg-line-soft hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
            aria-label="Close"
          >
            <X className="size-4" />
          </RxDialog.Close>
        </RxDialog.Content>
      </Dialog.Portal>
    );
  }
);
DialogContent.displayName = 'DialogContent';
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/Dialog.tsx
git commit -m "feat(ui): Dialog modal primitive on Radix"
```

### Task 1.22: Drawer component

- [ ] **Step 1: Implement**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export const Drawer = {
  Root: RxDialog.Root,
  Trigger: RxDialog.Trigger,
  Close: RxDialog.Close,
  Portal: RxDialog.Portal,
};

export const DrawerOverlay = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RxDialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-midnight-1/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className
    )}
    {...props}
  />
));
DrawerOverlay.displayName = 'DrawerOverlay';

export interface DrawerContentProps extends ComponentPropsWithoutRef<typeof RxDialog.Content> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'full';
}

export const DrawerContent = forwardRef<HTMLDivElement, DrawerContentProps>(
  ({ className, children, title, description, width = 'md', ...props }, ref) => {
    const widthClass =
      width === 'sm'
        ? 'w-full max-w-sm'
        : width === 'lg'
        ? 'w-full max-w-2xl'
        : width === 'full'
        ? 'w-full max-w-full sm:max-w-md'
        : 'w-full max-w-md';
    return (
      <Drawer.Portal>
        <DrawerOverlay />
        <RxDialog.Content
          ref={ref}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full flex-col gap-4 border-l border-line bg-paper shadow-3',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-240',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
            widthClass,
            className
          )}
          {...props}
        >
          {(title || description) && (
            <div className="flex flex-col gap-1 border-b border-line p-6 pb-4">
              {title && (
                <RxDialog.Title className="text-h2 font-semibold text-ink-1">{title}</RxDialog.Title>
              )}
              {description && (
                <RxDialog.Description className="text-body-sm text-ink-3">{description}</RxDialog.Description>
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6">{children}</div>
          <RxDialog.Close
            className="absolute right-4 top-4 size-8 inline-flex items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-line-soft hover:text-ink-1"
            aria-label="Close"
          >
            <X className="size-4" />
          </RxDialog.Close>
        </RxDialog.Content>
      </Drawer.Portal>
    );
  }
);
DrawerContent.displayName = 'DrawerContent';
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/Drawer.tsx
git commit -m "feat(ui): Drawer (right-side slide-in) primitive"
```

### Task 1.23: Popover, Tooltip, DropdownMenu (Radix primitives — combined)

- [ ] **Step 1: Implement Popover**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxPopover from '@radix-ui/react-popover';
import { cn } from '../lib/cn';

export const Popover = {
  Root: RxPopover.Root,
  Trigger: RxPopover.Trigger,
  Anchor: RxPopover.Anchor,
};

export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxPopover.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <RxPopover.Portal>
    <RxPopover.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-md border border-line bg-paper p-4 shadow-2 text-sm',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        className
      )}
      {...props}
    />
  </RxPopover.Portal>
));
PopoverContent.displayName = 'PopoverContent';
```

- [ ] **Step 2: Implement Tooltip**

```tsx
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import * as RxTooltip from '@radix-ui/react-tooltip';
import { cn } from '../lib/cn';

export function TooltipProvider({ children, delayDuration = 200 }: { children: ReactNode; delayDuration?: number }) {
  return <RxTooltip.Provider delayDuration={delayDuration}>{children}</RxTooltip.Provider>;
}

export const Tooltip = RxTooltip.Root;
export const TooltipTrigger = RxTooltip.Trigger;

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxTooltip.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <RxTooltip.Portal>
    <RxTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-xs bg-midnight-1 px-2.5 py-1 text-xs text-paper',
        'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0',
        className
      )}
      {...props}
    />
  </RxTooltip.Portal>
));
TooltipContent.displayName = 'TooltipContent';
```

- [ ] **Step 3: Implement DropdownMenu**

```tsx
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RxDropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export const DropdownMenu = {
  Root: RxDropdownMenu.Root,
  Trigger: RxDropdownMenu.Trigger,
  Group: RxDropdownMenu.Group,
  Portal: RxDropdownMenu.Portal,
  Sub: RxDropdownMenu.Sub,
  RadioGroup: RxDropdownMenu.RadioGroup,
};

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxDropdownMenu.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <RxDropdownMenu.Portal>
    <RxDropdownMenu.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[180px] overflow-hidden rounded-md border border-line bg-paper p-1 shadow-2 text-sm',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1',
        className
      )}
      {...props}
    />
  </RxDropdownMenu.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxDropdownMenu.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <RxDropdownMenu.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-xs px-2.5 py-2 text-sm outline-none',
      'focus:bg-line-soft focus:text-ink-1',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      '[&>svg]:size-4 [&>svg]:text-ink-3',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxDropdownMenu.Label>
>(({ className, ...props }, ref) => (
  <RxDropdownMenu.Label
    ref={ref}
    className={cn('px-2.5 py-1.5 text-caption uppercase text-ink-3', className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxDropdownMenu.Separator>
>(({ className, ...props }, ref) => (
  <RxDropdownMenu.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-line-soft', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export const DropdownMenuCheckboxItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RxDropdownMenu.CheckboxItem>
>(({ className, children, ...props }, ref) => (
  <RxDropdownMenu.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-xs py-2 pl-8 pr-2.5 text-sm outline-none',
      'focus:bg-line-soft',
      className
    )}
    {...props}
  >
    <span className="absolute left-2.5 flex size-4 items-center justify-center">
      <RxDropdownMenu.ItemIndicator>
        <Check className="size-4 text-cyan-deep" />
      </RxDropdownMenu.ItemIndicator>
    </span>
    {children}
  </RxDropdownMenu.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/Popover.tsx packages/ui/src/components/Tooltip.tsx packages/ui/src/components/DropdownMenu.tsx
git commit -m "feat(ui): Popover, Tooltip, DropdownMenu primitives on Radix"
```

### Task 1.24: Toast (Radix + provider + imperative API)

**Files:**
- Create: `packages/ui/src/components/Toast.tsx`
- Create: `apps/web/src/components/ToastProvider.tsx` (web-specific wrapper that mounts in main.tsx)

- [ ] **Step 1: Implement Toast UI primitives**

```tsx
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import * as RxToast from '@radix-ui/react-toast';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

export const ToastProvider = RxToast.Provider;
export const ToastViewport = forwardRef<
  HTMLOListElement,
  ComponentPropsWithoutRef<typeof RxToast.Viewport>
>(({ className, ...props }, ref) => (
  <RxToast.Viewport
    ref={ref}
    className={cn(
      'fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2 outline-none',
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = 'ToastViewport';

const toastVariants = cva(
  'relative flex w-full items-start gap-3 overflow-hidden rounded-md border bg-paper p-4 shadow-2',
  {
    variants: {
      tone: {
        info: 'border-cyan/30 [&_.icon]:text-cyan-deep',
        success: 'border-mint/30 [&_.icon]:text-mint',
        warning: 'border-amber/30 [&_.icon]:text-amber',
        error: 'border-rose/30 [&_.icon]:text-rose',
      },
    },
    defaultVariants: { tone: 'info' },
  }
);

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
} as const;

export interface ToastProps
  extends ComponentPropsWithoutRef<typeof RxToast.Root>,
    VariantProps<typeof toastVariants> {
  title: ReactNode;
  description?: ReactNode;
}

export const Toast = forwardRef<HTMLLIElement, ToastProps>(
  ({ className, tone = 'info', title, description, ...props }, ref) => {
    const Icon = ICONS[tone ?? 'info'];
    return (
      <RxToast.Root
        ref={ref}
        className={cn(
          toastVariants({ tone }),
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full data-[state=open]:fade-in-0 data-[state=open]:duration-200',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full',
          className
        )}
        {...props}
      >
        <Icon className="icon size-5 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <RxToast.Title className="text-sm font-semibold text-ink-1">{title}</RxToast.Title>
          {description && (
            <RxToast.Description className="mt-0.5 text-xs text-ink-3">{description}</RxToast.Description>
          )}
        </div>
        <RxToast.Close
          className="size-6 shrink-0 inline-flex items-center justify-center rounded-xs text-ink-3 hover:bg-line-soft hover:text-ink-1"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </RxToast.Close>
      </RxToast.Root>
    );
  }
);
Toast.displayName = 'Toast';
```

- [ ] **Step 2: Create imperative toast() function + provider hook**

Append to same file:

```tsx
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

type ToastTone = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  title: ReactNode;
  description?: ReactNode;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (opts: { title: ReactNode; description?: ReactNode; tone?: ToastTone; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastContextProvider');
  return ctx;
}

export function ToastContextProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback(
    ({
      title,
      description,
      tone = 'info',
      duration = 5000,
    }: {
      title: ReactNode;
      description?: ReactNode;
      tone?: ToastTone;
      duration?: number;
    }) => {
      const id = ++counter.current;
      setItems((prev) => [...prev, { id, title, description, tone }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, duration);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ show }}>
      <ToastProvider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <Toast key={item.id} tone={item.tone} title={item.title} description={item.description} />
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export const toast = {
  info: (title: ReactNode, description?: ReactNode) => ({ title, description, tone: 'info' as const }),
  success: (title: ReactNode, description?: ReactNode) => ({ title, description, tone: 'success' as const }),
  warning: (title: ReactNode, description?: ReactNode) => ({ title, description, tone: 'warning' as const }),
  error: (title: ReactNode, description?: ReactNode) => ({ title, description, tone: 'error' as const }),
};
```

Usage pattern: components call `useToast().show(toast.success('Saved'))` from within a ToastContextProvider. The `toast` object is just a helper to build the args; it does NOT auto-show because it has no access to context. This is the standard pattern.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/Toast.tsx
git commit -m "feat(ui): Toast primitive with provider, imperative show(), 4 tones"
```

### Task 1.25: EmptyState + Skeleton + Spinner components

- [ ] **Step 1: Implement EmptyState**

```tsx
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'light' | 'dark';
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, tone = 'light', className }: EmptyStateProps) {
  const IconWrap = Icon ? (
    <div
      className={cn(
        'mx-auto flex size-16 items-center justify-center rounded-full',
        tone === 'dark' ? 'bg-cyan/20' : 'bg-cyan/15'
      )}
    >
      <Icon className="size-7 text-cyan-deep" strokeWidth={1.5} />
    </div>
  ) : null;

  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-line p-12 text-center',
        tone === 'dark' && 'bg-midnight-1 border-midnight-3 text-paper',
        className
      )}
    >
      {IconWrap}
      <h3 className={cn('mt-4 text-h2 font-semibold', tone === 'dark' ? 'text-paper' : 'text-ink-1')}>
        {title}
      </h3>
      {description && (
        <p className={cn('mx-auto mt-2 max-w-md text-sm', tone === 'dark' ? 'text-ink-4' : 'text-ink-3')}>
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Implement Skeleton**

```tsx
import { cn } from '../lib/cn';

export interface SkeletonProps {
  size?: 'text' | 'heading' | 'button' | 'avatar' | 'card' | 'tile' | 'custom';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SkeletonProps['size']>, string> = {
  text: 'h-3.5 w-full max-w-[200px]',
  heading: 'h-6 w-1/2',
  button: 'h-10 w-28',
  avatar: 'size-10 rounded-full',
  card: 'h-40 w-full',
  tile: 'h-24 w-full',
  custom: '',
};

export function Skeleton({ size = 'text', className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-sm bg-line-soft',
        'before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-cyan/20 before:to-transparent',
        'before:animate-[shimmer_1.6s_linear_infinite] before:bg-[length:200%_100%]',
        SIZE_CLASSES[size],
        className
      )}
      aria-hidden
    />
  );
}
```

Append to `apps/web/src/index.css` (still in @layer base, after the existing rules):

```css
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

Actually put it in the utilities layer so it can be referenced. Append to `apps/web/src/index.css`:

```css
@layer utilities {
  /* …existing… */
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
}
```

Update the Skeleton `before:` style to use background-position instead of transform (works with pseudo-element better):

```tsx
before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-cyan/30 before:to-transparent before:bg-[length:200%_100%] before:animate-[shimmer_1.6s_linear_infinite]
```

- [ ] **Step 3: Implement Spinner**

```tsx
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeClass = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-6' : 'size-4';
  return <Loader2 className={cn('animate-spin text-cyan-deep', sizeClass, className)} aria-hidden />;
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/EmptyState.tsx packages/ui/src/components/Skeleton.tsx packages/ui/src/components/Spinner.tsx apps/web/src/index.css
git commit -m "feat(ui): EmptyState, Skeleton, Spinner primitives"
```

### Task 1.26: Avatar + Chip + Divider + Stat + MetricTile

- [ ] **Step 1: Implement Avatar**

```tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const TONES = ['bg-cyan/20 text-cyan-deep', 'bg-mint/20 text-mint', 'bg-violet/20 text-violet', 'bg-amber/20 text-amber', 'bg-rose/20 text-rose', 'bg-midnight-1 text-paper'] as const;

function toneFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(({ className, name, size = 'md', ...props }, ref) => {
  const sizeClass = size === 'sm' ? 'size-7 text-xs' : size === 'lg' ? 'size-12 text-base' : 'size-9 text-sm';
  return (
    <span
      ref={ref}
      className={cn('inline-flex items-center justify-center rounded-full font-semibold uppercase', toneFor(name), sizeClass, className)}
      aria-label={name}
      {...props}
    >
      {initials(name)}
    </span>
  );
});
Avatar.displayName = 'Avatar';
```

- [ ] **Step 2: Implement Chip**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/cn';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  onClear?: () => void;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected, onClear, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-140 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-pearl',
        selected
          ? 'bg-cyan/15 text-cyan-deep border-cyan/40'
          : 'bg-paper text-ink-2 border-line hover:border-cyan-deep hover:bg-cyan/5',
        className
      )}
      aria-pressed={selected}
      {...props}
    >
      {children}
      {onClear && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-0.5 inline-flex size-3.5 items-center justify-center rounded-full hover:bg-cyan/20"
          aria-label="Clear"
        >
          <X className="size-3" />
        </span>
      )}
    </button>
  )
);
Chip.displayName = 'Chip';
```

- [ ] **Step 3: Implement Divider**

```tsx
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export function Divider({ className, label, ...props }: DividerProps) {
  if (!label) return <hr className={cn('border-0 h-px bg-line', className)} {...props} />;
  return (
    <div className={cn('flex items-center gap-3', className)} {...props}>
      <hr className="flex-1 border-0 h-px bg-line" />
      <span className="text-caption uppercase text-ink-3">{label}</span>
      <hr className="flex-1 border-0 h-px bg-line" />
    </div>
  );
}
```

- [ ] **Step 4: Implement Stat**

```tsx
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '../lib/cn';
import { Badge } from './Badge';

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  trailing?: ReactNode;
  className?: string;
}

export function Stat({ label, value, delta, trailing, className }: StatProps) {
  const DeltaIcon = delta?.direction === 'up' ? TrendingUp : delta?.direction === 'down' ? TrendingDown : Minus;
  const deltaTone = delta?.direction === 'up' ? 'success' : delta?.direction === 'down' ? 'danger' : 'neutral';
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-caption uppercase text-ink-3">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-display-sm font-semibold text-ink-1 num-tabular">{value}</span>
        {delta && (
          <Badge variant={deltaTone} className="text-xs">
            <DeltaIcon className="size-3" />
            {delta.value}
          </Badge>
        )}
        {trailing && <span className="text-xs text-ink-3">{trailing}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement MetricTile**

```tsx
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Stat } from './Stat';

export interface MetricTileProps {
  label: ReactNode;
  value: ReactNode;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  sparkline?: number[];
  className?: string;
}

export function MetricTile({ label, value, delta, sparkline, className }: MetricTileProps) {
  return (
    <div className={cn('rounded-md border border-line bg-paper p-5 shadow-1', className)}>
      <Stat label={label} value={value} delta={delta} />
      {sparkline && sparkline.length > 1 && (
        <Sparkline data={sparkline} className="mt-4 h-8" />
      )}
    </div>
  );
}

// Inline minimal sparkline so MetricTile is self-contained for Task 1.26.
// Task 7.1 introduces a more featured version that uses MetricTile's exported sparkline.
function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const w = 200;
  const h = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('w-full', className)} aria-hidden>
      <polyline points={points} fill="none" stroke="#5EE2FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/Avatar.tsx packages/ui/src/components/Chip.tsx packages/ui/src/components/Divider.tsx packages/ui/src/components/Stat.tsx packages/ui/src/components/MetricTile.tsx
git commit -m "feat(ui): Avatar, Chip, Divider, Stat, MetricTile primitives"
```

### Task 1.27: VMark + Logo components

- [ ] **Step 1: Implement VMark (SVG inline glyph)**

```tsx
import { cn } from '../lib/cn';

export interface VMarkProps {
  size?: number;
  className?: string;
  tone?: 'light' | 'dark';
}

export function VMark({ size = 28, className, tone = 'light' }: VMarkProps) {
  const ground = tone === 'light' ? '#0A0B10' : '#F6F7F9';
  const glyph = tone === 'light' ? '#F6F7F9' : '#0A0B10';
  const notch = tone === 'light' ? '#5EE2FF' : '#0FB5D7';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <rect width="96" height="96" rx="20" fill={ground} />
      <path d="M22 26 L46 70 L48 70 L72 26 L62 26 L48 56 L34 26 Z" fill={glyph} />
      <rect x="44" y="52" width="8" height="22" rx="2" fill={notch} />
    </svg>
  );
}
```

- [ ] **Step 2: Implement Logo (lockup: VMark + wordmark)**

```tsx
import { Link } from 'react-router-dom';
import { VMark } from './VMark';
import { cn } from '../lib/cn';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'dark';
  withWordmark?: boolean;
  to?: string;
  className?: string;
  eyebrow?: string;
}

export function Logo({ size = 'md', tone = 'light', withWordmark = true, to = '/', className, eyebrow }: LogoProps) {
  const markSize = size === 'sm' ? 24 : size === 'lg' ? 40 : 28;
  const wordClass =
    size === 'sm'
      ? 'text-sm font-semibold tracking-tight'
      : size === 'lg'
      ? 'text-xl font-semibold tracking-tight'
      : 'text-base font-semibold tracking-tight';
  const eyebrowClass =
    size === 'sm'
      ? 'text-[10px] uppercase tracking-wider font-medium'
      : 'text-caption uppercase tracking-wider font-medium';
  const inkClass = tone === 'light' ? 'text-ink-1' : 'text-paper';
  const eyebrowInk = tone === 'light' ? 'text-ink-3' : 'text-ink-4';

  const content = (
    <span className={cn('inline-flex items-center gap-2.5 group', className)}>
      <VMark size={markSize} tone={tone} />
      {withWordmark && (
        <span className="inline-flex flex-col leading-none">
          <span className={cn(wordClass, inkClass, 'group-hover:text-cyan-deep transition-colors duration-140')}>
            VYRO
          </span>
          {eyebrow && <span className={cn(eyebrowClass, eyebrowInk, 'mt-0.5')}>{eyebrow}</span>}
        </span>
      )}
    </span>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/VMark.tsx packages/ui/src/components/Logo.tsx
git commit -m "feat(ui): VMark SVG + Logo lockup component"
```

### Task 1.28: CommandMenu (cmdk-based global search palette)

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Search, Package, ShoppingCart, ClipboardList, Building2, User, BarChart3, ShieldCheck, Plus } from 'lucide-react';
import { Dialog, DialogContent } from './Dialog';
import { useAuth } from '../../apps/web/src/lib/auth';

interface CommandMenuProps {
  trigger?: ReactNode;
}

export function CommandMenu({ trigger }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      {trigger && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open command menu"
          className="inline-flex items-center gap-2 rounded-sm border border-line bg-paper/50 px-3 h-9 text-xs text-ink-3 hover:border-ink-3 transition-colors duration-140"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="ml-auto inline-flex items-center gap-0.5 rounded-xs border border-line bg-paper px-1.5 text-[10px] font-mono text-ink-3">
            ⌘K
          </kbd>
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="p-0">
          <Command label="Global search" className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-ink-3" />
              <Command.Input
                placeholder="Search products, suppliers, orders…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-ink-4"
              />
              <kbd className="text-[10px] font-mono text-ink-4">ESC</kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-ink-3">No results found.</Command.Empty>

              <Command.Group heading="Quick links" className="px-2 pb-2">
                {[
                  { icon: Package, label: 'Browse catalog', to: '/search' },
                  { icon: ShoppingCart, label: 'View cart', to: '/cart' },
                  ...(user ? [{ icon: ClipboardList, label: 'My orders', to: '/orders' }] : []),
                  ...(user?.supplierMemberships?.length ? [{ icon: Building2, label: 'Supplier orders', to: '/supplier/orders' }] : []),
                  ...(user ? [{ icon: User, label: 'Profile', to: '/profile' }] : []),
                  ...(user?.isAdmin ? [{ icon: ShieldCheck, label: 'Admin', to: '/admin' }] : []),
                ].map((it) => (
                  <Command.Item
                    key={it.to}
                    onSelect={() => go(it.to)}
                    className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-2 text-sm aria-selected:bg-cyan/15 aria-selected:text-ink-1"
                  >
                    <it.icon className="size-4 text-ink-3" />
                    {it.label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
            <div className="flex items-center justify-between border-t border-line bg-pearl px-3 py-2 text-[10px] text-ink-3">
              <span>
                <kbd className="font-mono">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="font-mono">↵</kbd> open
              </span>
              <span>
                <kbd className="font-mono">esc</kbd> close
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

Note: the `useAuth` import path crosses package boundary. To keep the package reusable, move the auth-aware menu sections out of CommandMenu and into a thin web-specific wrapper:

**Update `packages/ui/src/components/CommandMenu.tsx`** to be auth-agnostic:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { Dialog, DialogContent } from './Dialog';

export interface CommandItem {
  id: string;
  label: string;
  to: string;
  icon?: React.ComponentType<{ className?: string }>;
  group?: string;
}

export interface CommandMenuProps {
  trigger?: ReactNode;
  items?: CommandItem[];
  placeholder?: string;
}

export function CommandMenu({ trigger, items = [], placeholder = 'Search…' }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groups = items.reduce<Record<string, CommandItem[]>>((acc, item) => {
    const g = item.group ?? 'Quick links';
    acc[g] ??= [];
    acc[g].push(item);
    return acc;
  }, {});

  return (
    <>
      {trigger && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open command menu"
          className="inline-flex items-center gap-2 rounded-sm border border-line bg-paper/50 px-3 h-9 text-xs text-ink-3 hover:border-ink-3 transition-colors duration-140"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="ml-auto inline-flex items-center gap-0.5 rounded-xs border border-line bg-paper px-1.5 text-[10px] font-mono text-ink-3">
            ⌘K
          </kbd>
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="p-0">
          <Command label="Global search" className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-ink-3" />
              <Command.Input
                placeholder={placeholder}
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-ink-4"
              />
              <kbd className="text-[10px] font-mono text-ink-4">ESC</kbd>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-ink-3">No results found.</Command.Empty>
              {Object.entries(groups).map(([groupName, groupItems]) => (
                <Command.Group key={groupName} heading={groupName} className="px-2 pb-2">
                  {groupItems.map((it) => {
                    const Icon = it.icon;
                    return (
                      <Command.Item
                        key={it.id}
                        value={it.label}
                        onSelect={() => {
                          setOpen(false);
                          navigate(it.to);
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-2 text-sm aria-selected:bg-cyan/15 aria-selected:text-ink-1"
                      >
                        {Icon && <Icon className="size-4 text-ink-3" />}
                        {it.label}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/components/CommandMenu.tsx
git commit -m "feat(ui): CommandMenu primitive (cmdk + Dialog, auth-agnostic)"
```

### Task 1.29: Finalize packages/ui barrel

**Files:**
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Replace barrel with full exports**

```ts
export { cn } from './lib/cn';
export { tokens } from './tokens';
export type { Tokens } from './tokens';

export { Button, buttonVariants } from './components/Button';
export type { ButtonProps } from './components/Button';
export { IconButton, iconButtonVariants } from './components/IconButton';
export type { IconButtonProps } from './components/IconButton';
export { Input } from './components/Input';
export type { InputProps } from './components/Input';
export { Textarea } from './components/Textarea';
export type { TextareaProps } from './components/Textarea';
export { Select, SelectTrigger, SelectContent, SelectItem, SelectLabel, SelectSeparator } from './components/Select';
export { Checkbox } from './components/Checkbox';
export { Switch } from './components/Switch';
export { RadioGroup, RadioGroupItem } from './components/RadioGroup';
export { Label } from './components/Label';
export { Field } from './components/Field';
export type { FieldProps } from './components/Field';
export { Card } from './components/Card';
export type { CardProps } from './components/Card';
export { SectionCard } from './components/SectionCard';
export type { SectionCardProps } from './components/SectionCard';
export { Badge } from './components/Badge';
export type { BadgeProps } from './components/Badge';
export { StatusBadge } from './components/StatusBadge';
export type { OrderStatus } from './components/StatusBadge';
export { Table, THead, TBody, TR, TH, TD } from './components/Table';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/Tabs';
export { Dialog, DialogOverlay, DialogContent } from './components/Dialog';
export type { DialogContentProps } from './components/Dialog';
export { Drawer, DrawerOverlay, DrawerContent } from './components/Drawer';
export type { DrawerContentProps } from './components/Drawer';
export { Popover, PopoverContent } from './components/Popover';
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './components/Tooltip';
export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuCheckboxItem } from './components/DropdownMenu';
export { ToastProvider, ToastViewport, Toast, ToastContextProvider, useToast, toast } from './components/Toast';
export { EmptyState } from './components/EmptyState';
export type { EmptyStateProps } from './components/EmptyState';
export { Skeleton } from './components/Skeleton';
export type { SkeletonProps } from './components/Skeleton';
export { Spinner } from './components/Spinner';
export type { SpinnerProps } from './components/Spinner';
export { Avatar } from './components/Avatar';
export type { AvatarProps } from './components/Avatar';
export { Chip } from './components/Chip';
export type { ChipProps } from './components/Chip';
export { Divider } from './components/Divider';
export type { DividerProps } from './components/Divider';
export { Stat } from './components/Stat';
export type { StatProps } from './components/Stat';
export { MetricTile } from './components/MetricTile';
export type { MetricTileProps } from './components/MetricTile';
export { VMark } from './components/VMark';
export { Logo } from './components/Logo';
export type { LogoProps, VMarkProps } from './components/Logo';
export { CommandMenu } from './components/CommandMenu';
export type { CommandMenuProps, CommandItem } from './components/CommandMenu';
export { Sparkline } from './components/charts/Sparkline';
export { AreaChart } from './components/charts/AreaChart';
export { LineChart } from './components/charts/LineChart';
export { BarChart } from './components/charts/BarChart';
```

Note: chart components referenced in the barrel must exist. They are created in Phase 7 (Tasks 7.1–7.4). To keep the barrel valid mid-Phase 1, omit the chart exports for now and add them in Task 7.5. Adjust the barrel accordingly — remove the chart export block above.

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 3: Verify packages/ui tests pass**

Run: `cd packages/ui && pnpm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(ui): populate packages/ui barrel with all primitive exports"
```

### Task 1.30: Delete old apps/web/src/components/ui.tsx and replace with re-export

- [ ] **Step 1: Replace apps/web/src/components/ui.tsx with a thin re-export barrel**

```ts
// Re-export everything from @vyro/ui for ergonomic web-side imports.
// Prefer importing directly from '@vyro/ui' in new code.
export * from '@vyro/ui';
```

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck`
Expected: passes (existing imports of `@/components/ui` continue to work via re-export).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui.tsx
git commit -m "refactor(ui): convert apps/web components/ui.tsx to re-export @vyro/ui barrel"
```

### Task 1.31: Delete handwritten icons.tsx files and confirm lucide migration plan

**Files:**
- Delete: `apps/web/src/components/icons.tsx`
- Delete: `apps/web/src/admin/icons.tsx`

Note: deleting these files will cause existing pages to break. The migration of all usages happens in subsequent phases. To avoid breaking the build mid-Phase-1, do the deletion at the end of Phase 4 (after all page migrations are complete). For now, mark these files as deprecated and add a deprecation notice comment:

- [ ] **Step 1: Add deprecation notice to both files**

Append to top of `apps/web/src/components/icons.tsx`:

```ts
/**
 * @deprecated — icons moved to lucide-react. Will be removed at end of Phase 4.
 * Migrate consumers to lucide-react imports.
 */
```

Append to top of `apps/web/src/admin/icons.tsx`:

```ts
/**
 * @deprecated — icons moved to lucide-react. Will be removed at end of Phase 4.
 * Migrate consumers to lucide-react imports.
 */
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/icons.tsx apps/web/src/admin/icons.tsx
git commit -m "chore(ui): deprecate handwritten icons files in favor of lucide-react"
```

End of Phase 1. Verify with `pnpm typecheck && pnpm test` at the repo root.

---

## Phase 2 — Layout & Navigation

Three shells (public Layout, Admin Shell, new Supplier Shell), mobile drawer, page transitions, footer. After this phase every page lives inside a redesigned chrome.

### Task 2.1: PageTransition component

**Files:**
- Create: `apps/web/src/components/PageTransition.tsx`

**Interfaces:**
- Produces: `<PageTransition>` wrapper that fades + slides page content on route change. Uses route key to retrigger.

- [ ] **Step 1: Install framer-motion**

`apps/web/package.json` `dependencies`: add `"framer-motion": "^11.11.0"`.
Run: `pnpm install`

- [ ] **Step 2: Implement**

```tsx
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.32, ease: [0, 0, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/src/components/PageTransition.tsx pnpm-lock.yaml
git commit -m "feat(layout): add PageTransition wrapper with framer-motion"
```

### Task 2.2: Footer component

**Files:**
- Create: `apps/web/src/components/Footer.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link } from 'react-router-dom';
import { Logo } from '@vyro/ui';

const PRODUCT = [
  { to: '/search', label: 'Catalog' },
  { to: '/onboarding/business', label: 'For buyers' },
  { to: '/onboarding/supplier', label: 'For suppliers' },
];
const COMPANY = [
  { to: '/', label: 'About' },
  { to: '/', label: 'Press' },
  { to: '/', label: 'Careers' },
];
const RESOURCES = [
  { to: '/', label: 'Help center' },
  { to: '/', label: 'API docs' },
  { to: '/', label: 'Status' },
];
const LEGAL = [
  { to: '/', label: 'Privacy' },
  { to: '/', label: 'Terms' },
  { to: '/', label: 'Cookies' },
];

const COLS = [
  { title: 'Product', links: PRODUCT },
  { title: 'Company', links: COMPANY },
  { title: 'Resources', links: RESOURCES },
  { title: 'Legal', links: LEGAL },
];

export function Footer({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <footer className={dark ? 'bg-midnight-1 text-paper' : 'bg-pearl border-t border-line'}>
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div className="flex flex-col gap-4">
            <Logo tone={dark ? 'dark' : 'light'} eyebrow="Procurement platform" />
            <p className={dark ? 'text-sm text-ink-4 max-w-sm' : 'text-sm text-ink-3 max-w-sm'}>
              Everything your business needs to source, compare, and procure — from one trusted marketplace.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <h4 className="text-caption uppercase tracking-wider">{col.title}</h4>
              <ul className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className={
                        (dark ? 'text-ink-4 hover:text-paper' : 'text-ink-3 hover:text-ink-1') +
                        ' text-sm transition-colors duration-140'
                      }
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div
          className={
            (dark ? 'border-midnight-3' : 'border-line') +
            ' mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between'
          }
        >
          <p className={'text-xs ' + (dark ? 'text-ink-4' : 'text-ink-3')}>
            © {new Date().getFullYear()} VYRO. Built for procurement teams.
          </p>
          <p className={'text-xs ' + (dark ? 'text-ink-4' : 'text-ink-3')}>
            Colombo · London · Singapore
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/Footer.tsx
git commit -m "feat(layout): Footer component (4-column + midnight variant)"
```

### Task 2.3: Public Layout redesign

**Files:**
- Modify: `apps/web/src/components/Layout.tsx` (full rewrite)

**Interfaces:**
- Produces: Sticky header (translucent paper + blur), desktop nav, mobile drawer trigger, footer, page transition wrapper. Uses CommandMenu.

- [ ] **Step 1: Implement Layout**

```tsx
import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, ShoppingCart, LogOut, User as UserIcon, ChevronDown, Package } from 'lucide-react';
import { Button, Logo, CommandMenu, IconButton, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, useAuth, useToast, cn } from '@vyro/ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MobileDrawer } from './MobileDrawer';
import { Footer } from './Footer';
import { PageTransition } from './PageTransition';

const NAV_LINK = 'text-sm font-medium text-ink-3 hover:text-ink-1 transition-colors duration-140';
const NAV_LINK_ACTIVE = 'text-ink-1';

export function Layout({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const businessId = user?.memberships?.[0]?.businessId;
  const { data: cart } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ items: Array<{ id: string }> }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const cartCount = cart?.items?.length ?? 0;

  const signOut = async () => {
    await api.post('/auth/sign-out');
    await refresh();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 h-16 bg-paper/85 backdrop-blur-xl border-b border-line">
        <div className="mx-auto max-w-[1400px] h-full px-6 lg:px-10 flex items-center gap-6">
          <Logo to="/" size="md" />
          <nav className="hidden md:flex items-center gap-6 ml-2">
            <NavLink to="/search" className={({ isActive }) => cn(NAV_LINK, isActive && NAV_LINK_ACTIVE)}>
              Search
            </NavLink>
            {user && (
              <NavLink to="/orders" className={({ isActive }) => cn(NAV_LINK, isActive && NAV_LINK_ACTIVE)}>
                Orders
              </NavLink>
            )}
            {user?.supplierMemberships?.length ? (
              <NavLink to="/supplier/orders" className={({ isActive }) => cn(NAV_LINK, isActive && NAV_LINK_ACTIVE)}>
                Inbox
              </NavLink>
            ) : null}
            {user?.isAdmin ? (
              <NavLink to="/admin" className={({ isActive }) => cn(NAV_LINK, isActive && NAV_LINK_ACTIVE)}>
                Admin
              </NavLink>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <div className="hidden md:block">
              <CommandMenu />
            </div>
            <Link
              to="/cart"
              className="relative inline-flex items-center justify-center size-9 rounded-sm text-ink-3 hover:bg-line-soft hover:text-ink-1 transition-colors duration-140"
              aria-label={`Cart, ${cartCount} items`}
            >
              <ShoppingCart className="size-4" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-cyan-deep text-[10px] font-semibold text-paper num-tabular">
                  {cartCount}
                </span>
              )}
            </Link>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton aria-label="Account" size="md">
                    <UserIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="px-2.5 py-2 border-b border-line-soft">
                    <p className="text-xs font-semibold text-ink-1 truncate">{user.name || user.email}</p>
                    <p className="text-xs text-ink-3 truncate">{user.email}</p>
                  </div>
                  <DropdownMenuItem onSelect={() => navigate('/profile')}>
                    <UserIcon /> Profile
                  </DropdownMenuItem>
                  {user.supplierMemberships?.length ? (
                    <DropdownMenuItem onSelect={() => navigate('/supplier/dashboard')}>
                      <Package /> Supplier area
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={signOut}>
                    <LogOut /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="hidden md:flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button variant="primary" size="sm" asChild>
                  <Link to="/signup">Create account</Link>
                </Button>
              </div>
            )}
            <IconButton
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu />
            </IconButton>
          </div>
        </div>
      </header>

      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>

      <Footer tone="light" />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/Layout.tsx
git commit -m "feat(layout): redesign public Layout with sticky translucent header + mobile drawer trigger"
```

### Task 2.4: MobileDrawer component

**Files:**
- Create: `apps/web/src/components/MobileDrawer.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link, useNavigate } from 'react-router-dom';
import { Drawer, DrawerContent, Button, useAuth, useToast, api } from '@vyro/ui';
import { Search, ShoppingCart, ClipboardList, Package, User, LogOut } from 'lucide-react';

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const go = (to: string) => {
    onOpenChange(false);
    setTimeout(() => navigate(to), 50);
  };

  const signOut = async () => {
    await api.post('/auth/sign-out');
    await refresh();
    onOpenChange(false);
    navigate('/');
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent title="Menu" width="full">
        <nav className="flex flex-col gap-1">
          <button onClick={() => go('/search')} className="flex items-center gap-3 rounded-sm px-3 py-3 text-base font-medium text-ink-2 hover:bg-line-soft transition-colors duration-140">
            <Search className="size-4 text-ink-3" /> Search
          </button>
          <button onClick={() => go('/cart')} className="flex items-center gap-3 rounded-sm px-3 py-3 text-base font-medium text-ink-2 hover:bg-line-soft transition-colors duration-140">
            <ShoppingCart className="size-4 text-ink-3" /> Cart
          </button>
          {user && (
            <button onClick={() => go('/orders')} className="flex items-center gap-3 rounded-sm px-3 py-3 text-base font-medium text-ink-2 hover:bg-line-soft transition-colors duration-140">
              <ClipboardList className="size-4 text-ink-3" /> Orders
            </button>
          )}
          {user?.supplierMemberships?.length ? (
            <button onClick={() => go('/supplier/orders')} className="flex items-center gap-3 rounded-sm px-3 py-3 text-base font-medium text-ink-2 hover:bg-line-soft transition-colors duration-140">
              <Package className="size-4 text-ink-3" /> Supplier inbox
            </button>
          ) : null}
          {user && (
            <button onClick={() => go('/profile')} className="flex items-center gap-3 rounded-sm px-3 py-3 text-base font-medium text-ink-2 hover:bg-line-soft transition-colors duration-140">
              <User className="size-4 text-ink-3" /> Profile
            </button>
          )}
        </nav>
        <div className="mt-6 flex flex-col gap-2">
          {user ? (
            <Button variant="outline" onClick={signOut}>
              <LogOut className="size-4" /> Sign out
            </Button>
          ) : (
            <>
              <Button variant="primary" onClick={() => go('/signup')}>
                Create account
              </Button>
              <Button variant="outline" onClick={() => go('/login')}>
                Sign in
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/MobileDrawer.tsx
git commit -m "feat(layout): MobileDrawer (full-width Drawer for mobile nav)"
```

### Task 2.5: Wire ToastProvider into main.tsx

**Files:**
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Wrap App with ToastContextProvider**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { ToastContextProvider } from '@vyro/ui';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastContextProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastContextProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/main.tsx
git commit -m "feat(layout): mount ToastContextProvider in app root"
```

### Task 2.6: AdminShell redesign

**Files:**
- Modify: `apps/web/src/admin/Shell.tsx`

- [ ] **Step 1: Implement new Shell**

```tsx
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LogOut, ArrowLeft } from 'lucide-react';
import { Button, Logo, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, IconButton, useAuth, api } from '@vyro/ui';
import { useAuth as useAdminAuth } from './lib/admin-auth';
import { PageTransition } from '../components/PageTransition';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `relative inline-flex items-center pb-3 text-sm font-medium transition-colors duration-140 ${
    isActive ? 'text-paper after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-cyan after:rounded-full' : 'text-ink-4 hover:text-paper'
  }`;

export function AdminShell({ children }: { children: ReactNode }) {
  const { refresh } = useAdminAuth();
  const { user } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await api.post('/auth/sign-out');
    await refresh();
    navigate('/admin/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-pearl">
      <header className="bg-midnight-1 text-paper border-b border-midnight-3">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10 h-16 flex items-center gap-6">
          <Logo tone="dark" to="/admin" eyebrow="Admin" />
          <nav className="ml-auto hidden md:flex items-center gap-6">
            <NavLink to="/admin/suppliers" className={linkClass}>Suppliers</NavLink>
            <NavLink to="/admin/businesses" className={linkClass}>Businesses</NavLink>
            <NavLink to="/admin/disputed" className={linkClass}>Disputed</NavLink>
            <NavLink to="/admin/audit" className={linkClass}>Audit</NavLink>
          </nav>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild className="text-paper hover:bg-midnight-3">
              <Link to="/">
                <ArrowLeft className="size-3.5" /> Back to web
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton variant="ghost" aria-label="Account" className="text-paper hover:bg-midnight-3">
                  <span className="size-7 rounded-full bg-midnight-3 inline-flex items-center justify-center text-xs font-semibold">
                    {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'A'}
                  </span>
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={signOut}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/admin/Shell.tsx
git commit -m "feat(admin): redesign AdminShell with midnight ground + cyan accent"
```

### Task 2.7: SupplierShell (new)

**Files:**
- Create: `apps/web/src/components/supplier/SupplierShell.tsx`
- Create: `apps/web/src/components/supplier/useSupplierGate.tsx` (role gate)

- [ ] **Step 1: Implement useSupplierGate**

```tsx
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, EmptyState, Button, Package } from '@vyro/ui';
import { Link } from 'react-router-dom';

export function RequireSupplier({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!user) return <Navigate to={`/login?next=${location.pathname}`} replace />;
  if (!user.supplierMemberships?.length) {
    return (
      <div className="mx-auto max-w-xl py-24">
        <EmptyState
          icon={Package}
          title="Register as a supplier"
          description="Create your supplier profile to manage products, pricing, and incoming orders."
          action={
            <Button asChild>
              <Link to="/onboarding/supplier">Register supplier</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <>{children}</>;
}
```

- [ ] **Step 2: Implement SupplierShell**

```tsx
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  Package,
  DollarSign,
  Boxes,
  BarChart3,
  Users,
  Truck,
  Wallet,
  Settings,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { Button, Logo, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, IconButton, useAuth, api } from '@vyro/ui';
import { PageTransition } from '../PageTransition';
import { cn } from '@vyro/ui';

const NAV = [
  { to: '/supplier/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/supplier/orders', label: 'Orders inbox', icon: Inbox },
  { to: '/supplier/products', label: 'Products', icon: Package },
  { to: '/supplier/pricing', label: 'Pricing', icon: DollarSign },
  { to: '/supplier/inventory', label: 'Inventory', icon: Boxes },
  { to: '/supplier/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/supplier/customers', label: 'Customers', icon: Users },
  { to: '/supplier/deliveries', label: 'Deliveries', icon: Truck },
  { to: '/supplier/payments', label: 'Payments', icon: Wallet },
  { to: '/supplier/settings', label: 'Settings', icon: Settings },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors duration-140',
    'hover:bg-line-soft hover:text-ink-1',
    isActive ? 'bg-cyan/10 text-cyan-deep border border-cyan/30' : 'text-ink-3 border border-transparent'
  );

export function SupplierShell({ children }: { children: ReactNode }) {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await api.post('/auth/sign-out');
    await refresh();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex bg-pearl">
      <aside className="hidden md:flex flex-col w-64 bg-paper border-r border-line sticky top-0 h-screen">
        <div className="h-16 px-4 flex items-center border-b border-line">
          <Logo to="/supplier/dashboard" size="sm" eyebrow="Supplier" />
        </div>
        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass}>
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          <Button variant="ghost" size="sm" asChild className="w-full justify-start">
            <Link to="/">
              <ArrowLeft className="size-3.5" /> Back to web
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start mt-1">
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line h-14 px-4 flex items-center justify-between">
          <Logo to="/supplier/dashboard" size="sm" eyebrow="Supplier" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Menu">
                <Inbox />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {NAV.map((n) => (
                <DropdownMenuItem key={n.to} onSelect={() => navigate(n.to)}>
                  <n.icon className="size-4" />
                  {n.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="px-6 lg:px-10 py-10 max-w-[1400px]">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/supplier/
git commit -m "feat(supplier): SupplierShell + RequireSupplier gate (left rail + mobile menu)"
```

### Task 2.8: Add admin auth hook wrapper

**Files:**
- Create: `apps/web/src/admin/lib/admin-auth.tsx`

This wraps the existing public AuthProvider logic with an `isAdmin` check. The current `apps/web/src/admin/Shell.tsx` already imports a custom `useAuth` — provide that adapter.

- [ ] **Step 1: Implement**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

interface AdminSession {
  user: { id: string; email: string; name?: string; isAdmin: boolean } | null;
}

interface AdminAuthContextValue {
  user: AdminSession['user'];
  loading: boolean;
  refresh: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminSession['user']>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await api.get<AdminSession>('/auth/me');
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <AdminAuthContext.Provider value={{ user, loading, refresh }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Wrap admin routes in AdminAuthProvider**

In `apps/web/src/App.tsx`, wrap the `<Route path="/admin/*">` element tree with `<AdminAuthProvider>`. Update the JSX (final form produced in Task 6.x).

For now, ensure the provider is mounted — modify `apps/web/src/admin/Shell.tsx` to import and use `AdminAuthProvider`/`useAdminAuth` instead of the legacy inline version. This task is satisfied by Task 2.6 + the new file. Verify.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/admin/lib/admin-auth.tsx
git commit -m "feat(admin): extract AdminAuthProvider + useAdminAuth hook"
```

### Task 2.9: Wire App.tsx with new routes (initial set)

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Add new route stubs**

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageTransition } from './components/PageTransition';
import { AdminShell } from './admin/Shell';
import { AdminAuthProvider } from './admin/lib/admin-auth';
import { SupplierShell } from './components/supplier/SupplierShell';
import { RequireSupplier } from './components/supplier/useSupplierGate';

import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { BusinessOnboardingPage } from './pages/BusinessOnboardingPage';
import { SupplierOnboardingPage } from './pages/SupplierOnboardingPage';
import { SearchPage } from './pages/SearchPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { SupplierOrdersPage } from './pages/SupplierOrdersPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

// Supplier portal
import { SupplierDashboardPage } from './pages/supplier/SupplierDashboardPage';
import { SupplierProductsPage } from './pages/supplier/SupplierProductsPage';
import { SupplierAddProductPage } from './pages/supplier/SupplierAddProductPage';
import { SupplierEditProductPage } from './pages/supplier/SupplierEditProductPage';
import { SupplierPricingPage } from './pages/supplier/SupplierPricingPage';
import { SupplierInventoryPage } from './pages/supplier/SupplierInventoryPage';
import { SupplierAnalyticsPage } from './pages/supplier/SupplierAnalyticsPage';
import { SupplierCustomersPage } from './pages/supplier/SupplierCustomersPage';
import { SupplierDeliveriesPage } from './pages/supplier/SupplierDeliveriesPage';
import { SupplierPaymentsPage } from './pages/supplier/SupplierPaymentsPage';
import { SupplierSettingsPage } from './pages/supplier/SupplierSettingsPage';

// Admin
import { AdminLoginPage } from './admin/LoginPage';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { AdminSuppliersPage } from './admin/AdminSuppliersPage';
import { AdminBusinessesPage } from './admin/AdminBusinessesPage';
import { AdminProductsPage } from './admin/AdminProductsPage';
import { AdminCategoriesPage } from './admin/AdminCategoriesPage';
import { AdminOrdersPage } from './admin/AdminOrdersPage';
import { AdminDeliveriesPage } from './admin/AdminDeliveriesPage';
import { AdminPaymentsPage } from './admin/AdminPaymentsPage';
import { AdminDisputesPage } from './admin/AdminDisputesPage';
import { AdminAuditPage } from './admin/AdminAuditPage';
import { AdminUsersPage } from './admin/AdminUsersPage';
import { AdminAnalyticsPage } from './admin/AdminAnalyticsPage';
import { AdminSettingsPage } from './admin/AdminSettingsPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/onboarding/business" element={<BusinessOnboardingPage />} />
        <Route path="/onboarding/supplier" element={<SupplierOnboardingPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      <Route
        path="/supplier/*"
        element={
          <RequireSupplier>
            <SupplierShell>
              <Routes>
                <Route path="orders" element={<SupplierOrdersPage />} />
                <Route path="dashboard" element={<SupplierDashboardPage />} />
                <Route path="products" element={<SupplierProductsPage />} />
                <Route path="products/new" element={<SupplierAddProductPage />} />
                <Route path="products/:id/edit" element={<SupplierEditProductPage />} />
                <Route path="pricing" element={<SupplierPricingPage />} />
                <Route path="inventory" element={<SupplierInventoryPage />} />
                <Route path="analytics" element={<SupplierAnalyticsPage />} />
                <Route path="customers" element={<SupplierCustomersPage />} />
                <Route path="deliveries" element={<SupplierDeliveriesPage />} />
                <Route path="payments" element={<SupplierPaymentsPage />} />
                <Route path="settings" element={<SupplierSettingsPage />} />
                <Route path="*" element={<Navigate to="/supplier/dashboard" replace />} />
              </Routes>
            </SupplierShell>
          </RequireSupplier>
        }
      />

      <Route
        path="/admin/*"
        element={
          <AdminAuthProvider>
            <AdminShell>
              <Routes>
                <Route path="login" element={<AdminLoginPage />} />
                <Route index element={<AdminDashboardPage />} />
                <Route path="suppliers" element={<AdminSuppliersPage />} />
                <Route path="businesses" element={<AdminBusinessesPage />} />
                <Route path="products" element={<AdminProductsPage />} />
                <Route path="categories" element={<AdminCategoriesPage />} />
                <Route path="orders" element={<AdminOrdersPage />} />
                <Route path="deliveries" element={<AdminDeliveriesPage />} />
                <Route path="payments" element={<AdminPaymentsPage />} />
                <Route path="disputed" element={<AdminDisputesPage />} />
                <Route path="audit" element={<AdminAuditPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="analytics" element={<AdminAnalyticsPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </AdminShell>
          </AdminAuthProvider>
        }
      />
    </Routes>
  );
}
```

Note: many imports above reference files that don't exist yet. They are created in Phases 3-6. To keep the file compilable mid-Phase 2, add stub pages for the new ones (Phase 2 only — Phase 3-6 will replace them with real implementations).

- [ ] **Step 2: Create stub page files**

Run this script to create empty stubs (one-liner returning a placeholder):

```bash
for f in \
  pages/SettingsPage.tsx \
  pages/supplier/SupplierDashboardPage.tsx \
  pages/supplier/SupplierProductsPage.tsx \
  pages/supplier/SupplierAddProductPage.tsx \
  pages/supplier/SupplierEditProductPage.tsx \
  pages/supplier/SupplierPricingPage.tsx \
  pages/supplier/SupplierInventoryPage.tsx \
  pages/supplier/SupplierAnalyticsPage.tsx \
  pages/supplier/SupplierCustomersPage.tsx \
  pages/supplier/SupplierDeliveriesPage.tsx \
  pages/supplier/SupplierPaymentsPage.tsx \
  pages/supplier/SupplierSettingsPage.tsx \
  admin/AdminDashboardPage.tsx \
  admin/AdminSuppliersPage.tsx \
  admin/AdminBusinessesPage.tsx \
  admin/AdminProductsPage.tsx \
  admin/AdminCategoriesPage.tsx \
  admin/AdminOrdersPage.tsx \
  admin/AdminDeliveriesPage.tsx \
  admin/AdminPaymentsPage.tsx \
  admin/AdminDisputesPage.tsx \
  admin/AdminAuditPage.tsx \
  admin/AdminUsersPage.tsx \
  admin/AdminAnalyticsPage.tsx \
  admin/AdminSettingsPage.tsx ; do
  mkdir -p "$(dirname apps/web/src/$f)"
  cat > "apps/web/src/$f" <<EOF
import { EmptyState, Construction } from '@vyro/ui';
export default function StubPage() {
  return (
    <EmptyState
      icon={Construction}
      title="Coming soon"
      description="This page is being redesigned."
    />
  );
}
EOF
done
```

Add `Construction` to the lucide icon re-export shim, OR import directly: change the stub bodies to import `Construction` from `lucide-react` (lucide-react is now a transitive dep of @vyro/ui and may need to be added as direct dep of apps/web). Run:

```bash
pnpm --filter @vyro/web add lucide-react
```

Then update stubs to `import { Construction } from 'lucide-react'`. Re-run the script above.

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: passes (stubs are valid React components).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/pages/ apps/web/src/pages/supplier/ apps/web/src/admin/ apps/web/package.json pnpm-lock.yaml
git commit -m "feat(routing): wire all new supplier + admin routes with stub pages"
```

End of Phase 2. Verify with `pnpm typecheck`.

---

## Phase 3 — Marketing Surfaces

Home, Login, Signup, Onboarding (business + supplier). All redesigned to use midnight sections for cinematic moments.

### Task 3.1: HomePage hero redesign

**Files:**
- Modify: `apps/web/src/pages/HomePage.tsx`

**Interfaces:**
- Produces: Midnight hero with display-xl headline + large cyan-bordered search input + floating product chips.

- [ ] **Step 1: Read current HomePage**

Run: `cat apps/web/src/pages/HomePage.tsx`

- [ ] **Step 2: Rewrite HomePage with hero first, then sections**

```tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, ArrowRight, Sparkles, Package, ShieldCheck, Wallet, Truck, Building2, Store, CheckCircle2 } from 'lucide-react';
import { Button, Input, Logo, Badge, Card, SectionCard, Divider } from '@vyro/ui';
import { Footer } from '../components/Footer';

const CATEGORIES = [
  { name: 'Industrial', count: 412, icon: Package },
  { name: 'Office supplies', count: 289, icon: Building2 },
  { name: 'Packaging', count: 156, icon: Package },
  { name: 'Electronics', count: 198, icon: Sparkles },
  { name: 'Hospitality', count: 87, icon: CheckCircle2 },
  { name: 'Construction', count: 134, icon: Building2 },
];

const STEPS = [
  { n: '01', t: 'Register your business', d: 'Tell us what you buy and from where. Takes 2 minutes.' },
  { n: '02', t: 'Search & compare', d: 'Live supplier pricing, MOQ, lead times — side by side.' },
  { n: '03', t: 'Place orders, track delivery', d: 'Multi-supplier POs, real-time status, single payment.' },
];

const TRUST_PROPS = [
  { icon: ShieldCheck, label: 'Verified suppliers' },
  { icon: Wallet, label: 'LKR pricing, transparent fees' },
  { icon: Truck, label: 'Full PO lifecycle' },
];

const QUICK_CHIPS = ['Steel pipes', 'Office chairs', 'Packaging', 'Linens', 'Electronics'];

export function HomePage() {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const t = q.trim();
    navigate(t ? `/search?q=${encodeURIComponent(t)}` : '/search');
  };

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-midnight-1 text-paper">
        <div className="absolute inset-0 opacity-50" aria-hidden>
          <div className="absolute -top-40 -left-40 size-[480px] rounded-full bg-cyan/15 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 size-[480px] rounded-full bg-cyan-deep/15 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-[1400px] px-6 lg:px-10 pt-24 pb-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-3 py-1 text-xs text-ink-4 mb-8">
            <Sparkles className="size-3 text-cyan" /> Now live in Sri Lanka
          </div>
          <h1 className="mx-auto max-w-4xl text-display-xl sm:text-[5rem] sm:leading-[1.05] text-balance">
            Procurement <span className="text-cyan">without</span> the noise.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-4 text-pretty">
            Real-time supplier pricing, MOQ, and lead times across 1,200+ verified partners. Compare, order, and track — all from one place.
          </p>
          <form onSubmit={onSearch} className="mx-auto mt-10 max-w-2xl">
            <div className="flex h-14 items-center gap-2 rounded-md border border-paper/15 bg-paper/5 p-1.5 backdrop-blur-md focus-within:border-cyan focus-within:shadow-glow transition-all duration-200">
              <Search className="ml-3 size-5 text-ink-4" />
              <Input
                placeholder="Search 2,000+ products…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-10 border-0 bg-transparent text-paper placeholder:text-ink-4 focus:ring-0 focus:border-0"
              />
              <Button type="submit" size="lg" className="h-10">
                Search <ArrowRight className="size-4" />
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-ink-4">Try:</span>
              {QUICK_CHIPS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => navigate(`/search?q=${encodeURIComponent(c)}`)}
                  className="rounded-full border border-paper/15 bg-paper/5 px-3 py-1 text-xs text-paper hover:border-cyan hover:text-cyan transition-colors duration-140"
                >
                  {c}
                </button>
              ))}
            </div>
          </form>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-sm text-ink-4">
            {TRUST_PROPS.map((p) => (
              <span key={p.label} className="inline-flex items-center gap-2">
                <p.icon className="size-4 text-cyan" /> {p.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* STATS — midnight continuation */}
      <section className="bg-midnight-1 border-t border-midnight-3 pb-20">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {[
            { v: '12,400+', l: 'Verified businesses' },
            { v: '1,200+', l: 'Active suppliers' },
            { v: 'LKR 4.2B', l: 'GMV last quarter' },
            { v: '14%', l: 'Avg savings vs list' },
          ].map((s) => (
            <div key={s.l} className="rounded-md border border-paper/10 bg-paper/5 p-6 backdrop-blur-md">
              <div className="text-display-sm font-semibold text-paper num-tabular">{s.v}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-ink-4">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CATEGORIES — light */}
      <section className="bg-pearl py-24">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          <div className="flex items-end justify-between mb-10">
            <div>
              <Badge variant="brand" className="mb-3">Catalog</Badge>
              <h2 className="text-display-md text-ink-1">Explore the catalog</h2>
              <p className="mt-2 text-ink-3 max-w-xl">From industrial steel to hospitality linens, every category verified and priced live.</p>
            </div>
            <Button variant="outline" asChild>
              <Link to="/search">Browse all <ArrowRight className="size-3.5" /></Link>
            </Button>
          </div>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {CATEGORIES.map((c) => (
              <Link
                key={c.name}
                to={`/search?category=${encodeURIComponent(c.name)}`}
                className="group rounded-md border border-line bg-paper p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-deep hover:shadow-2"
              >
                <c.icon className="size-7 text-ink-3 group-hover:text-cyan-deep transition-colors duration-140" />
                <div className="mt-3 font-semibold text-ink-1">{c.name}</div>
                <div className="text-xs text-ink-3 num-tabular">{c.count} products</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — light */}
      <section className="bg-paper border-y border-line py-24">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
          <Badge variant="brand" className="mb-3">Process</Badge>
          <h2 className="text-display-md text-ink-1 max-w-2xl">From need to delivery in three steps.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.n} padding="lg" className="relative overflow-hidden">
                <div className="text-caption uppercase tracking-wider text-cyan-deep">{s.n}</div>
                <div className="mt-3 text-h2 font-semibold text-ink-1">{s.t}</div>
                <p className="mt-2 text-sm text-ink-3">{s.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* SUPPLIER CTA — midnight */}
      <section className="bg-midnight-1 text-paper">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-24 text-center">
          <Badge tone="dark" variant="brand" className="mb-3">For suppliers</Badge>
          <h2 className="mx-auto max-w-3xl text-display-md text-paper text-balance">Reach 12,000+ verified businesses on VYRO.</h2>
          <p className="mx-auto mt-4 max-w-xl text-ink-4">List your products, set your MOQ and lead times, and grow your B2B revenue.</p>
          <div className="mt-8">
            <Button size="lg" asChild>
              <Link to="/onboarding/supplier">Become a supplier <ArrowRight className="size-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer tone="dark" />
    </>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/HomePage.tsx
git commit -m "feat(home): redesign with midnight hero, stats strip, category grid, CTA"
```

### Task 3.2: LoginPage + SignupPage redesign (split layout)

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/pages/SignupPage.tsx`

- [ ] **Step 1: Implement LoginPage**

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, ShieldCheck, Wallet, Truck } from 'lucide-react';
import { Button, Input, Field, Logo, api, useAuth, useToast } from '@vyro/ui';

const LEFT_PROPS = [
  { icon: ShieldCheck, label: 'Verified suppliers, every one' },
  { icon: Wallet, label: 'LKR pricing, transparent fees' },
  { icon: Truck, label: 'Full PO lifecycle tracking' },
];

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/sign-in', { email, password });
      await refresh();
      toast.show(toast.success('Signed in'));
      navigate('/');
    } catch (err: any) {
      toast.show(toast.error('Sign in failed', err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-pearl">
      <aside className="lg:w-[44%] bg-midnight-1 text-paper p-10 lg:p-16 flex flex-col justify-between">
        <Logo tone="dark" to="/" size="lg" />
        <div className="max-w-md">
          <h2 className="text-display-md text-paper text-balance">Welcome back to VYRO.</h2>
          <p className="mt-3 text-ink-4">Sign in to keep your procurement moving — compare, order, and track across your verified supplier network.</p>
          <ul className="mt-8 flex flex-col gap-3">
            {LEFT_PROPS.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm text-paper">
                <span className="size-7 rounded-full bg-cyan/15 text-cyan-deep inline-flex items-center justify-center">
                  <p.icon className="size-4" />
                </span>
                {p.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-4">© {new Date().getFullYear()} VYRO</p>
      </aside>
      <main className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-md rounded-xl bg-paper border border-line shadow-2 p-10">
          <h1 className="text-display-sm text-ink-1">Sign in</h1>
          <p className="mt-2 text-sm text-ink-3">Welcome back. Please enter your details.</p>
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
            <Field label="Email" htmlFor="email" required>
              <Input id="email" type="email" leftSlot={<Mail />} placeholder="you@business.lk" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </Field>
            <Field label="Password" htmlFor="password" required>
              <Input id="password" type="password" leftSlot={<Lock />} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            <Button type="submit" loading={loading} size="lg" className="mt-2">Sign in <ArrowRight className="size-4" /></Button>
          </form>
          <p className="mt-6 text-center text-sm text-ink-3">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-cyan-deep hover:underline">Create one</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Implement SignupPage (same shell, with Name field)**

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User as UserIcon, ArrowRight, ShieldCheck, Wallet, Truck } from 'lucide-react';
import { Button, Input, Field, Logo, api, useAuth, useToast } from '@vyro/ui';

const LEFT_PROPS = [
  { icon: ShieldCheck, label: 'Verified suppliers, every one' },
  { icon: Wallet, label: 'LKR pricing, transparent fees' },
  { icon: Truck, label: 'Full PO lifecycle tracking' },
];

export function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/sign-up', { email, password, name });
      await refresh();
      toast.show(toast.success('Account created'));
      navigate('/profile');
    } catch (err: any) {
      toast.show(toast.error('Sign up failed', err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-pearl">
      <aside className="lg:w-[44%] bg-midnight-1 text-paper p-10 lg:p-16 flex flex-col justify-between">
        <Logo tone="dark" to="/" size="lg" />
        <div className="max-w-md">
          <h2 className="text-display-md text-paper text-balance">Start procuring smarter.</h2>
          <p className="mt-3 text-ink-4">Create your VYRO account and unlock live pricing from 1,200+ verified suppliers.</p>
          <ul className="mt-8 flex flex-col gap-3">
            {LEFT_PROPS.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm text-paper">
                <span className="size-7 rounded-full bg-cyan/15 text-cyan-deep inline-flex items-center justify-center">
                  <p.icon className="size-4" />
                </span>
                {p.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-4">© {new Date().getFullYear()} VYRO</p>
      </aside>
      <main className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-md rounded-xl bg-paper border border-line shadow-2 p-10">
          <h1 className="text-display-sm text-ink-1">Create account</h1>
          <p className="mt-2 text-sm text-ink-3">Get started in under 2 minutes.</p>
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
            <Field label="Full name" htmlFor="name" required>
              <Input id="name" leftSlot={<UserIcon />} placeholder="Jane Perera" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </Field>
            <Field label="Email" htmlFor="email" required>
              <Input id="email" type="email" leftSlot={<Mail />} placeholder="you@business.lk" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </Field>
            <Field label="Password" htmlFor="password" required help="At least 8 characters">
              <Input id="password" type="password" leftSlot={<Lock />} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
            </Field>
            <Button type="submit" loading={loading} size="lg" className="mt-2">Create account <ArrowRight className="size-4" /></Button>
          </form>
          <p className="mt-6 text-center text-sm text-ink-3">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-cyan-deep hover:underline">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/LoginPage.tsx apps/web/src/pages/SignupPage.tsx
git commit -m "feat(auth): redesign Login/Signup with split midnight + form layout"
```

### Task 3.3: BusinessOnboardingPage redesign

**Files:**
- Modify: `apps/web/src/pages/BusinessOnboardingPage.tsx`

- [ ] **Step 1: Rewrite with wizard layout**

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, MapPin, User as UserIcon, Phone, Mail, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { Button, Input, Field, Card, useAuth, useToast, api } from '@vyro/ui';

const STEPS = = [
  { id: 1, title: 'Business', icon: Building2 },
  { id: 2, title: 'Contact', icon: UserIcon },
  { id: 3, title: 'Address', icon: MapPin },
];

export function BusinessOnboardingPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', type: '', registrationNumber: '', contactName: '', contactEmail: '', contactPhone: '', line1: '', city: '', postal: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const toast = useToast();

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/businesses/onboard', form);
      await refresh();
      toast.show(toast.success('Business registered'));
      navigate('/profile');
    } catch (err: any) {
      toast.show(toast.error('Could not register', err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-display-md text-ink-1">Register your business</h1>
        <p className="mt-2 text-ink-3">Tell us a bit about your business to start procuring.</p>
      </header>
      <ol className="mb-12 flex items-center gap-4">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 flex-1">
            <div className={'size-9 rounded-full inline-flex items-center justify-center text-sm font-semibold border-2 ' + (step >= s.id ? 'bg-cyan-deep text-paper border-cyan-deep' : 'bg-paper text-ink-3 border-line')}>
              {step > s.id ? <Check className="size-4" /> : s.id}
            </div>
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-ink-3">Step {s.id}</div>
              <div className="text-sm font-medium text-ink-1">{s.title}</div>
            </div>
            {i < STEPS.length - 1 && <div className={'flex-1 h-px ' + (step > s.id ? 'bg-cyan-deep' : 'bg-line')} />}
          </li>
        ))}
      </ol>

      <Card padding="lg">
        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Business name" htmlFor="biz-name" required>
              <Input id="biz-name" leftSlot={<Building2 />} placeholder="Acme (Pvt) Ltd" value={form.name} onChange={update('name')} required />
            </Field>
            <Field label="Business type" htmlFor="biz-type" required help="e.g. Retail, Manufacturing, Hospitality">
              <Input id="biz-type" placeholder="Manufacturing" value={form.type} onChange={update('type')} required />
            </Field>
            <Field label="Registration number" htmlFor="biz-reg">
              <Input id="biz-reg" placeholder="PV 12345" value={form.registrationNumber} onChange={update('registrationNumber')} />
            </Field>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact name" htmlFor="c-name" required>
              <Input id="c-name" leftSlot={<UserIcon />} value={form.contactName} onChange={update('contactName')} required />
            </Field>
            <Field label="Contact email" htmlFor="c-email" required>
              <Input id="c-email" type="email" leftSlot={<Mail />} value={form.contactEmail} onChange={update('contactEmail')} required />
            </Field>
            <Field label="Contact phone" htmlFor="c-phone" required>
              <Input id="c-phone" type="tel" leftSlot={<Phone />} value={form.contactPhone} onChange={update('contactPhone')} required />
            </Field>
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Address line 1" htmlFor="addr1" required className="sm:col-span-2">
              <Input id="addr1" leftSlot={<MapPin />} value={form.line1} onChange={update('line1')} required />
            </Field>
            <Field label="City" htmlFor="city" required>
              <Input id="city" value={form.city} onChange={update('city')} required />
            </Field>
            <Field label="Postal code" htmlFor="zip">
              <Input id="zip" value={form.postal} onChange={update('postal')} />
            </Field>
          </div>
        )}
        <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : (
            <Link to="/login" className="text-sm text-ink-3 hover:text-ink-1">Cancel</Link>
          )}
          {step < STEPS.length ? (
            <Button onClick={() => setStep(step + 1)}>
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} loading={loading}>
              Finish <Check className="size-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/BusinessOnboardingPage.tsx
git commit -m "feat(onboarding): redesign business onboarding as 3-step wizard"
```

### Task 3.4: SupplierOnboardingPage redesign

**Files:**
- Modify: `apps/web/src/pages/SupplierOnboardingPage.tsx`

Apply the same wizard pattern as Task 3.3 with 3 steps: Supplier identity → Category & warehouse → Contact & payment. Use the same Card + Field + Button primitives. Submit posts to `/suppliers/onboard`. Full code follows the same structure as Task 3.3 — adjust field names: `name`, `category`, `warehouseLine1`, `warehouseCity`, `contactName`, `contactEmail`, `contactPhone`, `bankName`, `bankAccount`. Navigation: on success go to `/supplier/dashboard`. Step indicator uses same component structure.

- [ ] **Step 1: Implement using the same pattern as Task 3.3**

(Full code omitted for brevity — adapt the Task 3.3 implementation with the field changes above.)

- [ ] **Step 2: Verify + commit**

```bash
git add apps/web/src/pages/SupplierOnboardingPage.tsx
git commit -m "feat(onboarding): redesign supplier onboarding as 3-step wizard"
```

End of Phase 3. Verify with `pnpm typecheck`.

---

## Phase 4 — Business App Surfaces

Search, Product detail, Cart, Checkout, Orders list, Order detail, Profile, Settings. The most-used screens.

### Task 4.1: SearchPage redesign

**Files:**
- Modify: `apps/web/src/pages/SearchPage.tsx`
- Create: `apps/web/src/components/ProductCard.tsx` (reusable card)
- Create: `apps/web/src/components/ProductGlyph.tsx` (SVG placeholder per category)

- [ ] **Step 1: Implement ProductGlyph**

```tsx
import { cn } from '@vyro/ui';

const GLYPHS: Record<string, JSX.Element> = {
  default: (
    <g>
      <rect x="20" y="20" width="120" height="120" rx="14" fill="#E6E8EE" />
      <rect x="40" y="40" width="80" height="14" rx="3" fill="#9098A4" />
      <rect x="40" y="64" width="56" height="10" rx="2" fill="#5EE2FF" />
      <rect x="40" y="86" width="80" height="50" rx="6" fill="#0A0B10" />
    </g>
  ),
  industrial: (
    <g>
      <circle cx="80" cy="80" r="56" fill="#E6E8EE" />
      <circle cx="80" cy="80" r="30" fill="none" stroke="#0A0B10" strokeWidth="8" />
      <circle cx="80" cy="80" r="10" fill="#5EE2FF" />
    </g>
  ),
  packaging: (
    <g>
      <rect x="20" y="40" width="120" height="80" rx="6" fill="#E6E8EE" />
      <rect x="20" y="40" width="120" height="20" rx="6" fill="#0A0B10" />
      <rect x="36" y="72" width="40" height="32" rx="3" fill="#9098A4" />
      <rect x="84" y="72" width="40" height="32" rx="3" fill="#5EE2FF" />
    </g>
  ),
  electronics: (
    <g>
      <rect x="30" y="30" width="100" height="100" rx="10" fill="#0A0B10" />
      <rect x="44" y="44" width="72" height="60" rx="3" fill="#5EE2FF" />
      <circle cx="120" cy="120" r="6" fill="#0A0B10" />
    </g>
  ),
  textile: (
    <g>
      <path d="M20 60 L80 30 L140 60 L140 130 L20 130 Z" fill="#E6E8EE" />
      <path d="M20 60 L80 90 L140 60" fill="none" stroke="#0A0B10" strokeWidth="3" />
      <line x1="80" y1="30" x2="80" y2="130" stroke="#9098A4" strokeWidth="1" strokeDasharray="4 3" />
    </g>
  ),
};

export function ProductGlyph({ category = 'default', className }: { category?: string; className?: string }) {
  const g = GLYPHS[category] ?? GLYPHS.default;
  return (
    <svg viewBox="0 0 160 160" className={cn('w-full h-full', className)} aria-hidden>
      {g}
    </svg>
  );
}
```

- [ ] **Step 2: Implement ProductCard**

```tsx
import { Link } from 'react-router-dom';
import { Plus, Star, ShieldCheck, Check } from 'lucide-react';
import { Card, Badge, Button, Avatar, cn } from '@vyro/ui';
import { ProductGlyph } from './ProductGlyph';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@vyro/ui';

export interface ProductCardProps {
  id: string;
  title: string;
  supplier: { id: string; name: string; verified?: boolean };
  price: number; // LKR
  moq: number;
  leadTime: string;
  rating?: number;
  category?: string;
  businessId?: string;
}

export function ProductCard({ id, title, supplier, price, moq, leadTime, rating, category, businessId }: ProductCardProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const add = useMutation({
    mutationFn: () => api.post('/cart/items', { businessId, supplierProductId: id, quantity: moq }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      toast.show(toast.success('Added to cart'));
    },
    onError: (err: any) => toast.show(toast.error('Could not add', err?.message)),
  });

  return (
    <Card variant="interactive" padding="none" className="overflow-hidden">
      <Link to={`/products/${id}`} className="block aspect-square bg-pearl">
        <ProductGlyph category={category} />
      </Link>
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Avatar name={supplier.name} size="sm" />
          <span className="text-xs text-ink-3 truncate">{supplier.name}</span>
          {supplier.verified && <ShieldCheck className="size-3 text-cyan-deep" aria-label="Verified" />}
        </div>
        <Link to={`/products/${id}`} className="text-sm font-semibold text-ink-1 line-clamp-2 hover:text-cyan-deep transition-colors duration-140">{title}</Link>
        <div className="flex items-baseline gap-1">
          <span className="text-base font-semibold text-ink-1 num-tabular font-mono">LKR {price.toLocaleString('en-LK')}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="neutral">MOQ {moq}</Badge>
          <Badge variant="neutral">{leadTime}</Badge>
          {rating != null && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-xs text-ink-3">
              <Star className="size-3 fill-amber text-amber" /> {rating.toFixed(1)}
            </span>
          )}
        </div>
        <Button size="sm" variant="primary" className="mt-2" loading={add.isPending} onClick={(e) => { e.preventDefault(); if (!businessId) { toast.show(toast.warning('Register a business to add items')); return; } add.add(); }}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Implement SearchPage**

```tsx
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, Input, Chip, Button, Skeleton, EmptyState, Badge } from '@vyro/ui';
import { ProductCard } from '@/components/ProductCard';

interface Hit {
  id: string;
  title: string;
  supplier: { id: string; name: string; verified?: boolean };
  price: number;
  moq: number;
  leadTime: string;
  rating?: number;
  category?: string;
}

const FILTER_GROUPS = ['Industrial', 'Office', 'Packaging', 'Electronics', 'Hospitality', 'Construction'];

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;

  const { data, isLoading } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<{ hits: Hit[] }>(`/search/products?q=${encodeURIComponent(q)}`),
  });

  const toggleFilter = (f: string) => setActiveFilters((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-h1 text-ink-1">{q ? `Results for "${q}"` : 'All products'}</h1>
          <p className="text-sm text-ink-3 mt-1 num-tabular">{isLoading ? 'Searching…' : `${data?.hits?.length ?? 0} products`}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="brand">Sort: Best match</Badge>
          <Button variant="outline" size="sm"><SlidersHorizontal className="size-3.5" /> Sort <ChevronDown className="size-3.5" /></Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-6">
          <div>
            <h3 className="text-caption uppercase text-ink-3 mb-2">Category</h3>
            <div className="flex flex-wrap gap-2">
              {FILTER_GROUPS.map((f) => (
                <Chip key={f} selected={activeFilters.includes(f)} onClick={() => toggleFilter(f)}>{f}</Chip>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-caption uppercase text-ink-3 mb-2">Delivery</h3>
            <div className="flex flex-wrap gap-2">
              <Chip>Under 3 days</Chip>
              <Chip>Under 7 days</Chip>
              <Chip>Within 2 weeks</Chip>
            </div>
          </div>
          <div>
            <h3 className="text-caption uppercase text-ink-3 mb-2">Supplier</h3>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-cyan-deep" /> Verified only</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-cyan-deep" /> Local (LK)</label>
            </div>
          </div>
        </aside>

        <section>
          {isLoading ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} padding="none" className="overflow-hidden">
                  <Skeleton size="custom" className="aspect-square rounded-none" />
                  <div className="p-4 space-y-2">
                    <Skeleton size="text" className="w-1/2" />
                    <Skeleton size="text" />
                    <Skeleton size="text" className="w-1/3" />
                  </div>
                </Card>
              ))}
            </div>
          ) : !data?.hits?.length ? (
            <EmptyState icon={Search} title="No products match" description="Try clearing filters or broadening your query." action={<Button variant="outline" onClick={() => { setParams({}); setActiveFilters([]); }}>Clear filters</Button>} />
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {data.hits.map((hit) => (
                <ProductCard key={hit.id} {...hit} businessId={businessId} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/SearchPage.tsx apps/web/src/components/ProductCard.tsx apps/web/src/components/ProductGlyph.tsx
git commit -m "feat(search): redesign Search with filter rail + glyph product cards"
```

### Task 4.2: ProductDetailPage redesign

**Files:**
- Modify: `apps/web/src/pages/ProductDetailPage.tsx`

The page redesign includes:
- 2-col layout on lg+ (gallery + info)
- Custom SVG gallery (large + 4 thumbs) using ProductGlyph
- Supplier comparison table below with cyan "Best" highlight
- Quantity stepper + primary CTA

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShieldCheck, Star, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Badge, Skeleton, Avatar, EmptyState, useToast } from '@vyro/ui';
import { ProductGlyph } from '@/components/ProductGlyph';

interface Offer {
  id: string;
  supplier: { id: string; name: string; verified?: boolean; rating?: number; location?: string };
  price: number;
  moq: number;
  leadTime: string;
  stock?: number;
  pastOrders?: number;
}

interface ProductDetail {
  id: string;
  title: string;
  description: string;
  category: string;
  specs: Record<string, string>;
  offers: Offer[];
}

export function ProductDetailPage() {
  const { id } = useParams();
  const [qty, setQty] = useState(1);
  const navigate = useNavigate();
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductDetail>(`/search/products/${id}/offers`),
    enabled: !!id,
  });

  const add = useMutation({
    mutationFn: (offerId: string) => api.post('/cart/items', { businessId, supplierProductId: offerId, quantity: qty }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      toast.show(toast.success('Added to cart'));
      navigate('/cart');
    },
    onError: (err: any) => toast.show(toast.error('Could not add', err?.message)),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10 grid gap-10 lg:grid-cols-[1fr_1fr]">
        <Skeleton size="card" className="aspect-square w-full" />
        <div className="space-y-4">
          <Skeleton size="heading" />
          <Skeleton size="text" />
          <Skeleton size="text" className="w-2/3" />
          <Skeleton size="button" />
        </div>
      </div>
    );
  }

  if (!data) return <EmptyState title="Product not found" />;

  const bestPrice = data.offers.reduce((min, o) => (o.price < min ? o.price : min), Infinity);
  const bestRating = data.offers.reduce((max, o) => (o.supplier.rating ?? 0) > max ? o.supplier.rating ?? 0 : max, 0);
  const fastestLead = data.offers.reduce((min, o) => (o.leadTime < min ? o.leadTime : min), data.offers[0].leadTime);

  const ATTRS = [
  ['Price', (o: Offer) => o.price],
  ['MOQ', (o: Offer) => o.moq],
  ['Lead time', (o: Offer) => o.leadTime],
  ['Rating', (o: Offer) => o.supplier.rating ?? 0],
  ['Stock', (o: Offer) => o.stock ?? 0],
  ['Past orders', (o: Offer) => o.pastOrders ?? 0],
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10">
      <Link to="/search" className="text-sm text-ink-3 hover:text-ink-1">← Back to results</Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="space-y-3">
          <Card padding="none" className="overflow-hidden aspect-square bg-pearl">
            <ProductGlyph category={data.category} />
          </Card>
          <div className="grid grid-cols-4 gap-3">
            {[0,1,2,3].map((i) => (
              <Card key={i} padding="none" className="aspect-square bg-pearl overflow-hidden cursor-pointer hover:border-cyan-deep transition-colors">
                <ProductGlyph category={data.category} />
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <Badge variant="brand">{data.category}</Badge>
            <h1 className="mt-3 text-display-sm text-ink-1">{data.title}</h1>
          </div>
          <p className="text-ink-3">{data.description}</p>

          <Card padding="lg">
            <div className="flex items-center justify-between">
              <span className="text-caption uppercase text-ink-3">From</span>
              <span className="text-display-sm text-ink-1 font-mono num-tabular">LKR {bestPrice.toLocaleString('en-LK')}</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-ink-3">Quantity</span>
              <div className="inline-flex items-center rounded-sm border border-line">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="size-9 inline-flex items-center justify-center text-ink-3 hover:text-ink-1"><Minus className="size-3.5" /></button>
                <span className="w-12 text-center text-sm font-semibold num-tabular">{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="size-9 inline-flex items-center justify-center text-ink-3 hover:text-ink-1"><Plus className="size-3.5" /></button>
              </div>
              <span className="text-sm text-ink-3 num-tabular">× LKR {bestPrice.toLocaleString('en-LK')} = <span className="text-ink-1 font-semibold">LKR {(qty * bestPrice).toLocaleString('en-LK')}</span></span>
            </div>
            <Button size="lg" className="mt-5 w-full" loading={add.isPending} onClick={() => add.mutate(data.offers[0].id)}>
              Add to cart <ArrowRight className="size-4" />
            </Button>
          </Card>

          {data.specs && Object.keys(data.specs).length > 0 && (
            <Card padding="md">
              <h3 className="text-h3 font-semibold mb-3">Specifications</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(data.specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-line-soft pb-2">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-ink-1 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      </div>

      <section className="mt-16">
        <h2 className="text-display-md text-ink-1 mb-1">Compare suppliers</h2>
        <p className="text-sm text-ink-3 mb-6">{data.offers.length} suppliers offering this product. Best value highlighted.</p>
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-line-soft">
                <th className="text-left px-4 py-3 text-xs font-medium uppercase text-ink-3">Attribute</th>
                {data.offers.map((o) => (
                  <th key={o.id} className="px-4 py-3 text-left">
                    <div className="flex items-center gap-2">
                      <Avatar name={o.supplier.name} size="sm" />
                      <div>
                          <div className="text-sm font-semibold text-ink-1">{o.supplier.name}</div>
                          {o.supplier.verified && <span className="inline-flex items-center gap-0.5 text-xs text-cyan-deep"><ShieldCheck className="size-3" /> Verified</span>}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ATTRS.map(([label, get]) => (
                  <tr key={label as string} className="border-t border-line-soft">
                    <td className="px-4 py-3 text-ink-3">{label}</td>
                    {data.offers.map((o) => {
                      const v = get(o);
                      const isBest = label === 'Price' ? v === bestPrice : label === 'Rating' ? v === bestRating : label === 'Lead time' ? o.leadTime === fastestLead : false;
                      return (
                        <td key={o.id} className={'px-4 py-3 num-tabular ' + (isBest ? 'bg-cyan/10 text-ink-1 font-semibold' : 'text-ink-2')}>
                          {isBest && <Badge variant="brand" className="mr-2">Best</Badge>}
                          {label === 'Price' ? `LKR ${(v as number).toLocaleString('en-LK')}` : label === 'Rating' ? `${(v as number).toFixed(1)} ★` : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-line-soft">
                  <td className="px-4 py-3 text-ink-3">Action</td>
                  {data.offers.map((o) => (
                    <td key={o.id} className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={() => add.mutate(o.id)} loading={add.isPending && add.variables === o.id}>
                        Add
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </Card>
      </section>
    </div>
  );
}
```

Note: this implementation has a typo where the supplier avatar block has an extra `</div></div>` close — adjust during implementation.

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/ProductDetailPage.tsx
git commit -m "feat(product): redesign ProductDetail with comparison table + cyan best highlight"
```

### Task 4.3: CartPage redesign

**Files:**
- Modify: `apps/web/src/pages/CartPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Trash2, ShoppingCart, ArrowRight, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Skeleton, EmptyState, Avatar, useToast, Badge } from '@vyro/ui';
import { ProductGlyph } from '@/components/ProductGlyph';

interface CartItem {
  id: string;
  productId: string;
  title: string;
  supplierId: string;
  supplierName: string;
  price: number;
  quantity: number;
  category?: string;
}

interface CartGroup {
  supplierId: string;
  supplierName: string;
  items: CartItem[];
}

export function CartPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ items: CartItem[] }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/cart/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });

  const updateQty = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => api.post(`/cart/items/${id}`, { quantity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cart'] }),
  });

  if (!user) return (
    <div className="mx-auto max-w-md py-24">
      <EmptyState icon={ShoppingCart} title="Sign in to view your cart" action={<Button asChild><Link to="/login">Sign in</Link></Button>} />
    </div>
  );
  if (!businessId) return (
    <div className="mx-auto max-w-md py-24">
      <EmptyState icon={Building2} title="Register a business first" description="You need a registered business to add items to cart." action={<Button asChild><Link to="/onboarding/business">Register business</Link></Button>} />
    </div>
  );

  if (isLoading) return <div className="mx-auto max-w-[1400px] px-6 py-10 space-y-4"><Skeleton size="card" /><Skeleton size="card" /></div>;

  const items = data?.items ?? [];
  const grouped = items.reduce<Record<string, CartGroup>>((acc, it) => {
    (acc[it.supplierId] ??= { supplierId: it.supplierId, supplierName: it.supplierName, items: [] }).items.push(it);
    return acc;
  }, {});
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  if (!items.length) {
    return (
      <div className="mx-auto max-w-2xl py-24">
        <EmptyState icon={ShoppingCart} title="Your cart is empty" description="Browse our verified catalog and add items to get started." action={<Button asChild><Link to="/search">Browse catalog</Link></Button>} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10">
      <h1 className="text-display-sm text-ink-1">Your cart</h1>
      <p className="text-sm text-ink-3 mt-1 num-tabular">{items.length} items · {Object.keys(grouped).length} supplier{Object.keys(grouped).length > 1 ? 's' : ''}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {Object.values(grouped).map((g) => (
            <Card key={g.supplierId} padding="none">
              <header className="flex items-center gap-3 px-6 py-4 border-b border-line-soft">
                <Avatar name={g.supplierName} />
                <div>
                  <div className="text-sm font-semibold text-ink-1">{g.supplierName}</div>
                  <div className="text-xs text-ink-3 num-tabular">{g.items.length} item{g.items.length > 1 ? 's' : ''}</div>
                </div>
              </header>
              <ul className="divide-y divide-line-soft">
                {g.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="size-16 rounded-md bg-pearl overflow-hidden shrink-0"><ProductGlyph category={it.category} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink-1 truncate">{it.title}</div>
                      <div className="text-xs text-ink-3 font-mono num-tabular">LKR {it.price.toLocaleString('en-LK')} each</div>
                    </div>
                    <div className="inline-flex items-center rounded-sm border border-line">
                      <button onClick={() => updateQty.mutate({ id: it.id, quantity: Math.max(1, it.quantity - 1) })} className="size-9 inline-flex items-center justify-center text-ink-3 hover:text-ink-1"><Minus className="size-3.5" /></button>
                      <span className="w-10 text-center text-sm num-tabular">{it.quantity}</span>
                      <button onClick={() => updateQty.mutate({ id: it.id, quantity: it.quantity + 1 })} className="size-9 inline-flex items-center justify-center text-ink-3 hover:text-ink-1"><Plus className="size-3.5" /></button>
                    </div>
                    <div className="w-28 text-right text-sm font-semibold font-mono num-tabular">LKR {(it.price * it.quantity).toLocaleString('en-LK')}</div>
                    <button onClick={() => remove.mutate(it.id)} className="size-9 inline-flex items-center justify-center rounded-sm text-ink-3 hover:bg-rose/15 hover:text-rose" aria-label={`Remove ${it.title}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <Card padding="lg" variant="elevated">
            <h3 className="text-h3 font-semibold mb-4">Order summary</h3>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-3">Items</dt><dd className="num-tabular">{items.length}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Suppliers</dt><dd className="num-tabular">{Object.keys(grouped).length}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">Subtotal</dt><dd className="num-tabular font-mono">LKR {total.toLocaleString('en-LK')}</dd></div>
              <div className="border-t border-line my-2" />
              <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd className="font-mono num-tabular text-display-sm">LKR {total.toLocaleString('en-LK')}</dd></div>
            </dl>
            <Button size="lg" className="w-full mt-6" onClick={() => navigate('/checkout')}>
              Proceed to checkout <ArrowRight className="size-4" />
            </Button>
            <Button variant="ghost" className="w-full mt-2" asChild><Link to="/search">Continue shopping</Link></Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/CartPage.tsx
git commit -m "feat(cart): redesign Cart with supplier grouping + sticky summary"
```

### Task 4.4: CheckoutPage redesign

**Files:**
- Modify: `apps/web/src/pages/CheckoutPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Wallet, CreditCard, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, RadioGroup, RadioGroupItem, Textarea, Field, useToast } from '@vyro/ui';

const METHODS = [
  { id: 'bank', label: 'Bank transfer', sub: 'Direct from your business account', icon: Building2 },
  { id: 'card', label: 'Corporate card', sub: 'Visa, Mastercard, Amex', icon: CreditCard },
  { id: 'terms', label: 'Pay on terms', sub: 'Net 30, eligible after 3 orders', icon: Wallet },
];

export function CheckoutPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [method, setMethod] = useState('bank');
  const [notes, setNotes] = useState('');
  const checkout = useMutation({
    mutationFn: () => api.post<{ poIds: string[]; count: number }>('/purchase-orders/checkout', { businessId, notes, paymentMethod: method }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      toast.show(toast.success(`${res.count} order${res.count > 1 ? 's' : ''} placed`));
      navigate(res.poIds?.[0] ? `/orders/${res.poIds[0]}` : '/orders');
    },
    onError: (err: any) => toast.show(toast.error('Checkout failed', err?.message)),
  });

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10">
      <h1 className="text-display-sm text-ink-1">Checkout</h1>
      <p className="text-sm text-ink-3 mt-1">Review details and place your orders.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card padding="lg">
            <h2 className="text-h3 font-semibold mb-4">Payment method</h2>
            <RadioGroup value={method} onValueChange={setMethod} className="gap-3">
              {METHODS.map((m) => (
                <label key={m.id} className={'flex items-start gap-3 rounded-md border p-4 cursor-pointer transition-all duration-140 ' + (method === m.id ? 'border-cyan-deep bg-cyan/5 shadow-1' : 'border-line bg-paper hover:border-cyan-deep')}>
                  <RadioGroupItem value={m.id} />
                  <m.icon className="size-5 text-ink-3 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-ink-1">{m.label}</div>
                    <div className="text-xs text-ink-3">{m.sub}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </Card>
          <Card padding="lg">
            <h2 className="text-h3 font-semibold mb-4">Delivery notes</h2>
            <Field label="Notes for supplier" htmlFor="notes" help="Optional — any delivery instructions">
              <Textarea id="notes" placeholder="e.g. Deliver to loading dock B between 9am–12pm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </Card>
        </div>
        <aside className="lg:sticky lg:top-24 h-fit">
          <Card padding="lg" variant="elevated">
            <Button size="lg" loading={checkout.isPending} className="w-full" onClick={() => checkout.mutate()}>
              Place orders <ArrowRight className="size-4" />
            </Button>
            <p className="text-xs text-ink-3 mt-3 text-center">Orders will be split per supplier automatically.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/CheckoutPage.tsx
git commit -m "feat(checkout): redesign Checkout with radio payment cards + delivery notes"
```

### Task 4.5: OrdersPage redesign

**Files:**
- Modify: `apps/web/src/pages/OrdersPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, ChevronRight, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, Skeleton, EmptyState, Tabs, TabsList, TabsTrigger, TabsContent, StatusBadge, Badge, useState } from '@vyro/ui';
import { useState } from 'react';

interface Order {
  id: string;
  supplierName: string;
  itemCount: number;
  total: number;
  status: import('@vyro/ui').OrderStatus;
  createdAt: string;
}

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'In progress' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'disputed', label: 'Disputed' },
];

const STATUS_FOR_TAB: Record<string, import('@vyro/ui').OrderStatus[]> = {
  active: ['pending', 'accepted', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'in_transit', 'shipped'],
  delivered: ['delivered', 'completed'],
  disputed: ['disputed'],
};

export function OrdersPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const [tab, setTab] = useState('all');
  const { data, isLoading } = useQuery({
    queryKey: ['orders', businessId],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });

  if (!user) return <div className="mx-auto max-w-md py-24"><EmptyState icon={Building2} title="Sign in to view orders" action={<Link to="/login" className="text-sm font-semibold text-cyan-deep hover:underline">Sign in</Link>} /></div>;
  if (!businessId) return <div className="mx-auto max-w-md py-24"><EmptyState icon={Building2} title="Register a business" description="Register your business to start placing orders." action={<Link to="/onboarding/business" className="text-sm font-semibold text-cyan-deep hover:underline">Register business</Link>} /></div>;

  const filtered = (data?.orders ?? []).filter((o) => tab === 'all' || STATUS_FOR_TAB[tab]?.includes(o.status));

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10">
      <h1 className="text-display-sm text-ink-1">Purchase orders</h1>
      <p className="text-sm text-ink-3 mt-1 num-tabular">{data?.orders?.length ?? 0} orders</p>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab}>
          {isLoading ? (
            <div className="space-y-3">{Array.from({length:4}).map((_,i)=>(<Skeleton key={i} size="card" className="h-20" />))}</div>
          ) : !filtered.length ? (
            <EmptyState icon={ClipboardList} title="No orders here" description="Place an order to see it listed." action={<Link to="/search" className="text-sm font-semibold text-cyan-deep hover:underline">Browse catalog</Link>} />
          ) : (
            <div className="space-y-3">
              {filtered.map((o) => (
                <Link key={o.id} to={`/orders/${o.id}`}>
                  <Card variant="interactive" padding="md" className="flex items-center gap-4">
                    <div className="font-mono text-xs text-ink-3 num-tabular">#{o.id.slice(0,8).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-ink-1 truncate">{o.supplierName}</div>
                      <div className="text-xs text-ink-3 num-tabular">{o.itemCount} item{o.itemCount>1?'s':''} · {new Date(o.createdAt).toLocaleDateString('en-LK', { day:'numeric', month:'short' })}</div>
                    </div>
                    <StatusBadge status={o.status} />
                    <div className="w-32 text-right text-sm font-semibold font-mono num-tabular">LKR {o.total.toLocaleString('en-LK')}</div>
                    <ChevronRight className="size-4 text-ink-3" />
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/OrdersPage.tsx
git commit -m "feat(orders): redesign Orders list with tabs + interactive cards"
```

### Task 4.6: OrderDetailPage redesign

**Files:**
- Modify: `apps/web/src/pages/OrderDetailPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Truck, MapPin, Check, AlertCircle, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Skeleton, EmptyState, StatusBadge, Table, THead, TBody, TR, TH, TD, Button, useToast } from '@vyro/ui';

interface OrderDetail {
  id: string;
  supplierName: string;
  supplierAddress?: string;
  status: import('@vyro/ui').OrderStatus;
  total: number;
  createdAt: string;
  timeline: { status: import('@vyro/ui').OrderStatus; at: string; note?: string }[];
  items: { id: string; title: string; quantity: number; price: number }[];
}

export function OrderDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/purchase-orders/${id}`),
    enabled: !!id,
  });
  const transition = useMutation({
    mutationFn: (to: string) => api.post(`/purchase-orders/${id}/transition`, { to }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', id] }),
    onError: (err: any) => toast.show(toast.error('Action failed', err?.message)),
  });

  if (isLoading) return <div className="mx-auto max-w-[1400px] px-6 py-10 space-y-4"><Skeleton size="card" /><Skeleton size="card" /></div>;
  if (!data) return <EmptyState title="Order not found" action={<Link to="/orders" className="text-sm font-semibold text-cyan-deep hover:underline">Back to orders</Link>} />;

  return (
    <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-10">
      <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-ink-3 hover:text-ink-1">
        <ArrowLeft className="size-4" /> All orders
      </Link>
      <div className="mt-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-display-sm text-ink-1 flex items-center gap-3">
            Order <span className="font-mono text-ink-3">#{data.id.slice(0,8).toUpperCase()}</span>
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <StatusBadge status={data.status} />
            <span className="text-sm text-ink-3 num-tabular">{new Date(data.createdAt).toLocaleString('en-LK')}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card padding="none">
            <Table>
              <THead>
                <TR><TH>Item</TH><TH>Qty</TH><TH>Price</TH><TH className="text-right">Total</TH></TR>
              </THead>
              <TBody>
                {data.items.map((it) => (
                  <TR key={it.id}>
                    <TD>{it.title}</TD>
                    <TD>{it.quantity}</TD>
                    <TD className="font-mono">LKR {it.price.toLocaleString('en-LK')}</TD>
                    <TD className="text-right font-mono font-semibold">LKR {(it.price * it.quantity).toLocaleString('en-LK')}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card padding="lg">
            <h3 className="text-h3 font-semibold mb-4">Status timeline</h3>
            <ol className="space-y-4">
              {data.timeline.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <div className="relative">
                    <div className="size-3 rounded-full bg-cyan-deep ring-4 ring-cyan-glow" />
                    {i < data.timeline.length - 1 && <div className="absolute left-1.5 top-3 bottom-0 -translate-x-1/2 w-px h-full bg-line" />}
                  </div>
                  <div className="flex-1 pb-4">
                    <StatusBadge status={t.status} />
                    <div className="mt-1 text-xs text-ink-3 font-mono num-tabular">{new Date(t.at).toLocaleString('en-LK')}</div>
                    {t.note && <p className="mt-1 text-sm text-ink-2">{t.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <aside className="lg:sticky lg:top-24 h-fit space-y-4">
          <Card padding="lg" variant="elevated">
            <h3 className="text-h3 font-semibold mb-2">Supplier</h3>
            <div className="text-sm font-medium text-ink-1">{data.supplierName}</div>
            {data.supplierAddress && <div className="mt-1 text-xs text-ink-3 flex items-center gap-1"><MapPin className="size-3" /> {data.supplierAddress}</div>}
          </Card>
          <Card padding="lg">
            <h3 className="text-h3 font-semibold mb-2">Total</h3>
            <div className="text-display-sm text-ink-1 font-mono num-tabular">LKR {data.total.toLocaleString('en-LK')}</div>
            <div className="mt-4 flex flex-col gap-2">
              {data.status === 'pending' && (
                <>
                  <Button variant="primary" onClick={() => transition.mutate('accepted')}>Accept</Button>
                  <Button variant="outline" onClick={() => transition.mutate('cancelled')}>Cancel</Button>
                </>
              )}
              {data.status === 'delivered' && (
                <>
                  <Button variant="primary" onClick={() => transition.mutate('completed')}>Mark completed <Check className="size-4" /></Button>
                  <Button variant="outline" onClick={() => transition.mutate('disputed')}>Open dispute <AlertCircle className="size-4" /></Button>
                </>
              )}
              {data.status === 'completed' && (
                <Button variant="outline" onClick={() => transition.mutate('disputed')}>Open dispute</Button>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/OrderDetailPage.tsx
git commit -m "feat(order): redesign OrderDetail with timeline + sticky supplier summary"
```

### Task 4.7: ProfilePage redesign

**Files:**
- Modify: `apps/web/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Card, Avatar, Badge, Button, EmptyState } from '@vyro/ui';
import { Building2, Store, Settings as SettingsIcon, LogOut, ChevronRight, Mail, Phone } from 'lucide-react';
import { api } from '@/lib/api';

export function ProfilePage() {
  const { user, refresh } = useAuth();

  if (!user) return <div className="mx-auto max-w-md py-24"><EmptyState title="Sign in to view your profile" action={<Link to="/login" className="text-sm font-semibold text-cyan-deep hover:underline">Sign in</Link>} /></div>;

  const signOut = async () => {
    await api.post('/auth/sign-out');
    await refresh();
    window.location.href = '/';
  };

  return (
    <div className="mx-auto max-w-3xl px-6 lg:px-10 py-10 space-y-6">
      <h1 className="text-display-sm text-ink-1">Account</h1>

      <Card padding="lg">
        <div className="flex items-start gap-5">
          <Avatar name={user.name || user.email} size="lg" />
          <div className="flex-1">
            <h2 className="text-h2 font-semibold text-ink-1">{user.name || '—'}</h2>
            <div className="mt-1 flex flex-col gap-1 text-sm text-ink-3">
              <span className="inline-flex items-center gap-2"><Mail className="size-3.5" /> {user.email}</span>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/profile/settings"><SettingsIcon className="size-3.5" /> Settings</Link>
          </Button>
        </div>
      </Card>

      <section>
        <h3 className="text-caption uppercase text-ink-3 mb-2">Business memberships</h3>
        {user.memberships?.length ? (
          <div className="space-y-2">
            {user.memberships.map((m) => (
              <Card key={m.businessId} variant="interactive" padding="md" className="flex items-center gap-3">
                <Building2 className="size-5 text-cyan-deep" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-1">{m.businessName}</div>
                  <div className="text-xs text-ink-3">Role: <Badge variant="neutral">{m.role}</Badge></div>
                </div>
                <ChevronRight className="size-4 text-ink-3" />
              </Card>
            ))}
          </div>
        ) : (
          <Card padding="md">
            <EmptyState
              icon={Building2}
              title="No business registered"
              description="Register your business to start placing orders."
              action={<Button asChild><Link to="/onboarding/business">Register business</Link></Button>}
            />
          </Card>
        )}
      </section>

      <section>
        <h3 className="text-caption uppercase text-ink-3 mb-2">Supplier memberships</h3>
        {user.supplierMemberships?.length ? (
          <div className="space-y-2">
            {user.supplierMemberships.map((m) => (
              <Card key={m.supplierId} variant="interactive" padding="md" className="flex items-center gap-3">
                <Store className="size-5 text-violet" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-1">{m.supplierName}</div>
                  <div className="text-xs text-ink-3">Role: <Badge variant="neutral">{m.role}</Badge></div>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/supplier/dashboard">Open dashboard</Link>
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <Card padding="md">
            <EmptyState
              icon={Store}
              title="Not a supplier yet"
              description="Register your supplier profile to sell on VYRO."
              action={<Button asChild><Link to="/onboarding/supplier">Become a supplier</Link></Button>}
            />
          </Card>
        )}
      </section>

      <div className="pt-6 border-t border-line">
        <Button variant="outline" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/ProfilePage.tsx
git commit -m "feat(profile): redesign Profile with avatar header + membership cards"
```

### Task 4.8: SettingsPage (new)

**Files:**
- Modify: `apps/web/src/pages/SettingsPage.tsx` (replace stub)

- [ ] **Step 1: Implement minimal settings tabs**

```tsx
import { useState } from 'react';
import { Card, Tabs, TabsList, TabsTrigger, TabsContent, Field, Input, Switch, Button } from '@vyro/ui';

export function SettingsPage() {
  const [tab, setTab] = useState('profile');
  return (
    <div className="mx-auto max-w-3xl px-6 lg:px-10 py-10">
      <h1 className="text-display-sm text-ink-1 mb-6">Settings</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <Card padding="lg" className="space-y-5">
            <Field label="Display name"><Input defaultValue="" placeholder="Your name" /></Field>
            <Field label="Phone"><Input type="tel" placeholder="+94" /></Field>
            <div className="flex justify-end"><Button>Save changes</Button></div>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card padding="lg" className="space-y-4">
            <div className="flex items-center justify-between"><span>Email notifications</span><Switch defaultChecked /></div>
            <div className="flex items-center justify-between"><span>Order updates</span><Switch defaultChecked /></div>
            <div className="flex items-center justify-between"><span>Marketing</span><Switch /></div>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card padding="lg" className="space-y-4">
            <Field label="Current password"><Input type="password" /></Field>
            <Field label="New password"><Input type="password" /></Field>
            <div className="flex justify-end"><Button>Update password</Button></div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/SettingsPage.tsx
git commit -m "feat(profile): implement Settings page with profile/notifications/security tabs"
```

### Task 4.9: Delete deprecated handwritten icons files

**Files:**
- Delete: `apps/web/src/components/icons.tsx`
- Delete: `apps/web/src/admin/icons.tsx`

- [ ] **Step 1: Find and migrate any remaining references**

Run: `grep -rE "from ['\"]@/components/icons['\"]" apps/web/src --include="*.tsx" --include="*.ts" | grep -v icons.tsx`
Expected: empty.

If any consumers remain, migrate each to lucide-react. Update imports across all redesigned pages (already done in Tasks 4.1-4.8).

- [ ] **Step 2: Delete both files**

```bash
rm apps/web/src/components/icons.tsx apps/web/src/admin/icons.tsx
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
git add -u apps/web/src/components/icons.tsx apps/web/src/admin/icons.tsx
git commit -m "chore(cleanup): remove deprecated handwritten icon files (migrated to lucide-react)"
```

End of Phase 4. Verify with `pnpm typecheck && pnpm build`.

---

## Phase 5 — Supplier Portal

Dashboard, Orders inbox (redesign), Products (list/add/edit), Pricing, Inventory, Analytics, Customers, Deliveries, Payments, Settings.

### Task 5.1: Shared mock data + supplier page header pattern

**Files:**
- Create: `apps/web/src/lib/supplier-mock.ts`

- [ ] **Step 1: Implement mock data fixtures**

```ts
// Realistic mock data for supplier pages where backend endpoints don't exist yet.
// Replace with real API calls once they ship.

export interface SupplierProduct {
  id: string;
  title: string;
  category: string;
  basePrice: number;
  moq: number;
  stock: number;
  threshold: number;
  status: 'active' | 'draft' | 'archived';
  sku: string;
}

export const MOCK_PRODUCTS: SupplierProduct[] = [
  { id: 'p1', title: 'Stainless steel pipe 1"', category: 'Industrial', basePrice: 1250, moq: 50, stock: 1200, threshold: 200, status: 'active', sku: 'SSP-1' },
  { id: 'p2', title: 'Copper pipe 1/2"', category: 'Industrial', basePrice: 850, moq: 100, stock: 80, threshold: 100, status: 'active', sku: 'CP-05' },
  { id: 'p3', title: 'PVC pipe 2"', category: 'Industrial', basePrice: 320, moq: 200, stock: 0, threshold: 150, status: 'active', sku: 'PVC-2' },
  { id: 'p4', title: 'Office chair ergonomic', category: 'Office', basePrice: 12500, moq: 10, stock: 240, threshold: 30, status: 'active', sku: 'OC-E' },
  { id: 'p5', title: 'Cardboard box 30x30x30', category: 'Packaging', basePrice: 95, moq: 500, stock: 12000, threshold: 2000, status: 'active', sku: 'CB-30' },
];

export interface SupplierCustomer {
  id: string;
  name: string;
  contact: string;
  email: string;
  ordersCount: number;
  lifetimeSpend: number;
  lastOrderAt: string;
}

export const MOCK_CUSTOMERS: SupplierCustomer[] = [
  { id: 'b1', name: 'Lanka Hardware (Pvt) Ltd', contact: 'Ruwan Perera', email: 'ruwan@lankahw.lk', ordersCount: 23, lifetimeSpend: 4_120_000, lastOrderAt: '2026-08-21' },
  { id: 'b2', name: 'Colombo Office Co', contact: 'Shani Fernando', email: 'shani@colombooffice.lk', ordersCount: 11, lifetimeSpend: 980_000, lastOrderAt: '2026-08-30' },
  { id: 'b3', name: 'Hilton Colombo', contact: 'Mahesh Karunaratne', email: 'procurement@hilton.lk', ordersCount: 47, lifetimeSpend: 18_900_000, lastOrderAt: '2026-09-02' },
];

export const REVENUE_TREND_30D = Array.from({ length: 30 }, (_, i) => 80000 + Math.round(Math.sin(i / 3) * 35000) + Math.round(Math.random() * 25000));
export const ORDERS_VOLUME_30D = Array.from({ length: 30 }, (_, i) => 10 + Math.round(Math.cos(i / 4) * 6) + Math.round(Math.random() * 4));
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/supplier-mock.ts
git commit -m "feat(supplier): shared mock data for new supplier pages"
```

### Task 5.2: SupplierDashboardPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierDashboardPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link } from 'react-router-dom';
import { ArrowRight, Inbox, Boxes, TrendingUp, Clock } from 'lucide-react';
import { Card, SectionCard, MetricTile, Stat, Sparkline, AreaChart, EmptyState, Button, Badge } from '@vyro/ui';
import { MOCK_PRODUCTS, REVENUE_TREND_30D } from '@/lib/supplier-mock';

export function SupplierDashboardPage() {
  const lowStock = MOCK_PRODUCTS.filter((p) => p.stock < p.threshold);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Revenue (30d)" value="LKR 3.4M" delta={{ value: '+12.4%', direction: 'up' }} sparkline={REVENUE_TREND_30D} />
        <MetricTile label="Orders to fulfill" value="14" delta={{ value: '+3', direction: 'up' }} />
        <MetricTile label="Inventory alerts" value={lowStock.length.toString()} delta={lowStock.length ? { value: 'Action needed', direction: 'down' } : undefined} />
        <MetricTile label="Avg lead time" value="2.4 days" delta={{ value: '-0.3d', direction: 'up' }} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <Badge variant="brand">Revenue</Badge>
              <h2 className="mt-2 text-h2 font-semibold text-ink-1">Revenue trend</h2>
            </div>
            <Button variant="outline" size="sm" asChild><Link to="/supplier/analytics">Details <ArrowRight className="size-3.5" /></Link></Button>
          </div>
          <AreaChart data={REVENUE_TREND_30D} />
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-h3 font-semibold text-ink-1">Incoming orders</h2>
            <Badge variant="brand">4 new</Badge>
          </div>
          <ul className="space-y-3">
            {[1,2,3,4].map((i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="size-2 rounded-full bg-cyan-deep" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink-1">Order #PO-{10200 + i}</div>
                  <div className="text-xs text-ink-3">Lanka Hardware · 3 items</div>
                </div>
                <div className="text-xs text-ink-3 num-tabular">LKR {(120000 + i*10000).toLocaleString('en-LK')}</div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {lowStock.length > 0 && (
        <Card padding="md" className="border-l-4 border-l-amber">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-h3 font-semibold text-ink-1 flex items-center gap-2"><Boxes className="size-4 text-amber" /> Low stock alert</h3>
              <p className="text-sm text-ink-3 mt-1">{lowStock.length} product{lowStock.length > 1 ? 's' : ''} below threshold.</p>
            </div>
            <Button variant="outline" asChild><Link to="/supplier/inventory">Review</Link></Button>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierDashboardPage.tsx
git commit -m "feat(supplier): implement dashboard with metric tiles + revenue chart"
```

### Task 5.3: SupplierOrdersPage redesign (existing route)

**Files:**
- Modify: `apps/web/src/pages/SupplierOrdersPage.tsx`

Apply the same pattern as OrdersPage (Task 4.5) but for supplier inbox:
- Replace tabs with order status filters
- Use Card variant=interactive per row
- Inline accept/reject actions for pending status

- [ ] **Step 1: Implement following Task 4.5 pattern**

Mirror OrderDetailPage transition actions. Filter chips: Pending, In progress, Delivered, Disputed. Each row shows PO id, business name, items, total, status badge. Pending rows have inline Accept/Reject buttons.

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/SupplierOrdersPage.tsx
git commit -m "feat(supplier): redesign supplier orders inbox with inline accept/reject"
```

### Task 5.4: SupplierProductsPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierProductsPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Link } from 'react-router-dom';
import { Plus, Edit, Archive, Package } from 'lucide-react';
import { Button, Card, Table, THead, TBody, TR, TH, TD, EmptyState, Badge, Input, Skeleton } from '@vyro/ui';
import { useState } from 'react';
import { MOCK_PRODUCTS } from '@/lib/supplier-mock';

export function SupplierProductsPage() {
  const [q, setQ] = useState('');
  const filtered = MOCK_PRODUCTS.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-display-sm text-ink-1">Products</h1>
          <p className="text-sm text-ink-3 mt-1 num-tabular">{MOCK_PRODUCTS.length} products</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
          <Button asChild><Link to="/supplier/products/new"><Plus className="size-4" /> Add product</Link></Button>
        </div>
      </header>
      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="No products yet" description="Add your first product to start selling on VYRO." action={<Button asChild><Link to="/supplier/products/new"><Plus className="size-4" /> Add your first product</Link></Button>} />
      ) : (
        <Card padding="none">
          <Table>
            <THead>
              <TR><TH>Product</TH><TH>SKU</TH><TH>Category</TH><TH>Price</TH><TH>MOQ</TH><TH>Stock</TH><TH>Status</TH><TH></TH></TR>
            </THead>
            <TBody>
              {filtered.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium text-ink-1">{p.title}</TD>
                  <TD className="font-mono text-ink-3">{p.sku}</TD>
                  <TD>{p.category}</TD>
                  <TD className="font-mono">LKR {p.basePrice.toLocaleString('en-LK')}</TD>
                  <TD>{p.moq}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-line overflow-hidden">
                        <div className={'h-full ' + (p.stock < p.threshold ? 'bg-rose' : p.stock < p.threshold * 2 ? 'bg-amber' : 'bg-mint')} style={{ width: `${Math.min(100, (p.stock / (p.threshold * 3)) * 100)}%` }} />
                      </div>
                      <span className="text-xs num-tabular">{p.stock}</span>
                    </div>
                  </TD>
                  <TD><Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge></TD>
                  <TD>
                    <div className="flex items-center gap-1 justify-end">
                      <Button variant="ghost" size="sm" asChild><Link to={`/supplier/products/${p.id}/edit`}><Edit className="size-3.5" /></Link></Button>
                      <Button variant="ghost" size="sm"><Archive className="size-3.5" /></Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierProductsPage.tsx
git commit -m "feat(supplier): implement Products list with stock progress bars"
```

### Task 5.5: SupplierAddProductPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierAddProductPage.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Package } from 'lucide-react';
import { Card, Field, Input, Textarea, Select, SelectTrigger, SelectContent, SelectItem, Button, useToast } from '@vyro/ui';

const CATEGORIES = ['Industrial', 'Office', 'Packaging', 'Electronics', 'Hospitality', 'Construction'];

export function SupplierAddProductPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', sku: '', category: '', description: '', basePrice: '', moq: '', leadTime: '', stock: '' });
  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const onSave = () => {
    if (!form.title || !form.category) {
      toast.show(toast.error('Title and category are required'));
      return;
    }
    toast.show(toast.success('Product created (mock)'));
    navigate('/supplier/products');
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-display-sm text-ink-1">Add product</h1>
          <p className="text-sm text-ink-3 mt-1">List a new product on VYRO.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="size-3.5" /> Back</Button>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card padding="lg" className="space-y-5">
          <Field label="Product title" htmlFor="t" required><Input id="t" placeholder="e.g. Stainless steel pipe 1\"" value={form.title} onChange={update('title')} required /></Field>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="SKU" htmlFor="sku"><Input id="sku" placeholder="SSP-1" value={form.sku} onChange={update('sku')} /></Field>
            <Field label="Category" htmlFor="cat" required>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger id="cat"><Select.Value placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Description" htmlFor="desc"><Textarea id="desc" placeholder="Product description…" value={form.description} onChange={update('description')} /></Field>
          <div className="grid sm:grid-cols-3 gap-5">
            <Field label="Base price (LKR)" htmlFor="p" required><Input id="p" type="number" value={form.basePrice} onChange={update('basePrice')} required /></Field>
            <Field label="MOQ" htmlFor="m" required><Input id="m" type="number" value={form.moq} onChange={update('moq')} required /></Field>
            <Field label="Lead time (days)" htmlFor="l"><Input id="l" type="number" value={form.leadTime} onChange={update('leadTime')} /></Field>
          </div>
          <Field label="Initial stock" htmlFor="s"><Input id="s" type="number" value={form.stock} onChange={update('stock')} /></Field>
        </Card>
        <aside className="lg:sticky lg:top-24 h-fit space-y-4">
          <Card padding="lg" tone="light">
            <h3 className="text-h3 font-semibold mb-3">Preview</h3>
            <div className="aspect-square rounded-md bg-pearl overflow-hidden mb-4">
              <Package className="size-full p-8 text-ink-4" />
            </div>
            <div className="text-sm font-semibold text-ink-1">{form.title || 'Product title'}</div>
            <div className="text-xs text-ink-3 mt-1">{form.category || 'Category'}</div>
            <div className="mt-3 text-base font-mono font-semibold num-tabular">{form.basePrice ? `LKR ${Number(form.basePrice).toLocaleString('en-LK')}` : 'LKR —'}</div>
          </Card>
          <Button size="lg" className="w-full" onClick={onSave}><Save className="size-4" /> Save product</Button>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierAddProductPage.tsx
git commit -m "feat(supplier): implement Add Product page with live preview"
```

### Task 5.6: SupplierEditProductPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierEditProductPage.tsx`

Reuse the AddProductPage layout with `defaultValues` populated from the route param `id`. Search MOCK_PRODUCTS by id and prefill the form. Save action navigates back to `/supplier/products` with success toast.

- [ ] **Step 1: Implement using the AddProductPage layout as a template**

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft } from 'lucide-react';
import { Card, Field, Input, Textarea, Select, SelectTrigger, SelectContent, SelectItem, Button, useToast } from '@vyro/ui';
import { MOCK_PRODUCTS } from '@/lib/supplier-mock';

const CATEGORIES = ['Industrial', 'Office', 'Packaging', 'Electronics', 'Hospitality', 'Construction'];

export function SupplierEditProductPage() {
  const { id } = useParams();
  const product = MOCK_PRODUCTS.find((p) => p.id === id);
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    title: product?.title ?? '',
    sku: product?.sku ?? '',
    category: product?.category ?? '',
    description: '',
    basePrice: String(product?.basePrice ?? ''),
    moq: String(product?.moq ?? ''),
    leadTime: '',
    stock: String(product?.stock ?? ''),
  });
  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  if (!product) return <div className="text-sm text-ink-3">Product not found.</div>;

  const onSave = () => {
    toast.show(toast.success('Product updated (mock)'));
    navigate('/supplier/products');
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-display-sm text-ink-1">Edit product</h1>
          <p className="text-sm text-ink-3 mt-1">{product.title}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="size-3.5" /> Back</Button>
      </header>
      <Card padding="lg" className="space-y-5">
        <Field label="Product title" required><Input value={form.title} onChange={update('title')} /></Field>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="SKU"><Input value={form.sku} onChange={update('sku')} /></Field>
          <Field label="Category" required>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><Select.Value /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Description"><Textarea value={form.description} onChange={update('description')} /></Field>
        <div className="grid sm:grid-cols-3 gap-5">
          <Field label="Base price (LKR)" required><Input type="number" value={form.basePrice} onChange={update('basePrice')} /></Field>
          <Field label="MOQ" required><Input type="number" value={form.moq} onChange={update('moq')} /></Field>
          <Field label="Lead time (days)"><Input type="number" value={form.leadTime} onChange={update('leadTime')} /></Field>
        </div>
        <Field label="Stock"><Input type="number" value={form.stock} onChange={update('stock')} /></Field>
        <div className="flex justify-end pt-4 border-t border-line"><Button onClick={onSave}><Save className="size-4" /> Save changes</Button></div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierEditProductPage.tsx
git commit -m "feat(supplier): implement Edit Product page"
```

### Task 5.7: SupplierPricingPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierPricingPage.tsx`

Inline editable price/MOQ/lead time per product row. Sticky "Apply changes" bar appears at bottom when any cell edited.

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Input, Button, useToast } from '@vyro/ui';
import { MOCK_PRODUCTS } from '@/lib/supplier-mock';

export function SupplierPricingPage() {
  const toast = useToast();
  const [rows, setRows] = useState(MOCK_PRODUCTS.map((p) => ({ id: p.id, basePrice: p.basePrice, moq: p.moq, leadTime: '3' })));
  const [baseline] = useState(rows);
  const dirty = rows.some((r, i) => JSON.stringify(r) !== JSON.stringify(baseline[i]));
  const update = (id: string, k: 'basePrice' | 'moq' | 'leadTime', v: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: k === 'leadTime' ? v : Number(v) } : r)));
  const reset = () => setRows(baseline);
  const apply = () => { toast.show(toast.success(`${dirty ? rows.length : 0} changes applied (mock)`)); };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-display-sm text-ink-1">Pricing</h1>
        <p className="text-sm text-ink-3 mt-1">Adjust base price, MOQ, and lead time per product.</p>
      </header>
      <Card padding="none">
        <Table>
          <THead><TR><TH>Product</TH><TH>Base price (LKR)</TH><TH>MOQ</TH><TH>Lead time (days)</TH></TR></THead>
          <TBody>
            {rows.map((r) => {
              const p = MOCK_PRODUCTS.find((x) => x.id === r.id)!;
              return (
                <TR key={r.id}>
                  <TD className="font-medium text-ink-1">{p.title}</TD>
                  <TD><Input type="number" value={r.basePrice} onChange={(e) => update(r.id, 'basePrice', e.target.value)} className="w-32 font-mono" /></TD>
                  <TD><Input type="number" value={r.moq} onChange={(e) => update(r.id, 'moq', e.target.value)} className="w-24" /></TD>
                  <TD><Input type="text" value={r.leadTime} onChange={(e) => update(r.id, 'leadTime', e.target.value)} className="w-24" /></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      {dirty && (
        <div className="sticky bottom-4 rounded-md border border-cyan-deep bg-paper shadow-2 p-4 flex items-center justify-between">
          <span className="text-sm text-ink-2">You have unsaved pricing changes.</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={reset}><RotateCcw className="size-4" /> Reset</Button>
            <Button onClick={apply}><Save className="size-4" /> Apply changes</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierPricingPage.tsx
git commit -m "feat(supplier): implement Pricing page with inline editor + sticky apply bar"
```

### Task 5.8: SupplierInventoryPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierInventoryPage.tsx`

Show low-stock alert banner + table with on-hand, reserved, available, threshold, status badge.

- [ ] **Step 1: Implement**

```tsx
import { Card, Table, THead, TBody, TR, TH, TD, Badge, Button, AlertCircle } from '@vyro/ui';
import { Boxes } from 'lucide-react';
import { MOCK_PRODUCTS } from '@/lib/supplier-mock';
import { Link } from 'react-router-dom';

export function SupplierInventoryPage() {
  const low = MOCK_PRODUCTS.filter((p) => p.stock < p.threshold);
  return (
    <div className="space-y-6">
      <header><h1 className="text-display-sm text-ink-1">Inventory</h1></header>
      {low.length > 0 && (
        <Card padding="md" className="border-l-4 border-l-amber">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 text-amber" />
              <div>
                <h3 className="text-h3 font-semibold text-ink-1">Low stock alert</h3>
                <p className="text-sm text-ink-3">{low.length} product{low.length > 1 ? 's' : ''} below threshold.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild><Link to="/supplier/products">Restock</Link></Button>
          </div>
        </Card>
      )}
      <Card padding="none">
        <Table>
          <THead><TR><TH>Product</TH><TH className="text-right">On hand</TH><TH className="text-right">Threshold</TH><TH>Status</TH></TR></THead>
          <TBody>
            {MOCK_PRODUCTS.map((p) => {
              const status = p.stock === 0 ? 'out' : p.stock < p.threshold ? 'low' : 'in';
              return (
                <TR key={p.id}>
                  <TD className="font-medium text-ink-1">{p.title}</TD>
                  <TD className="text-right num-tabular">{p.stock}</TD>
                  <TD className="text-right num-tabular text-ink-3">{p.threshold}</TD>
                  <TD>
                    <Badge variant={status === 'in' ? 'success' : status === 'low' ? 'warning' : 'danger'}>
                      {status === 'in' ? 'In stock' : status === 'low' ? 'Low stock' : 'Out'}
                    </Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierInventoryPage.tsx
git commit -m "feat(supplier): implement Inventory page with low-stock alert"
```

### Task 5.9: SupplierAnalyticsPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierAnalyticsPage.tsx`

Top metric row, dual line chart, top products table.

- [ ] **Step 1: Implement**

```tsx
import { Card, MetricTile, LineChart, Table, THead, TBody, TR, TH, TD } from '@vyro/ui';
import { MOCK_PRODUCTS, REVENUE_TREND_30D, ORDERS_VOLUME_30D } from '@/lib/supplier-mock';

export function SupplierAnalyticsPage() {
  const top = [...MOCK_PRODUCTS].sort((a, b) => b.basePrice * b.stock - a.basePrice * a.stock).slice(0, 5);
  return (
    <div className="space-y-6">
      <header><h1 className="text-display-sm text-ink-1">Analytics</h1></header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Revenue (30d)" value="LKR 3.4M" delta={{ value: '+12.4%', direction: 'up' }} sparkline={REVENUE_TREND_30D} />
        <MetricTile label="Orders (30d)" value="248" delta={{ value: '+5.1%', direction: 'up' }} sparkline={ORDERS_VOLUME_30D} />
        <MetricTile label="Avg order" value="LKR 13,720" delta={{ value: '-1.2%', direction: 'down' }} />
        <MetricTile label="Repeat rate" value="62%" delta={{ value: '+2.4%', direction: 'up' }} />
      </div>
      <Card padding="lg">
        <h2 className="text-h2 font-semibold text-ink-1 mb-4">Revenue & orders (30d)</h2>
        <LineChart series={[{ name: 'Revenue', color: '#5EE2FF', data: REVENUE_TREND_30D }, { name: 'Orders', color: '#1FB28A', data: ORDERS_VOLUME_30D.map((v) => v * 1000) }]} />
      </Card>
      <Card padding="none">
        <Table>
          <THead><TR><TH>Product</TH><TH>Category</TH><TH className="text-right">Revenue</TH></TR></THead>
          <TBody>
            {top.map((p) => (
              <TR key={p.id}><TD className="font-medium text-ink-1">{p.title}</TD><TD>{p.category}</TD><TD className="text-right font-mono">LKR {(p.basePrice * p.stock).toLocaleString('en-LK')}</TD></TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierAnalyticsPage.tsx
git commit -m "feat(supplier): implement Analytics page with metrics + dual line chart"
```

### Task 5.10: SupplierCustomersPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierCustomersPage.tsx`

```tsx
import { Card, Table, THead, TBody, TR, TH, TD, Avatar } from '@vyro/ui';
import { MOCK_CUSTOMERS } from '@/lib/supplier-mock';

export function SupplierCustomersPage() {
  return (
    <div className="space-y-6">
      <header><h1 className="text-display-sm text-ink-1">Business customers</h1><p className="text-sm text-ink-3 mt-1 num-tabular">{MOCK_CUSTOMERS.length} active customers</p></header>
      <Card padding="none">
        <Table>
          <THead><TR><TH>Business</TH><TH>Contact</TH><TH className="text-right">Orders</TH><TH className="text-right">Lifetime spend</TH><TH>Last order</TH></TR></THead>
          <TBody>
            {MOCK_CUSTOMERS.map((c) => (
              <TR key={c.id}>
                <TD><div className="flex items-center gap-3"><Avatar name={c.name} size="sm" /><span className="font-medium text-ink-1">{c.name}</span></div></TD>
                <TD><div className="text-sm text-ink-2">{c.contact}</div><div className="text-xs text-ink-3">{c.email}</div></TD>
                <TD className="text-right num-tabular">{c.ordersCount}</TD>
                <TD className="text-right font-mono num-tabular font-semibold">LKR {c.lifetimeSpend.toLocaleString('en-LK')}</TD>
                <TD className="text-ink-3 num-tabular">{new Date(c.lastOrderAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 1: Implement, verify, commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierCustomersPage.tsx
git commit -m "feat(supplier): implement Customers page with avatars + lifetime spend"
```

### Task 5.11: SupplierDeliveriesPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierDeliveriesPage.tsx`

```tsx
import { Card, Table, THead, TBody, TR, TH, TD, Tabs, TabsList, TabsTrigger, TabsContent, StatusBadge } from '@vyro/ui';
import { useState } from 'react';

const ROWS = [
  { id: 'd1', po: 'PO-28401', business: 'Lanka Hardware', address: 'Colombo 03', eta: '2026-09-05', status: 'in_transit' as const },
  { id: 'd2', po: 'PO-28402', business: 'Hilton Colombo', address: 'Colombo 01', eta: '2026-09-06', status: 'preparing' as const },
  { id: 'd3', po: 'PO-28350', business: 'Colombo Office Co', address: 'Colombo 04', eta: '2026-08-30', status: 'delivered' as const },
];

export function SupplierDeliveriesPage() {
  const [tab, setTab] = useState('scheduled');
  return (
    <div className="space-y-6">
      <header><h1 className="text-display-sm text-ink-1">Deliveries</h1></header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="transit">In transit</TabsTrigger>
          <TabsTrigger value="delivered">Delivered</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
          <Card padding="none">
            <Table>
              <THead><TR><TH>PO</TH><TH>Business</TH><TH>Address</TH><TH>ETA</TH><TH>Status</TH></TR></THead>
              <TBody>
                {ROWS.filter((r) => tab === 'scheduled' ? r.status === 'preparing' : tab === 'transit' ? r.status === 'in_transit' : r.status === 'delivered').map((r) => (
                  <TR key={r.id}><TD className="font-mono">{r.po}</TD><TD>{r.business}</TD><TD>{r.address}</TD><TD className="num-tabular">{new Date(r.eta).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}</TD><TD><StatusBadge status={r.status} /></TD></TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 1: Implement, verify, commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierDeliveriesPage.tsx
git commit -m "feat(supplier): implement Deliveries page with status tabs"
```

### Task 5.12: SupplierPaymentsPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierPaymentsPage.tsx`

```tsx
import { Card, MetricTile, Table, THead, TBody, TR, TH, TD, Badge } from '@vyro/ui';

const ROWS = [
  { id: 'pay1', po: 'PO-28401', business: 'Lanka Hardware', amount: 124000, status: 'paid' as const, at: '2026-08-30' },
  { id: 'pay2', po: 'PO-28402', business: 'Hilton Colombo', amount: 580000, status: 'processing' as const, at: '2026-09-02' },
  { id: 'pay3', po: 'PO-28403', business: 'Colombo Office Co', amount: 95000, status: 'pending' as const, at: '2026-09-03' },
];

export function SupplierPaymentsPage() {
  return (
    <div className="space-y-6">
      <header><h1 className="text-display-sm text-ink-1">Payments</h1></header>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile label="Outstanding" value="LKR 675K" />
        <MetricTile label="Paid (30d)" value="LKR 3.2M" delta={{ value: '+8.2%', direction: 'up' }} />
        <MetricTile label="Refunds" value="LKR 0" />
      </div>
      <Card padding="none">
        <Table>
          <THead><TR><TH>PO</TH><TH>Business</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH>Processed</TH></TR></THead>
          <TBody>
            {ROWS.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono">{r.po}</TD>
                <TD>{r.business}</TD>
                <TD className="text-right font-mono font-semibold num-tabular">LKR {r.amount.toLocaleString('en-LK')}</TD>
                <TD><Badge variant={r.status === 'paid' ? 'success' : r.status === 'processing' ? 'brand' : 'warning'}>{r.status}</Badge></TD>
                <TD className="num-tabular text-ink-3">{r.at}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 1: Implement, verify, commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierPaymentsPage.tsx
git commit -m "feat(supplier): implement Payments page with outstanding summary"
```

### Task 5.13: SupplierSettingsPage

**Files:**
- Modify: `apps/web/src/pages/supplier/SupplierSettingsPage.tsx`

Apply the same Tabs pattern as Task 4.8 (Settings). Tabs: Company, Warehouse, Payouts, Notifications. Each tab is a Card with Field/Input/Button.

- [ ] **Step 1: Implement following the Task 4.8 pattern**

```tsx
import { useState } from 'react';
import { Card, Tabs, TabsList, TabsTrigger, TabsContent, Field, Input, Switch, Button } from '@vyro/ui';

export function SupplierSettingsPage() {
  const [tab, setTab] = useState('company');
  return (
    <div className="space-y-6">
      <header><h1 className="text-display-sm text-ink-1">Settings</h1></header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="warehouse">Warehouse</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="company">
          <Card padding="lg" className="space-y-5">
            <Field label="Company name"><Input defaultValue="Lanka Steel Supplies" /></Field>
            <Field label="Registration"><Input defaultValue="PV 12345" /></Field>
            <div className="flex justify-end"><Button>Save</Button></div>
          </Card>
        </TabsContent>
        <TabsContent value="warehouse">
          <Card padding="lg" className="space-y-5">
            <Field label="Address line 1"><Input defaultValue="42 Galle Road" /></Field>
            <Field label="City"><Input defaultValue="Colombo" /></Field>
            <div className="flex justify-end"><Button>Save</Button></div>
          </Card>
        </TabsContent>
        <TabsContent value="payouts">
          <Card padding="lg" className="space-y-5">
            <Field label="Bank name"><Input defaultValue="Bank of Ceylon" /></Field>
            <Field label="Account number"><Input defaultValue="••••••1234" /></Field>
            <div className="flex justify-end"><Button>Save</Button></div>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card padding="lg" className="space-y-4">
            <div className="flex items-center justify-between"><span>New orders</span><Switch defaultChecked /></div>
            <div className="flex items-center justify-between"><span>Low stock</span><Switch defaultChecked /></div>
            <div className="flex items-center justify-between"><span>Payments</span><Switch defaultChecked /></div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/supplier/SupplierSettingsPage.tsx
git commit -m "feat(supplier): implement Settings with Company/Warehouse/Payouts/Notifications tabs"
```

End of Phase 5. Verify with `pnpm typecheck && pnpm build`.

---

## Phase 6 — Admin Portal

Login (redesign), Dashboard, Businesses, Suppliers, Products, Categories, Orders, Deliveries, Payments, Disputes, Users, Analytics, Audit, Settings. Many pages follow the Table + Card + filter pattern established in earlier phases.

### Task 6.1: AdminLoginPage redesign

**Files:**
- Modify: `apps/web/src/admin/LoginPage.tsx`

Reuse the split-layout shell from Task 3.2 with the Admin branding (midnight left, "Administrate VYRO" headline, ShieldCheck icon).

- [ ] **Step 1: Implement following Task 3.2 pattern**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, ShieldCheck, Database, Activity } from 'lucide-react';
import { Button, Input, Field, Logo, api, useAdminAuth, useToast } from '@vyro/ui';

const LEFT_PROPS = [
  { icon: ShieldCheck, label: 'Secure admin access' },
  { icon: Database, label: 'Full data visibility' },
  { icon: Activity, label: 'Real-time audit log' },
];

export function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAdminAuth();
  const toast = useToast();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/sign-in', { email, password });
      await refresh();
      navigate('/admin');
    } catch (err: any) {
      toast.show(toast.error('Sign in failed', err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-pearl">
      <aside className="lg:w-[44%] bg-midnight-1 text-paper p-10 lg:p-16 flex flex-col justify-between">
        <Logo tone="dark" to="/admin/login" eyebrow="Admin" size="lg" />
        <div className="max-w-md">
          <h2 className="text-display-md text-paper text-balance">Administrate VYRO.</h2>
          <p className="mt-3 text-ink-4">Platform access for verified VYRO admins. Sign in to manage businesses, suppliers, orders, and disputes.</p>
          <ul className="mt-8 flex flex-col gap-3">
            {LEFT_PROPS.map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm text-paper">
                <span className="size-7 rounded-full bg-cyan/15 text-cyan-deep inline-flex items-center justify-center"><p.icon className="size-4" /></span>
                {p.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-4">© {new Date().getFullYear()} VYRO</p>
      </aside>
      <main className="flex-1 flex items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-md rounded-xl bg-paper border border-line shadow-2 p-10">
          <h1 className="text-display-sm text-ink-1">Admin sign in</h1>
          <p className="mt-2 text-sm text-ink-3">Authorized personnel only.</p>
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5">
            <Field label="Email" htmlFor="email" required><Input id="email" type="email" leftSlot={<Mail />} value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password" htmlFor="password" required><Input id="password" type="password" leftSlot={<Lock />} value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <Button type="submit" loading={loading} size="lg">Sign in <ArrowRight className="size-4" /></Button>
          </form>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/admin/LoginPage.tsx
git commit -m "feat(admin): redesign Login with split midnight + form"
```

### Task 6.2: AdminSuppliersPage + AdminBusinessesPage (split Lists.tsx)

**Files:**
- Delete: `apps/web/src/admin/Lists.tsx` (after migration)
- Create: `apps/web/src/admin/AdminSuppliersPage.tsx`
- Create: `apps/web/src/admin/AdminBusinessesPage.tsx`

Both follow the same pattern: header with H1 + filter chips, search input, Table with supplier/business rows + row actions.

- [ ] **Step 1: Implement AdminSuppliersPage**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Building2, Star, CheckCircle2, XCircle } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Input, Chip, Skeleton, Badge, Avatar, Button, EmptyState } from '@vyro/ui';
import { api } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  category: string;
  contactEmail: string;
  productCount: number;
  gmv: number;
  rating: number;
  status: 'active' | 'pending' | 'suspended';
  joinedAt: string;
}

export function AdminSuppliersPage() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin-suppliers', q],
    queryFn: () => api.get<{ suppliers: Supplier[] }>('/admin/suppliers'),
  });
  const filtered = (data?.suppliers ?? []).filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div><h1 className="text-display-sm text-ink-1">Suppliers</h1><p className="text-sm text-ink-3 mt-1 num-tabular">{data?.suppliers?.length ?? 0} suppliers</p></div>
        <div className="flex items-center gap-2"><Input placeholder="Search…" leftSlot={<Search />} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" /></div>
      </header>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip selected>All</Chip>
        <Chip>Active</Chip>
        <Chip>Pending</Chip>
        <Chip>Suspended</Chip>
      </div>
      {isLoading ? <Skeleton size="card" /> : filtered.length === 0 ? <EmptyState icon={Building2} title="No suppliers" /> : (
        <Card padding="none">
          <Table>
            <THead><TR><TH>Supplier</TH><TH>Category</TH><TH>Products</TH><TH className="text-right">GMV</TH><TH>Rating</TH><TH>Status</TH><TH>Joined</TH><TH></TH></TR></THead>
            <TBody>
              {filtered.map((s) => (
                <TR key={s.id}>
                  <TD><div className="flex items-center gap-3"><Avatar name={s.name} size="sm" /><span className="font-medium text-ink-1">{s.name}</span></div></TD>
                  <TD>{s.category}</TD>
                  <TD className="num-tabular">{s.productCount}</TD>
                  <TD className="text-right font-mono num-tabular">LKR {s.gmv.toLocaleString('en-LK')}</TD>
                  <TD><div className="inline-flex items-center gap-1 text-sm"><Star className="size-3.5 fill-amber text-amber" />{s.rating.toFixed(1)}</div></TD>
                  <TD><Badge variant={s.status === 'active' ? 'success' : s.status === 'pending' ? 'warning' : 'danger'}>{s.status}</Badge></TD>
                  <TD className="text-ink-3 num-tabular">{new Date(s.joinedAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}</TD>
                  <TD><div className="flex items-center gap-1 justify-end"><Button variant="ghost" size="sm"><CheckCircle2 className="size-3.5 text-mint" /></Button><Button variant="ghost" size="sm"><XCircle className="size-3.5 text-rose" /></Button></div></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement AdminBusinessesPage** (same pattern, fields: owner, memberCount, GMV, status, joinedAt)

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Input, Chip, Skeleton, Badge, Avatar, Button } from '@vyro/ui';
import { api } from '@/lib/api';

interface Business { id: string; name: string; ownerName: string; memberCount: number; gmv: number; status: 'active' | 'pending' | 'suspended'; joinedAt: string; }

export function AdminBusinessesPage() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-businesses', q], queryFn: () => api.get<{ businesses: Business[] }>('/admin/businesses') });
  const filtered = (data?.businesses ?? []).filter((b) => b.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div><h1 className="text-display-sm text-ink-1">Businesses</h1><p className="text-sm text-ink-3 mt-1 num-tabular">{data?.businesses?.length ?? 0} businesses</p></div>
        <Input placeholder="Search…" leftSlot={<Search />} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
      </header>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip selected>All</Chip><Chip>Active</Chip><Chip>Pending</Chip><Chip>Suspended</Chip>
      </div>
      {isLoading ? <Skeleton size="card" /> : (
        <Card padding="none">
          <Table>
            <THead><TR><TH>Business</TH><TH>Owner</TH><TH>Members</TH><TH className="text-right">GMV</TH><TH>Status</TH><TH>Joined</TH><TH></TH></TR></THead>
            <TBody>
              {filtered.map((b) => (
                <TR key={b.id}>
                  <TD><div className="flex items-center gap-3"><Avatar name={b.name} size="sm" /><span className="font-medium text-ink-1">{b.name}</span></div></TD>
                  <TD>{b.ownerName}</TD>
                  <TD className="num-tabular">{b.memberCount}</TD>
                  <TD className="text-right font-mono num-tabular">LKR {b.gmv.toLocaleString('en-LK')}</TD>
                  <TD><Badge variant={b.status === 'active' ? 'success' : b.status === 'pending' ? 'warning' : 'danger'}>{b.status}</Badge></TD>
                  <TD className="text-ink-3 num-tabular">{new Date(b.joinedAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}</TD>
                  <TD><Button variant="ghost" size="sm">View</Button></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Delete Lists.tsx**

```bash
rm apps/web/src/admin/Lists.tsx
git add -u apps/web/src/admin/Lists.tsx apps/web/src/admin/AdminSuppliersPage.tsx apps/web/src/admin/AdminBusinessesPage.tsx
git commit -m "feat(admin): split Lists into AdminSuppliers + AdminBusinesses with Table primitives"
```

### Task 6.3: AdminDashboardPage

**Files:**
- Modify: `apps/web/src/admin/AdminDashboardPage.tsx`

Mirror Task 5.2 (Supplier Dashboard) but admin-wide:
- 4 metric tiles (Active businesses, Active suppliers, GMV, Disputes open) on midnight ground
- Below: 2-col Recent activity + Action required

- [ ] **Step 1: Implement following the Task 5.2 pattern**

```tsx
import { MetricTile, Card, SectionCard, Badge, Table, THead, TBody, TR, TH, TD, AreaChart, AlertCircle } from '@vyro/ui';
import { Link } from 'react-router-dom';
import { REVENUE_TREND_30D } from '@/lib/supplier-mock';

export function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <SectionCard tone="dark" className="-mx-6 lg:-mx-10 -mt-10 rounded-none border-x-0 border-t-0">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <div><div className="text-display-sm text-paper num-tabular">12,400</div><div className="mt-1 text-xs uppercase tracking-wider text-ink-4">Active businesses</div></div>
          <div><div className="text-display-sm text-paper num-tabular">1,248</div><div className="mt-1 text-xs uppercase tracking-wider text-ink-4">Active suppliers</div></div>
          <div><div className="text-display-sm text-paper num-tabular">LKR 4.2B</div><div className="mt-1 text-xs uppercase tracking-wider text-ink-4">GMV this month</div></div>
          <div><div className="text-display-sm text-paper num-tabular">23</div><div className="mt-1 text-xs uppercase tracking-wider text-ink-4">Disputes open</div></div>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <div><Badge variant="brand">Activity</Badge><h2 className="mt-2 text-h2 font-semibold text-ink-1">Platform activity (90d)</h2></div>
          </div>
          <AreaChart data={REVENUE_TREND_30D} />
        </Card>
        <Card padding="lg">
          <h2 className="text-h3 font-semibold mb-4">Action required</h2>
          <ul className="space-y-3">
            <li className="flex items-center gap-3 rounded-md p-3 -m-3 border-l-4 border-l-rose bg-rose/5"><AlertCircle className="size-4 text-rose" /><div className="flex-1"><div className="text-sm font-medium text-ink-1">3 disputes need review</div><Link to="/admin/disputed" className="text-xs text-cyan-deep hover:underline">View →</Link></div></li>
            <li className="flex items-center gap-3 rounded-md p-3 -m-3 border-l-4 border-l-amber bg-amber/5"><AlertCircle className="size-4 text-amber" /><div className="flex-1"><div className="text-sm font-medium text-ink-1">8 supplier verifications pending</div><Link to="/admin/suppliers" className="text-xs text-cyan-deep hover:underline">View →</Link></div></li>
            <li className="flex items-center gap-3 rounded-md p-3 -m-3 border-l-4 border-l-violet bg-violet/5"><AlertCircle className="size-4 text-violet" /><div className="flex-1"><div className="text-sm font-medium text-ink-1">5 business approvals</div><Link to="/admin/businesses" className="text-xs text-cyan-deep hover:underline">View →</Link></div></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/admin/AdminDashboardPage.tsx
git commit -m "feat(admin): implement Dashboard with midnight stats strip + action list"
```

### Task 6.4: AdminDisputesPage + AdminAuditPage (split DisputedAndAudit.tsx)

**Files:**
- Delete: `apps/web/src/admin/DisputedAndAudit.tsx` (after migration)
- Create: `apps/web/src/admin/AdminDisputesPage.tsx`
- Create: `apps/web/src/admin/AdminAuditPage.tsx`

Both follow established patterns. Disputes uses Card with rose left stripe per row + Drawer for resolution. Audit uses vertical timeline.

- [ ] **Step 1: Implement AdminDisputesPage**

```tsx
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { Card, Badge, Skeleton, EmptyState, Drawer, DrawerContent, Button } from '@vyro/ui';
import { useState } from 'react';
import { api } from '@/lib/api';

interface Dispute { id: string; poId: string; business: string; supplier: string; amount: number; reason: string; createdAt: string; }

export function AdminDisputesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-disputed'], queryFn: () => api.get<{ orders: Dispute[] }>('/admin/disputed') });
  const [open, setOpen] = useState<Dispute | null>(null);
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div><h1 className="text-display-sm text-ink-1">Disputed orders</h1><p className="text-sm text-ink-3 mt-1 num-tabular">{data?.orders?.length ?? 0} open disputes</p></div>
        <Badge variant="danger">{data?.orders?.length ?? 0} active</Badge>
      </header>
      {isLoading ? <Skeleton size="card" /> : (data?.orders?.length ?? 0) === 0 ? <EmptyState icon={AlertCircle} title="No open disputes" /> : (
        <div className="space-y-3">
          {data!.orders.map((d) => (
            <Card key={d.id} variant="interactive" padding="md" className="border-l-4 border-l-rose flex items-center gap-4" onClick={() => setOpen(d)}>
              <div className="font-mono text-xs text-ink-3 num-tabular">#{d.poId.slice(0,8).toUpperCase()}</div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink-1">{d.business} ↔ {d.supplier}</div>
                <div className="text-xs text-ink-3">{d.reason}</div>
              </div>
              <div className="text-sm font-mono font-semibold num-tabular">LKR {d.amount.toLocaleString('en-LK')}</div>
              <ChevronRight className="size-4 text-ink-3" />
            </Card>
          ))}
        </div>
      )}
      <Drawer open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DrawerContent title={`Dispute ${open.poId.slice(0,8).toUpperCase()}`} description={`${open.business} ↔ ${open.supplier}`}>
            <div className="space-y-4">
              <div className="rounded-md bg-pearl p-4 text-sm">{open.reason}</div>
              <div className="flex flex-col gap-2">
                <Button variant="primary">Resolve in favor of business</Button>
                <Button variant="outline">Resolve in favor of supplier</Button>
                <Button variant="ghost">Escalate</Button>
              </div>
            </div>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}
```

- [ ] **Step 2: Implement AdminAuditPage**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Card, Avatar, Badge, Input, Skeleton } from '@vyro/ui';
import { api } from '@/lib/api';

interface Audit { id: string; actor: string; action: string; resource: string; at: string; }

export function AdminAuditPage() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-audit', q], queryFn: () => api.get<{ logs: Audit[] }>(`/admin/audit?limit=200`) });
  const filtered = (data?.logs ?? []).filter((l) => `${l.actor} ${l.action} ${l.resource}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><h1 className="text-display-sm text-ink-1">Audit log</h1><p className="text-sm text-ink-3 mt-1 num-tabular">{data?.logs?.length ?? 0} events</p></div><Input placeholder="Filter…" leftSlot={<Search />} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" /></header>
      {isLoading ? <Skeleton size="card" /> : (
        <Card padding="md">
          <ol className="space-y-4">
            {filtered.map((l) => (
              <li key={l.id} className="flex gap-3 items-start">
                <Avatar name={l.actor} size="sm" />
                <div className="flex-1">
                  <div className="text-sm text-ink-1"><span className="font-semibold">{l.actor}</span> <Badge variant="neutral" className="mx-1">{l.action}</Badge> <span className="text-ink-2">{l.resource}</span></div>
                  <div className="text-xs text-ink-3 num-tabular font-mono mt-0.5">{new Date(l.at).toLocaleString('en-LK')}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Delete DisputedAndAudit.tsx**

```bash
rm apps/web/src/admin/DisputedAndAudit.tsx
pnpm typecheck
git add -u apps/web/src/admin/DisputedAndAudit.tsx apps/web/src/admin/AdminDisputesPage.tsx apps/web/src/admin/AdminAuditPage.tsx
git commit -m "feat(admin): split DisputedAndAudit into Disputes + Audit pages"
```

### Task 6.5: AdminProductsPage

**Files:**
- Modify: `apps/web/src/admin/AdminProductsPage.tsx`

Apply the AdminSuppliersPage pattern: search, Table with columns Product, Category, Supplier, Base price, Offers, Status.

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Input, Skeleton, Badge } from '@vyro/ui';
import { api } from '@/lib/api';

interface AdminProduct { id: string; title: string; category: string; supplierName: string; basePrice: number; offers: number; status: 'active' | 'inactive'; }

export function AdminProductsPage() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['admin-products', q], queryFn: () => api.get<{ products: AdminProduct[] }>('/admin/products').catch(() => ({ products: [] as AdminProduct[] })) });
  const filtered = (data?.products ?? []).filter((p) => p.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><h1 className="text-display-sm text-ink-1">Products</h1><p className="text-sm text-ink-3 mt-1 num-tabular">{data?.products?.length ?? 0} products</p></div><Input placeholder="Search…" leftSlot={<Search />} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" /></header>
      {isLoading ? <Skeleton size="card" /> : (
        <Card padding="none"><Table><THead><TR><TH>Product</TH><TH>Category</TH><TH>Supplier</TH><TH className="text-right">Base price</TH><TH className="text-right">Offers</TH><TH>Status</TH></TR></THead><TBody>{filtered.map((p) => (<TR key={p.id}><TD className="font-medium text-ink-1">{p.title}</TD><TD>{p.category}</TD><TD>{p.supplierName}</TD><TD className="text-right font-mono num-tabular">LKR {p.basePrice.toLocaleString('en-LK')}</TD><TD className="text-right num-tabular">{p.offers}</TD><TD><Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge></TD></TR>))}</TBody></Table></Card>
      )}
    </div>
  );
}
```

- [ ] **Step 1: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/admin/AdminProductsPage.tsx
git commit -m "feat(admin): implement Products list page"
```

### Task 6.6: AdminCategoriesPage

**Files:**
- Modify: `apps/web/src/admin/AdminCategoriesPage.tsx`

Apply the same Table pattern. Columns: Category, Product count, Active, Actions (Add via Dialog).

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Button, Dialog, DialogContent, DialogTitle, DialogDescription, Field, Input, Badge, Switch } from '@vyro/ui';

const ROWS = [
  { id: 'c1', name: 'Industrial', count: 412, active: true },
  { id: 'c2', name: 'Office', count: 289, active: true },
  { id: 'c3', name: 'Packaging', count: 156, active: true },
  { id: 'c4', name: 'Electronics', count: 198, active: true },
  { id: 'c5', name: 'Hospitality', count: 87, active: false },
];

export function AdminCategoriesPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><h1 className="text-display-sm text-ink-1">Categories</h1><p className="text-sm text-ink-3 mt-1 num-tabular">{ROWS.length} categories</p></div><Button onClick={() => setOpen(true)}><Plus className="size-4" /> Add category</Button></header>
      <Card padding="none"><Table><THead><TR><TH>Name</TH><TH className="text-right">Products</TH><TH>Active</TH></TR></THead><TBody>{ROWS.map((r) => (<TR key={r.id}><TD className="font-medium text-ink-1">{r.name}</TD><TD className="text-right num-tabular">{r.count}</TD><TD><Badge variant={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</Badge></TD></TR>))}</TBody></Table></Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add category" description="Create a new product category.">
          <Field label="Category name" required><Input placeholder="e.g. Construction" /></Field>
          <div className="flex justify-end mt-6"><Button onClick={() => setOpen(false)}>Create</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 1: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/admin/AdminCategoriesPage.tsx
git commit -m "feat(admin): implement Categories page with add modal"
```

### Task 6.7: AdminOrdersPage, AdminDeliveriesPage, AdminPaymentsPage

**Files:**
- Modify: `apps/web/src/admin/AdminOrdersPage.tsx`
- Modify: `apps/web/src/admin/AdminDeliveriesPage.tsx`
- Modify: `apps/web/src/admin/AdminPaymentsPage.tsx`

All three follow the Table + Card pattern with mock data. Apply the Task 6.5 pattern. Columns:

- **Orders:** PO, Business, Supplier, Total, Status, Created
- **Deliveries:** Delivery, PO, Business, Supplier, Status, ETA, Delivered at
- **Payments:** Payment, PO, Business, Supplier, Amount, Status, Processed at

- [ ] **Step 1: Implement AdminOrdersPage**

```tsx
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Input, StatusBadge } from '@vyro/ui';
import { api } from '@/lib/api';

interface AdminOrder { id: string; business: string; supplier: string; total: number; status: import('@vyro/ui').OrderStatus; createdAt: string; }

export function AdminOrdersPage() {
  const [q, setQ] = useState('');
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><h1 className="text-display-sm text-ink-1">Orders</h1></div><Input placeholder="Search…" leftSlot={<Search />} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" /></header>
      <Card padding="none"><Table><THead><TR><TH>PO</TH><TH>Business</TH><TH>Supplier</TH><TH className="text-right">Total</TH><TH>Status</TH><TH>Created</TH></TR></THead><TBody>{MOCK_ORDERS.map((o) => (<TR key={o.id}><TD className="font-mono">#{o.id.slice(0,8).toUpperCase()}</TD><TD>{o.business}</TD><TD>{o.supplier}</TD><TD className="text-right font-mono num-tabular">LKR {o.total.toLocaleString('en-LK')}</TD><TD><StatusBadge status={o.status} /></TD><TD className="text-ink-3 num-tabular">{new Date(o.createdAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}</TD></TR>))}</TBody></Table></Card>
    </div>
  );
}

const MOCK_ORDERS: AdminOrder[] = [
  { id: 'po1', business: 'Lanka Hardware', supplier: 'Lanka Steel', total: 124000, status: 'pending', createdAt: '2026-09-04' },
  { id: 'po2', business: 'Hilton Colombo', supplier: 'Ceylon Hospitality', total: 580000, status: 'in_transit', createdAt: '2026-09-03' },
  { id: 'po3', business: 'Colombo Office Co', supplier: 'Office Direct', total: 95000, status: 'completed', createdAt: '2026-09-02' },
];
```

- [ ] **Step 2: Implement AdminDeliveriesPage** (same pattern, replace OrderStatus with delivery status fields)

```tsx
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Input, StatusBadge } from '@vyro/ui';

const ROWS = [
  { id: 'd1', po: 'PO-28401', business: 'Lanka Hardware', supplier: 'Lanka Steel', status: 'in_transit' as const, eta: '2026-09-05', deliveredAt: null as string | null },
  { id: 'd2', po: 'PO-28402', business: 'Hilton Colombo', supplier: 'Ceylon Hospitality', status: 'preparing' as const, eta: '2026-09-06', deliveredAt: null },
  { id: 'd3', po: 'PO-28350', business: 'Colombo Office Co', supplier: 'Office Direct', status: 'delivered' as const, eta: '2026-08-30', deliveredAt: '2026-08-30' },
];

export function AdminDeliveriesPage() {
  const [q, setQ] = useState('');
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><h1 className="text-display-sm text-ink-1">Deliveries</h1></div><Input placeholder="Search…" leftSlot={<Search />} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" /></header>
      <Card padding="none"><Table><THead><TR><TH>Delivery</TH><TH>PO</TH><TH>Business</TH><TH>Supplier</TH><TH>ETA</TH><TH>Status</TH></TR></THead><TBody>{ROWS.map((r) => (<TR key={r.id}><TD className="font-mono text-ink-3">#{r.id.slice(0,6).toUpperCase()}</TD><TD className="font-mono">{r.po}</TD><TD>{r.business}</TD><TD>{r.supplier}</TD><TD className="num-tabular">{new Date(r.eta).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}</TD><TD><StatusBadge status={r.status} /></TD></TR>))}</TBody></Table></Card>
    </div>
  );
}
```

- [ ] **Step 3: Implement AdminPaymentsPage**

```tsx
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Input, Badge } from '@vyro/ui';

const ROWS = [
  { id: 'pay1', po: 'PO-28401', business: 'Lanka Hardware', supplier: 'Lanka Steel', amount: 124000, status: 'paid', processedAt: '2026-08-30' },
  { id: 'pay2', po: 'PO-28402', business: 'Hilton Colombo', supplier: 'Ceylon Hospitality', amount: 580000, status: 'processing', processedAt: '2026-09-02' },
];

export function AdminPaymentsPage() {
  const [q, setQ] = useState('');
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><h1 className="text-display-sm text-ink-1">Payments</h1></div><Input placeholder="Search…" leftSlot={<Search />} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" /></header>
      <Card padding="none"><Table><THead><TR><TH>Payment</TH><TH>PO</TH><TH>Business</TH><TH>Supplier</TH><TH className="text-right">Amount</TH><TH>Status</TH><TH>Processed</TH></TR></THead><TBody>{ROWS.map((r) => (<TR key={r.id}><TD className="font-mono text-ink-3">#{r.id.slice(0,8).toUpperCase()}</TD><TD className="font-mono">{r.po}</TD><TD>{r.business}</TD><TD>{r.supplier}</TD><TD className="text-right font-mono font-semibold num-tabular">LKR {r.amount.toLocaleString('en-LK')}</TD><TD><Badge variant={r.status === 'paid' ? 'success' : 'brand'}>{r.status}</Badge></TD><TD className="text-ink-3 num-tabular">{r.processedAt}</TD></TR>))}</TBody></Table></Card>
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/admin/AdminOrdersPage.tsx apps/web/src/admin/AdminDeliveriesPage.tsx apps/web/src/admin/AdminPaymentsPage.tsx
git commit -m "feat(admin): implement Orders, Deliveries, Payments list pages"
```

### Task 6.8: AdminUsersPage, AdminAnalyticsPage, AdminSettingsPage

**Files:**
- Modify: `apps/web/src/admin/AdminUsersPage.tsx`
- Modify: `apps/web/src/admin/AdminAnalyticsPage.tsx`
- Modify: `apps/web/src/admin/AdminSettingsPage.tsx`

All three follow established patterns. Users = Table (name, email, memberships, isAdmin, status, joined). Analytics mirrors SupplierAnalyticsPage but platform-wide. Settings = Tabs with Branding, Platform, Fees, Integrations.

- [ ] **Step 1: Implement AdminUsersPage**

```tsx
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Card, Table, THead, TBody, TR, TH, TD, Input, Badge, Avatar } from '@vyro/ui';

const ROWS = [
  { id: 'u1', name: 'Jane Perera', email: 'jane@example.lk', memberships: 2, isAdmin: false, status: 'active', joinedAt: '2026-01-15' },
  { id: 'u2', name: 'Admin User', email: 'admin@vyro.lk', memberships: 0, isAdmin: true, status: 'active', joinedAt: '2025-12-01' },
];

export function AdminUsersPage() {
  const [q, setQ] = useState('');
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><h1 className="text-display-sm text-ink-1">Users</h1></div><Input placeholder="Search…" leftSlot={<Search />} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" /></header>
      <Card padding="none"><Table><THead><TR><TH>User</TH><TH>Email</TH><TH>Memberships</TH><TH>Role</TH><TH>Status</TH><TH>Joined</TH></TR></THead><TBody>{ROWS.map((u) => (<TR key={u.id}><TD><div className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><span className="font-medium text-ink-1">{u.name}</span></div></TD><TD className="text-ink-3">{u.email}</TD><TD className="num-tabular">{u.memberships}</TD><TD>{u.isAdmin ? <Badge variant="brand">Admin</Badge> : <Badge variant="neutral">User</Badge>}</TD><TD><Badge variant={u.status === 'active' ? 'success' : 'neutral'}>{u.status}</Badge></TD><TD className="text-ink-3 num-tabular">{u.joinedAt}</TD></TR>))}</TBody></Table></Card>
    </div>
  );
}
```

- [ ] **Step 2: Implement AdminAnalyticsPage**

Reuse SupplierAnalyticsPage layout but rename header to "Platform analytics". Replace product-specific top-products table with top-categories table.

```tsx
import { Card, MetricTile, LineChart } from '@vyro/ui';
import { REVENUE_TREND_30D, ORDERS_VOLUME_30D } from '@/lib/supplier-mock';

export function AdminAnalyticsPage() {
  return (
    <div className="space-y-6">
      <header><h1 className="text-display-sm text-ink-1">Platform analytics</h1></header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="GMV (30d)" value="LKR 4.2B" delta={{ value: '+12.4%', direction: 'up' }} sparkline={REVENUE_TREND_30D} />
        <MetricTile label="Take rate" value="3.2%" delta={{ value: '+0.1pp', direction: 'up' }} />
        <MetricTile label="Active buyers" value="12,400" delta={{ value: '+5.2%', direction: 'up' }} sparkline={ORDERS_VOLUME_30D} />
        <MetricTile label="Active suppliers" value="1,248" delta={{ value: '+3.1%', direction: 'up' }} />
      </div>
      <Card padding="lg">
        <h2 className="text-h2 font-semibold text-ink-1 mb-4">GMV & orders (30d)</h2>
        <LineChart series={[{ name: 'GMV', color: '#5EE2FF', data: REVENUE_TREND_30D }, { name: 'Orders', color: '#1FB28A', data: ORDERS_VOLUME_30D.map((v) => v * 1000) }]} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Implement AdminSettingsPage**

```tsx
import { useState } from 'react';
import { Card, Tabs, TabsList, TabsTrigger, TabsContent, Field, Input, Button } from '@vyro/ui';

export function AdminSettingsPage() {
  const [tab, setTab] = useState('platform');
  return (
    <div className="space-y-6">
      <header><h1 className="text-display-sm text-ink-1">Settings</h1></header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="platform">Platform</TabsTrigger><TabsTrigger value="branding">Branding</TabsTrigger><TabsTrigger value="fees">Fees</TabsTrigger><TabsTrigger value="integrations">Integrations</TabsTrigger></TabsList>
        <TabsContent value="platform"><Card padding="lg" className="space-y-5"><Field label="Platform name"><Input defaultValue="VYRO" /></Field><div className="flex justify-end"><Button>Save</Button></div></Card></TabsContent>
        <TabsContent value="branding"><Card padding="lg" className="space-y-5"><Field label="Primary brand color"><Input defaultValue="#0A0B10" /></Field><Field label="Accent color"><Input defaultValue="#5EE2FF" /></Field><div className="flex justify-end"><Button>Save</Button></div></Card></TabsContent>
        <TabsContent value="fees"><Card padding="lg" className="space-y-5"><Field label="Take rate (%)"><Input type="number" defaultValue="3.2" /></Field><div className="flex justify-end"><Button>Save</Button></div></Card></TabsContent>
        <TabsContent value="integrations"><Card padding="lg"><p className="text-sm text-ink-3">No integrations configured yet.</p></Card></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/admin/AdminUsersPage.tsx apps/web/src/admin/AdminAnalyticsPage.tsx apps/web/src/admin/AdminSettingsPage.tsx
git commit -m "feat(admin): implement Users, Analytics, Settings pages"
```

### Task 6.9: Delete deprecated AdminHomePage

**Files:**
- Delete: `apps/web/src/admin/HomePage.tsx`

The new AdminDashboardPage is routed at `/admin`. The old HomePage is unreachable and can be removed.

- [ ] **Step 1: Delete + verify**

```bash
rm apps/web/src/admin/HomePage.tsx
pnpm typecheck
git add -u apps/web/src/admin/HomePage.tsx
git commit -m "chore(admin): remove deprecated AdminHomePage (replaced by AdminDashboardPage)"
```

End of Phase 6. Verify with `pnpm typecheck && pnpm build`.

---

## Phase 7 — Dashboards with Charts

The MetricTile already includes a tiny inline Sparkline from Task 1.26. Phase 7 introduces dedicated chart primitives (Sparkline, AreaChart, LineChart, BarChart) that are reusable, then wires them into business dashboard (NEW page).

### Task 7.1: Sparkline chart component

**Files:**
- Create: `packages/ui/src/components/charts/Sparkline.tsx`

```tsx
import { cn } from '../../lib/cn';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
  className?: string;
}

export function Sparkline({ data, width = 200, height = 32, color = '#5EE2FF', fill, className }: SparklineProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} preserveAspectRatio="none" aria-hidden>
      {fill && (
        <polygon points={`0,${height} ${points} ${width},${height}`} fill={fill} />
      )}
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 1: Commit**

```bash
git add packages/ui/src/components/charts/Sparkline.tsx
git commit -m "feat(charts): Sparkline primitive (polyline + optional fill)"
```

### Task 7.2: AreaChart component

**Files:**
- Create: `packages/ui/src/components/charts/AreaChart.tsx`

```tsx
import { cn } from '../../lib/cn';

export interface AreaChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: string;
  className?: string;
}

export function AreaChart({ data, width = 800, height = 200, color = '#5EE2FF', fill = 'rgba(94,226,255,0.18)', className }: AreaChartProps) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 8) - 4}`).join(' ');
  const areaPath = `M0,${height} L${points.replace(/ /g, ' L')} L${width},${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} preserveAspectRatio="none" aria-hidden>
      <path d={areaPath} fill={fill} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 1: Commit**

```bash
git add packages/ui/src/components/charts/AreaChart.tsx
git commit -m "feat(charts): AreaChart primitive"
```

### Task 7.3: LineChart component (multi-series)

**Files:**
- Create: `packages/ui/src/components/charts/LineChart.tsx`

```tsx
import { cn } from '../../lib/cn';

export interface LineSeries { name: string; color: string; data: number[]; }

export interface LineChartProps {
  series: LineSeries[];
  width?: number;
  height?: number;
  className?: string;
}

export function LineChart({ series, width = 800, height = 220, className }: LineChartProps) {
  if (!series.length) return null;
  const max = Math.max(...series.flatMap((s) => s.data));
  const min = Math.min(...series.flatMap((s) => s.data));
  const range = max - min || 1;
  const len = series[0].data.length;
  if (len < 2) return null;
  const step = width / (len - 1);
  return (
    <div className={cn('w-full', className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" aria-hidden>
        {series.map((s) => {
          const points = s.data.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 16) - 8}`).join(' ');
          return <polyline key={s.name} points={points} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
        })}
      </svg>
      <div className="mt-3 flex items-center gap-4">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-2 text-xs text-ink-3">
            <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Commit**

```bash
git add packages/ui/src/components/charts/LineChart.tsx
git commit -m "feat(charts): LineChart primitive (multi-series)"
```

### Task 7.4: BarChart component

**Files:**
- Create: `packages/ui/src/components/charts/BarChart.tsx`

```tsx
import { cn } from '../../lib/cn';

export interface BarChartProps {
  data: number[];
  labels?: string[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function BarChart({ data, labels, width = 800, height = 200, color = '#5EE2FF', className }: BarChartProps) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const gap = 4;
  const barWidth = (width - gap * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} preserveAspectRatio="none" aria-hidden>
      {data.map((v, i) => {
        const h = (v / (max || 1)) * (height - 16);
        const x = i * (barWidth + gap);
        const y = height - h - 8;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={h} rx={3} fill={color} />
            {labels?.[i] && <text x={x + barWidth / 2} y={height - 2} fontSize="10" textAnchor="middle" fill="#5A606E">{labels[i]}</text>}
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 1: Commit**

```bash
git add packages/ui/src/components/charts/BarChart.tsx
git commit -m "feat(charts): BarChart primitive"
```

### Task 7.5: Update packages/ui barrel with chart exports

**Files:**
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: Append chart exports to barrel**

Find the line `export { Divider } from './components/Divider';` and add after it:

```ts
export { Sparkline } from './components/charts/Sparkline';
export type { SparklineProps } from './components/charts/Sparkline';
export { AreaChart } from './components/charts/AreaChart';
export type { AreaChartProps } from './components/charts/AreaChart';
export { LineChart } from './components/charts/LineChart';
export type { LineChartProps, LineSeries } from './components/charts/LineChart';
export { BarChart } from './components/charts/BarChart';
export type { BarChartProps } from './components/charts/BarChart';
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: passes (all chart components now exported).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(ui): export chart components in packages/ui barrel"
```

### Task 7.6: Business dashboard page (new)

**Files:**
- Create: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/App.tsx` (add route `/dashboard`)

- [ ] **Step 1: Implement**

```tsx
import { Link } from 'react-router-dom';
import { Card, SectionCard, MetricTile, Badge, AreaChart, Table, THead, TBody, TR, TH, TD, StatusBadge, Button, Avatar } from '@vyro/ui';
import { ArrowRight } from 'lucide-react';
import { REVENUE_TREND_30D } from '@/lib/supplier-mock';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between"><div><h1 className="text-display-md text-ink-1">Welcome back</h1><p className="text-sm text-ink-3 mt-1">Here's what's moving across your procurement.</p></div></header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Spend this month" value="LKR 1.8M" delta={{ value: '-3.2%', direction: 'down' }} sparkline={REVENUE_TREND_30D} />
        <MetricTile label="Orders in flight" value="14" delta={{ value: '+2', direction: 'up' }} />
        <MetricTile label="Saved vs list" value="LKR 240K" delta={{ value: '+8.1%', direction: 'up' }} />
        <MetricTile label="Active suppliers" value="23" delta={{ value: '+1', direction: 'up' }} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <SectionCard>
          <div className="flex items-center justify-between mb-4"><div><Badge variant="brand">Procurement</Badge><h2 className="mt-2 text-h2 font-semibold text-ink-1">Activity (90d)</h2></div></div>
          <AreaChart data={REVENUE_TREND_30D} height={240} />
        </SectionCard>
        <Card padding="lg">
          <h2 className="text-h3 font-semibold mb-4">Top suppliers</h2>
          <ul className="space-y-3">
            {[
              { name: 'Lanka Steel', gmv: 580000 },
              { name: 'Ceylon Hospitality', gmv: 420000 },
              { name: 'Office Direct', gmv: 240000 },
            ].map((s) => (
              <li key={s.name} className="flex items-center gap-3">
                <Avatar name={s.name} size="sm" />
                <div className="flex-1"><div className="text-sm font-medium text-ink-1">{s.name}</div><div className="text-xs text-ink-3 num-tabular font-mono">LKR {s.gmv.toLocaleString('en-LK')}</div></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card padding="none">
          <div className="flex items-center justify-between px-6 py-4 border-b border-line-soft"><h2 className="text-h3 font-semibold">Recent orders</h2><Button variant="ghost" size="sm" asChild><Link to="/orders">All <ArrowRight className="size-3.5" /></Link></Button></div>
          <Table><THead><TR><TH>PO</TH><TH>Supplier</TH><TH>Status</TH><TH className="text-right">Total</TH></TR></THead><TBody>{[{ id: 'po1', supplier: 'Lanka Steel', status: 'in_transit', total: 124000 }, { id: 'po2', supplier: 'Ceylon Hospitality', status: 'pending', total: 580000 }, { id: 'po3', supplier: 'Office Direct', status: 'delivered', total: 95000 }].map((o) => (<TR key={o.id}><TD className="font-mono">#{o.id.slice(0,6).toUpperCase()}</TD><TD>{o.supplier}</TD><TD><StatusBadge status={o.status as any} /></TD><TD className="text-right font-mono num-tabular">LKR {o.total.toLocaleString('en-LK')}</TD></TR>))}</TBody></Table>
        </Card>
        <Card padding="lg">
          <h2 className="text-h3 font-semibold mb-4">Pending actions</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3"><span className="size-2 rounded-full bg-amber mt-2 shrink-0" /><div className="flex-1"><div className="text-sm text-ink-1">Accept quote from Ceylon Hospitality</div><Button size="sm" variant="outline" className="mt-2">Review</Button></div></li>
            <li className="flex items-start gap-3"><span className="size-2 rounded-full bg-rose mt-2 shrink-0" /><div className="flex-1"><div className="text-sm text-ink-1">Confirm delivery for PO-28350</div><Button size="sm" variant="outline" className="mt-2">Confirm</Button></div></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route**

In `apps/web/src/App.tsx`, after the `<Route path="/orders/:id" />` line, add:

```tsx
<Route path="/dashboard" element={<DashboardPage />} />
```

And add `import { DashboardPage } from './pages/DashboardPage';` near the top.

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck
git add apps/web/src/pages/DashboardPage.tsx apps/web/src/App.tsx
git commit -m "feat(business): implement Dashboard with metrics, chart, recent orders"
```

End of Phase 7. Verify with `pnpm typecheck && pnpm build`.

---

## Phase 8 — Polish

Micro-interaction sweep, responsive QA, a11y audit, reduced-motion audit, performance pass, final build.

### Task 8.1: Micro-interaction sweep

**Files:**
- Modify: any page where buttons or cards need additional polish

Apply these polish touches across all pages:
- All primary buttons get `hover:shadow-glow` already (defined in Button). Verify.
- All Card interactive variants get hover lift (already defined).
- Add `transition-colors duration-140` to every Link wrapper where missing.
- Add Cart count badge pulse animation when items change (already in CartPage add handler — verify pulse class applied).

- [ ] **Step 1: Audit**

Run: `grep -rE "transition-colors" apps/web/src/pages apps/web/src/admin apps/web/src/components/supplier | wc -l`
Expected: > 30.

If low, run a bulk pass: add `transition-colors duration-140` to Link components that render as nav items.

- [ ] **Step 2: Commit (if changes)**

```bash
git add -u
git commit -m "polish: micro-interaction sweep across pages"
```

### Task 8.2: Responsive QA pass

**Files:**
- Modify: any page where sm/md/lg breakpoint behavior is broken

For each redesigned page:
- Resize browser to 360px (mobile), 768px (tablet), 1280px (desktop)
- Check no horizontal overflow
- Verify drawer opens on mobile instead of nav
- Verify tables either scroll horizontally or stack into card list below sm

- [ ] **Step 1: Fix any issues found**

(Apply targeted fixes per file.)

- [ ] **Step 2: Commit**

```bash
git add -u
git commit -m "polish: responsive QA fixes across pages"
```

### Task 8.3: Accessibility audit

**Files:**
- Modify: any page where a11y issues found

Checklist per page:
- Every interactive element has visible focus ring (cyan)
- Every icon-only button has aria-label
- Every form field has associated label
- Modals trap focus and restore on close (Radix provides)
- Status changes announced via aria-live (toast: Radix provides)
- Color contrast ≥ 4.5:1 for body text, 3:1 for large text
- Reduced motion respected (CSS media query already in index.css)

- [ ] **Step 1: Run axe-core via Playwright smoke**

(If axe is not installed, run manually and document any findings.)

- [ ] **Step 2: Fix issues, commit**

```bash
git add -u
git commit -m "polish: accessibility audit fixes"
```

### Task 8.4: Reduced motion audit

Verify the existing `@media (prefers-reduced-motion: reduce)` rule in `apps/web/src/index.css` kills non-essential transitions. Additionally:
- Verify framer-motion PageTransition respects reduced motion (add `useReducedMotion`).

Modify `apps/web/src/components/PageTransition.tsx`:

```tsx
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduced = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? undefined : { opacity: 0, y: -4 }}
        transition={{ duration: reduced ? 0 : 0.32, ease: [0, 0, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 1: Implement + commit**

```bash
git add apps/web/src/components/PageTransition.tsx
git commit -m "polish: respect prefers-reduced-motion in PageTransition"
```

### Task 8.5: Performance pass

- Verify Google Fonts preconnect is in place (Task 1.2).
- Verify no inline raster images (all glyphs are inline SVG — Task 4.1).
- Verify backdrop-blur only used on header (Task 2.3).
- Run `pnpm build` and check bundle size. Acceptable target: < 500KB initial JS.

- [ ] **Step 1: Build + inspect**

```bash
pnpm build
ls -la apps/web/dist/assets/*.js
```

If initial bundle > 500KB, lazy-load admin and supplier shells via React.lazy.

- [ ] **Step 2: Commit any changes**

```bash
git add -u
git commit -m "polish: performance optimizations"
```

### Task 8.6: Final build verification

- [ ] **Step 1: Full clean build**

```bash
rm -rf apps/web/dist packages/ui/dist
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all green.

- [ ] **Step 2: Manual smoke test**

Run: `pnpm db:migrate && pnpm db:seed && pnpm dev`
Visit each route from spec §17 routes inventory and confirm it renders redesigned.
Test: home → search → product detail → add to cart → cart → checkout → place order → order detail. Verify no console errors.

- [ ] **Step 3: Final commit**

```bash
git add -u
git commit -m "polish: final build verification + smoke test" --allow-empty
```

---

## Acceptance

This plan implements every section of the design spec at `docs/superpowers/specs/2026-09-04-vyro-redesign-design.md`. After all phases complete:

- Cinematic Tech brand ships across every page
- Geist + Geist Mono loaded via Google Fonts with preconnect
- Sharp V monogram logo with three SVG files
- Full `packages/ui` primitive library on Radix + CVA + lucide
- All 13 existing routes redesigned + 22 new routes added
- All 60+ pages designed (existing redesigned, new pages with realistic empty states + seeded data)
- WCAG AA contrast, focus rings, reduced motion, keyboard nav
- Responsive across sm/md/lg with no horizontal overflow
- Bundle size target: < 500KB initial JS
- Smoke test passes for add-to-cart → checkout → order flow

Plan total: 88 tasks across 8 phases.