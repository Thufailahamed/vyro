import { Hono } from 'hono';
import { z } from 'zod';
import { getLiveRate } from '../modules/cross-border/fx';
import { httpError } from '../lib/errors';
import type { Env } from '../env';

const querySchema = z.object({
  base: z.string().length(3),
  quote: z.string().length(3),
});

const router = new Hono<{ Bindings: Env }>();

router.get('/fx/rates', async (c) => {
  const parsed = querySchema.safeParse({
    base: c.req.query('base'),
    quote: c.req.query('quote'),
  });
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const rateScaled = await getLiveRate(parsed.data.base, parsed.data.quote, c.env);
  if (!rateScaled) throw httpError(503, 'FX_UNAVAILABLE', 'Cannot fetch FX rate');
  return c.json({ rateScaled });
});

export default router;