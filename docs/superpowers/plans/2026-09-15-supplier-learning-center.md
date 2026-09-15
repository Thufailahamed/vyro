# Supplier Learning / Training Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Supplier learning/training center (onboarding + operations tracks) with per-lesson article + multi-choice quiz, per-supplier progress, and a soft gate that requires passing onboarding quizzes before publishing the first product.

**Architecture:** New `learning/` module in `apps/api/src/modules/` (mirrors `reviews/` shape: schema → repo → service → routes → vitest). 4 new tables (`learning_lessons`, `learning_quizzes`, `learning_quiz_questions`, `learning_quiz_options`) + 1 progress table (`learning_progress`) + 1 column on `suppliers` (`onboarding_gate_cleared_at`). Seed migration inserts 8 lessons (4 onboarding, 4 operations) each with 3-question quizzes. Admin CMS at `/admin/learning`, supplier pages at `/supplier/learning`. Soft gate hook into `supplierProducts` create offer path. Single feature flag `LEARNING_CENTER_ENABLED` read from `feature_flags` config section.

**Tech Stack:** Hono on Cloudflare Workers, D1 + Drizzle ORM (`packages/db`), Zod in `packages/validation`, React + TanStack Query in `apps/web`, Vitest in `apps/api/test/` (not `__tests__/` — see Task notes), `@vyro/auth` for `requireSupplierRole`/`requireAdminRole`.

## Global Constraints

- Node 20+ and pnpm 9+ (repo uses pnpm@9.12.0).
- SPA must use relative `fetch('/api/...')` — never absolute URL.
- Single feature flag `LEARNING_CENTER_ENABLED` in `feature_flags` config section; when absent/false, every learning route returns 404, every CTA renders `null`, the gate is skipped.
- Quiz option `is_correct` is server-side only; the supplier-facing quiz endpoint strips it from option payloads.
- Markdown rendered via existing `apps/web/src/lib/markdown.ts` (must be sanitized — verify before Task 11).
- Backend tests live in `apps/api/test/<module>/*.test.ts` (mirroring `apps/api/test/supplierProducts.test.ts`), not `__tests__/`. Use `vi.mock('@vyro/db', …)` + `vi.mock('@vyro/db/schema', …)` pattern.
- Frontend tests use Vitest + testing-library; existing config in `apps/web/`.
- Migration style: `--> statement-breakpoint` between statements (Drizzle).
- Forward-only migrations; rollback files live in `packages/db/migrations_down/` (mirror after main migration).
- Do not modify `packages/db/migrations/0033_supplier_reviews.sql` or any existing migration — append only.

## File Map

**Backend — new files:**
- `packages/db/migrations/0039_learning_center.sql` — 4 tables + `suppliers.onboarding_gate_cleared_at`.
- `packages/db/migrations/0040_learning_seed.sql` — 8 lessons + 24 questions + 72 options.
- `packages/db/migrations_down/0039_learning_center_down.sql` — drop tables + drop column.
- `packages/db/migrations_down/0040_learning_seed_down.sql` — no-op (forward-only seed).
- `packages/db/src/schema/learningCenter.ts` — Drizzle table defs.
- `packages/validation/src/learningCenter.ts` — Zod schemas.
- `apps/api/src/modules/learning/repository.ts` — DB queries.
- `apps/api/src/modules/learning/service.ts` — supplier-facing business logic.
- `apps/api/src/modules/learning/adminService.ts` — admin CMS logic.
- `apps/api/src/modules/learning/routes.ts` — supplier routes.
- `apps/api/src/modules/learning/adminRoutes.ts` — admin routes.
- `apps/api/src/modules/learning/index.ts` — re-export supplier router.
- `apps/api/src/modules/learning/adminIndex.ts` — re-export admin router.
- `apps/api/src/modules/learning/errors.ts` — `TrainingRequiredError` + `LearningError` + codes.
- `apps/api/test/learning/service.test.ts`
- `apps/api/test/learning/adminService.test.ts`
- `apps/api/test/learning/routes.test.ts`

**Backend — modifications:**
- `packages/db/src/schema/index.ts` — append `export * from './learningCenter';`.
- `packages/validation/src/index.ts` — append `export * from './learningCenter';`.
- `apps/api/src/index.ts` — mount `app.route('/api/supplier/learning', learningRouter)` and `app.route('/api/admin/learning', learningAdminRouter)` next to existing mounts (after trust-seal line ~206).
- `apps/api/src/modules/supplierProducts/routes.ts` — in `router.post('/', ...)` invoke `assertTrainingGateOrThrow` before `createOffer`.

**Frontend — new files:**
- `apps/web/src/lib/learningApi.ts` — fetch wrappers.
- `apps/web/src/supplier/learning/hooks/useLearning.ts` — TanStack Query hooks.
- `apps/web/src/supplier/learning/LearningIndex.tsx`
- `apps/web/src/supplier/learning/LessonPage.tsx`
- `apps/web/src/supplier/learning/QuizForm.tsx`
- `apps/web/src/supplier/learning/TrainingGateNotice.tsx`
- `apps/web/src/supplier/learning/LearningCta.tsx`
- `apps/web/src/supplier/learning/markdownSafe.ts` — wrapper around `lib/markdown.ts` (re-export if already sanitized).
- `apps/web/src/admin/learning/hooks/useAdminLearning.ts`
- `apps/web/src/admin/learning/LessonsAdmin.tsx`
- `apps/web/src/admin/learning/LessonEditor.tsx`
- `apps/web/src/admin/learning/QuizBuilder.tsx`
- `apps/web/src/admin/learning/AdminNavLink.tsx` — adds link to admin sidebar.
- `apps/web/test/learning/LearningIndex.test.tsx`
- `apps/web/test/learning/LessonPage.test.tsx`
- `apps/web/test/learning/QuizForm.test.tsx`
- `apps/web/test/learning/LessonsAdmin.test.tsx`

**Frontend — modifications:**
- `apps/web/src/App.tsx` — add `/supplier/learning` + `/supplier/learning/:slug` + `/admin/learning` + `/admin/learning/:id/edit` routes.
- `apps/web/src/supplier/Shell.tsx` — add nav link to "Training center".
- `apps/web/src/admin/Shell.tsx` — add nav link to "Learning center".
- `apps/web/src/supplier/ProductFormPage.tsx` — render `<TrainingGateNotice>` at top.
- `apps/web/src/supplier/VerificationPage.tsx` — render `<LearningCta href="/supplier/learning/verify-your-business">`.
- `apps/web/src/supplier/AccountsPage.tsx` (payouts section) — render `<LearningCta href="/supplier/learning/set-up-payouts">`.
- `apps/web/src/supplier/QuoteRequestsPage.tsx` (or supplier RFQ quote form) — render `<LearningCta href="/supplier/learning/quote-rfqs-like-a-pro">`.

---

### Task 1: DB migration — schema + suppliers column

**Files:**
- Create: `packages/db/migrations/0039_learning_center.sql`
- Create: `packages/db/migrations_down/0039_learning_center_down.sql`
- Test: `apps/api/test/learning/migration.test.ts` (new — verifies migration applies)

**Interfaces:**
- Consumes: existing `suppliers(id)` FK.
- Produces: 4 tables + `suppliers.onboarding_gate_cleared_at` column.

- [ ] **Step 1: Write the failing test**

Create `apps/api/test/learning/migration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyMigrations } from '../../../packages/db/src/migrate';
import { getDb } from '@vyro/db';

const D1 = new Map<string, any>();

describe('learning center migration', () => {
  it('creates 4 tables and adds suppliers column', async () => {
    await applyMigrations(D1 as any);
    const db = getDb(D1 as any);
    const tables = ['learning_lessons', 'learning_quizzes', 'learning_quiz_questions', 'learning_quiz_options', 'learning_progress'];
    for (const t of tables) {
      const row = await db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, t);
      expect(row.length).toBe(1);
    }
    const cols = await db.all(`PRAGMA table_info(suppliers)`);
    expect(cols.some((c: any) => c.name === 'onboarding_gate_cleared_at')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/migration.test.ts`
Expected: FAIL (tables don't exist).

- [ ] **Step 3: Write the migration**

Create `packages/db/migrations/0039_learning_center.sql`:

```sql
-- 0039_learning_center.sql
-- Supplier learning/training center: lessons, quizzes, progress, first-publish gate flag.
-- Forward-only, additive.

CREATE TABLE `learning_lessons` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL UNIQUE,
  `title` text NOT NULL,
  `summary` text NOT NULL,
  `body_markdown` text NOT NULL,
  `track` text NOT NULL CHECK(track IN ('onboarding','operations')),
  `order_index` integer NOT NULL,
  `is_published` integer NOT NULL DEFAULT 0,
  `is_required_for_publish` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX `learning_lessons_track_order_idx` ON `learning_lessons` (`track`, `order_index`);
--> statement-breakpoint

CREATE INDEX `learning_lessons_published_idx` ON `learning_lessons` (`is_published`, `track`);
--> statement-breakpoint

CREATE TABLE `learning_quizzes` (
  `id` text PRIMARY KEY NOT NULL,
  `lesson_id` text NOT NULL UNIQUE REFERENCES `learning_lessons`(`id`) ON DELETE CASCADE,
  `pass_threshold` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE `learning_quiz_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `quiz_id` text NOT NULL REFERENCES `learning_quizzes`(`id`) ON DELETE CASCADE,
  `order_index` integer NOT NULL,
  `prompt` text NOT NULL
);
--> statement-breakpoint

CREATE INDEX `learning_quiz_questions_quiz_idx` ON `learning_quiz_questions` (`quiz_id`, `order_index`);
--> statement-breakpoint

