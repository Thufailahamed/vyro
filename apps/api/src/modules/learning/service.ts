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

export interface QuizOptionForSupplier {
  id: string;
  orderIndex: number;
  label: string;
}
export interface QuizQuestionForSupplier {
  id: string;
  orderIndex: number;
  prompt: string;
  options: QuizOptionForSupplier[];
}
export interface QuizForSupplier {
  id: string;
  passThreshold: number;
  questions: QuizQuestionForSupplier[];
}
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
      articleCompleted: !!p?.articleCompletedAt,
      quizPassed: !!p?.quizPassedAt,
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
    articleCompleted: !!progress?.articleCompletedAt,
    quizPassed: !!progress?.quizPassedAt,
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