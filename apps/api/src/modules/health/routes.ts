import { Hono } from 'hono';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
  let dbOk = false;
  try {
    const row = await c.env.DB.prepare('SELECT 1 as ok').first();
    dbOk = row?.ok === 1;
  } catch {
    dbOk = false;
  }
  return c.json(
    {
      ok: dbOk,
      ready: dbOk,
      db: dbOk ? 'ok' : 'down',
      version: c.env.VERSION ?? 'dev',
      ts: new Date().toISOString(),
    },
    dbOk ? 200 : 503,
  );
});

router.get('/version', (c) =>
  c.json({
    version: c.env.VERSION ?? 'dev',
    env: c.env.ENVIRONMENT,
    deployedAt: c.env.DEPLOYED_AT ?? null,
  }),
);

export default router;