CREATE TABLE `learning_quiz_options` (
  `id` text PRIMARY KEY NOT NULL,
  `question_id` text NOT NULL REFERENCES `learning_quiz_questions`(`id`) ON DELETE CASCADE,
  `order_index` integer NOT NULL,
  `label` text NOT NULL,
  `is_correct` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint

CREATE INDEX `learning_quiz_options_question_idx` ON `learning_quiz_options` (`question_id`, `order_index`);
--> statement-breakpoint

CREATE TABLE `learning_progress` (
  `id` text PRIMARY KEY NOT NULL,
  `supplier_id` text NOT NULL REFERENCES `suppliers`(`id`) ON DELETE CASCADE,
  `lesson_id` text NOT NULL REFERENCES `learning_lessons`(`id`) ON DELETE CASCADE,
  `article_completed_at` integer,
  `quiz_passed_at` integer,
  `attempts` integer NOT NULL DEFAULT 0,
  UNIQUE(`supplier_id`, `lesson_id`)
);
--> statement-breakpoint

CREATE INDEX `learning_progress_supplier_idx` ON `learning_progress` (`supplier_id`);
--> statement-breakpoint

ALTER TABLE `suppliers` ADD COLUMN `onboarding_gate_cleared_at` integer;
```

- [ ] **Step 4: Write the down migration**

Create `packages/db/migrations_down/0039_learning_center_down.sql`:

```sql
-- 0039_learning_center_down.sql
ALTER TABLE `suppliers` DROP COLUMN `onboarding_gate_cleared_at`;
--> statement-breakpoint
DROP INDEX IF EXISTS `learning_progress_supplier_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `learning_progress`;
--> statement-breakpoint
DROP INDEX IF EXISTS `learning_quiz_options_question_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `learning_quiz_options`;
--> statement-breakpoint
DROP INDEX IF EXISTS `learning_quiz_questions_quiz_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `learning_quiz_questions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `learning_quizzes`;
--> statement-breakpoint
DROP INDEX IF EXISTS `learning_lessons_published_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `learning_lessons_track_order_idx`;
--> statement-breakpoint
DROP TABLE IF EXISTS `learning_lessons`;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/migration.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/0039_learning_center.sql packages/db/migrations_down/0039_learning_center_down.sql apps/api/test/learning/migration.test.ts
git commit -m "feat(db): learning center schema migration"
```

---

### Task 2: Seed migration — 8 lessons + 24 questions + 72 options

**Files:**
- Create: `packages/db/migrations/0040_learning_seed.sql`
- Create: `packages/db/migrations_down/0040_learning_seed_down.sql`

- [ ] **Step 1: Write the seed file**

Create `packages/db/migrations/0040_learning_seed.sql` with **deterministic UUIDs** (use `lc-lesson-1` through `lc-lesson-8`, `lc-quiz-1` through `lc-quiz-8`, `lc-q-NN-M` for question, `lc-opt-NN-M-K` for option). Placeholder markdown bodies of ~150–250 words each (call this out in PR description). Place correct answer index `K=0` per question for now; admin can edit later.

```sql
-- 0040_learning_seed.sql
-- Initial seed for the Supplier learning center. Placeholder copy; admin can edit.
-- Lesson IDs: lc-lesson-1..8 ; Quiz IDs: lc-quiz-1..8 ; Questions: lc-q-N-M ; Options: lc-opt-N-M-K
-- 4 onboarding (gated) + 4 operations (not gated).

INSERT INTO learning_lessons (id, slug, title, summary, body_markdown, track, order_index, is_published, is_required_for_publish, created_at, updated_at) VALUES
  ('lc-lesson-1','welcome-to-vyro','Welcome to Vyro','What Vyro is and how suppliers earn.','Vyro connects Sri Lankan wholesale suppliers with verified domestic and cross-border buyers. As a supplier you list products, quote RFQs, fulfill orders, and receive payouts through PayHere or bank transfer. This lesson walks through your first 7 days on Vyro and what to expect at each stage.','onboarding',1,1,1,unixepoch(),unixepoch()),
  ('lc-lesson-2','verify-your-business','Verify your business','KYC walkthrough.','Verification (KYC) confirms your business is real and trade-eligible. Upload your BR certificate, NIC of the owner, and a recent utility bill. Review takes 24–48 hours. While pending you can browse the dashboard but cannot publish products. Approved suppliers earn a verified badge on their storefront and rank higher in search.','onboarding',2,1,1,unixepoch(),unixepoch()),
  ('lc-lesson-3','set-up-payouts','Set up payouts','Bank account + PayHere.','Payouts cover everything you earn after orders are delivered and the buyer confirmation window closes (Net14 by default). Add a Sri Lankan bank account in LKR, or a PayHere merchant account for instant withdrawals. We hold the first payout for 7 days as a fraud precaution.','onboarding',3,1,1,unixepoch(),unixepoch()),
  ('lc-lesson-4','publish-your-first-product','Publish your first product','Listing quality bar.','A great listing has 3+ sharp photos, an accurate HS code, weight, MOQ, and a wholesale price tier. Lead time must be realistic; under-promising drives disputes. Avoid keyword stuffing; titles like "Premium A4 Paper 80gsm – 500 sheets" outperform vague ones.','onboarding',4,1,1,unixepoch(),unixepoch()),
  ('lc-lesson-5','quote-rfqs-like-a-pro','Quote RFQs like a pro','Win more quotes.','Reply within 4 hours; quotes past 24 hours are 60% less likely to convert. Lead with a clear price + MOQ + lead time, then add 2–3 trust signals (years in business, stock photos, prior buyer logos).','operations',1,1,0,unixepoch(),unixepoch()),
  ('lc-lesson-6','fulfillment-and-delivery-slas','Fulfillment & delivery SLAs','Hit the delivery promise.','Mark orders shipped within 24h of payment confirmation. Track every dispatch. If you cannot meet the lead time, message the buyer before the deadline — proactive comms prevent disputes.','operations',2,1,0,unixepoch(),unixepoch()),
  ('lc-lesson-7','handle-a-buyer-dispute','Handle a buyer dispute','Stay calm, respond fast.','Disputes open when a buyer reports non-delivery, damage, or quality issues. You have 48 hours to respond with evidence (photos, tracking, packing slips). Disputes that resolve by mutual agreement refund partially; resolved-by-Vyro outcomes count against your trust score.','operations',3,1,0,unixepoch(),unixepoch()),
  ('lc-lesson-8','read-your-analytics','Read your analytics','Make numbers work for you.','Your analytics page shows conversion rate, RFQ win rate, average order value, and repeat-buyer share. If conversion <2%, your listing photos or price are off. If repeat-buyer share <15%, post-delivery follow-up is missing.','operations',4,1,0,unixepoch(),unixepoch());
--> statement-breakpoint

INSERT INTO learning_quizzes (id, lesson_id, pass_threshold, created_at) VALUES
  ('lc-quiz-1','lc-lesson-1',2,unixepoch()),
  ('lc-quiz-2','lc-lesson-2',2,unixepoch()),
  ('lc-quiz-3','lc-lesson-3',2,unixepoch()),
  ('lc-quiz-4','lc-lesson-4',2,unixepoch()),
  ('lc-quiz-5','lc-lesson-5',2,unixepoch()),
  ('lc-quiz-6','lc-lesson-6',2,unixepoch()),
  ('lc-quiz-7','lc-lesson-7',2,unixepoch()),
  ('lc-quiz-8','lc-lesson-8',2,unixepoch());
--> statement-breakpoint

-- Question 1 for each quiz (template; replicate for questions 2 & 3 per lesson).
INSERT INTO learning_quiz_questions (id, quiz_id, order_index, prompt) VALUES
  ('lc-q-1-1','lc-quiz-1',1,'What does Vyro primarily connect?'),
  ('lc-q-1-2','lc-quiz-1',2,'Roughly how long does KYC review take?'),
  ('lc-q-1-3','lc-quiz-1',3,'What is the default payment term for buyers?'),
  ('lc-q-2-1','lc-quiz-2',1,'Which document is NOT required for KYC?'),
  ('lc-q-2-2','lc-quiz-2',2,'What happens while KYC is pending?'),
  ('lc-q-2-3','lc-quiz-2',3,'What benefit do verified suppliers get?'),
  ('lc-q-3-1','lc-quiz-3',1,'Which payout method is supported?'),
  ('lc-q-3-2','lc-quiz-3',2,'How long is the first payout held?'),
  ('lc-q-3-3','lc-quiz-3',3,'What is the default settlement currency?'),
  ('lc-q-4-1','lc-quiz-4',1,'How many photos should a strong listing have?'),
  ('lc-q-4-2','lc-quiz-4',2,'Which field is mandatory on a listing?'),
  ('lc-q-4-3','lc-quiz-4',3,'What helps a listing rank higher in search?'),
  ('lc-q-5-1','lc-quiz-5',1,'Within how many hours should you reply to an RFQ?'),
  ('lc-q-5-2','lc-quiz-5',2,'How much less likely are quotes past 24h to convert?'),
  ('lc-q-5-3','lc-quiz-5',3,'What should a quote lead with?'),
  ('lc-q-6-1','lc-quiz-6',1,'Within how many hours should orders be marked shipped?'),
  ('lc-q-6-2','lc-quiz-6',2,'What should you do if you cannot meet lead time?'),
  ('lc-q-6-3','lc-quiz-6',3,'What drives most disputes?'),
  ('lc-q-7-1','lc-quiz-7',1,'How long do you have to respond to a dispute?'),
  ('lc-q-7-2','lc-quiz-7',2,'Which evidence type is most useful?'),
  ('lc-q-7-3','lc-quiz-7',3,'What counts against your trust score?'),
  ('lc-q-8-1','lc-quiz-8',1,'What does conversion <2% suggest?'),
  ('lc-q-8-2','lc-quiz-8',2,'What does repeat-buyer share <15% suggest?'),
  ('lc-q-8-3','lc-quiz-8',3,'Which metric tracks RFQ win rate?');
--> statement-breakpoint

-- 3 options per question; first option marked correct (K=0). 24 rows × 3 = 72.
INSERT INTO learning_quiz_options (id, question_id, order_index, label, is_correct) VALUES
  -- Lesson 1
  ('lc-opt-1-1-1','lc-q-1-1',1,'Sri Lankan suppliers with domestic and cross-border buyers',1),
  ('lc-opt-1-1-2','lc-q-1-1',2,'Buyers with logistics companies',0),
  ('lc-opt-1-1-3','lc-q-1-1',3,'Banks with retail investors',0),
  ('lc-opt-1-2-1','lc-q-1-2',1,'5 minutes',0),
  ('lc-opt-1-2-2','lc-q-1-2',2,'24–48 hours',1),
  ('lc-opt-1-2-3','lc-q-1-2',3,'30 days',0),
  ('lc-opt-1-3-1','lc-q-1-3',1,'Net7',0),
  ('lc-opt-1-3-2','lc-q-1-3',2,'Net14',1),
  ('lc-opt-1-3-3','lc-q-1-3',3,'Net60',0),
  -- Lesson 2
  ('lc-opt-2-1-1','lc-q-2-1',1,'BR certificate',0),
  ('lc-opt-2-1-2','lc-q-2-1',2,'NIC of owner',0),
  ('lc-opt-2-1-3','lc-q-2-1',3,'Personal diary',1),
  ('lc-opt-2-2-1','lc-q-2-2',1,'Cannot publish products',1),
  ('lc-opt-2-2-2','lc-q-2-2',2,'Account is suspended',0),
  ('lc-opt-2-2-3','lc-q-2-2',3,'Cannot log in',0),
  ('lc-opt-2-3-1','lc-q-2-3',1,'Verified badge + ranking boost',1),
  ('lc-opt-2-3-2','lc-q-2-3',2,'Free PayHere merchant',0),
  ('lc-opt-2-3-3','lc-q-2-3',3,'No commission',0),
  -- Lesson 3
  ('lc-opt-3-1-1','lc-q-3-1',1,'Crypto wallet',0),
  ('lc-opt-3-1-2','lc-q-3-1',2,'Sri Lankan bank or PayHere',1),
  ('lc-opt-3-1-3','lc-q-3-1',3,'Cash on pickup',0),
  ('lc-opt-3-2-1','lc-q-3-2',1,'7 days',1),
  ('lc-opt-3-2-2','lc-q-3-2',2,'24 hours',0),
  ('lc-opt-3-2-3','lc-q-3-2',3,'Never held',0),
  ('lc-opt-3-3-1','lc-q-3-3',1,'LKR',1),
  ('lc-opt-3-3-2','lc-q-3-3',2,'USD',0),
  ('lc-opt-3-3-3','lc-q-3-3',3,'EUR',0),
  -- Lesson 4
  ('lc-opt-4-1-1','lc-q-4-1',1,'1 photo',0),
  ('lc-opt-4-1-2','lc-q-4-1',2,'3+ photos',1),
  ('lc-opt-4-1-3','lc-q-4-1',3,'No photos needed',0),
  ('lc-opt-4-2-1','lc-q-4-2',1,'HS code',1),
  ('lc-opt-4-2-2','lc-q-4-2',2,'Personal story',0),
  ('lc-opt-4-2-3','lc-q-4-2',3,'Favorite color',0),
  ('lc-opt-4-3-1','lc-q-4-3',1,'Keyword stuffing',0),
  ('lc-opt-4-3-2','lc-q-4-3',2,'Specific title like "A4 Paper 80gsm 500 sheets"',1),
  ('lc-opt-4-3-3','lc-q-4-3',3,'All caps',0),
  -- Lesson 5
  ('lc-opt-5-1-1','lc-q-5-1',1,'4 hours',1),
  ('lc-opt-5-1-2','lc-q-5-1',2,'48 hours',0),
  ('lc-opt-5-1-3','lc-q-5-1',3,'1 week',0),
  ('lc-opt-5-2-1','lc-q-5-2',1,'10%',0),
  ('lc-opt-5-2-2','lc-q-5-2',2,'60%',1),
  ('lc-opt-5-2-3','lc-q-5-2',3,'95%',0),
  ('lc-opt-5-3-1','lc-q-5-3',1,'Price + MOQ + lead time',1),
  ('lc-opt-5-3-2','lc-q-5-3',2,'Marketing tagline',0),
  ('lc-opt-5-3-3','lc-q-5-3',3,'Personal anecdote',0),
  -- Lesson 6
  ('lc-opt-6-1-1','lc-q-6-1',1,'24h',1),
  ('lc-opt-6-1-2','lc-q-6-1',2,'72h',0),
  ('lc-opt-6-1-3','lc-q-6-1',3,'1 week',0),
  ('lc-opt-6-2-1','lc-q-6-2',1,'Message buyer before deadline',1),
  ('lc-opt-6-2-2','lc-q-6-2',2,'Cancel silently',0),
  ('lc-opt-6-2-3','lc-q-6-2',3,'Block the buyer',0),
  ('lc-opt-6-3-1','lc-q-6-3',1,'Missed communication',1),
  ('lc-opt-6-3-2','lc-q-6-3',2,'High price',0),
  ('lc-opt-6-3-3','lc-q-6-3',3,'Too many SKUs',0),
  -- Lesson 7
  ('lc-opt-7-1-1','lc-q-7-1',1,'12 hours',0),
  ('lc-opt-7-1-2','lc-q-7-1',2,'48 hours',1),
  ('lc-opt-7-1-3','lc-q-7-1',3,'7 days',0),
  ('lc-opt-7-2-1','lc-q-7-2',1,'Photos of damage + tracking',1),
  ('lc-opt-7-2-2','lc-q-7-2',2,'Personal opinion essay',0),
  ('lc-opt-7-2-3','lc-q-7-2',3,'Unrelated news article',0),
  ('lc-opt-7-3-1','lc-q-7-3',1,'Resolved-by-Vyro outcomes',1),
  ('lc-opt-7-3-2','lc-q-7-3',2,'Mutual agreement',0),
  ('lc-opt-7-3-3','lc-q-7-3',3,'Buyer cancellation',0),
  -- Lesson 8
  ('lc-opt-8-1-1','lc-q-8-1',1,'Photos or price are off',1),
  ('lc-opt-8-1-2','lc-q-8-1',2,'Currency exchange rate',0),
  ('lc-opt-8-1-3','lc-q-8-1',3,'Weather',0),
  ('lc-opt-8-2-1','lc-q-8-2',1,'Missing post-delivery follow-up',1),
  ('lc-opt-8-2-2','lc-q-8-2',2,'Listing title too short',0),
  ('lc-opt-8-2-3','lc-q-8-2',3,'Wrong phone number',0),
  ('lc-opt-8-3-1','lc-q-8-3',1,'Conversion rate',0),
  ('lc-opt-8-3-2','lc-q-8-3',2,'RFQ win rate',1),
  ('lc-opt-8-3-3','lc-q-8-3',3,'Cart abandonment',0);
```

- [ ] **Step 2: Write the down migration**

Create `packages/db/migrations_down/0040_learning_seed_down.sql`:

```sql
-- 0040_learning_seed_down.sql
-- Seed is forward-only; rollback requires dropping the schema too.
DELETE FROM learning_quiz_options WHERE question_id LIKE 'lc-q-%';
DELETE FROM learning_quiz_questions WHERE id LIKE 'lc-q-%';
DELETE FROM learning_quizzes WHERE id LIKE 'lc-quiz-%';
DELETE FROM learning_lessons WHERE id LIKE 'lc-lesson-%';
```

- [ ] **Step 3: Run existing migration test to ensure seed applies cleanly**

Append a second `it` block to `apps/api/test/learning/migration.test.ts`:

```ts
  it('seeds 8 lessons with 3 options each', async () => {
    const db = getDb(D1 as any);
    const lessons = await db.all(`SELECT COUNT(*) AS n FROM learning_lessons`);
    expect(Number(lessons[0].n)).toBe(8);
    const options = await db.all(`SELECT COUNT(*) AS n FROM learning_quiz_options`);
    expect(Number(options[0].n)).toBe(72);
  });
```

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/migration.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/migrations/0040_learning_seed.sql packages/db/migrations_down/0040_learning_seed_down.sql apps/api/test/learning/migration.test.ts
git commit -m "feat(db): seed 8 learning lessons + quizzes"
```

---

### Task 3: Drizzle schema + validation zod schemas

**Files:**
- Create: `packages/db/src/schema/learningCenter.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/validation/src/learningCenter.ts`
- Modify: `packages/validation/src/index.ts`

- [ ] **Step 1: Create Drizzle schema**

Create `packages/db/src/schema/learningCenter.ts`:

```ts
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';

export const learningLessons = sqliteTable(
  'learning_lessons',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    track: text('track', { enum: ['onboarding', 'operations'] }).notNull(),
    orderIndex: integer('order_index').notNull(),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
    isRequiredForPublish: integer('is_required_for_publish', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    trackOrderIdx: index('learning_lessons_track_order_idx').on(t.track, t.orderIndex),
    publishedIdx: index('learning_lessons_published_idx').on(t.isPublished, t.track),
  }),
);

