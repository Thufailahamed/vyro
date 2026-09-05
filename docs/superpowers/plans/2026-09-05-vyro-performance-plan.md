# VYRO Performance (B3) Implementation Plan

**Goal:** Reduce initial bundle size, add cache headers, lazy-load images.

**Architecture:** Lazy route components, cache middleware, manualChunks, lazy images.

## Global Constraints
- TypeScript strict
- Single branch `feat/b3-performance`

---

### Task 1: Cache-Control middleware

**Files:**
- Create: `apps/api/src/middleware/cacheControl.ts`
- Test: `apps/api/test/middleware/cacheControl.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { cacheControl } from '../../src/middleware/cacheControl';

describe('cacheControl', () => {
  it('sets public, max-age=3600', async () => {
    const app = new Hono();
    app.use('*', cacheControl({ public: true, maxAge: 3600 }));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.fetch(new Request('http://localhost/x'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('sets immutable flag', async () => {
    const app = new Hono();
    app.use('*', cacheControl({ maxAge: 31536000, immutable: true }));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.fetch(new Request('http://localhost/x'));
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- cacheControl.test 2>&1 | tail -5`
Expected: FAIL

- [ ] **Step 3: Write middleware**

Create `apps/api/src/middleware/cacheControl.ts`:

```ts
import type { MiddlewareHandler } from 'hono';

export type CacheControlOpts = {
  maxAge: number;
  public?: boolean;
  immutable?: boolean;
};

export const cacheControl = (opts: CacheControlOpts): MiddlewareHandler => async (c, next) => {
  await next();
  const parts: string[] = [opts.public ? 'public' : 'private', `max-age=${opts.maxAge}`];
  if (opts.immutable) parts.push('immutable');
  c.header('Cache-Control', parts.join(', '));
};
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vyro/api test -- cacheControl.test 2>&1 | tail -5`
Expected: 2 PASS

- [ ] **Step 5: Apply to categories/products/avatars**

In `apps/api/src/index.ts`:
- Import `cacheControl`
- Add `app.use('/api/categories/*', cacheControl({ public: true, maxAge: 3600 }));`
- Add `app.use('/api/products/*', cacheControl({ public: true, maxAge: 300 }));`

In `apps/api/src/modules/settings/routes.ts`, the avatar route already has `cache-control` set inline; keep that.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/cacheControl.ts apps/api/test/middleware/cacheControl.test.ts apps/api/src/index.ts
git commit -m "perf: Cache-Control on public read endpoints"
```

---

### Task 2: Vite manualChunks

**Files:**
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: Add build config**

In `apps/web/vite.config.ts`, add `build` key to defineConfig:

```ts
build: {
  chunkSizeWarningLimit: 600,
  rollupOptions: {
    output: {
      manualChunks: {
        react: ['react', 'react-dom'],
        router: ['react-router-dom'],
        query: ['@tanstack/react-query'],
      },
    },
  },
},
```

- [ ] **Step 2: Verify build**

Run: `pnpm --filter @vyro/web build 2>&1 | tail -20`
Expected: produces multiple chunk files

- [ ] **Step 3: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "perf: Vite manualChunks split (react/router/query)"
```

---

### Task 3: Route lazy loading

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Convert imports to lazy()**

Replace all `import { X } from './pages/X';` with:
```tsx
const X = lazy(() => import('./pages/X').then(m => ({ default: m.X })));
```

Use lazy() for each page route. Wrap `<Routes>` in `<Suspense fallback={<PageFallback />}>`.

- [ ] **Step 2: Add PageFallback component**

Inside App.tsx, before export:
```tsx
function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-dvh bg-bone">
      <div className="text-ink-4 text-sm">Loading…</div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter @vyro/web typecheck 2>&1 | tail -5 && pnpm --filter @vyro/web build 2>&1 | tail -10`
Expected: clean + many chunks

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "perf: route-level lazy loading via React.lazy"
```

---

### Task 4: Image lazy attributes

**Files:**
- Modify: SearchPage, ProfilePage, supplier components

- [ ] **Step 1: Find product card images**

Run: `grep -n "<img " /Users/thufailahamed/Downloads/project-5/apps/web/src/pages/SearchPage.tsx`

Add `loading="lazy" decoding="async"` to each `<img>` tag.

- [ ] **Step 2: Find avatar img in ProfilePage**

Add `loading="lazy"` to the avatar img element.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @vyro/web typecheck 2>&1 | tail -5
git add apps/web/src/pages/
git commit -m "perf: loading=lazy on product/avatar images"
```

---

### Task 5: Final verification + merge

- [ ] **Step 1: Full typecheck + tests**

Run: `pnpm typecheck 2>&1 | tail -5; pnpm --filter @vyro/api test 2>&1 | tail -5; pnpm --filter @vyro/web test 2>&1 | tail -5`
Expected: clean except pre-existing search.test

- [ ] **Step 2: Merge to main**

```bash
git checkout main
git merge --no-ff feat/b3-performance
git branch -d feat/b3-performance
```
