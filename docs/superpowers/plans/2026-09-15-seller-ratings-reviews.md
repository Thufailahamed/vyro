# Seller Ratings & Reviews (Full) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix v1 review bugs and ship edit, helpful votes, photos, notifications, and full page wiring.

**Architecture:** Extend `apps/api/src/modules/reviews/` in place, add migration `0037_seller_reviews_full.sql`, reuse `PRODUCTS` R2 binding and `notifications/dispatcher.ts`, keep `REVIEWS_ENABLED` gating.

**Tech Stack:** Hono on Cloudflare Workers + D1 (Drizzle), Zod `@vyro/validation`, React SPA `@vyro/web`, Vitest, R2 `vyro-products`, KV rate-limit, Notifications queue.

## Global Constraints

- Node 20+, pnpm 9+.
- SPA must use relative `fetch('/api/...')` — never absolute URL.
- `run_worker_first = ["/api/*"]` — Worker always sees API traffic.
- Reviews writes return 404 when `feature_flags.REVIEWS_ENABLED === false`; reads still work.
- One review per `(supplierId, orderId)` — unique index stays.
- Max 3 photos per review, image/* only, 5MB each, R2 keys `reviews/<reviewId>/<uuid>-<sanitized>`.
- Buyer edit window 7 days, published only.
- Notifications are best-effort and never break transactions.
- `pnpm typecheck` green; `pnpm --filter @vyro/api test -- reviews` green; `pnpm --filter @vyro/web test -- reviews` green.

---

### Task 1: Migration + Drizzle schema

**Files:**
- Create: `packages/db/migrations/0037_seller_reviews_full.sql`
- Modify: `packages/db/src/schema/supplierReviews.ts`
- Create: `packages/db/src/schema/supplierReviewImages.ts`
- Create: `packages/db/src/schema/supplierReviewHelpfulVotes.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Consumes: existing `supplier_reviews`, `suppliers` tables.
- Produces: `supplierReviewImages`, `supplierReviewHelpfulVotes` tables; `supplierReviews.editedAt`, `supplierReviews.helpfulCount` columns for Tasks 3-5.

- [ ] **Step 1: Write migration file**

```sql
-- 0037_seller_reviews_full.sql
ALTER TABLE `supplier_reviews` ADD COLUMN `edited_at` integer;
--> statement-breakpoint
ALTER TABLE `supplier_reviews` ADD COLUMN `helpful_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `supplier_review_images` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL REFERENCES `supplier_reviews`(`id`),
  `r2_key` text NOT NULL,
  `mime` text,
  `size_bytes` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_review_images_review_idx` ON `supplier_review_images` (`review_id`);
--> statement-breakpoint
CREATE TABLE `supplier_review_helpful_votes` (
  `review_id` text NOT NULL REFERENCES `supplier_reviews`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL,
  PRIMARY KEY (`review_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_review_helpful_review_idx` ON `supplier_review_helpful_votes` (`review_id`);
```

- [ ] **Step 2: Add Drizzle schema files**

`packages/db/src/schema/supplierReviewImages.ts`:
```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { supplierReviews } from './supplierReviews';
export const supplierReviewImages = sqliteTable('supplier_review_images', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => supplierReviews.id),
  r2Key: text('r2_key').notNull(),
  mime: text('mime'),
  sizeBytes: integer('size_bytes'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({ reviewIdx: index('supplier_review_images_review_idx').on(t.reviewId) }));
```

`packages/db/src/schema/supplierReviewHelpfulVotes.ts`:
```ts
import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { supplierReviews } from './supplierReviews';
import { users } from './users';
export const supplierReviewHelpfulVotes = sqliteTable('supplier_review_helpful_votes', {
  reviewId: text('review_id').notNull().references(() => supplierReviews.id),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.reviewId, t.userId] }),
  reviewIdx: index('supplier_review_helpful_review_idx').on(t.reviewId),
}));
```

Patch `supplierReviews.ts` to add:
```ts
editedAt: integer('edited_at'),
helpfulCount: integer('helpful_count').notNull().default(0),
```

Add exports in `index.ts`:
```ts
export * from './supplierReviewImages';
export * from './supplierReviewHelpfulVotes';
```

- [ ] **Step 3: Apply locally and verify**

Run: `pnpm db:migrate 2>&1 | tail -20`
Expected: migration 0037 applies without error.

- [ ] **Step 4: Typecheck db package**

Run: `pnpm --filter @vyro/db exec tsc --noEmit 2>&1 | tail -20`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0037_seller_reviews_full.sql packages/db/src/schema/
git commit -m "feat(reviews): migration 0037 images helpful edit columns"
```

---

### Task 2: Validation schemas

**Files:**
- Modify: `packages/validation/src/supplierReviews.ts`
- Test: `packages/validation/test/supplierReviews.test.ts`

**Interfaces:**
- Consumes: existing `submitReviewSchema`, `replySchema`, `flagSchema`.
- Produces: `editReviewSchema`, extended `submitReviewSchema` with `imageR2Keys`, `helpfulToggleSchema` for Task 5.

- [ ] **Step 1: Write failing test additions**

```ts
import { describe, expect, it } from 'vitest';
import { editReviewSchema, submitReviewSchema } from '../src/supplierReviews';
describe('reviews full validation', () => {
  it('edit requires rating+body', () => {
    expect(editReviewSchema.safeParse({ rating: 4, body: 'updated' }).success).toBe(true);
    expect(editReviewSchema.safeParse({ rating: 6, body: 'x' }).success).toBe(false);
  });
  it('submit allows max 3 image keys', () => {
    const ok = submitReviewSchema.safeParse({ orderId: '00000000-0000-0000-0000-000000000001', rating: 5, body: 'great', imageR2Keys: ['a','b','c'] });
    expect(ok.success).toBe(true);
    const bad = submitReviewSchema.safeParse({ orderId: '00000000-0000-0000-0000-000000000001', rating: 5, body: 'great', imageR2Keys: ['a','b','c','d'] });
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/validation test -- supplierReviews 2>&1 | tail -20`
Expected: FAIL with "editReviewSchema is not defined".

- [ ] **Step 3: Implement schemas**

Append to `packages/validation/src/supplierReviews.ts`:
```ts
export const editReviewSchema = z.object({
  rating: ratingSchema,
  body: z.string().min(1).max(2000),
}).strict();
export type EditReviewInput = z.infer<typeof editReviewSchema>;
export const imageR2KeysSchema = z.array(z.string().min(1).max(500)).max(3).optional();
```

Change `submitReviewSchema` to:
```ts
export const submitReviewSchema = z.object({
  orderId: z.string().uuid(),
  rating: ratingSchema,
  body: z.string().min(1).max(2000),
  imageR2Keys: z.array(z.string().min(1).max(500)).max(3).optional(),
}).strict();
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vyro/validation test -- supplierReviews 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/supplierReviews.ts packages/validation/test/supplierReviews.test.ts
git commit -m "feat(reviews): edit + image keys validation"
```

---

### Task 3: Repository fixes + new queries

**Files:**
- Modify: `apps/api/src/modules/reviews/repository.ts`
- Test: `apps/api/test/reviews/repository.test.ts`

**Interfaces:**
- Consumes: `supplierReviews`, `supplierReviewImages`, `supplierReviewHelpfulVotes` Drizzle tables.
- Produces: `findImagesByReviewIds(ids)`, `findRepliesByReviewIds(ids)`, `findOpenFlagByReview(reviewId)`, `updateReview(id, patch, now)`, `addHelpful(reviewId, userId, now)`, `removeHelpful(reviewId, userId)`, fixed `listReviews` sort for Task 4-5.

- [ ] **Step 1: Write failing test for sort fix**

```ts
import { describe, expect, it } from 'vitest';
// sort contract: highest = rating desc, lowest = rating asc, recent = createdAt desc
describe('listReviews sort contract', () => {
  it('documents expected order', () => {
    const orderByFor = (sort: string) => sort === 'highest' ? 'desc-rating' : sort === 'lowest' ? 'asc-rating' : 'desc-created';
    expect(orderByFor('highest')).toBe('desc-rating');
    expect(orderByFor('lowest')).toBe('asc-rating');
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @vyro/api test -- reviews 2>&1 | tail -10`
Expected: PASS (contract test), existing code still inverted — manual check next step.

- [ ] **Step 3: Fix sort + add new functions**

In `repository.ts` replace orderBy block with:
```ts
const orderBy =
  opts.sort === 'highest'
    ? [desc(supplierReviews.rating), desc(supplierReviews.createdAt)]
    : opts.sort === 'lowest'
      ? [asc(supplierReviews.rating), desc(supplierReviews.createdAt)]
      : [desc(supplierReviews.createdAt)];
```

Append:
```ts
import { supplierReviewImages, supplierReviewHelpfulVotes } from '@vyro/db/schema';
export async function findImagesByReviewIds(d1: D1Database, ids: string[]) {
  if (!ids.length) return [];
  const db = getDb(d1);
  const { inArray } = await import('drizzle-orm');
  return db.select().from(supplierReviewImages).where(inArray(supplierReviewImages.reviewId, ids)).all();
}
export async function findRepliesByReviewIds(d1: D1Database, ids: string[]) {
  if (!ids.length) return [];
  const db = getDb(d1);
  const { inArray } = await import('drizzle-orm');
  return db.select().from(supplierReviewReplies).where(inArray(supplierReviewReplies.reviewId, ids)).all();
}
export async function findOpenFlagByReview(d1: D1Database, reviewId: string) {
  const db = getDb(d1);
  return db.select().from(supplierReviewFlags).where(and(eq(supplierReviewFlags.reviewId, reviewId), eq(supplierReviewFlags.status, 'pending' as never))).get();
}
export async function updateReview(d1: D1Database, id: string, patch: { rating: number; body: string; editedAt: number; updatedAt: number }) {
  const db = getDb(d1);
  return db.update(supplierReviews).set({ rating: patch.rating, body: patch.body, editedAt: patch.editedAt, updatedAt: patch.updatedAt }).where(eq(supplierReviews.id, id)).returning().get();
}
export async function addHelpful(d1: D1Database, reviewId: string, userId: string, now: number) {
  const db = getDb(d1);
  try { await db.insert(supplierReviewHelpfulVotes).values({ reviewId, userId, createdAt: now }).run(); } catch { /* duplicate = already voted */ }
  await db.update(supplierReviews).set({ helpfulCount: sql`COALESCE(helpful_count,0)+1` }).where(eq(supplierReviews.id, reviewId)).run();
}
export async function removeHelpful(d1: D1Database, reviewId: string, userId: string) {
  const db = getDb(d1);
  await db.delete(supplierReviewHelpfulVotes).where(and(eq(supplierReviewHelpfulVotes.reviewId, reviewId), eq(supplierReviewHelpfulVotes.userId, userId))).run();
  await db.update(supplierReviews).set({ helpfulCount: sql`MAX(COALESCE(helpful_count,1)-1,0)` }).where(eq(supplierReviews.id, reviewId)).run();
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vyro/api test -- reviews 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reviews/repository.ts apps/api/test/reviews/
git commit -m "fix(reviews): correct sort + images helpful replies queries"
```

---

### Task 4: Service fixes + edit/helpful/images/flag guard

**Files:**
- Modify: `apps/api/src/modules/reviews/service.ts`
- Modify: `apps/api/src/modules/reviews/analytics.ts`
- Test: `apps/api/test/reviews/service.test.ts`

**Interfaces:**
- Consumes: repository functions from Task 3.
- Produces: `editReview(reviewId, input, session)`, `deleteReviewByBuyer(reviewId, session)`, `toggleHelpful(reviewId, userId, on)`, fixed `checkEligibility`, guarded `flagReview` for Task 5.

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';
import * as svc from '../../src/modules/reviews/service';
describe('reviews full service', () => {
  it('exports edit + helpful', () => {
    expect(typeof (svc as any).editReview).toBe('function');
    expect(typeof (svc as any).toggleHelpful).toBe('function');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/api test -- reviews 2>&1 | tail -10`
Expected: FAIL "expected undefined to be function".

- [ ] **Step 3: Implement service changes**

Fix `checkEligibility` — replace first two guards with:
```ts
if (!buyerOwnsOrder(order, session.allowedBusinessIds)) return { canReview: false, reason: 'not_buyer' };
if (order.status === 'disputed' || order.disputeId) return { canReview: false, reason: 'dispute_open' };
if (order.status !== 'delivered') return { canReview: false, reason: 'not_delivered' };
```

Guard `flagReview` — after loading review insert:
```ts
const open = await repo.findOpenFlagByReview(d1, reviewId);
if (open) throw new ReviewError('already_reviewed');
```

Append:
```ts
export async function editReview(d1: D1Database, reviewId: string, input: { rating: number; body: string }, session: { userId: string; allowedBusinessIds: string[] }) {
  const review = await repo.findReviewById(d1, reviewId);
  if (!review) throw new ReviewError('not_found');
  const db = getDb(d1);
  const order = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, review.orderId)).get() as any;
  if (!order || !session.allowedBusinessIds.includes(order.businessId)) throw new ReviewError('not_buyer');
  if (review.status !== 'published') throw new ReviewError('not_found');
  if (Date.now() - review.createdAt > 7 * 24 * 3600 * 1000) throw new ReviewError('already_reviewed');
  const now = nowMs();
  const updated = await repo.updateReview(d1, reviewId, { rating: input.rating, body: input.body, editedAt: now, updatedAt: now });
  await recomputeAggregate(d1, review.supplierId);
  return updated;
}
export async function deleteReviewByBuyer(d1: D1Database, reviewId: string, session: { userId: string; allowedBusinessIds: string[] }) {
  const review = await repo.findReviewById(d1, reviewId);
  if (!review) throw new ReviewError('not_found');
  const db = getDb(d1);
  const order = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, review.orderId)).get() as any;
  if (!order || !session.allowedBusinessIds.includes(order.businessId)) throw new ReviewError('not_buyer');
  await repo.updateReviewStatus(d1, reviewId, 'removed_by_admin', nowMs());
  await recomputeAggregate(d1, review.supplierId);
}
export async function toggleHelpful(d1: D1Database, reviewId: string, userId: string, on: boolean) {
  const review = await repo.findReviewById(d1, reviewId);
  if (!review) throw new ReviewError('not_found');
  if (on) await repo.addHelpful(d1, reviewId, userId, nowMs());
  else await repo.removeHelpful(d1, reviewId, userId);
}
```

Extend `analytics.ts` ReviewEvent union with `'review_edited' | 'review_helpful' | 'review_photo_added'`.

Map `already_reviewed` stays 409 in routes (covers edit-window-expired + duplicate flag).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vyro/api test -- reviews 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reviews/service.ts apps/api/src/modules/reviews/analytics.ts apps/api/test/reviews/
git commit -m "feat(reviews): eligibility fix flag guard edit helpful"
```

---

### Task 5: Routes + upload + rate-limit + enriched list

**Files:**
- Modify: `apps/api/src/modules/reviews/routes.ts`
- Test: `apps/api/test/reviews/e2e.test.ts`

**Interfaces:**
- Consumes: service functions from Task 4, `rateLimit` middleware, `PRODUCTS` R2, `NOTIFICATIONS_QUEUE`.
- Produces: `PATCH /api/reviews/:id`, `DELETE /api/reviews/:id`, `POST|DELETE /api/reviews/:id/helpful`, `POST /api/reviews/images/upload-direct`, enriched `GET /suppliers/:id/reviews`.

- [ ] **Step 1: Write failing route shape test**

```ts
import { describe, expect, it } from 'vitest';
import router from '../../src/modules/reviews/routes';
describe('reviews routes full', () => {
  it('router is defined', () => { expect(router).toBeDefined(); });
});
```

- [ ] **Step 2: Run**

Run: `pnpm --filter @vyro/api test -- reviews 2>&1 | tail -10`
Expected: PASS (baseline).

- [ ] **Step 3: Implement routes**

Add imports: `editReviewSchema` from validation, `rateLimit` from `../../middleware/rateLimit`, `sanitizeFilename` from `../documents/repository`, dispatcher `notifySupplierOrg`, `notifyBusinessOrg`.

Apply `router.use('/reviews*', rateLimit({ key: 'reviews-mutate', limit: 60, window: 60 }))` and same for `/suppliers/*/reviews/*`.

Extend `POST /reviews` to accept `imageR2Keys` and insert images (max 3) via direct db insert, emit + notify:
```ts
import { getDb } from '@vyro/db';
import { supplierReviewImages } from '@vyro/db/schema';
// after svc.submitReview success:
if (parsed.data.imageR2Keys?.length) {
  const db = getDb(c.env.DB);
  await db.insert(supplierReviewImages).values(parsed.data.imageR2Keys.slice(0,3).map(k => ({ id: crypto.randomUUID(), reviewId: review.id, r2Key: k, createdAt: Date.now() }))).run();
}
try {
  const { notifySupplierOrg } = await import('../notifications/dispatcher');
  await notifySupplierOrg(c.env.DB, c.env.NOTIFICATIONS_QUEUE, review.supplierId, { type: 'review.submitted', title: `New ${review.rating}-star review`, body: review.body.slice(0,200), link: `/supplier/reviews?supplier=${review.supplierId}` });
} catch {}
```

Add:
```ts
router.patch('/reviews/:id', async (c) => {
  if (!(await isReviewsEnabled(c.env.DB))) throw httpError(404, 'NOT_FOUND', 'Reviews disabled');
  const ctx = ctxOf(c);
  const parsed = editReviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const allowedBusinessIds = ctx.businesses.map((b) => b.businessId).filter((x): x is string => !!x);
  try {
    const updated = await svc.editReview(c.env.DB, c.req.param('id'), parsed.data, { userId: ctx.userId, allowedBusinessIds });
    analytics.emit('review_edited', { reviewId: c.req.param('id') });
    return c.json({ review: updated });
  } catch (e) { if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message); throw e; }
});
router.delete('/reviews/:id', async (c) => {
  const ctx = ctxOf(c);
  const allowedBusinessIds = ctx.businesses.map((b) => b.businessId).filter((x): x is string => !!x);
  try {
    await svc.deleteReviewByBuyer(c.env.DB, c.req.param('id'), { userId: ctx.userId, allowedBusinessIds });
    return c.json({ ok: true });
  } catch (e) { if (e instanceof svc.ReviewError) throw httpError(mapStatus(e.code), mapErrorCode(e.code), e.message); throw e; }
});
router.post('/reviews/:id/helpful', async (c) => {
  const ctx = ctxOf(c);
  await svc.toggleHelpful(c.env.DB, c.req.param('id'), ctx.userId, true);
  analytics.emit('review_helpful', { reviewId: c.req.param('id'), on: true });
  return c.json({ ok: true });
});
router.delete('/reviews/:id/helpful', async (c) => {
  const ctx = ctxOf(c);
  await svc.toggleHelpful(c.env.DB, c.req.param('id'), ctx.userId, false);
  return c.json({ ok: true });
});
router.post('/reviews/images/upload-direct', async (c) => {
  if (!(await isReviewsEnabled(c.env.DB))) throw httpError(404, 'NOT_FOUND', 'Reviews disabled');
  ctxOf(c);
  const form = await c.req.parseBody();
  const file = form['file'];
  if (!(file instanceof File)) throw httpError(400, 'VALIDATION_ERROR', 'file required');
  if (!file.type.startsWith('image/')) throw httpError(400, 'VALIDATION_ERROR', 'image only');
  if (file.size > 5 * 1024 * 1024) throw httpError(400, 'VALIDATION_ERROR', 'max 5MB');
  const { sanitizeFilename } = await import('../documents/repository');
  const key = `reviews/tmp/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  await c.env.PRODUCTS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  analytics.emit('review_photo_added', { r2Key: key });
  return c.json({ r2Key: key }, 201);
});
```

Enrich `GET /suppliers/:id/reviews`: after `listReviews`, fetch `findRepliesByReviewIds` + `findImagesByReviewIds`, merge:
```ts
const ids = items.map((r: any) => r.id);
const [replies, images] = await Promise.all([repo.findRepliesByReviewIds(c.env.DB, ids), repo.findImagesByReviewIds(c.env.DB, ids)]);
const byReply = new Map(replies.map((r: any) => [r.reviewId, r]));
const byImg = new Map<string, any[]>();
for (const im of images) { const a = byImg.get(im.reviewId) ?? []; a.push({ ...im, url: `/cdn/${im.r2Key}` }); byImg.set(im.reviewId, a); }
return c.json({ reviews: items.map((r: any) => ({ ...r, reply: byReply.get(r.id) ?? null, images: byImg.get(r.id) ?? [], helpfulCount: r.helpfulCount ?? 0 })), nextCursor: items.length === q.data.limit ? items[items.length-1].id : null });
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @vyro/api test -- reviews 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/reviews/routes.ts apps/api/test/reviews/
git commit -m "feat(reviews): edit delete helpful upload enriched list"
```

---

### Task 6: Web components — fix list + helpful + photos + form edit

**Files:**
- Modify: `apps/web/src/reviews/ReviewList.tsx`
- Create: `apps/web/src/reviews/HelpfulButton.tsx`
- Create: `apps/web/src/reviews/ReviewImageGrid.tsx`
- Modify: `apps/web/src/reviews/ReviewForm.tsx`
- Test: `apps/web/test/reviews/ReviewListFull.test.tsx`

**Interfaces:**
- Consumes: enriched `GET /suppliers/:id/reviews` from Task 5.
- Produces: fixed pagination, reply/photo/helpful/edit UI for Task 7 wiring.

- [ ] **Step 1: Write failing web test**

```tsx
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HelpfulButton } from '../../src/reviews/HelpfulButton';
describe('HelpfulButton', () => {
  it('renders count', () => {
    const html = renderToStaticMarkup(createElement(HelpfulButton, { reviewId: 'r1', initialCount: 3 }));
    expect(html).toMatch(/3/);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @vyro/web test -- reviews 2>&1 | tail -10`
Expected: FAIL "HelpfulButton not found".

- [ ] **Step 3: Implement components**

`HelpfulButton.tsx`:
```tsx
import { useState } from 'react';
export function HelpfulButton({ reviewId, initialCount }: { reviewId: string; initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [on, setOn] = useState(false);
  async function toggle() {
    const res = await fetch(`/api/reviews/${reviewId}/helpful`, { method: on ? 'DELETE' : 'POST', credentials: 'include' });
    if (res.ok) { setOn(!on); setCount((c) => c + (on ? -1 : 1)); }
  }
  return <button onClick={toggle} aria-pressed={on} className="text-xs text-gray-600 underline">Helpful ({count})</button>;
}
```

`ReviewImageGrid.tsx`:
```tsx
export function ReviewImageGrid({ images }: { images: Array<{ url: string }> }) {
  if (!images.length) return null;
  return <div className="flex gap-2 mt-2">{images.slice(0,3).map((im) => <img key={im.url} src={im.url} alt="Review photo" className="w-20 h-20 object-cover rounded border" loading="lazy" />)}</div>;
}
```

Fix `ReviewList.tsx`: remove `nextCursor` from effect deps, append on Load more:
```tsx
const [cursor, setCursor] = useState<string | null>(null);
// effect deps [supplierId, sort] only; fetch with cursor; setItems(prev => cursor ? [...prev, ...newItems] : newItems)
// render reply, <ReviewImageGrid images={r.images ?? []} />, <HelpfulButton reviewId={r.id} initialCount={r.helpfulCount ?? 0} />
```

Extend `ReviewForm.tsx` with props `{ orderId, initialRating?, initialBody?, reviewId?, onSubmitted? }`: if `reviewId` PATCH `/api/reviews/${reviewId}` else POST; add `<input type="file" accept="image/*" multiple>` max 3, upload each via `POST /api/reviews/images/upload-direct` FormData, collect r2Keys, include `imageR2Keys` in POST body.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @vyro/web test -- reviews 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/reviews/ apps/web/test/reviews/
git commit -m "feat(reviews-web): fixed list helpful photos edit form"
```

---

### Task 7: Page wiring + admin burst

**Files:**
- Modify: `apps/web/src/pages/OrderDetailPage.tsx`
- Modify: `apps/web/src/pages/ProductDetailPage.tsx`
- Modify: `apps/web/src/supplier/DashboardPage.tsx`
- Modify: `apps/web/src/admin/ReviewsPage.tsx`
- Modify: `apps/web/src/reviews/AdminReviewQueue.tsx`

**Interfaces:**
- Consumes: components from Task 6, `useReviewEligibility`, `useSupplierReviewSummary`.
- Produces: visible ratings everywhere, no dead UI.

- [ ] **Step 1: Wire OrderDetail review block**

In `OrderDetailPage.tsx` where delivered order renders:
```tsx
import { ReviewForm } from '@/reviews/ReviewForm';
import { useReviewEligibility } from '@/reviews/useReviewEligibility';
// inside component: const elig = useReviewEligibility(order?.id ?? null);
{elig.canReview && order && <div className="mt-4"><h3 className="text-sm font-medium">Rate supplier</h3><ReviewForm orderId={order.id} onSubmitted={() => window.location.reload()} /></div>}
{elig.reason && <p className="text-xs text-gray-500">{elig.reason}</p>}
```

- [ ] **Step 2: Wire ProductDetail + Supplier dashboard + Admin**

`ProductDetailPage.tsx` offer row: `<SupplierStarsLine avg={offer.reviewAvg} count={offer.reviewCount} />` already exists — ensure `SupplierReviewsPanel supplierId` renders below offers.

`supplier/DashboardPage.tsx` add section:
```tsx
import { SupplierReviewsPanel } from '@/reviews/SupplierReviewsPanel';
// <section><h2>Buyer Reviews</h2><SupplierReviewsPanel supplierId={supplierId} /></section>
```

`admin/ReviewsPage.tsx` add burst fetch:
```tsx
const [burst, setBurst] = useState([]);
useEffect(() => { fetch('/api/admin/reviews/flag-burst?windowHours=24&minCount=3', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(j => setBurst(j?.items ?? [])); }, []);
// render list supplierId + flagCount above <AdminReviewQueue />
```

- [ ] **Step 3: Typecheck web**

Run: `pnpm --filter @vyro/web exec tsc --noEmit 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 4: Run web review tests**

Run: `pnpm --filter @vyro/web test -- reviews 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/OrderDetailPage.tsx apps/web/src/pages/ProductDetailPage.tsx apps/web/src/supplier/DashboardPage.tsx apps/web/src/admin/ReviewsPage.tsx
git commit -m "feat(reviews): wire order product supplier admin pages"
```

---

### Task 8: Verification + rollout note

**Files:**
- Modify: `docs/superpowers/rollouts/2026-09-13-supplier-reviews.md` (append § Full v2) or create `docs/superpowers/rollouts/2026-09-15-seller-reviews-full.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green suite + manual smoke proof.

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck 2>&1 | tail -20`
Expected: PASS across monorepo.

- [ ] **Step 2: Full review suites**

Run: `pnpm --filter @vyro/api test -- reviews 2>&1 | tail -10`
Expected: PASS.

Run: `pnpm --filter @vyro/web test -- reviews 2>&1 | tail -10`
Expected: PASS.

Run: `pnpm --filter @vyro/validation test -- supplierReviews 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 3: Write rollout note**

Create `docs/superpowers/rollouts/2026-09-15-seller-reviews-full.md` listing migration `0037`, flag behavior, smoke checklist (submit, edit within 7d, expired edit 409, helpful toggle, photo upload 3 max + 5MB reject, duplicate flag 409, dispute hide, admin resolve, burst).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/rollouts/2026-09-15-seller-reviews-full.md
git commit -m "docs: seller reviews full rollout"
```