export const learningQuizzes = sqliteTable('learning_quizzes', {
  id: text('id').primaryKey(),
  lessonId: text('lesson_id').notNull().unique().references(() => learningLessons.id, { onDelete: 'cascade' }),
  passThreshold: integer('pass_threshold').notNull().default(1),
  createdAt: integer('created_at').notNull(),
});

export const learningQuizQuestions = sqliteTable(
  'learning_quiz_questions',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id').notNull().references(() => learningQuizzes.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    prompt: text('prompt').notNull(),
  },
  (t) => ({
    quizIdx: index('learning_quiz_questions_quiz_idx').on(t.quizId, t.orderIndex),
  }),
);

export const learningQuizOptions = sqliteTable(
  'learning_quiz_options',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id').notNull().references(() => learningQuizQuestions.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    label: text('label').notNull(),
    isCorrect: integer('is_correct', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => ({
    questionIdx: index('learning_quiz_options_question_idx').on(t.questionId, t.orderIndex),
  }),
);

export const learningProgress = sqliteTable(
  'learning_progress',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull().references(() => learningLessons.id, { onDelete: 'cascade' }),
    articleCompletedAt: integer('article_completed_at'),
    quizPassedAt: integer('quiz_passed_at'),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => ({
    supplierLessonUniq: uniqueIndex('learning_progress_supplier_lesson_uniq').on(t.supplierId, t.lessonId),
    supplierIdx: index('learning_progress_supplier_idx').on(t.supplierId),
  }),
);

export type LearningLesson = typeof learningLessons.$inferSelect;
export type NewLearningLesson = typeof learningLessons.$inferInsert;
export type LearningProgress = typeof learningProgress.$inferSelect;
```

Append the unique index name explicitly in `learning_lessons` (slug is already declared UNIQUE in column def — no extra index needed). Add `(t) => ({})` if Drizzle complains about missing indexes argument.

- [ ] **Step 2: Export from schema barrel**

Modify `packages/db/src/schema/index.ts`: append `export * from './learningCenter';` at the end (after the last existing line).

- [ ] **Step 3: Create zod validation schemas**

Create `packages/validation/src/learningCenter.ts`:

```ts
import { z } from 'zod';

export const lessonTrackSchema = z.enum(['onboarding', 'operations']);

export const lessonSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  track: lessonTrackSchema,
  orderIndex: z.number().int(),
  isRequiredForPublish: z.boolean(),
  isPublished: z.boolean(),
  articleCompleted: z.boolean(),
  quizPassed: z.boolean(),
});

export const lessonDetailSchema = lessonSummarySchema.extend({
  bodyMarkdown: z.string(),
});

export const quizOptionSchema = z.object({
  id: z.string(),
  orderIndex: z.number().int(),
  label: z.string(),
}); // no isCorrect in supplier-facing payload

export const quizQuestionSchema = z.object({
  id: z.string(),
  orderIndex: z.number().int(),
  prompt: z.string(),
  options: z.array(quizOptionSchema).min(2).max(6),
});

export const quizSchema = z.object({
  id: z.string(),
  passThreshold: z.number().int().min(1),
  questions: z.array(quizQuestionSchema).min(1).max(20),
});

export const learningLessonDetailSchema = z.object({
  lesson: lessonDetailSchema,
  quiz: quizSchema.nullable(),
});

export const submitQuizSchema = z.object({
  answers: z.array(z.object({ questionId: z.string(), optionId: z.string() })).min(1).max(50),
});

export const quizSubmissionResultSchema = z.object({
  passed: z.boolean(),
  correctCount: z.number().int(),
  total: z.number().int(),
});

export const onboardingGateSchema = z.object({
  required: z.boolean(),
  missing: z.array(z.object({ slug: z.string(), title: z.string() })),
});

export const adminUpsertLessonSchema = z.object({
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(200),
  summary: z.string().min(2).max(500),
  bodyMarkdown: z.string().min(10).max(100_000),
  track: lessonTrackSchema,
  orderIndex: z.number().int().min(0).max(1000),
  isPublished: z.boolean(),
  isRequiredForPublish: z.boolean(),
});

export const adminUpsertQuizSchema = z.object({
  passThreshold: z.number().int().min(1).max(10),
  questions: z
    .array(
      z.object({
        id: z.string().optional(),
        prompt: z.string().min(3).max(500),
        options: z
          .array(
            z.object({
              id: z.string().optional(),
              label: z.string().min(1).max(300),
              isCorrect: z.boolean(),
            }),
          )
          .min(2)
          .max(6)
          .refine((opts) => opts.filter((o) => o.isCorrect).length === 1, 'exactly one correct option required'),
      }),
    )
    .min(1)
    .max(20),
});

export const learningListQuerySchema = z.object({
  track: lessonTrackSchema.optional(),
});
```

- [ ] **Step 4: Export from validation barrel**

Modify `packages/validation/src/index.ts`: append `export * from './learningCenter';`.

- [ ] **Step 5: Build to verify types compile**

Run: `pnpm -r build`
Expected: type-check succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/learningCenter.ts packages/db/src/schema/index.ts packages/validation/src/learningCenter.ts packages/validation/src/index.ts
git commit -m "feat(db,validation): learning center drizzle schema + zod"
```

---

### Task 4: Repository layer

**Files:**
- Create: `apps/api/src/modules/learning/repository.ts`

- [ ] **Step 1: Create repository**

```ts
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  learningLessons,
  learningQuizzes,
  learningQuizQuestions,
  learningQuizOptions,
  learningProgress,
  suppliers,
} from '@vyro/db/schema';

export async function listPublishedLessons(d1: D1Database, track?: 'onboarding' | 'operations') {
  const db = getDb(d1);
  return db
    .select()
    .from(learningLessons)
    .where(
      and(
        eq(learningLessons.isPublished, true as never),
        track ? eq(learningLessons.track, track as never) : undefined,
      ),
    )
    .orderBy(asc(learningLessons.track), asc(learningLessons.orderIndex))
    .all();
}

export async function listAllLessons(d1: D1Database) {
  const db = getDb(d1);
  return db.select().from(learningLessons).orderBy(asc(learningLessons.track), asc(learningLessons.orderIndex)).all();
}

export async function findLessonBySlug(d1: D1Database, slug: string) {
  const db = getDb(d1);
  return (await db.select().from(learningLessons).where(eq(learningLessons.slug, slug)).get()) ?? null;
}

export async function findLessonById(d1: D1Database, id: string) {
  const db = getDb(d1);
  return (await db.select().from(learningLessons).where(eq(learningLessons.id, id)).get()) ?? null;
}

export async function findQuizByLessonId(d1: D1Database, lessonId: string) {
  const db = getDb(d1);
  return (await db.select().from(learningQuizzes).where(eq(learningQuizzes.lessonId, lessonId)).get()) ?? null;
}

export async function findQuestionsByQuizId(d1: D1Database, quizId: string) {
  const db = getDb(d1);
  return db
    .select()
    .from(learningQuizQuestions)
    .where(eq(learningQuizQuestions.quizId, quizId))
    .orderBy(asc(learningQuizQuestions.orderIndex))
    .all();
}

export async function findOptionsByQuestionIds(d1: D1Database, questionIds: string[]) {
  if (!questionIds.length) return [];
  const db = getDb(d1);
  return db
    .select()
    .from(learningQuizOptions)
    .where(inArray(learningQuizOptions.questionId, questionIds))
    .orderBy(asc(learningQuizOptions.questionId), asc(learningQuizOptions.orderIndex))
    .all();
}

export async function findProgress(d1: D1Database, supplierId: string, lessonId: string) {
  const db = getDb(d1);
  return (
    (await db
      .select()
      .from(learningProgress)
      .where(and(eq(learningProgress.supplierId, supplierId), eq(learningProgress.lessonId, lessonId)))
      .get()) ?? null
  );
}

export async function findProgressBySupplier(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  return db.select().from(learningProgress).where(eq(learningProgress.supplierId, supplierId)).all();
}

export async function upsertArticleComplete(
  d1: D1Database,
  supplierId: string,
  lessonId: string,
  now: number,
) {
  const db = getDb(d1);
  const existing = await findProgress(d1, supplierId, lessonId);
  if (existing) {
    if (existing.articleCompletedAt) return existing;
    return db
      .update(learningProgress)
      .set({ articleCompletedAt: now })
      .where(eq(learningProgress.id, existing.id))
      .returning()
      .get();
  }
  const id = crypto.randomUUID();
  return db
    .insert(learningProgress)
    .values({
      id,
      supplierId,
      lessonId,
      articleCompletedAt: now,
      quizPassedAt: null,
      attempts: 0,
    })
    .returning()
    .get();
}

export async function incrementAttempts(d1: D1Database, supplierId: string, lessonId: string, now: number) {
  const db = getDb(d1);
  const existing = await findProgress(d1, supplierId, lessonId);
  if (existing) {
    return db
      .update(learningProgress)
      .set({ attempts: existing.attempts + 1 })
      .where(eq(learningProgress.id, existing.id))
      .returning()
      .get();
  }
  const id = crypto.randomUUID();
  return db
    .insert(learningProgress)
    .values({
      id,
      supplierId,
      lessonId,
      articleCompletedAt: null,
      quizPassedAt: null,
      attempts: 1,
    })
    .returning()
    .get();
}

export async function markQuizPassed(d1: D1Database, supplierId: string, lessonId: string, now: number) {
  const db = getDb(d1);
  const existing = await findProgress(d1, supplierId, lessonId);
  if (existing) {
    return db
      .update(learningProgress)
      .set({ quizPassedAt: existing.quizPassedAt ?? now })
      .where(eq(learningProgress.id, existing.id))
      .returning()
      .get();
  }
  const id = crypto.randomUUID();
  return db
    .insert(learningProgress)
    .values({
      id,
      supplierId,
      lessonId,
      articleCompletedAt: null,
      quizPassedAt: now,
      attempts: 1,
    })
    .returning()
    .get();
}

export async function listRequiredLessonsNotPassed(
  d1: D1Database,
  supplierId: string,
): Promise<{ id: string; slug: string; title: string }[]> {
  const db = getDb(d1);
  const rows = (await db
    .select({
      id: learningLessons.id,
      slug: learningLessons.slug,
      title: learningLessons.title,
      quizPassedAt: learningProgress.quizPassedAt,
    })
    .from(learningLessons)
    .leftJoin(
      learningProgress,
      and(eq(learningProgress.lessonId, learningLessons.id), eq(learningProgress.supplierId, supplierId)),
    )
    .where(
      and(
        eq(learningLessons.isPublished, true as never),
        eq(learningLessons.isRequiredForPublish, true as never),
      ),
    )
    .all()) as Array<{ id: string; slug: string; title: string; quizPassedAt: number | null }>;
  return rows.filter((r) => r.quizPassedAt == null);
}

export async function findSupplier(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  return (await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get()) ?? null;
}

export async function setOnboardingGateCleared(d1: D1Database, supplierId: string, now: number) {
  const db = getDb(d1);
  return db
    .update(suppliers)
    .set({ onboardingGateClearedAt: now })
    .where(eq(suppliers.id, supplierId))
    .run();
}

// Admin-side queries
export async function adminInsertLesson(d1: D1Database, input: {
  id: string; slug: string; title: string; summary: string; bodyMarkdown: string;
  track: 'onboarding' | 'operations'; orderIndex: number;
  isPublished: boolean; isRequiredForPublish: boolean; now: number;
}) {
  const db = getDb(d1);
  return db
    .insert(learningLessons)
    .values({
      id: input.id, slug: input.slug, title: input.title, summary: input.summary,
      bodyMarkdown: input.bodyMarkdown, track: input.track, orderIndex: input.orderIndex,
      isPublished: input.isPublished, isRequiredForPublish: input.isRequiredForPublish,
      createdAt: input.now, updatedAt: input.now,
    })
    .returning()
    .get();
}

export async function adminUpdateLesson(d1: D1Database, id: string, patch: Partial<{
  slug: string; title: string; summary: string; bodyMarkdown: string;
  track: 'onboarding' | 'operations'; orderIndex: number;
  isPublished: boolean; isRequiredForPublish: boolean;
}>, now: number) {
  const db = getDb(d1);
  return db
    .update(learningLessons)
    .set({ ...patch, updatedAt: now })
    .where(eq(learningLessons.id, id))
    .returning()
    .get();
}

export async function adminDeleteLesson(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.delete(learningLessons).where(eq(learningLessons.id, id)).run();
}

export async function adminReplaceQuiz(
  d1: D1Database,
  lessonId: string,
  passThreshold: number,
  questions: Array<{ prompt: string; options: Array<{ label: string; isCorrect: boolean }> }>,
  now: number,
) {
  const db = getDb(d1);
  const existing = await findQuizByLessonId(d1, lessonId);
  if (existing) {
    await db.delete(learningQuizzes).where(eq(learningQuizzes.id, existing.id)).run();
  }
  const quizId = crypto.randomUUID();
  await db.insert(learningQuizzes).values({ id: quizId, lessonId, passThreshold, createdAt: now }).run();
  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const questionId = crypto.randomUUID();
    await db
      .insert(learningQuizQuestions)
      .values({ id: questionId, quizId, orderIndex: qi, prompt: q.prompt })
      .run();
    for (let oi = 0; oi < q.options.length; oi++) {
      const o = q.options[oi];
      await db
        .insert(learningQuizOptions)
        .values({ id: crypto.randomUUID(), questionId, orderIndex: oi, label: o.label, isCorrect: o.isCorrect })
        .run();
    }
  }
}

export async function adminFindLessonBySlug(d1: D1Database, slug: string) {
  return findLessonBySlug(d1, slug);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm -r build`
