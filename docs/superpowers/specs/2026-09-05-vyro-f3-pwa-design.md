# F3 — Mobile / PWA — Design

**Goal:** VYRO web works great on phones and can be installed as a PWA. Offline shell, install prompt, mobile-responsive.

## Manifest

`apps/web/public/manifest.webmanifest`:
- name: "VYRO — Procurement OS"
- short_name: "VYRO"
- theme_color: #0C0E0B
- background_color: #F4F1EA
- display: "standalone"
- start_url: "/"
- scope: "/"
- icons: 192, 512 (PNG fallback + SVG source)
- shortcuts: catalog, cart, orders

Generate icon PNGs at build time from SVG via small Node script using sharp (already in deps? check). If not, use plain SVG icons (browsers accept SVG icons in manifest in 2024+).

## Service worker

Hand-written SW in `apps/web/public/sw.js`. Strategies:
- Precache HTML shell, manifest, icons at install
- Cache-first for hashed assets (`/assets/*.js`, `/assets/*.css`)
- Network-first with cache fallback for navigations
- Stale-while-revalidate for product/category JSON
- Versioned cache name (`vyro-v1`) — bump on deploy

SW registered from main.tsx only in production (`import.meta.env.PROD`).

## Install prompt

`useInstallPrompt` hook:
- listens to `beforeinstallprompt`
- returns `{ canInstall, prompt() }`
- install banner shown on 2nd visit if not installed and canInstall
- banner stored in localStorage dismissed state

## Mobile responsive

Audit high-traffic pages: CartPage, OrderDetailPage, SearchPage, DashboardPage. Add:
- `grid-cols-1` default, `lg:grid-cols-N` for desktop
- Bottom safe-area padding on sticky elements
- Tap targets ≥ 44px

Existing pages already use Tailwind responsive prefixes. Audit only.

## Files

**New:**
- `apps/web/public/manifest.webmanifest`
- `apps/web/public/sw.js`
- `apps/web/public/icons/icon-192.svg`, `icon-512.svg`
- `apps/web/src/hooks/useInstallPrompt.ts`
- `apps/web/src/components/InstallBanner.tsx`
- `apps/web/test/hooks/useInstallPrompt.test.ts`

**Modified:**
- `apps/web/index.html` (link manifest, theme-color meta, apple-touch-icon)
- `apps/web/src/main.tsx` (register SW)

## Tests

- useInstallPrompt: emits prompt event, prompt() resolves, dismissed state persists

## Non-goals

- Push notifications
- Background sync
- IndexedDB cache for cart (consider future)
