# VYRO Performance (Sub-project B3)

**Date:** 2026-09-05
**Status:** Approved design
**Parent:** `docs/superpowers/specs/2026-09-05-vyro-feature-gaps-design.md` §10

## 1. Background

Current state (audited):
- `apps/web/src/App.tsx` imports all 30+ page components statically — single large bundle.
- No cache headers on read-only endpoints (categories, products, avatars) → redundant fetches.
- No manual chunk splitting in `vite.config.ts` — vendor + app code mixed in single file.
- No `loading="lazy"` on `<img>` tags in product cards.
- No HTTP caching strategy documented.

## 2. Goals

- Code-split web SPA by route (each page becomes its own chunk, lazy-loaded).
- Cache-Control headers on read-only public endpoints (1h public, immutable for avatars).
- Vite manualChunks split: react, react-router, query, ui, app.
- Image lazy loading on product cards and avatars.
- Document Cloudflare's automatic gzip/brotli (already on, no config needed).

## 3. Non-goals

- Service worker / PWA caching (F3 sub-project).
- Image CDN (R2 already serves /products and /avatars).
- SSR / SSG.
- HTTP/3 (Cloudflare automatic).

## 4. Architecture

### 4.1 Route-level lazy loading

```tsx
// apps/web/src/App.tsx
import { lazy, Suspense } from 'react';

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
// ... etc

function PageFallback() {
  return <div className="p-8 text-center text-ink-4">Loading…</div>;
}

// Wrap Routes:
<Suspense fallback={<PageFallback />}>
  <Routes>...</Routes>
</Suspense>
```

Vite auto-creates chunks per dynamic import.

### 4.2 Cache-Control middleware

```ts
// apps/api/src/middleware/cacheControl.ts
export const cacheControl = (opts: { maxAge: number; public?: boolean; immutable?: boolean }): MiddlewareHandler => async (c, next) => {
  await next();
  const parts: string[] = [];
  if (opts.public) parts.push('public');
  else parts.push('private');
  parts.push(`max-age=${opts.maxAge}`);
  if (opts.immutable) parts.push('immutable');
  c.header('Cache-Control', parts.join(', '));
};
```

Apply to:
- `GET /api/categories` → `public, max-age=3600` (1h)
- `GET /api/products/:id` → `public, max-age=300` (5min)
- `GET /api/settings/avatars/:key` → `public, max-age=31536000, immutable` (1y)

### 4.3 Vite manualChunks

```ts
// apps/web/vite.config.ts
build: {
  chunkSizeWarningLimit: 600,
  rollupOptions: {
    output: {
      manualChunks: {
        react: ['react', 'react-dom'],
        router: ['react-router-dom'],
        query: ['@tanstack/react-query'],
        ui: ['@vyro/ui'],
      },
    },
  },
},
```

### 4.4 Image lazy loading

Add `loading="lazy"` and `decoding="async"` to:
- Product card images in SearchPage
- Avatar `<img>` in ProfilePage
- Supplier logo in SupplierCard

## 5. Components

| File | Purpose |
|---|---|
| `apps/web/src/App.tsx` | Route lazy() wrappers + Suspense |
| `apps/api/src/middleware/cacheControl.ts` | Cache-Control header helper |
| `apps/api/src/index.ts` | Apply cache headers to categories/products/avatars |
| `apps/web/vite.config.ts` | manualChunks config |
| `apps/web/src/pages/SearchPage.tsx` | loading="lazy" on product images |
| `apps/web/src/pages/ProfilePage.tsx` | loading="lazy" on avatar |

## 6. Data flow

No backend data flow changes. Frontend: same routes, smaller initial bundle, lazy chunks fetched on navigation.

## 7. Error handling

Suspense fallback if a chunk fails to load — show error message, "Retry" link.

## 8. Testing

- cacheControl middleware test (header set on GET response).
- Verify chunk count via vite build output (visual, no test).
- Manual: open DevTools network, navigate, confirm lazy chunks only loaded on visit.

## 9. Phases

1. Cache-Control middleware + apply to 3 endpoints
2. Vite manualChunks + verify build
3. Route lazy() loading
4. Image lazy attributes

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Lazy load breaks SSR | Vite SPA, no SSR. |
| Manual chunks break circular deps | Test build + smoke run. |
| Cache-Control on auth responses leaks data | Only apply to public endpoints. |
| Image lazy off-screen on scrollback | Acceptable UX trade-off. |

## 11. Acceptance criteria

1. `pnpm --filter @vyro/web build` produces ≥4 chunks (react, router, query, ui, app).
2. `Cache-Control` header on `GET /api/categories` is `public, max-age=3600`.
3. First page load fetches only initial route chunk + vendor chunks.
4. Product card images have `loading="lazy"` attribute.

## 12. Out of scope

- Service worker caching.
- Edge-side image transforms.
- HTTP/3 tuning (Cloudflare default).