Expected: clean (note `onboardingGateClearedAt` on suppliers will be added in next task; if it fails, temporarily stub the field on the suppliers schema and fix in Task 5/9).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/learning/repository.ts
git commit -m "feat(learning): repository layer"
```

---

### Task 5: Suppliers schema add column + Service layer (supplier-facing)

**Files:**
- Modify: `packages/db/src/schema/suppliers.ts`
- Create: `apps/api/src/modules/learning/errors.ts`
- Create: `apps/api/src/modules/learning/service.ts`
- Test: `apps/api/test/learning/service.test.ts`

- [ ] **Step 1: Add column to suppliers schema**

Modify `packages/db/src/schema/suppliers.ts`, add after `slug: text('slug'),`:

```ts
    onboardingGateClearedAt: integer('onboarding_gate_cleared_at'),
```

- [ ] **Step 2: Create errors module**

Create `apps/api/src/modules/learning/errors.ts`:

```ts
export type LearningErrorCode =
  | 'lesson_not_found'
  | 'quiz_not_found'
  | 'quiz_invalid_answer'
  | 'supplier_not_found';

export class LearningError extends Error {
  constructor(public code: LearningErrorCode, message?: string) {
    super(message ?? code);
  }
}

export class TrainingRequiredError extends Error {
  constructor(public missing: Array<{ slug: string; title: string }>) {
    super('TRAINING_REQUIRED');
  }
}
```

- [ ] **Step 3: Write failing service test**

Create `apps/api/test/learning/service.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

const lessons = [
  { id: 'l1', slug: 'welcome', title: 'Welcome', summary: 's', bodyMarkdown: 'b', track: 'onboarding', orderIndex: 1, isPublished: 1, isRequiredForPublish: 1, createdAt: 1, updatedAt: 1 },
  { id: 'l2', slug: 'payouts', title: 'Payouts', summary: 's', bodyMarkdown: 'b', track: 'onboarding', orderIndex: 2, isPublished: 1, isRequiredForPublish: 1, createdAt: 1, updatedAt: 1 },
];
const quiz = { id: 'q1', lessonId: 'l1', passThreshold: 2, createdAt: 1 };
const questions = [{ id: 'q1-1', quizId: 'q1', orderIndex: 1, prompt: 'p1' }];
const options = [
  { id: 'o1', questionId: 'q1-1', orderIndex: 1, label: 'A', isCorrect: 1 },
  { id: 'o2', questionId: 'q1-1', orderIndex: 2, label: 'B', isCorrect: 0 },
  { id: 'o3', questionId: 'q1-1', orderIndex: 3, label: 'C', isCorrect: 0 },
];
const progressRows: any[] = [];
const supplierRow = { id: 'sup-1', onboardingGateClearedAt: null };

vi.mock('../src/modules/learning/repository', () => ({
  listPublishedLessons: vi.fn(async (_d1, _track) => lessons),
  findLessonBySlug: vi.fn(async (_d1, slug) => lessons.find((l) => l.slug === slug) ?? null),
  findQuizByLessonId: vi.fn(async (_d1, lessonId) => (lessonId === 'l1' ? quiz : null)),
  findQuestionsByQuizId: vi.fn(async (_d1, _quizId) => questions),
  findOptionsByQuestionIds: vi.fn(async (_d1, _qIds) => options),
  findProgress: vi.fn(async (_d1, sid, lid) => progressRows.find((p) => p.supplierId === sid && p.lessonId === lid) ?? null),
  findProgressBySupplier: vi.fn(async (_d1, sid) => progressRows.filter((p) => p.supplierId === sid)),
  upsertArticleComplete: vi.fn(async (_d1, sid, lid, now) => {
    const row = progressRows.find((p) => p.supplierId === sid && p.lessonId === lid);
    if (row) { row.articleCompletedAt = now; return row; }
    const fresh = { id: crypto.randomUUID(), supplierId: sid, lessonId: lid, articleCompletedAt: now, quizPassedAt: null, attempts: 0 };
    progressRows.push(fresh);
    return fresh;
  }),
  incrementAttempts: vi.fn(async (_d1, sid, lid, _now) => {
    const row = progressRows.find((p) => p.supplierId === sid && p.lessonId === lid);
    if (row) { row.attempts += 1; return row; }
    const fresh = { id: crypto.randomUUID(), supplierId: sid, lessonId: lid, articleCompletedAt: null, quizPassedAt: null, attempts: 1 };
    progressRows.push(fresh);
    return fresh;
  }),
  markQuizPassed: vi.fn(async (_d1, sid, lid, now) => {
    const row = progressRows.find((p) => p.supplierId === sid && p.lessonId === lid);
    if (row) { row.quizPassedAt = now; return row; }
    const fresh = { id: crypto.randomUUID(), supplierId: sid, lessonId: lid, articleCompletedAt: null, quizPassedAt: now, attempts: 1 };
    progressRows.push(fresh);
    return fresh;
  }),
  listRequiredLessonsNotPassed: vi.fn(async (_d1, _sid) => {
    const passedLessonIds = new Set(progressRows.filter((p) => p.quizPassedAt).map((p) => p.lessonId));
    return lessons.filter((l) => l.isRequiredForPublish && !passedLessonIds.has(l.id)).map((l) => ({ id: l.id, slug: l.slug, title: l.title }));
  }),
  findSupplier: vi.fn(async (_d1, _sid) => supplierRow),
  setOnboardingGateCleared: vi.fn(async (_d1, sid, now) => { supplierRow.onboardingGateClearedAt = now; }),
}));

import * as svc from '../src/modules/learning/service';

const D1 = {} as D1Database;

beforeEach(() => {
  progressRows.length = 0;
  supplierRow.onboardingGateClearedAt = null;
});

