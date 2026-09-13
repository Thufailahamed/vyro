import { Hono } from 'hono';
import type { Env } from '../env';

const router = new Hono<{ Bindings: Env }>();

router.get('/api/admin/_test/5xx-burst', (c) => {
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'disabled_in_prod' }, 403);
  }
  return c.json({ error: 'synthetic_5xx' }, 500);
});

router.post('/api/admin/_test/5xx-burst', async (c) => {
  if (c.env.ENVIRONMENT === 'production') {
    return c.json({ error: 'disabled_in_prod' }, 403);
  }
  const body = (await c.req.json().catch(() => ({}))) as { n?: number };
  const n = Math.min(Math.max(body.n ?? 1, 1), 50);
  return c.json({ fired: n, status: 500 }, 500);
});

export default router;