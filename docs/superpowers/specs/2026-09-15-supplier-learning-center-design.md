# Supplier Learning / Training Center — Design

**Date:** 2026-09-15
**Status:** Approved (brainstorming)
**Scope:** New feature in Vyro monorepo. Suppliers (`/supplier/*`) + admins (`/admin/*`).
**Flag:** `LEARNING_CENTER_ENABLED` (single flag in `apps/api/src/lib/flags.ts`).

## 1. Goal

Ship a Supplier learning/training center covering onboarding + operations. Each lesson = markdown article + one multiple-choice quiz. Per-supplier progress is tracked. Onboarding lessons soft-gate first product publish.

**Locked decisions (from brainstorming):**

1. Scope: Onboarding + operations.
2. Format: Markdown article + 1 multi-choice quiz per lesson (pass/fail).
3. Tracking: per-lesson completion + soft gate on first product publish.
4. Authoring: admin CMS + seeded initial content via migration.
5. Surface: `/supplier/learning` route + contextual CTAs from product publish, KYC, payouts, RFQ quote, dispute pages.
6. Rollout: single `LEARNING_CENTER_ENABLED` flag.

## 2. Architecture

### Module shape

- **Backend:** new `apps/api/src/modules/learning/` mirroring `reviews/` exactly (schema → repo → service → routes → vitest).
- **Frontend:**
  - `apps/web/src/supplier/learning/` — `/supplier/learning` index, `/supplier/learning/:slug` lesson page.
  - `apps/web/src/admin/learning/` — `/admin/learning` list + edit.
- **Flag:** `LEARNING_CENTER_ENABLED` in `apps/api/src/lib/flags.ts`. When `false`: all `/api/supplier/learning/*` + `/api/admin/learning/*` return 404; no CTAs render in `apps/web`; product publish gate is not enforced.

### Existing analogues to reuse

- `reviews/` — repo/service/route pattern, vitest structure.
- `repeatOffers/` — admin CMS list/edit shape.
- `kyc/` — gating logic + soft-block banner pattern.
- `supplier/` + `supplierProducts/` — context for CTAs and publish service hook.

## 3. Data model (D1)

```sql
CREATE TABLE learning_lessons (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  track TEXT NOT NULL CHECK(track IN ('onboarding','operations')),
  order_index INTEGER NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0,
  is_required_for_publish INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_learning_lessons_track_order ON learning_lessons(track, order_index);
CREATE INDEX idx_learning_lessons_published ON learning_lessons(is_published, track);

CREATE TABLE learning_quizzes (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL UNIQUE REFERENCES learning_lessons(id) ON DELETE CASCADE,
  pass_threshold INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE learning_quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES learning_quizzes(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  prompt TEXT NOT NULL
);

CREATE INDEX idx_learning_quiz_questions_quiz ON learning_quiz_questions(quiz_id, order_index);

CREATE TABLE learning_quiz_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES learning_quiz_questions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_learning_quiz_options_question ON learning_quiz_options(question_id, order_index);

CREATE TABLE learning_progress (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
  article_completed_at INTEGER,
  quiz_passed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE(supplier_id, lesson_id)
);

CREATE INDEX idx_learning_progress_supplier ON learning_progress(supplier_id);
```

Notes:
- `is_correct` is server-side only; the supplier-facing quiz endpoint strips `is_correct` from option payloads.
- `attempts` increments on every quiz submission (pass or fail), but the response and UI don't surface attempt history beyond a counter.

## 4. Service layer

`apps/api/src/modules/learning/service.ts`:

- `listLessons({ track?, supplierId })` → `{ lessons: LessonSummary[] }`. Filters `is_published = 1` for supplier callers; admins see all. Includes per-lesson progress (`article_completed`, `quiz_passed`) when `supplierId` is provided.
- `getLessonBySlug(slug, supplierId)` → `{ lesson, quiz, progress }`. Strips `is_correct` from quiz options for supplier callers.
- `markArticleComplete(supplierId, lessonId)` → idempotent upsert of `learning_progress` with `article_completed_at`.
- `submitQuiz(supplierId, lessonId, answers: { questionId: optionId }[])` → `{ passed, correctCount, total }`. Increments `attempts`. Sets `quiz_passed_at` if threshold met.
- `getOnboardingGate(supplierId)` → `{ required, missing: { slug, title }[] }`. Lists published lessons where `is_required_for_publish = 1` and supplier has no `quiz_passed_at`.

`apps/api/src/modules/learning/adminService.ts`:

- `listLessonsAdmin()`, `createLesson(input)`, `updateLesson(id, input)`, `deleteLesson(id)`, `upsertQuiz(lessonId, quizInput)`.

## 5. Routes