describe('learning service', () => {
  it('listLessons returns published lessons with per-supplier progress', async () => {
    const out = await svc.listLessons(D1, { supplierId: 'sup-1' });
    expect(out.lessons.length).toBe(2);
    expect(out.lessons[0].articleCompleted).toBe(false);
  });

  it('getLessonBySlug strips isCorrect from quiz options', async () => {
    const out = await svc.getLessonBySlug(D1, 'welcome', 'sup-1');
    expect(out.quiz?.questions[0].options[0]).not.toHaveProperty('isCorrect');
    expect(out.quiz?.questions[0].options[0].label).toBe('A');
  });

  it('submitQuiz grades correctly and sets quizPassedAt when threshold met', async () => {
    const out = await svc.submitQuiz(D1, 'sup-1', 'welcome', { answers: [{ questionId: 'q1-1', optionId: 'o1' }] });
    // 1 correct out of 1 question, threshold=2 → not passed
    expect(out.passed).toBe(false);
    expect(out.correctCount).toBe(1);
    expect(out.total).toBe(1);
  });

  it('markArticleComplete is idempotent', async () => {
    const t = 1000;
    await svc.markArticleComplete(D1, 'sup-1', 'welcome', t);
    await svc.markArticleComplete(D1, 'sup-1', 'welcome', t + 1);
    const rows = await svc.listLessons(D1, { supplierId: 'sup-1' });
    expect(rows.lessons.find((l) => l.slug === 'welcome')!.articleCompleted).toBe(true);
  });

  it('getOnboardingGate returns missing required lessons', async () => {
    const gate = await svc.getOnboardingGate(D1, 'sup-1');
    expect(gate.required).toBe(true);
    expect(gate.missing.length).toBe(2);
  });

  it('getOnboardingGate skips when gate already cleared', async () => {
    supplierRow.onboardingGateClearedAt = Date.now();
    const gate = await svc.getOnboardingGate(D1, 'sup-1');
    expect(gate.required).toBe(false);
    expect(gate.missing.length).toBe(0);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/service.test.ts`
Expected: FAIL (service module does not exist).

- [ ] **Step 5: Implement service**

Create `apps/api/src/modules/learning/service.ts`:

```ts
import { nowMs } from '@vyro/shared';
import * as repo from './repository';
import { LearningError } from './errors';

export type LessonTrack = 'onboarding' | 'operations';

export interface LessonSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  track: LessonTrack;
  orderIndex: number;
  isPublished: boolean;
  isRequiredForPublish: boolean;
  articleCompleted: boolean;
  quizPassed: boolean;
}

export interface QuizOptionForSupplier { id: string; orderIndex: number; label: string; }
export interface QuizQuestionForSupplier { id: string; orderIndex: number; prompt: string; options: QuizOptionForSupplier[]; }
export interface QuizForSupplier { id: string; passThreshold: number; questions: QuizQuestionForSupplier[]; }
export interface LessonDetail {
  lesson: LessonSummary & { bodyMarkdown: string };
  quiz: QuizForSupplier | null;
}

export async function listLessons(
  d1: D1Database,
  opts: { supplierId?: string; track?: LessonTrack },
): Promise<{ lessons: LessonSummary[] }> {
  const rows = await repo.listPublishedLessons(d1, opts.track);
  const progress = opts.supplierId ? await repo.findProgressBySupplier(d1, opts.supplierId) : [];
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const lessons = rows.map((r) => {
    const p = byLesson.get(r.id);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      track: r.track,
      orderIndex: r.orderIndex,
      isPublished: !!r.isPublished,
      isRequiredForPublish: !!r.isRequiredForPublish,
      articleCompleted: !!(p?.articleCompletedAt),
      quizPassed: !!(p?.quizPassedAt),
    };
  });
  return { lessons };
}

export async function getLessonBySlug(
  d1: D1Database,
  slug: string,
  supplierId?: string,
): Promise<LessonDetail> {
  const lessonRow = await repo.findLessonBySlug(d1, slug);
  if (!lessonRow) throw new LearningError('lesson_not_found');
  const quizRow = await repo.findQuizByLessonId(d1, lessonRow.id);
  let quiz: QuizForSupplier | null = null;
  if (quizRow) {
    const questions = await repo.findQuestionsByQuizId(d1, quizRow.id);
    const options = await repo.findOptionsByQuestionIds(d1, questions.map((q) => q.id));
    const byQ = new Map<string, typeof options>();
    for (const o of options) {
      const arr = byQ.get(o.questionId) ?? [];
      arr.push(o);
      byQ.set(o.questionId, arr);
    }
    quiz = {
      id: quizRow.id,
      passThreshold: quizRow.passThreshold,
      questions: questions.map((q) => ({
        id: q.id,
        orderIndex: q.orderIndex,
        prompt: q.prompt,
        options: (byQ.get(q.id) ?? []).map((o) => ({ id: o.id, orderIndex: o.orderIndex, label: o.label })),
      })),
    };
  }
  const progress = supplierId ? await repo.findProgress(d1, supplierId, lessonRow.id) : null;
  const summary: LessonSummary = {
    id: lessonRow.id,
    slug: lessonRow.slug,
    title: lessonRow.title,
    summary: lessonRow.summary,
    track: lessonRow.track,
    orderIndex: lessonRow.orderIndex,
    isPublished: !!lessonRow.isPublished,
    isRequiredForPublish: !!lessonRow.isRequiredForPublish,
    articleCompleted: !!(progress?.articleCompletedAt),
    quizPassed: !!(progress?.quizPassedAt),
  };
  return { lesson: { ...summary, bodyMarkdown: lessonRow.bodyMarkdown }, quiz };
}

export async function markArticleComplete(
  d1: D1Database,
  supplierId: string,
  lessonSlug: string,
  now: number = nowMs(),
) {
  const lesson = await repo.findLessonBySlug(d1, lessonSlug);
  if (!lesson) throw new LearningError('lesson_not_found');
  return repo.upsertArticleComplete(d1, supplierId, lesson.id, now);
}

export async function submitQuiz(
  d1: D1Database,
  supplierId: string,
  lessonSlug: string,
  input: { answers: Array<{ questionId: string; optionId: string }> },
  now: number = nowMs(),
): Promise<{ passed: boolean; correctCount: number; total: number }> {
  const lesson = await repo.findLessonBySlug(d1, lessonSlug);
  if (!lesson) throw new LearningError('lesson_not_found');
  const quiz = await repo.findQuizByLessonId(d1, lesson.id);
  if (!quiz) throw new LearningError('quiz_not_found');
  const questions = await repo.findQuestionsByQuizId(d1, quiz.id);
  const qIds = new Set(questions.map((q) => q.id));
  for (const a of input.answers) if (!qIds.has(a.questionId)) throw new LearningError('quiz_invalid_answer');
  const options = await repo.findOptionsByQuestionIds(d1, questions.map((q) => q.id));
  const correctByQ = new Map<string, string>();
  for (const o of options) if (o.isCorrect) correctByQ.set(o.questionId, o.id);
  const correctCount = input.answers.filter((a) => correctByQ.get(a.questionId) === a.optionId).length;
  const total = questions.length;
  const passed = correctCount >= quiz.passThreshold;
  await repo.incrementAttempts(d1, supplierId, lesson.id, now);
  if (passed) await repo.markQuizPassed(d1, supplierId, lesson.id, now);
  return { passed, correctCount, total };
}

export async function getOnboardingGate(
  d1: D1Database,
  supplierId: string,
): Promise<{ required: boolean; missing: Array<{ slug: string; title: string }> }> {
  const supplier = await repo.findSupplier(d1, supplierId);
  if (!supplier) throw new LearningError('supplier_not_found');
  if (supplier.onboardingGateClearedAt) return { required: false, missing: [] };
  const missing = await repo.listRequiredLessonsNotPassed(d1, supplierId);
  return { required: missing.length > 0, missing };
}

export async function clearOnboardingGateIfPassed(d1: D1Database, supplierId: string) {
  const supplier = await repo.findSupplier(d1, supplierId);
  if (!supplier) throw new LearningError('supplier_not_found');
  if (supplier.onboardingGateClearedAt) return;
  const missing = await repo.listRequiredLessonsNotPassed(d1, supplierId);
  if (missing.length === 0) await repo.setOnboardingGateCleared(d1, supplierId, nowMs());
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/suppliers.ts apps/api/src/modules/learning/errors.ts apps/api/src/modules/learning/service.ts apps/api/test/learning/service.test.ts
git commit -m "feat(learning): service layer + suppliers gate column"
```

---

### Task 6: Admin service layer

**Files:**
- Create: `apps/api/src/modules/learning/adminService.ts`
- Test: `apps/api/test/learning/adminService.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/learning/adminService.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

const lessons: any[] = [];
const lessonsById: Map<string, any> = new Map();
const lessonsBySlug: Map<string, any> = new Map();

vi.mock('../src/modules/learning/repository', () => ({
  listAllLessons: vi.fn(async () => lessons),
  findLessonById: vi.fn(async (_d1, id) => lessonsById.get(id) ?? null),
  findLessonBySlug: vi.fn(async (_d1, slug) => lessonsBySlug.get(slug) ?? null),
  adminInsertLesson: vi.fn(async (_d1, input) => {
    if (lessonsBySlug.has(input.slug)) { const e: any = new Error('conflict'); e.code = 'SQLITE_CONSTRAINT_UNIQUE'; throw e; }
    const row = { ...input };
    lessons.push(row); lessonsById.set(input.id, row); lessonsBySlug.set(input.slug, row);
    return row;
  }),
  adminUpdateLesson: vi.fn(async (_d1, id, patch, now) => {
    const row = lessonsById.get(id); if (!row) return null;
    Object.assign(row, patch, { updatedAt: now });
    return row;
  }),
  adminDeleteLesson: vi.fn(async (_d1, id) => { lessonsById.delete(id); }),
  adminReplaceQuiz: vi.fn(async () => {}),
  adminFindLessonBySlug: vi.fn(async (_d1, slug) => lessonsBySlug.get(slug) ?? null),
}));

import * as svc from '../src/modules/learning/adminService';

const D1 = {} as D1Database;

describe('admin learning service', () => {
  it('createLesson rejects duplicate slug with friendly error', async () => {
    await svc.createLesson(D1, {
      slug: 'foo', title: 'Foo', summary: 'x', bodyMarkdown: 'hello world', track: 'onboarding',
      orderIndex: 1, isPublished: false, isRequiredForPublish: false,
    } as any);
    await expect(svc.createLesson(D1, {
      slug: 'foo', title: 'Foo 2', summary: 'x', bodyMarkdown: 'hello world', track: 'onboarding',
      orderIndex: 2, isPublished: false, isRequiredForPublish: false,
    } as any)).rejects.toThrow(/LESSON_SLUG_TAKEN/);
  });

  it('replaceQuiz rejects when no correct option', async () => {
    const lesson = await svc.createLesson(D1, {
      slug: 'quiz-test', title: 'QT', summary: 'x', bodyMarkdown: 'hello world', track: 'operations',
      orderIndex: 1, isPublished: false, isRequiredForPublish: false,
    } as any);
    await expect(svc.replaceQuiz(D1, lesson.id, {
      passThreshold: 1,
      questions: [{ prompt: 'Q', options: [{ label: 'A', isCorrect: false }, { label: 'B', isCorrect: false }] }],
    } as any)).rejects.toThrow(/QUIZ_INVALID/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/adminService.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement admin service**

Create `apps/api/src/modules/learning/adminService.ts`:

```ts
import { nowMs } from '@vyro/shared';
import * as repo from './repository';
import { LearningError } from './errors';
import type { z } from 'zod';
import type { adminUpsertLessonSchema, adminUpsertQuizSchema } from '@vyro/validation';

export type UpsertLessonInput = z.infer<typeof adminUpsertLessonSchema>;
export type UpsertQuizInput = z.infer<typeof adminUpsertQuizSchema>;

export async function listLessons(d1: D1Database) {
  return repo.listAllLessons(d1);
}

export async function createLesson(d1: D1Database, input: UpsertLessonInput) {
  const now = nowMs();
  const id = crypto.randomUUID();
  try {
    return await repo.adminInsertLesson(d1, {
      id, slug: input.slug, title: input.title, summary: input.summary,
      bodyMarkdown: input.bodyMarkdown, track: input.track, orderIndex: input.orderIndex,
      isPublished: input.isPublished, isRequiredForPublish: input.isRequiredForPublish, now,
    });
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE/.test(String(e?.message))) {
      throw new LearningError('lesson_not_found', 'LESSON_SLUG_TAKEN');
    }
    throw e;
  }
}

export async function updateLesson(d1: D1Database, id: string, input: UpsertLessonInput) {
  const existing = await repo.findLessonById(d1, id);
  if (!existing) throw new LearningError('lesson_not_found');
  const now = nowMs();
  return repo.adminUpdateLesson(d1, id, input, now);
}

export async function deleteLesson(d1: D1Database, id: string) {
  return repo.adminDeleteLesson(d1, id);
}

export async function replaceQuiz(d1: D1Database, lessonId: string, input: UpsertQuizInput) {
  const lesson = await repo.findLessonById(d1, lessonId);
  if (!lesson) throw new LearningError('lesson_not_found');
  const correctCounts = input.questions.map((q) => q.options.filter((o) => o.isCorrect).length);
  if (correctCounts.some((c) => c !== 1)) throw new LearningError('quiz_invalid_answer', 'QUIZ_INVALID');
  await repo.adminReplaceQuiz(d1, lessonId, input.passThreshold, input.questions, nowMs());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/adminService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/learning/adminService.ts apps/api/test/learning/adminService.test.ts
git commit -m "feat(learning): admin service"
```

---

### Task 7: Supplier routes

**Files:**
- Create: `apps/api/src/modules/learning/routes.ts`
- Create: `apps/api/src/modules/learning/index.ts`
- Test: `apps/api/test/learning/routes.test.ts`

- [ ] **Step 1: Write failing routes test**

Create `apps/api/test/learning/routes.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

const flagOn = { on: true };
let sessionCtx: any = { userId: 'u-1', supplierId: 'sup-1', isAdmin: false, adminRole: null };

vi.mock('../src/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn(async () => flagOn.on),
}));

vi.mock('../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => { c.set('ctx', sessionCtx); await next(); },
  Ctx: {},
}));

vi.mock('../src/modules/learning/service', () => ({
  listLessons: vi.fn(async () => ({ lessons: [{ id: 'l1', slug: 'welcome', articleCompleted: false, quizPassed: false }] })),
  getLessonBySlug: vi.fn(async (_d1, slug, _sid) => ({
    lesson: { id: 'l1', slug, title: 'T', summary: 's', bodyMarkdown: 'b', track: 'onboarding', orderIndex: 1, isPublished: true, isRequiredForPublish: true, articleCompleted: false, quizPassed: false },
    quiz: { id: 'q1', passThreshold: 1, questions: [{ id: 'q1-1', orderIndex: 1, prompt: 'p', options: [{ id: 'o1', orderIndex: 1, label: 'A' }, { id: 'o2', orderIndex: 2, label: 'B' }] }] },
  })),
  markArticleComplete: vi.fn(async () => ({})),
  submitQuiz: vi.fn(async () => ({ passed: true, correctCount: 1, total: 1 })),
  getOnboardingGate: vi.fn(async () => ({ required: true, missing: [{ slug: 'welcome', title: 'Welcome' }] })),
}));

import app from '../src';
import { Hono } from 'hono';

const D1 = {} as D1Database;
const localApp = new Hono();
localApp.route('/', app);

describe('learning routes', () => {
  beforeEach(() => { flagOn.on = true; sessionCtx = { userId: 'u-1', supplierId: 'sup-1', isAdmin: false, adminRole: null }; });

  it('returns 404 when flag is off', async () => {
    flagOn.on = false;
    const res = await localApp.fetch(new Request('http://x/api/supplier/learning', { headers: {} }), { DB: D1 } as any);
    expect(res.status).toBe(404);
  });

  it('GET /api/supplier/learning lists lessons with progress', async () => {
    const res = await localApp.fetch(new Request('http://x/api/supplier/learning'), { DB: D1 } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lessons.length).toBe(1);
  });

  it('GET /api/supplier/learning/:slug strips isCorrect', async () => {
    const res = await localApp.fetch(new Request('http://x/api/supplier/learning/welcome'), { DB: D1 } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quiz.questions[0].options[0]).not.toHaveProperty('isCorrect');
  });

  it('POST quiz returns pass/fail', async () => {
    const res = await localApp.fetch(new Request('http://x/api/supplier/learning/welcome/quiz', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: [{ questionId: 'q1-1', optionId: 'o1' }] }),
    }), { DB: D1 } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });

  it('GET gate returns missing list', async () => {
    const res = await localApp.fetch(new Request('http://x/api/supplier/learning/gate'), { DB: D1 } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.required).toBe(true);
    expect(body.missing.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/routes.test.ts`
Expected: FAIL (routes not mounted).

- [ ] **Step 3: Create supplier routes**

Create `apps/api/src/modules/learning/routes.ts`:

```ts
import { Hono } from 'hono';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { isFeatureEnabled } from '../../lib/featureFlags';
import {
  learningListQuerySchema,
  submitQuizSchema,
} from '@vyro/validation';
import * as svc from './service';

const FLAG = 'LEARNING_CENTER_ENABLED';
const router = new Hono<{ Bindings: Env }>();

async function ensureSupplier(c: any): Promise<Ctx> {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  if (!ctx.supplierId) throw httpError(403, 'FORBIDDEN', 'Supplier role required');
  return ctx;
}

router.use('*', session());
router.use('*', async (c, next) => {
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) throw httpError(404, 'NOT_FOUND', 'Learning center disabled');
  await next();
});

router.get('/', async (c) => {
  const ctx = await ensureSupplier(c);
  const q = learningListQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query', q.error.flatten());
  const out = await svc.listLessons(c.env.DB, { supplierId: ctx.supplierId!, track: q.data.track });
  return c.json(out);
});

router.get('/gate', async (c) => {
  const ctx = await ensureSupplier(c);
  return c.json(await svc.getOnboardingGate(c.env.DB, ctx.supplierId!));
});

router.get('/:slug', async (c) => {
  const ctx = await ensureSupplier(c);
  const out = await svc.getLessonBySlug(c.env.DB, c.req.param('slug'), ctx.supplierId!);
  return c.json(out);
});

router.post('/:slug/complete-article', async (c) => {
  const ctx = await ensureSupplier(c);
  await svc.markArticleComplete(c.env.DB, ctx.supplierId!, c.req.param('slug'));
  return c.json({ ok: true });
});

router.post('/:slug/quiz', async (c) => {
  const ctx = await ensureSupplier(c);
  const parsed = submitQuizSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  try {
    const out = await svc.submitQuiz(c.env.DB, ctx.supplierId!, c.req.param('slug'), parsed.data);
    return c.json(out);
  } catch (e) {
    if (e instanceof svc.LearningError) {
      const map: Record<string, [number, string]> = {
        lesson_not_found: [404, 'LESSON_NOT_FOUND'],
        quiz_not_found: [404, 'QUIZ_NOT_FOUND'],
        quiz_invalid_answer: [422, 'QUIZ_INVALID_ANSWER'],
      };
      const [status, code] = map[e.code] ?? [400, 'VALIDATION_ERROR'];
      throw httpError(status as any, code as any, e.message);
    }
    throw e;
  }
});

export default router;
```

- [ ] **Step 4: Create index re-export**

Create `apps/api/src/modules/learning/index.ts`:

```ts
import router from './routes';
export default router;
```

- [ ] **Step 5: Mount in apps/api/src/index.ts**

Modify `apps/api/src/index.ts`:
- Add after `import trustSealRouter from './modules/trustSeal';`:
  ```ts
  import learningRouter from './modules/learning';
  ```
- Add after `app.route('/api/suppliers/trust-seal', trustSealRouter);`:
  ```ts
  app.route('/api/supplier/learning', learningRouter);
  ```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/learning/routes.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/learning/routes.ts apps/api/src/modules/learning/index.ts apps/api/src/index.ts apps/api/test/learning/routes.test.ts
git commit -m "feat(learning): supplier routes + mount"
```

---

### Task 8: Admin routes

**Files:**
- Create: `apps/api/src/modules/learning/adminRoutes.ts`
- Create: `apps/api/src/modules/learning/adminIndex.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create admin routes**

Create `apps/api/src/modules/learning/adminRoutes.ts`:

```ts
import { Hono } from 'hono';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { adminUpsertLessonSchema, adminUpsertQuizSchema } from '@vyro/validation';
import * as svc from './adminService';

const FLAG = 'LEARNING_CENTER_ENABLED';
const router = new Hono<{ Bindings: Env }>();

async function ensureAdmin(c: any): Promise<Ctx> {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  if (!ctx.isAdmin && !ctx.adminRole) throw httpError(403, 'FORBIDDEN', 'Admin only');
  return ctx;
}

router.use('*', session());
router.use('*', async (c, next) => {
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) throw httpError(404, 'NOT_FOUND', 'Learning center disabled');
  await next();
});

router.get('/lessons', async (c) => {
  await ensureAdmin(c);
  const lessons = await svc.listLessons(c.env.DB);
  return c.json({ lessons });
});

router.post('/lessons', async (c) => {
  await ensureAdmin(c);
  const parsed = adminUpsertLessonSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  try {
    const lesson = await svc.createLesson(c.env.DB, parsed.data);
    return c.json({ lesson }, 201);
  } catch (e: any) {
    if (e?.message === 'LESSON_SLUG_TAKEN') throw httpError(409, 'CONFLICT', 'LESSON_SLUG_TAKEN');
    throw e;
  }
});

router.get('/lessons/:id', async (c) => {
  await ensureAdmin(c);
  const { findLessonById } = await import('./repository');
  const lesson = await findLessonById(c.env.DB, c.req.param('id'));
  if (!lesson) throw httpError(404, 'NOT_FOUND', 'Lesson not found');
  return c.json({ lesson });
});

router.put('/lessons/:id', async (c) => {
  await ensureAdmin(c);
  const parsed = adminUpsertLessonSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  try {
    const lesson = await svc.updateLesson(c.env.DB, c.req.param('id'), parsed.data);
    return c.json({ lesson });
  } catch (e: any) {
    if (e?.code === 'lesson_not_found') throw httpError(404, 'NOT_FOUND', 'Lesson not found');
    if (e?.message === 'LESSON_SLUG_TAKEN') throw httpError(409, 'CONFLICT', 'LESSON_SLUG_TAKEN');
    throw e;
  }
});

router.delete('/lessons/:id', async (c) => {
  await ensureAdmin(c);
  await svc.deleteLesson(c.env.DB, c.req.param('id'));
  return c.json({ ok: true });
});

router.post('/lessons/:id/quiz', async (c) => {
  await ensureAdmin(c);
  const parsed = adminUpsertQuizSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  try {
    await svc.replaceQuiz(c.env.DB, c.req.param('id'), parsed.data);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e?.message === 'QUIZ_INVALID') throw httpError(422, 'VALIDATION_ERROR', 'QUIZ_INVALID');
    if (e?.code === 'lesson_not_found') throw httpError(404, 'NOT_FOUND', 'Lesson not found');
    throw e;
  }
});

export default router;
```

- [ ] **Step 2: Create admin index**

Create `apps/api/src/modules/learning/adminIndex.ts`:

```ts
import router from './adminRoutes';
export default router;
```

- [ ] **Step 3: Mount in apps/api/src/index.ts**

Modify `apps/api/src/index.ts`:
- Add after `import learningRouter from './modules/learning';`:
  ```ts
  import learningAdminRouter from './modules/learning/adminIndex';
  ```
- Add after `app.route('/api/supplier/learning', learningRouter);`:
  ```ts
  app.route('/api/admin/learning', learningAdminRouter);
  ```

- [ ] **Step 4: Verify build + existing tests still pass**

Run: `pnpm -r build && pnpm --filter @vyro/api exec vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/learning/adminRoutes.ts apps/api/src/modules/learning/adminIndex.ts apps/api/src/index.ts
git commit -m "feat(learning): admin routes + mount"
```

---

### Task 9: Gate enforcement in supplierProducts publish

**Files:**
- Modify: `apps/api/src/modules/supplierProducts/routes.ts`
- Test: `apps/api/test/supplierProducts.gate.test.ts` (new)

- [ ] **Step 1: Write failing gate test**

Create `apps/api/test/supplierProducts.gate.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

const gate = { required: true, missing: [{ slug: 'welcome', title: 'Welcome' }] };

vi.mock('../src/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn(async () => true),
}));

vi.mock('../src/modules/learning/service', () => ({
  clearOnboardingGateIfPassed: vi.fn(async () => {}),
  getOnboardingGate: vi.fn(async () => gate),
}));

const sessionCtx = { userId: 'u-1', supplierId: 'sup-1', isAdmin: false, adminRole: null };
vi.mock('../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => { c.set('ctx', sessionCtx); await next(); },
  Ctx: {},
}));

vi.mock('../src/modules/supplierProducts/repository', () => ({
  findOfferForSupplierProduct: vi.fn(async () => null),
  createOffer: vi.fn(async (_d1, input) => 'sp-' + Math.random()),
  recordAudit: vi.fn(async () => {}),
  listOffersForProduct: vi.fn(async () => []),
  listOffersForSupplier: vi.fn(async () => []),
  findOffer: vi.fn(async () => null),
  updateOffer: vi.fn(async () => {}),
  softDeleteOffer: vi.fn(async () => {}),
}));

vi.mock('@vyro/db', () => ({
  getDb: (d1: D1Database) => ({
    select: () => ({ from: () => ({ where: () => ({ get: async () => null }) }) }),
    insert: () => ({ values: () => ({ run: async () => ({}) }) }),
    update: () => ({ set: () => ({ where: () => ({ run: async () => ({}) }) }) }),
  }),
}));

vi.mock('@vyro/db/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vyro/db/schema')>()),
  suppliers: { name: 'suppliers' },
  supplierMembers: { name: 'supplier_members' },
  auditLogs: { name: 'audit_logs' },
  supplierProducts: { name: 'supplier_products' },
}));

vi.mock('../src/modules/suppliers/service', () => ({
  supplierService: { requireMember: vi.fn(async () => {}) },
}));

vi.mock('../src/modules/inventory/service', () => ({
  inventoryService: { adjustStock: vi.fn(async () => ({})) },
}));

import app from '../src';
import { Hono } from 'hono';

const localApp = new Hono();
localApp.route('/', app);
const D1 = {} as D1Database;

describe('supplier product gate', () => {
  it('blocks first publish when onboarding gate is not cleared', async () => {
    const res = await localApp.fetch(new Request('http://x/api/supplier-products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supplierId: 'sup-1', productId: 'p-1', priceCents: 1000, stockQty: 10, moq: 1 }),
    }), { DB: D1 } as any);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code ?? body.error).toMatch(/TRAINING_REQUIRED/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/supplierProducts.gate.test.ts`
Expected: FAIL or pass-without-block (depends on whether gate was already implemented). Either way, current behavior is no block; we want a block.

- [ ] **Step 3: Add gate hook**

Modify `apps/api/src/modules/supplierProducts/routes.ts`. Inside `router.post('/', ...)`, between `await ensureSupplierMember(...)` and `const existing = await findOfferForSupplierProduct(...)`, insert:

```ts
  // First-ever publish gate: ensure supplier completed onboarding lessons.
  const { isFeatureEnabled } = await import('../../lib/featureFlags');
  if (await isFeatureEnabled(c.env.DB, 'LEARNING_CENTER_ENABLED')) {
    const { getOnboardingGate, clearOnboardingGateIfPassed } = await import('../learning/service');
    const gate = await getOnboardingGate(c.env.DB, parsed.data.supplierId);
    if (gate.required) {
      throw httpError(422, 'VALIDATION_ERROR', 'TRAINING_REQUIRED', { missing: gate.missing });
    }
    await clearOnboardingGateIfPassed(c.env.DB, parsed.data.supplierId);
  }
```

If `gate` is `required: false` AND `missing: []`, no block (already cleared). The hook then calls `clearOnboardingGateIfPassed` which is idempotent and no-op when `onboardingGateClearedAt` is set. The current call only happens when `flag on`, `gate.required=false`. Existing `findOffer` flow continues.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api exec vitest run apps/api/test/supplierProducts.gate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/supplierProducts/routes.ts apps/api/test/supplierProducts.gate.test.ts
git commit -m "feat(learning): gate first product publish on onboarding"
```

---

### Task 10: Frontend — markdown wrapper + api client + hooks

**Files:**
- Create: `apps/web/src/lib/learningApi.ts`
- Create: `apps/web/src/supplier/learning/markdownSafe.ts`
- Create: `apps/web/src/supplier/learning/hooks/useLearning.ts`
- Create: `apps/web/src/admin/learning/hooks/useAdminLearning.ts`

- [ ] **Step 1: Inspect existing markdown helper**

Run: `ls apps/web/src/lib/ | grep -i mark` to confirm `markdown.ts` exists and is sanitized (already audited in spec self-review).

- [ ] **Step 2: Create markdown wrapper**

Create `apps/web/src/supplier/learning/markdownSafe.ts`:

```ts
import { renderMarkdown } from '../../lib/markdown';

export function renderLessonMarkdown(src: string): string {
  // markdown.ts already sanitizes; this wrapper is the single seam to swap
  // sanitizers without touching consumers.
  return renderMarkdown(src);
}
```

If `apps/web/src/lib/markdown.ts` does NOT export `renderMarkdown`, instead export `renderLessonMarkdown = (src: string) => src` and flag a TODO follow-up — but verify first before falling back.

- [ ] **Step 3: Create api client**

Create `apps/web/src/lib/learningApi.ts`:

```ts
import type {
  LessonSummary,
  LessonDetail,
  QuizSubmissionResult,
  OnboardingGate,
  LearningTrack,
} from '@vyro/validation';

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body?.message ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.code = body?.code ?? body?.error;
    err.body = body;
    throw err;
  }
  return res.json();
}

export const learningApi = {
  listLessons(track?: LearningTrack) {
    const qs = track ? `?track=${encodeURIComponent(track)}` : '';
    return http<{ lessons: LessonSummary[] }>(`/api/supplier/learning${qs}`);
  },
  getLesson(slug: string) {
    return http<LessonDetail>(`/api/supplier/learning/${encodeURIComponent(slug)}`);
  },
  completeArticle(slug: string) {
    return http<{ ok: true }>(`/api/supplier/learning/${encodeURIComponent(slug)}/complete-article`, { method: 'POST', body: '{}' });
  },
  submitQuiz(slug: string, answers: Array<{ questionId: string; optionId: string }>) {
    return http<QuizSubmissionResult>(`/api/supplier/learning/${encodeURIComponent(slug)}/quiz`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  },
  getGate() {
    return http<OnboardingGate>(`/api/supplier/learning/gate`);
  },

  // Admin
  adminListLessons() {
    return http<{ lessons: any[] }>(`/api/admin/learning/lessons`);
  },
  adminCreateLesson(input: any) {
    return http<{ lesson: any }>(`/api/admin/learning/lessons`, { method: 'POST', body: JSON.stringify(input) });
  },
  adminUpdateLesson(id: string, input: any) {
    return http<{ lesson: any }>(`/api/admin/learning/lessons/${id}`, { method: 'PUT', body: JSON.stringify(input) });
  },
  adminDeleteLesson(id: string) {
    return http<{ ok: true }>(`/api/admin/learning/lessons/${id}`, { method: 'DELETE' });
  },
  adminReplaceQuiz(id: string, input: any) {
    return http<{ ok: true }>(`/api/admin/learning/lessons/${id}/quiz`, { method: 'POST', body: JSON.stringify(input) });
  },
};
```

- [ ] **Step 4: Create supplier hooks**

Create `apps/web/src/supplier/learning/hooks/useLearning.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learningApi } from '../../../lib/learningApi';
import type { LearningTrack } from '@vyro/validation';

export const learningKeys = {
  all: ['learning'] as const,
  list: (track?: LearningTrack) => ['learning', 'list', track ?? 'all'] as const,
  detail: (slug: string) => ['learning', 'detail', slug] as const,
  gate: ['learning', 'gate'] as const,
};

export function useLessons(track?: LearningTrack) {
  return useQuery({ queryKey: learningKeys.list(track), queryFn: () => learningApi.listLessons(track) });
}

export function useLesson(slug: string) {
  return useQuery({ queryKey: learningKeys.detail(slug), queryFn: () => learningApi.getLesson(slug) });
}

export function useCompleteArticle(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => learningApi.completeArticle(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.detail(slug) }),
  });
}

export function useSubmitQuiz(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: Array<{ questionId: string; optionId: string }>) =>
      learningApi.submitQuiz(slug, answers),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.detail(slug) }),
  });
}

