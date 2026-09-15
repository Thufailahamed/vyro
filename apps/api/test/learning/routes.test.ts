import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

const flagOn = { on: true };
let sessionCtx: any = {
  userId: 'u-1',
  email: 'u@x',
  isAdmin: false,
  adminRole: null,
  businesses: [],
  suppliers: [{ supplierId: 'sup-1', supplierName: 'S', role: 'owner' }],
};

vi.mock('../../src/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn(async () => flagOn.on),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

vi.mock('../../src/modules/learning/service', () => ({
  listLessons: vi.fn(async () => ({
    lessons: [{ id: 'l1', slug: 'welcome', articleCompleted: false, quizPassed: false }],
  })),
  getLessonBySlug: vi.fn(async (_d1: D1Database, slug: string, _sid: string) => ({
    lesson: {
      id: 'l1',
      slug,
      title: 'T',
      summary: 's',
      bodyMarkdown: 'b',
      track: 'onboarding',
      orderIndex: 1,
      isPublished: true,
      isRequiredForPublish: true,
      articleCompleted: false,
      quizPassed: false,
    },
    quiz: {
      id: 'q1',
      passThreshold: 1,
      questions: [
        {
          id: 'q1-1',
          orderIndex: 1,
          prompt: 'p',
          options: [
            { id: 'o1', orderIndex: 1, label: 'A' },
            { id: 'o2', orderIndex: 2, label: 'B' },
          ],
        },
      ],
    },
  })),
  markArticleComplete: vi.fn(async () => ({})),
  submitQuiz: vi.fn(async () => ({ passed: true, correctCount: 1, total: 1 })),
  getOnboardingGate: vi.fn(async () => ({ required: true, missing: [{ slug: 'welcome', title: 'Welcome' }] })),
}));

import app from '../../src';

const D1 = {} as D1Database;

beforeEach(() => {
  flagOn.on = true;
  sessionCtx = {
    userId: 'u-1',
    email: 'u@x',
    isAdmin: false,
    adminRole: null,
    businesses: [],
    suppliers: [{ supplierId: 'sup-1', supplierName: 'S', role: 'owner' }],
  };
});

describe('learning routes', () => {
  it('returns 404 when flag is off', async () => {
    flagOn.on = false;
    const res = await app.fetch(new Request('http://x/api/supplier/learning?supplierId=sup-1'), { DB: D1 } as any);
    expect(res.status).toBe(404);
  });

  it('GET /api/supplier/learning lists lessons with progress', async () => {
    const res = await app.fetch(new Request('http://x/api/supplier/learning?supplierId=sup-1'), { DB: D1 } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lessons.length).toBe(1);
  });

  it('GET /api/supplier/learning/:slug strips isCorrect', async () => {
    const res = await app.fetch(new Request('http://x/api/supplier/learning/welcome?supplierId=sup-1'), { DB: D1 } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quiz.questions[0].options[0]).not.toHaveProperty('isCorrect');
  });

  it('POST quiz returns pass/fail', async () => {
    const res = await app.fetch(
      new Request('http://x/api/supplier/learning/welcome/quiz?supplierId=sup-1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: [{ questionId: 'q1-1', optionId: 'o1' }] }),
      }),
      { DB: D1 } as any,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passed).toBe(true);
  });

  it('GET gate returns missing list', async () => {
    const res = await app.fetch(new Request('http://x/api/supplier/learning/gate?supplierId=sup-1'), { DB: D1 } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.required).toBe(true);
    expect(body.missing.length).toBe(1);
  });
});