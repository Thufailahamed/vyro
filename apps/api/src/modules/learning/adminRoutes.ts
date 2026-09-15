import { Hono } from 'hono';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { adminUpsertLessonSchema, adminUpsertQuizSchema } from '@vyro/validation';
import * as svc from './adminService';
import { LearningError } from './errors';

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
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) {
    throw httpError(404, 'NOT_FOUND', 'Learning center disabled');
  }
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
    if (e instanceof LearningError && e.message === 'LESSON_SLUG_TAKEN') {
      throw httpError(409, 'CONFLICT', 'LESSON_SLUG_TAKEN');
    }
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
    if (e instanceof LearningError) throw httpError(404, 'NOT_FOUND', 'Lesson not found');
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
    if (e instanceof LearningError) {
      if (e.message === 'QUIZ_INVALID') throw httpError(422, 'VALIDATION_ERROR', 'QUIZ_INVALID');
      throw httpError(404, 'NOT_FOUND', 'Lesson not found');
    }
    throw e;
  }
});

export default router;