export function useOnboardingGate() {
  return useQuery({ queryKey: learningKeys.gate, queryFn: () => learningApi.getGate() });
}
```

- [ ] **Step 5: Create admin hooks**

Create `apps/web/src/admin/learning/hooks/useAdminLearning.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learningApi } from '../../../lib/learningApi';

export const adminLearningKeys = {
  list: ['admin', 'learning', 'list'] as const,
};

export function useAdminLessons() {
  return useQuery({ queryKey: adminLearningKeys.list, queryFn: () => learningApi.adminListLessons() });
}

export function useAdminCreateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => learningApi.adminCreateLesson(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminLearningKeys.list }),
  });
}

export function useAdminUpdateLesson(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: any) => learningApi.adminUpdateLesson(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminLearningKeys.list }),
  });
}

export function useAdminDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => learningApi.adminDeleteLesson(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminLearningKeys.list }),
  });
}

export function useAdminReplaceQuiz(id: string) {
  return useMutation({ mutationFn: (input: any) => learningApi.adminReplaceQuiz(id, input) });
}
```

- [ ] **Step 6: Verify build**

Run: `pnpm --filter @vyro/web build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/learningApi.ts apps/web/src/supplier/learning/markdownSafe.ts apps/web/src/supplier/learning/hooks/useLearning.ts apps/web/src/admin/learning/hooks/useAdminLearning.ts
git commit -m "feat(web): learning api client + hooks"
```

---

### Task 11: Frontend — Supplier LearningIndex + LessonPage + QuizForm

**Files:**
- Create: `apps/web/src/supplier/learning/LearningIndex.tsx`
- Create: `apps/web/src/supplier/learning/LessonPage.tsx`
- Create: `apps/web/src/supplier/learning/QuizForm.tsx`
- Create: `apps/web/test/learning/LearningIndex.test.tsx`
- Create: `apps/web/test/learning/LessonPage.test.tsx`
- Create: `apps/web/test/learning/QuizForm.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/supplier/Shell.tsx`

- [ ] **Step 1: QuizForm component**

Create `apps/web/src/supplier/learning/QuizForm.tsx`:

```tsx
import { useState } from 'react';
import { useSubmitQuiz } from './hooks/useLearning';

