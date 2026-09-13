import { Hono } from 'hono';
import type { Env } from '../env';
import { readStatusPayload } from '../observability/status';

const router = new Hono<{ Bindings: Env }>();

router.get('/status.json', async (c) => {
  const payload = await readStatusPayload(c.env, []);
  return c.json(payload);
});

router.get('/status', (c) => c.redirect('/', 302));

export default router;