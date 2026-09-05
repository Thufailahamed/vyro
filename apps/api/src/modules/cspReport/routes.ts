import { Hono } from 'hono';
import type { Env } from '../../env';
import { queueCspViolation } from './repository';

const router = new Hono<{ Bindings: Env }>();

router.post('/', async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const report = (body['csp-report'] as Record<string, unknown>) ?? body;
    await queueCspViolation(c.env as Env, report);
  } catch {
    // ignore parse errors — CSP reports are best-effort
  }
  return c.body(null, 204);
});

export default router;