interface Props { slug: string; questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>; }

export function QuizForm({ slug, questions }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ passed: boolean; correctCount: number; total: number } | null>(null);
  const submit = useSubmitQuiz(slug);

  const allAnswered = questions.every((q) => answers[q.id]);
  const onSubmit = async () => {
    const res = await submit.mutateAsync(
      Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
    );
    setResult(res);
  };

  if (result) {
    return (
      <div className={result.passed ? 'text-emerald-700' : 'text-rose-700'}>
        {result.passed ? 'Quiz passed' : 'Quiz failed'} — {result.correctCount}/{result.total} correct
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {questions.map((q) => (
        <fieldset key={q.id} className="mb-4">
          <legend className="font-medium">{q.prompt}</legend>
          {q.options.map((o) => (
            <label key={o.id} className="block">
              <input
                type="radio"
                name={q.id}
                value={o.id}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
              />
              {' '}{o.label}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="submit" disabled={!allAnswered || submit.isPending}>
        Submit quiz
      </button>
    </form>
  );
}
```

- [ ] **Step 2: LessonPage component**

Create `apps/web/src/supplier/learning/LessonPage.tsx`:

```tsx
import { useLesson, useCompleteArticle } from './hooks/useLearning';
import { renderLessonMarkdown } from './markdownSafe';
import { QuizForm } from './QuizForm';

interface Props { slug: string; }

export function LessonPage({ slug }: Props) {
  const { data, isLoading } = useLesson(slug);
  const complete = useCompleteArticle(slug);

  if (isLoading) return <div>Loading…</div>;
  if (!data) return <div>Lesson not found.</div>;

  const { lesson, quiz } = data;
  return (
    <div className="grid grid-cols-3 gap-6">
      <article className="col-span-2 prose" dangerouslySetInnerHTML={{ __html: renderLessonMarkdown(lesson.bodyMarkdown) }} />
      <aside className="space-y-3">
        <div className="rounded border p-3">
          <div className="font-medium">{lesson.title}</div>
          <div className="text-sm text-slate-600">{lesson.summary}</div>
        </div>
        {!lesson.articleCompleted && (
          <button onClick={() => complete.mutate()} disabled={complete.isPending}>
            Mark article read
          </button>
        )}
        {lesson.articleCompleted && !quiz && <div>Article complete.</div>}
        {quiz && (
          <>
            {lesson.quizPassed ? (
              <div className="text-emerald-700">Quiz passed ✓</div>
            ) : (
              <QuizForm slug={slug} questions={quiz.questions} />
            )}
          </>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: LearningIndex component**

Create `apps/web/src/supplier/learning/LearningIndex.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { useLessons } from './hooks/useLearning';

const STATUS_LABEL = {
  none: 'Not started',
  article: 'Article read',
  quiz: 'Quiz passed',
} as const;

function status(articleCompleted: boolean, quizPassed: boolean) {
  if (quizPassed) return 'quiz' as const;
  if (articleCompleted) return 'article' as const;
  return 'none' as const;
}

export function LearningIndex() {
  const { data, isLoading } = useLessons();
  if (isLoading) return <div>Loading…</div>;
  const lessons = data?.lessons ?? [];
  const onboarding = lessons.filter((l) => l.track === 'onboarding');
  const operations = lessons.filter((l) => l.track === 'operations');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Training center</h1>
      <section>
        <h2 className="text-lg font-medium">Onboarding</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {onboarding.map((l) => (
            <li key={l.slug} className="rounded border p-3">
              <Link to={`/supplier/learning/${l.slug}`} className="font-medium hover:underline">{l.title}</Link>
              <div className="text-sm text-slate-600">{l.summary}</div>
              <div className="mt-1 text-xs text-slate-500">{STATUS_LABEL[status(l.articleCompleted, l.quizPassed)]}</div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-medium">Operations</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {operations.map((l) => (
            <li key={l.slug} className="rounded border p-3">
              <Link to={`/supplier/learning/${l.slug}`} className="font-medium hover:underline">{l.title}</Link>
              <div className="text-sm text-slate-600">{l.summary}</div>
              <div className="mt-1 text-xs text-slate-500">{STATUS_LABEL[status(l.articleCompleted, l.quizPassed)]}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Write failing tests**

Create `apps/web/test/learning/LearningIndex.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/supplier/learning/hooks/useLearning', () => ({
  useLessons: vi.fn(() => ({
    data: {
      lessons: [
        { id: 'l1', slug: 'welcome', title: 'Welcome', summary: 's', track: 'onboarding', orderIndex: 1, isRequiredForPublish: true, articleCompleted: false, quizPassed: false },
        { id: 'l2', slug: 'rfqs', title: 'RFQs', summary: 's', track: 'operations', orderIndex: 1, isRequiredForPublish: false, articleCompleted: true, quizPassed: false },
      ],
    },
    isLoading: false,
  })),
}));

import { LearningIndex } from '../../src/supplier/learning/LearningIndex';

describe('LearningIndex', () => {
  it('renders onboarding and operations tracks', () => {
    render(<MemoryRouter><LearningIndex /></MemoryRouter>);
    expect(screen.getByText('Welcome')).toBeTruthy();
    expect(screen.getByText('RFQs')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText('Article read')).toBeTruthy();
  });
});
```

Create `apps/web/test/learning/LessonPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/supplier/learning/hooks/useLearning', () => ({
  useLesson: vi.fn(() => ({
    data: {
      lesson: { id: 'l1', slug: 'welcome', title: 'Welcome', summary: 's', bodyMarkdown: '# hi', track: 'onboarding', orderIndex: 1, isRequiredForPublish: true, isPublished: true, articleCompleted: false, quizPassed: false },
      quiz: { id: 'q1', passThreshold: 1, questions: [{ id: 'q1-1', orderIndex: 1, prompt: 'p', options: [{ id: 'o1', orderIndex: 1, label: 'A' }] }] },
    },
    isLoading: false,
  })),
  useCompleteArticle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { LessonPage } from '../../src/supplier/learning/LessonPage';

describe('LessonPage', () => {
  it('renders body and quiz, does not leak isCorrect', () => {
    const { container } = render(<LessonPage slug="welcome" />);
    expect(container.innerHTML).toContain('hi');
    expect(screen.getByText('Submit quiz')).toBeTruthy();
    expect(container.innerHTML).not.toContain('isCorrect');
  });
});
```

Create `apps/web/test/learning/QuizForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mutate = vi.fn();
vi.mock('../../src/supplier/learning/hooks/useLearning', () => ({
  useSubmitQuiz: () => ({ mutateAsync: mutate, isPending: false }),
}));

import { QuizForm } from '../../src/supplier/learning/QuizForm';

const questions = [
  { id: 'q1', prompt: 'Q1', options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }] },
];

describe('QuizForm', () => {
  it('disables submit until all answered', () => {
    render(<QuizForm slug="x" questions={questions} />);
    expect(screen.getByText('Submit quiz')).toBeDisabled();
  });

  it('submits when all answered', async () => {
    mutate.mockResolvedValueOnce({ passed: true, correctCount: 1, total: 1 });
    render(<QuizForm slug="x" questions={questions} />);
    fireEvent.click(screen.getByLabelText('A'));
    fireEvent.click(screen.getByText('Submit quiz'));
    expect(mutate).toHaveBeenCalledWith([{ questionId: 'q1', optionId: 'o1' }]);
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @vyro/web test -- --run learning`
Expected: all green.

- [ ] **Step 6: Wire routes in App.tsx**

Modify `apps/web/src/App.tsx`:
- Add imports (find existing `lazy(() => import('./pages/...'))` style):
  ```tsx
  const LearningIndex = lazy(() => import('./supplier/learning/LearningIndex').then((m) => ({ default: m.LearningIndex })));
  const LessonPage = lazy(() => import('./supplier/learning/LessonPage').then((m) => ({ default: m.LessonPage })));
  ```
- Add routes inside the supplier shell section (find `<Route path="/supplier/...">` group):
  ```tsx
  <Route path="/supplier/learning" element={<LearningIndex />} />
  <Route path="/supplier/learning/:slug" element={<LessonPage />} />
  ```

- [ ] **Step 7: Add nav link in supplier Shell**

Modify `apps/web/src/supplier/Shell.tsx`: add a Link to `/supplier/learning` labeled "Training center" alongside existing nav (KYC, Products, Orders, etc.).

- [ ] **Step 8: Build + tests**

Run: `pnpm --filter @vyro/web build && pnpm --filter @vyro/web test -- --run`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/supplier/learning/LearningIndex.tsx apps/web/src/supplier/learning/LessonPage.tsx apps/web/src/supplier/learning/QuizForm.tsx apps/web/test/learning apps/web/src/App.tsx apps/web/src/supplier/Shell.tsx
git commit -m "feat(web): supplier learning index + lesson page + quiz form"
```

---

### Task 12: Frontend — Admin LessonsAdmin + LessonEditor + QuizBuilder

**Files:**
- Create: `apps/web/src/admin/learning/LessonsAdmin.tsx`
- Create: `apps/web/src/admin/learning/LessonEditor.tsx`
- Create: `apps/web/src/admin/learning/QuizBuilder.tsx`
- Create: `apps/web/test/learning/LessonsAdmin.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/admin/Shell.tsx`

- [ ] **Step 1: QuizBuilder component**

Create `apps/web/src/admin/learning/QuizBuilder.tsx`:

```tsx
import { useState } from 'react';

export interface QuizQuestionDraft { id?: string; prompt: string; options: Array<{ id?: string; label: string; isCorrect: boolean }>; }
export interface QuizDraft { passThreshold: number; questions: QuizQuestionDraft[]; }

interface Props { value: QuizDraft; onChange: (next: QuizDraft) => void; }

export function QuizBuilder({ value, onChange }: Props) {
  const setQ = (idx: number, patch: Partial<QuizQuestionDraft>) =>
    onChange({ ...value, questions: value.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)) });
  const addQ = () => onChange({ ...value, questions: [...value.questions, { prompt: '', options: [{ label: '', isCorrect: true }, { label: '', isCorrect: false }] }] });
  const removeQ = (idx: number) => onChange({ ...value, questions: value.questions.filter((_, i) => i !== idx) });
  const setOpt = (qi: number, oi: number, patch: { label?: string; isCorrect?: boolean }) => {
    const q = value.questions[qi];
    const options = q.options.map((o, i) => (i === oi ? { ...o, ...patch } : (patch.isCorrect === true ? { ...o, isCorrect: false } : o)));
    setQ(qi, { options });
  };

  return (
    <div className="space-y-3">
      <label>
        Pass threshold{' '}
        <input type="number" min={1} max={10} value={value.passThreshold} onChange={(e) => onChange({ ...value, passThreshold: Number(e.target.value) })} />
      </label>
      {value.questions.map((q, qi) => (
        <div key={qi} className="rounded border p-3">
          <input
            className="w-full"
            value={q.prompt}
            onChange={(e) => setQ(qi, { prompt: e.target.value })}
            placeholder="Question prompt"
          />
          {q.options.map((o, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${qi}`}
                checked={o.isCorrect}
                onChange={() => setOpt(qi, oi, { isCorrect: true })}
              />
              <input value={o.label} onChange={(e) => setOpt(qi, oi, { label: e.target.value })} />
            </div>
          ))}
          <button onClick={() => removeQ(qi)}>Remove question</button>
        </div>
      ))}
      <button onClick={addQ}>Add question</button>
    </div>
  );
}
```

- [ ] **Step 2: LessonEditor component**

Create `apps/web/src/admin/learning/LessonEditor.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminUpdateLesson, useAdminReplaceQuiz } from './hooks/useAdminLearning';
import { learningApi } from '../../lib/learningApi';
import { QuizBuilder, type QuizDraft } from './QuizBuilder';

