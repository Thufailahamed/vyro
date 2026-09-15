import { Hono } from 'hono';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { requireSupplierRole } from '@vyro/auth';
import {
  learningListQuerySchema,
  submitQuizSchema,
} from '@vyro/validation';
import * as svc from './service';
import { LearningError } from './errors';

const FLAG = 'LEARNING_CENTER_ENABLED';
const SUPPLIER_ROLES = ['owner', 'sales', 'ops', 'finance'] as const;

const router = new Hono<{ Bindings: Env }>();

function supplierIdFromQuery(c: any): string {
  const sid = (c.req.query('supplierId') ?? '').trim();
  if (!sid) throw httpError(400, 'VALIDATION_ERROR', 'supplierId query param required');
  return sid;
}

async function ensureSupplierRole(c: any): Promise<{ ctx: Ctx; supplierId: string }> {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const supplierId = supplierIdFromQuery(c);
  try {
    requireSupplierRole(ctx, supplierId, SUPPLIER_ROLES);
  } catch (e: any) {
    throw httpError(403, 'FORBIDDEN', e?.message ?? 'Not a supplier member');
  }
  return { ctx, supplierId };
}

router.use('*', session());
router.use('*', async (c, next) => {
  if (!(await isFeatureEnabled(c.env.DB, FLAG))) {
    throw httpError(404, 'FEATURE_DISABLED', 'Learning center disabled');
  }
  await next();
});

router.get('/', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const q = learningListQuerySchema.safeParse(c.req.query());
  if (!q.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query', q.error.flatten());
  const out = await svc.listLessons(c.env.DB, { supplierId, ...(q.data.track ? { track: q.data.track } : {}) });
  return c.json(out);
});

router.get('/gate', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  return c.json(await svc.getOnboardingGate(c.env.DB, supplierId));
});

router.get('/:slug', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const out = await svc.getLessonBySlug(c.env.DB, c.req.param('slug'), supplierId);
  return c.json(out);
});

router.post('/:slug/complete-article', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  await svc.markArticleComplete(c.env.DB, supplierId, c.req.param('slug'));
  return c.json({ ok: true });
});

router.post('/:slug/quiz', async (c) => {
  const { supplierId } = await ensureSupplierRole(c);
  const parsed = submitQuizSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  try {
    const out = await svc.submitQuiz(c.env.DB, supplierId, c.req.param('slug'), parsed.data);
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