### Supplier-auth (`apps/api/src/routes/supplier/learning.ts`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/supplier/learning` | list published lessons + per-lesson progress |
| GET | `/api/supplier/learning/:slug` | lesson + quiz (no `is_correct`) + progress |
| POST | `/api/supplier/learning/:slug/complete-article` | mark article read |
| POST | `/api/supplier/learning/:slug/quiz` | submit quiz answers |
| GET | `/api/supplier/learning/gate` | `{ required, missing[] }` for product publish service |

All routes return 404 if `LEARNING_CENTER_ENABLED = false`.

### Admin-auth (`apps/api/src/routes/admin/learning.ts`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/learning/lessons` | list all lessons (incl. unpublished) |
| POST | `/api/admin/learning/lessons` | create lesson |
| GET | `/api/admin/learning/lessons/:id` | fetch lesson + quiz (with `is_correct`) |
| PUT | `/api/admin/learning/lessons/:id` | update lesson |
| DELETE | `/api/admin/learning/lessons/:id` | delete lesson (cascades quiz/progress) |
| POST | `/api/admin/learning/lessons/:id/quiz` | replace quiz (questions + options) |
| POST | `/api/admin/learning/lessons/:id/publish` | toggle `is_published` |

## 6. Frontend

### Supplier (`apps/web/src/supplier/learning/`)

- `LearningIndex.tsx` (`/supplier/learning`): two track sections (Onboarding / Operations). Each lesson card shows title, summary, status badge (`Not started` / `Article read` / `Quiz passed`).
- `LessonPage.tsx` (`/supplier/learning/:slug`): two-pane — left = rendered markdown (reuse `apps/web/src/lib/markdown.ts`), right = progress card + quiz CTA.
- `QuizForm.tsx`: radio buttons per question, submit, inline pass/fail with `correctCount / total`.
- `hooks/useLearning.ts`: tanstack-query wrapper around supplier routes.
- `__tests__/`:
  - `LearningIndex.test.tsx` — renders both tracks, status badges, lock icon if quiz not passed but lesson reads required for publish.
  - `LessonPage.test.tsx` — markdown renders, quiz submit returns pass/fail UI, no `is_correct` leakage in rendered markup.
  - `QuizForm.test.tsx` — submit empty → disabled; submit with correct → `Quiz passed`; submit with wrong → `Quiz failed`.

### Admin (`apps/web/src/admin/learning/`)

- `LessonsAdmin.tsx` (`/admin/learning`): table of lessons, filter by track/published, drag handle for `order_index`, publish toggle.
- `LessonEditor.tsx` (`/admin/learning/:id/edit`): title/slug/summary/body markdown inputs, required-for-publish checkbox, quiz builder (add question → add options → mark correct).
- `hooks/useAdminLearning.ts`.

### Contextual CTAs

| Surface | Component | Behavior |
| --- | --- | --- |
| Product publish form (`supplierProducts`) | `<TrainingGateNotice>` | If `gate.required && gate.missing.length > 0` and supplier has 0 published products: show banner listing missing lessons, link to `/supplier/learning/:slug`. |
| KYC banner (`kyc`) | `<LearningCta>` | Small "Need help? Open the verify your business guide" link. |
| Payouts page (`payouts`) | `<LearningCta>` | "Open the payouts guide" link. |
| RFQ quote form (`rfqs`) | `<LearningCta>` | "Open the RFQ quoting guide" link. |
| Dispute detail (`disputes`/admin) | `<LearningCta>` | "Open the dispute playbook" link. |

CTA components check `LEARNING_CENTER_ENABLED` via shared feature-flag hook (`apps/web/src/hooks/useFeatureFlag.ts`); when off, render `null`.

## 7. Gate enforcement

`apps/api/src/modules/supplierProducts/service.ts` (`publishProduct` flow):

- Before persisting a publish for a supplier who currently has 0 published products, call `learningService.getOnboardingGate(supplierId)`.
- If `required === true && missing.length > 0`: throw `TrainingRequiredError` (extends `DomainError` with `code: 'TRAINING_REQUIRED'` + `missing` payload).
- HTTP layer maps to **422 Unprocessable Entity** with `{ error: 'TRAINING_REQUIRED', missing: [{ slug, title }] }`.
- Frontend surfaces this via existing `<TrainingGateNotice>` banner on the publish form.

Note: the check is only enforced when `LEARNING_CENTER_ENABLED = true`. If flag is off, products publish normally.

## 8. Error handling

| Condition | HTTP | Body |
| --- | --- | --- |
| Flag disabled | 404 | standard 404 |
| Lesson not found | 404 | `{ error: 'LESSON_NOT_FOUND' }` |
| Quiz submission empty answers | 422 | `{ error: 'QUIZ_ANSWERS_REQUIRED' }` |
| Quiz submission with unknown questionId | 422 | `{ error: 'QUIZ_INVALID_ANSWER' }` |
| Publish product without training | 422 | `{ error: 'TRAINING_REQUIRED', missing: [...] }` |
| Admin: slug conflict | 409 | `{ error: 'LESSON_SLUG_TAKEN' }` |
| Admin: invalid markdown body length (>100KB) | 422 | `{ error: 'BODY_TOO_LARGE' }` |