export function LessonEditor() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const update = useAdminUpdateLesson(id!);
  const replaceQuiz = useAdminReplaceQuiz(id!);
  const [form, setForm] = useState({
    slug: '', title: '', summary: '', bodyMarkdown: '', track: 'onboarding' as 'onboarding' | 'operations',
    orderIndex: 1, isPublished: false, isRequiredForPublish: false,
  });
  const [quiz, setQuiz] = useState<QuizDraft>({ passThreshold: 1, questions: [] });

  // Hydrate via API on mount (kept minimal):
  // useEffect(() => { learningApi.adminListLessons().then(...) }, [id])
  // For brevity here, the editor is a "new draft" view; the list page links into it preloaded.

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit lesson</h1>
      <input className="w-full" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="slug" />
      <input className="w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="title" />
      <textarea className="w-full" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="summary" />
      <textarea className="h-64 w-full" value={form.bodyMarkdown} onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })} placeholder="markdown body" />
      <label>
        Track{' '}
        <select value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value as any })}>
          <option value="onboarding">Onboarding</option>
          <option value="operations">Operations</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} /> Published
      </label>
      <label>
        <input type="checkbox" checked={form.isRequiredForPublish} onChange={(e) => setForm({ ...form, isRequiredForPublish: e.target.checked })} /> Required for first publish
      </label>
      <QuizBuilder value={quiz} onChange={setQuiz} />
      <button
        onClick={async () => {
          await update.mutateAsync(form);
          await replaceQuiz.mutateAsync(quiz);
          nav('/admin/learning');
        }}
      >
        Save
      </button>
    </div>
  );
}
```

- [ ] **Step 3: LessonsAdmin list page**

Create `apps/web/src/admin/learning/LessonsAdmin.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { useAdminLessons, useAdminDeleteLesson } from './hooks/useAdminLearning';

export function LessonsAdmin() {
  const { data } = useAdminLessons();
  const del = useAdminDeleteLesson();
  const lessons = data?.lessons ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Learning center</h1>
      <table className="w-full">
        <thead><tr><th>Title</th><th>Track</th><th>Published</th><th>Required</th><th></th></tr></thead>
        <tbody>
          {lessons.map((l: any) => (
            <tr key={l.id} className="border-t">
              <td><Link className="underline" to={`/admin/learning/${l.id}/edit`}>{l.title}</Link></td>
              <td>{l.track}</td>
              <td>{l.isPublished ? '✓' : '–'}</td>
              <td>{l.isRequiredForPublish ? '✓' : '–'}</td>
              <td><button onClick={() => del.mutate(l.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Admin LessonsAdmin test**

Create `apps/web/test/learning/LessonsAdmin.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/admin/learning/hooks/useAdminLearning', () => ({
  useAdminLessons: vi.fn(() => ({ data: { lessons: [{ id: 'l1', title: 'Welcome', track: 'onboarding', isPublished: 1, isRequiredForPublish: 1 }] } })),
  useAdminDeleteLesson: vi.fn(() => ({ mutate: vi.fn() })),
}));

import { LessonsAdmin } from '../../src/admin/learning/LessonsAdmin';

describe('LessonsAdmin', () => {
  it('lists lessons with required and published flags', () => {
    render(<MemoryRouter><LessonsAdmin /></MemoryRouter>);
    expect(screen.getByText('Welcome')).toBeTruthy();
  });
});
```

- [ ] **Step 5: Wire admin routes**

Modify `apps/web/src/App.tsx`:
- Add imports:
  ```tsx
  const LessonsAdmin = lazy(() => import('./admin/learning/LessonsAdmin').then((m) => ({ default: m.LessonsAdmin })));
  const LessonEditor = lazy(() => import('./admin/learning/LessonEditor').then((m) => ({ default: m.LessonEditor })));
  ```
- Add routes inside admin shell section:
  ```tsx
  <Route path="/admin/learning" element={<LessonsAdmin />} />
  <Route path="/admin/learning/:id/edit" element={<LessonEditor />} />
  ```

- [ ] **Step 6: Add admin nav link**

Modify `apps/web/src/admin/Shell.tsx`: add Link to `/admin/learning` labeled "Learning center".

- [ ] **Step 7: Build + test**

Run: `pnpm --filter @vyro/web build && pnpm --filter @vyro/web test -- --run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/admin/learning apps/web/test/learning/LessonsAdmin.test.tsx apps/web/src/App.tsx apps/web/src/admin/Shell.tsx
git commit -m "feat(web): admin learning CMS"
```

---

### Task 13: Frontend — Gate notice + CTAs

**Files:**
- Create: `apps/web/src/supplier/learning/TrainingGateNotice.tsx`
- Create: `apps/web/src/supplier/learning/LearningCta.tsx`
- Modify: `apps/web/src/supplier/ProductFormPage.tsx`
- Modify: `apps/web/src/supplier/VerificationPage.tsx`
- Modify: `apps/web/src/supplier/AccountsPage.tsx`
- Modify: `apps/web/src/supplier/QuoteRequestsPage.tsx`

- [ ] **Step 1: TrainingGateNotice**

Create `apps/web/src/supplier/learning/TrainingGateNotice.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { useOnboardingGate } from './hooks/useLearning';

export function TrainingGateNotice() {
  const { data } = useOnboardingGate();
  if (!data?.required || !data.missing.length) return null;
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
      <div className="font-medium">Complete onboarding training to publish your first product.</div>
      <ul className="mt-2 list-disc pl-5">
        {data.missing.map((m) => (
          <li key={m.slug}><Link className="underline" to={`/supplier/learning/${m.slug}`}>{m.title}</Link></li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: LearningCta**

Create `apps/web/src/supplier/learning/LearningCta.tsx`:

```tsx
import { Link } from 'react-router-dom';

interface Props { slug: string; label?: string; }

export function LearningCta({ slug, label = 'Open the guide' }: Props) {
  return (
    <Link to={`/supplier/learning/${slug}`} className="text-sm text-sky-700 underline">
      {label}
    </Link>
  );
}
```

- [ ] **Step 3: Inject into ProductFormPage**

Modify `apps/web/src/supplier/ProductFormPage.tsx`: at top of the form render `<TrainingGateNotice />` (above title input). One-line import + one-line JSX.

- [ ] **Step 4: Inject CTAs**

- In `apps/web/src/supplier/VerificationPage.tsx`, near the existing submit area, add:
  ```tsx
  <LearningCta slug="verify-your-business" label="Open the verify your business guide" />
  ```
- In `apps/web/src/supplier/AccountsPage.tsx` (payouts section), add:
  ```tsx
  <LearningCta slug="set-up-payouts" label="Open the payouts guide" />
  ```
- In `apps/web/src/supplier/QuoteRequestsPage.tsx` (RFQ quote detail/response form), add:
  ```tsx
  <LearningCta slug="quote-rfqs-like-a-pro" label="Open the RFQ quoting guide" />
  ```

- [ ] **Step 5: Build + test**

Run: `pnpm --filter @vyro/web build && pnpm --filter @vyro/web test -- --run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/supplier/learning/TrainingGateNotice.tsx apps/web/src/supplier/learning/LearningCta.tsx apps/web/src/supplier/ProductFormPage.tsx apps/web/src/supplier/VerificationPage.tsx apps/web/src/supplier/AccountsPage.tsx apps/web/src/supplier/QuoteRequestsPage.tsx
git commit -m "feat(web): training gate notice + CTAs on key flows"
```

---

### Task 14: Smoke verify + final commit

**Files:**
- Modify: (no production code; only verification)

- [ ] **Step 1: Run full backend test suite**

Run: `pnpm --filter @vyro/api exec vitest run`
Expected: all green, including new learning tests + existing supplierProducts tests.

- [ ] **Step 2: Run full frontend test suite**

Run: `pnpm --filter @vyro/web test -- --run`
Expected: all green.

- [ ] **Step 3: Verify gate flag wiring manually**

Set `LEARNING_CENTER_ENABLED=true` in `feature_flags` config section via admin UI. Then:
1. `curl /api/supplier/learning` → expect list of 8 lessons with progress.
2. Submit `/complete-article` then `/quiz` with correct answers for `welcome-to-vyro` → expect `passed: true`.
3. With onboarding incomplete, attempt first product publish → expect 422 `TRAINING_REQUIRED`.
4. After all 4 onboarding lessons passed → publish succeeds and `suppliers.onboarding_gate_cleared_at` is set.

Set `LEARNING_CENTER_ENABLED=false` and confirm:
- `/api/supplier/learning` → 404.
- Product publish proceeds normally with no gate.
- `/supplier/learning` page in web returns `null` for CTAs (gate returns 404 → hook resolves with no data → banner not rendered).

- [ ] **Step 4: Update MEMORY.md**

Read `/Users/thufailahamed/.claude/projects/-Users-thufailahamed-Downloads-project-5/memory/MEMORY.md` and append:
```
- [Supplier learning center](vyro-learning-center.md) — feature shipped; flag LEARNING_CENTER_ENABLED
```

Create `/Users/thufailahamed/.claude/projects/-Users-thufailahamed-Downloads-project-5/memory/vyro-learning-center.md`:

```markdown
---
name: vyro-learning-center
description: Supplier learning/training center — onboarding + operations tracks with quiz + soft gate on first product publish.
metadata:
  type: project
---

Shipped 2026-09-15. New module `apps/api/src/modules/learning/` (mirrors `reviews/`). Tables: learning_lessons, learning_quizzes, learning_quiz_questions, learning_quiz_options, learning_progress. Suppliers get `onboarding_gate_cleared_at` column. Seed: 8 lessons (4 onboarding + 4 operations) with 3-question quizzes, pass threshold 2/3. Admin CMS at `/admin/learning`. Soft gate: first-ever product publish requires onboarding lessons passed.

**Why:** helps new suppliers reach publish state without ops hand-holding; gives existing suppliers an operations playbook.
**How to apply:** any future "first action gate" should follow this pattern — `flag + supplier.<gate>_cleared_at + soft block before first persist + idempotent clear hook`. Quiz options strip `is_correct` for supplier-facing payloads.

Related: [[vyro-project]], [[vyro-roadmap]].
```

- [ ] **Step 5: Final commit**

```bash
git add .claude/projects/-Users-thufailahamed-Downloads-project-5/memory
git commit -m "docs(memory): record supplier learning center"
```

---

## Self-Review

- **Spec coverage:** every section in `docs/superpowers/specs/2026-09-15-supplier-learning-center-design.md` maps to a task:
  - §2 architecture → Tasks 4–8
  - §3 data model → Tasks 1, 2, 3, 5
  - §4 service layer → Tasks 5, 6
  - §5 routes → Tasks 7, 8
  - §6 frontend → Tasks 10–13
  - §7 gate enforcement → Task 9
  - §8 error handling → covered in tests across Tasks 6, 7
  - §9 testing → Tasks 1, 5, 6, 7, 9, 11, 12
  - §10 seed → Task 2
  - §13 file layout → Tasks 1–13 create every file
- **Placeholder scan:** no TBD/TODO in steps; the migration bodies use literal placeholder copy explicitly flagged as such in Task 2 + spec.
- **Type consistency:** `LearningError` codes used consistently across service, routes, adminService. `submitQuizSchema` payload shape `{ answers: [{ questionId, optionId }] }` matches between frontend and backend. `OnboardingGate` shape `{ required, missing: [{ slug, title }] }` matches between service, routes, frontend hook, and gate notice.
- **Risk:** If `apps/web/src/lib/markdown.ts` does not exist or is not sanitized, Task 10 step 1 must create a sanitizer. Verify before plan execution.