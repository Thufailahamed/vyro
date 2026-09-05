import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../../middleware/session';
import { httpError } from '../../../lib/errors';
import { search } from './searchService';

const router = new Hono<{ Bindings: { DB: D1Database } }>();

router.use('*', session());

const querySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

router.get('/', async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query', parsed.error.flatten());
  const ctx = c.get('ctx') as { adminRole: import('@vyro/auth').AdminRole | null } | undefined;
  const results = await search(c.env.DB, parsed.data.q, parsed.data.limit, ctx?.adminRole ?? null);
  return c.json(results);
});

export default router;
