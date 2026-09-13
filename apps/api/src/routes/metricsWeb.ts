import { Hono } from 'hono';
import type { Env } from '../env';
import { MetricsWebBodySchema } from '@vyro/validation';

const router = new Hono<{ Bindings: Env }>();

router.post('/api/metrics/web', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = MetricsWebBodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  if (c.env.METRICS) {
    try {
      c.env.METRICS.writeDataPoint({
        blobs: ['web.cwv', 'lcp_ms', parsed.data.route],
        doubles: [parsed.data.lcp_ms ?? 0],
        indexes: ['web.cwv'],
      });
    } catch {
      // swallow — metrics writes never fail the request
    }
  }
  return c.body(null, 204);
});

export default router;