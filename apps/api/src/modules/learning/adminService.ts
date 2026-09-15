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
      id,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      bodyMarkdown: input.bodyMarkdown,
      track: input.track,
      orderIndex: input.orderIndex,
      isPublished: input.isPublished,
      isRequiredForPublish: input.isRequiredForPublish,
      now,
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