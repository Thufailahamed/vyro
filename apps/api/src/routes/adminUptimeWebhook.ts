import { Hono } from 'hono';
import type { Env } from '../env';
import { UptimeWebhookSchema } from '@vyro/validation';
import { newId } from '@vyro/shared';

const router = new Hono<{ Bindings: Env }>();

const INCIDENT_KEY = (id: string) => `incident:${id}`;
const INCIDENTS_INDEX = 'incidents:index';

router.post('/api/admin/observability/uptime-webhook', async (c) => {
  const sig = c.req.header('x-uptime-signature') ?? '';
  const body = await c.req.text();
  if (!c.env.UPTIMEROBOT_WEBHOOK_SECRET) {
    return c.json({ error: 'secret_missing' }, 503);
  }
  const expected = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body + c.env.UPTIMEROBOT_WEBHOOK_SECRET),
  );
  const hex = Array.from(new Uint8Array(expected))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (hex !== sig) return c.json({ error: 'bad_signature' }, 401);

  let json: unknown;
  try {
    json = JSON.parse(body || '{}');
  } catch {
    return c.json({ error: 'bad_json' }, 400);
  }
  const parsed = UptimeWebhookSchema.safeParse(json);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const evt = parsed.data;
  if (evt.status !== 'down') return c.json({ ok: true, ignored: true });
  const id = newId();
  const incident = {
    id,
    title: `External monitor down: ${evt.monitor.name}`,
    severity: 'critical' as const,
    components: ['api'] as const,
    startedAt: evt.timestamp * 1000,
    updates: [
      {
        at: evt.timestamp * 1000,
        message: `UptimeRobot reported monitor ${evt.monitor.id} down`,
      },
    ],
  };
  await c.env.ALERTS_KV.put(INCIDENT_KEY(id), JSON.stringify(incident), {
    expirationTtl: 30 * 86400,
  });
  const idxRaw = await c.env.ALERTS_KV.get(INCIDENTS_INDEX);
  const idx: string[] = idxRaw ? JSON.parse(idxRaw) : [];
  idx.unshift(id);
  await c.env.ALERTS_KV.put(
    INCIDENTS_INDEX,
    JSON.stringify(idx.slice(0, 200)),
    { expirationTtl: 30 * 86400 },
  );
  return c.json({ ok: true, incident });
});

export default router;