import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

const lessons: any[] = [];
const lessonsById: Map<string, any> = new Map();
const lessonsBySlug: Map<string, any> = new Map();

vi.mock('../../src/modules/learning/repository', () => ({
  listAllLessons: vi.fn(async () => lessons),
  findLessonById: vi.fn(async (_d1: D1Database, id: string) => lessonsById.get(id) ?? null),
  findLessonBySlug: vi.fn(async (_d1: D1Database, slug: string) => lessonsBySlug.get(slug) ?? null),
  adminInsertLesson: vi.fn(async (_d1: D1Database, input: any) => {
    if (lessonsBySlug.has(input.slug)) {
      const e: any = new Error('conflict');
      e.code = 'SQLITE_CONSTRAINT_UNIQUE';
      throw e;
    }
    const row = { ...input };
    lessons.push(row);
    lessonsById.set(input.id, row);
    lessonsBySlug.set(input.slug, row);
    return row;
  }),
  adminUpdateLesson: vi.fn(async (_d1: D1Database, id: string, patch: any, now: number) => {
    const row = lessonsById.get(id);
    if (!row) return null;
    Object.assign(row, patch, { updatedAt: now });
    return row;
  }),
  adminDeleteLesson: vi.fn(async (_d1: D1Database, id: string) => {
    lessonsById.delete(id);
  }),
  adminReplaceQuiz: vi.fn(async () => {}),
}));

import * as svc from '../../src/modules/learning/adminService';

const D1 = {} as D1Database;

describe('admin learning service', () => {
  it('createLesson rejects duplicate slug with friendly error', async () => {
    await svc.createLesson(D1, {
      slug: 'foo',
      title: 'Foo',
      summary: 'x',
      bodyMarkdown: 'hello world',
      track: 'onboarding',
      orderIndex: 1,
      isPublished: false,
      isRequiredForPublish: false,
    });
    await expect(
      svc.createLesson(D1, {
        slug: 'foo',
        title: 'Foo 2',
        summary: 'x',
        bodyMarkdown: 'hello world',
        track: 'onboarding',
        orderIndex: 2,
        isPublished: false,
        isRequiredForPublish: false,
      }),
    ).rejects.toThrow(/LESSON_SLUG_TAKEN/);
  });

  it('replaceQuiz rejects when no correct option', async () => {
    const lesson = await svc.createLesson(D1, {
      slug: 'quiz-test',
      title: 'QT',
      summary: 'x',
      bodyMarkdown: 'hello world',
      track: 'operations',
      orderIndex: 1,
      isPublished: false,
      isRequiredForPublish: false,
    });
    await expect(
      svc.replaceQuiz(D1, lesson.id, {
        passThreshold: 1,
        questions: [{ prompt: 'Q', options: [{ label: 'A', isCorrect: false }, { label: 'B', isCorrect: false }] }],
      }),
    ).rejects.toThrow(/QUIZ_INVALID/);
  });
});