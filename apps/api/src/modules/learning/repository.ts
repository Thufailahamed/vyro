import { and, asc, eq, inArray } from 'drizzle-orm';
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
  return db
    .select()
    .from(learningLessons)
    .orderBy(asc(learningLessons.track), asc(learningLessons.orderIndex))
    .all();
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

export async function upsertArticleComplete(d1: D1Database, supplierId: string, lessonId: string, now: number) {
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
    if (existing.quizPassedAt) return existing;
    return db
      .update(learningProgress)
      .set({ quizPassedAt: now })
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
): Promise<Array<{ id: string; slug: string; title: string }>> {
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
export async function adminInsertLesson(
  d1: D1Database,
  input: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    bodyMarkdown: string;
    track: 'onboarding' | 'operations';
    orderIndex: number;
    isPublished: boolean;
    isRequiredForPublish: boolean;
    now: number;
  },
) {
  const db = getDb(d1);
  return db
    .insert(learningLessons)
    .values({
      id: input.id,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      bodyMarkdown: input.bodyMarkdown,
      track: input.track,
      orderIndex: input.orderIndex,
      isPublished: input.isPublished,
      isRequiredForPublish: input.isRequiredForPublish,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning()
    .get();
}

export async function adminUpdateLesson(
  d1: D1Database,
  id: string,
  patch: Partial<{
    slug: string;
    title: string;
    summary: string;
    bodyMarkdown: string;
    track: 'onboarding' | 'operations';
    orderIndex: number;
    isPublished: boolean;
    isRequiredForPublish: boolean;
  }>,
  now: number,
) {
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
    const q = questions[qi]!;
    const questionId = crypto.randomUUID();
    await db
      .insert(learningQuizQuestions)
      .values({ id: questionId, quizId, orderIndex: qi, prompt: q.prompt })
      .run();
    for (let oi = 0; oi < q.options.length; oi++) {
      const o = q.options[oi]!;
      await db
        .insert(learningQuizOptions)
        .values({ id: crypto.randomUUID(), questionId, orderIndex: oi, label: o.label, isCorrect: o.isCorrect })
        .run();
    }
  }
}