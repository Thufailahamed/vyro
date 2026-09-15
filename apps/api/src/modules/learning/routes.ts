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
import { LearningError } from './errors';

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
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) {
    throw httpError(404, 'NOT_FOUND', 'Learning center disabled');
  }
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
    if (e instanceof LearningError) {
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