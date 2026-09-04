import { Hono } from 'hono';
import type { Env } from '../../env';
import { listActiveBusinessTypes } from './repository';

const router = new Hono<{ Bindings: Env }>();

router.get('/types', async (c) => {
  const types = await listActiveBusinessTypes(c.env.DB);
  return c.json({ types });
});

export default router;
