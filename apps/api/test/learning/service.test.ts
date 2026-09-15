import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

const lessons = [
  {
    id: 'l1',
    slug: 'welcome',
    title: 'Welcome',
    summary: 's',
    bodyMarkdown: 'b',
    track: 'onboarding',
    orderIndex: 1,
    isPublished: 1,
    isRequiredForPublish: 1,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'l2',
    slug: 'payouts',
    title: 'Payouts',
    summary: 's',
    bodyMarkdown: 'b',
    track: 'onboarding',
    orderIndex: 2,
    isPublished: 1,
    isRequiredForPublish: 1,
    createdAt: 1,
    updatedAt: 1,
  },
];
const quiz = { id: 'q1', lessonId: 'l1', passThreshold: 2, createdAt: 1 };
const questions = [{ id: 'q1-1', quizId: 'q1', orderIndex: 1, prompt: 'p1' }];
const options = [
  { id: 'o1', questionId: 'q1-1', orderIndex: 1, label: 'A', isCorrect: 1 },
  { id: 'o2', questionId: 'q1-1', orderIndex: 2, label: 'B', isCorrect: 0 },
  { id: 'o3', questionId: 'q1-1', orderIndex: 3, label: 'C', isCorrect: 0 },
];
const progressRows: any[] = [];
const supplierRow: any = { id: 'sup-1', onboardingGateClearedAt: null };

vi.mock('../../src/modules/learning/repository', () => ({
  listPublishedLessons: vi.fn(async (_d1: D1Database, _track?: any) => lessons),
  findLessonBySlug: vi.fn(async (_d1: D1Database, slug: string) => lessons.find((l) => l.slug === slug) ?? null),
  findQuizByLessonId: vi.fn(async (_d1: D1Database, lessonId: string) => (lessonId === 'l1' ? quiz : null)),
  findQuestionsByQuizId: vi.fn(async (_d1: D1Database, _quizId: string) => questions),
  findOptionsByQuestionIds: vi.fn(async (_d1: D1Database, _qIds: string[]) => options),
  findProgress: vi.fn(async (_d1: D1Database, sid: string, lid: string) =>
    progressRows.find((p) => p.supplierId === sid && p.lessonId === lid) ?? null,
  ),
  findProgressBySupplier: vi.fn(async (_d1: D1Database, sid: string) =>
    progressRows.filter((p) => p.supplierId === sid),
  ),
  upsertArticleComplete: vi.fn(async (_d1: D1Database, sid: string, lid: string, now: number) => {
    const row = progressRows.find((p) => p.supplierId === sid && p.lessonId === lid);
    if (row) {
      if (!row.articleCompletedAt) row.articleCompletedAt = now;
      return row;
    }
    const fresh = { id: crypto.randomUUID(), supplierId: sid, lessonId: lid, articleCompletedAt: now, quizPassedAt: null, attempts: 0 };
    progressRows.push(fresh);
    return fresh;
  }),
  incrementAttempts: vi.fn(async (_d1: D1Database, sid: string, lid: string, _now: number) => {
    const row = progressRows.find((p) => p.supplierId === sid && p.lessonId === lid);
    if (row) { row.attempts += 1; return row; }
    const fresh = { id: crypto.randomUUID(), supplierId: sid, lessonId: lid, articleCompletedAt: null, quizPassedAt: null, attempts: 1 };
    progressRows.push(fresh);
    return fresh;
  }),
  markQuizPassed: vi.fn(async (_d1: D1Database, sid: string, lid: string, now: number) => {
    const row = progressRows.find((p) => p.supplierId === sid && p.lessonId === lid);
    if (row) { if (!row.quizPassedAt) row.quizPassedAt = now; return row; }
    const fresh = { id: crypto.randomUUID(), supplierId: sid, lessonId: lid, articleCompletedAt: null, quizPassedAt: now, attempts: 1 };
    progressRows.push(fresh);
    return fresh;
  }),
  listRequiredLessonsNotPassed: vi.fn(async (_d1: D1Database, _sid: string) => {
    const passedLessonIds = new Set(progressRows.filter((p) => p.quizPassedAt).map((p) => p.lessonId));
    return lessons
      .filter((l) => l.isRequiredForPublish && !passedLessonIds.has(l.id))
      .map((l) => ({ id: l.id, slug: l.slug, title: l.title }));
  }),
  findSupplier: vi.fn(async (_d1: D1Database, _sid: string) => supplierRow),
  setOnboardingGateCleared: vi.fn(async (_d1: D1Database, _sid: string, now: number) => {
    supplierRow.onboardingGateClearedAt = now;
  }),
}));

import * as svc from '../../src/modules/learning/service';

const D1 = {} as D1Database;

beforeEach(() => {
  progressRows.length = 0;
  supplierRow.onboardingGateClearedAt = null;
});

describe('learning service', () => {
  it('listLessons returns published lessons with per-supplier progress', async () => {
    const out = await svc.listLessons(D1, { supplierId: 'sup-1' });
    expect(out.lessons.length).toBe(2);
    expect(out.lessons[0]!.articleCompleted).toBe(false);
  });

  it('getLessonBySlug strips isCorrect from quiz options', async () => {
    const out = await svc.getLessonBySlug(D1, 'welcome', 'sup-1');
    expect(out.quiz?.questions[0]!.options[0]).not.toHaveProperty('isCorrect');
    expect(out.quiz?.questions[0]!.options[0]!.label).toBe('A');
  });

  it('submitQuiz grades correctly and returns passed=false when below threshold', async () => {
    const out = await svc.submitQuiz(D1, 'sup-1', 'welcome', { answers: [{ questionId: 'q1-1', optionId: 'o1' }] });
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