All input validated with shared zod schemas in `apps/api/src/modules/learning/schemas.ts`.

## 9. Testing

### Backend (vitest)

`apps/api/src/modules/learning/__tests__/`:

- `service.test.ts`:
  - `listLessons` filters by `is_published` for supplier callers.
  - `markArticleComplete` is idempotent.
  - `submitQuiz` grades correctly, sets `quiz_passed_at` only on threshold met.
  - `getOnboardingGate` returns `required: true` and `missing[]` when required lessons not passed.
- `routes.test.ts`:
  - All supplier routes 404 when flag disabled.
  - Supplier GET strips `is_correct`.
  - Admin GET returns `is_correct`.
  - Submit quiz invalid payload → 422.
- `adminService.test.ts`:
  - Slug uniqueness enforced.
  - Quiz replace cascades to options.

### Frontend (vitest + testing-library)

- `LearningIndex.test.tsx`: track sections render, status badges.
- `LessonPage.test.tsx`: markdown renders, no `is_correct` leak in markup, gate banner copy.
- `QuizForm.test.tsx`: empty submit disabled, correct → passed, wrong → failed.
- `LessonsAdmin.test.tsx`: list, publish toggle, quiz builder add/remove option.

### Integration smoke

- `apps/api/scripts/smoke/learning.sh`: hit `/api/supplier/learning/gate` before and after completing onboarding quiz; expect `missing.length` decrement.

## 10. Seed content (initial migration)

The first migration (`apps/api/migrations/0042_learning_seed.sql`) inserts:

**Onboarding track (4 lessons, all `is_required_for_publish = 1`):**

1. `welcome-to-vyro` — Welcome to Vyro — what Vyro is, how suppliers earn.
2. `verify-your-business` — Verify your business — KYC walkthrough.
3. `set-up-payouts` — Set up payouts — bank account + PayHere.
4. `publish-your-first-product` — Publish your first product — listing quality bar.

**Operations track (4 lessons, `is_required_for_publish = 0`):**

5. `quote-rfqs-like-a-pro` — Quote RFQs like a pro.
6. `fulfillment-and-delivery-slas` — Fulfillment & delivery SLAs.
7. `handle-a-buyer-dispute` — Handle a buyer dispute.
8. `read-your-analytics` — Read your analytics.

Each ships with a 3-question quiz (3 options each, 1 correct, pass threshold 2/3). Markdown bodies are placeholder copy (~150–250 words each) and marked `// TODO: refine copy` in a follow-up note inside the migration file.

## 11. Out of scope (future work)

- Multi-attempt scoring history UI (counter only for now).
- Completion badges on supplier storefront/profile.
- Completion certificates / PDF export.
- Multi-language lessons.
- Per-supplier video / audio embeds.
- Lesson comments / supplier Q&A.
- Per-track admin analytics dashboards.
- Per-lesson prerequisites (track sequencing already exists via `order_index`).
- Refund / dispute resolution training for buyers (separate buyer-facing center if needed).

## 12. Open risks

- **Migration size** — 8 lessons × ~3 quiz questions × 3 options = ~96 rows in one migration. Acceptable; group insert in single transaction.
- **Markdown XSS** — reuse existing sanitizer in `apps/web/src/lib/markdown.ts` (same as `supplierProducts` descriptions, store copy). Confirm sanitizer is in place before plan execution.
- **Seed copy** — placeholder copy will ship. Document the follow-up task in handoff.

## 13. File layout (new)

```
apps/api/src/modules/learning/
  index.ts
  schema.sql
  repo.ts
  service.ts
  adminService.ts
  schemas.ts
  routes.ts
  adminRoutes.ts
  __tests__/
    service.test.ts
    routes.test.ts
    adminService.test.ts
apps/api/src/routes/supplier/learning.ts (re-exports routes)
apps/api/src/routes/admin/learning.ts (re-exports routes)
apps/api/migrations/0042_learning_seed.sql
apps/api/migrations/0041_learning_schema.sql  (or rolled into 0042)
apps/web/src/supplier/learning/
  LearningIndex.tsx
  LessonPage.tsx
  QuizForm.tsx
  TrainingGateNotice.tsx
  LearningCta.tsx
  hooks/useLearning.ts
  __tests__/
apps/web/src/admin/learning/
  LessonsAdmin.tsx
  LessonEditor.tsx
  QuizBuilder.tsx
  hooks/useAdminLearning.ts
  __tests__/
```