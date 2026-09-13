import { Hono } from 'hono';
import type { Env } from '../env';
import {
  IncidentCreateSchema,
  IncidentUpdateSchema,
} from '@vyro/validation';
import { newId } from '@vyro/shared';
import { session } from '../middleware/session';
import { requirePermission } from '../middleware/rbac';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session());

const INCIDENT_KEY = (id: string) => `incident:${id}`;
const INCIDENTS_INDEX = 'incidents:index';

async function listIncidents(env: Env) {
  const raw = await env.ALERTS_KV.get(INCIDENTS_INDEX);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const rows = await Promise.all(
    ids.map((id) => env.ALERTS_KV.get(INCIDENT_KEY(id))),
  );
  return rows
    .filter((r): r is string => !!r)
    .map((r) => JSON.parse(r));
}

router.get('/api/admin/observability/incidents', requirePermission('observability:read'), async (c) => {
  return c.json({ incidents: await listIncidents(c.env) });
});

router.post('/api/admin/observability/incidents', requirePermission('observability:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = IncidentCreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const id = newId();
  const now = Date.now();
  const incident = {
    id,
    title: parsed.data.title,
    severity: parsed.data.severity,
    components: parsed.data.components,
    startedAt: now,
    updates: [{ at: now, message: parsed.data.message }],
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

router.patch('/api/admin/observability/incidents/:id', requirePermission('observability:write'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = IncidentUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const raw = await c.env.ALERTS_KV.get(INCIDENT_KEY(id));
  if (!raw) return c.json({ error: 'not_found' }, 404);
  const inc = JSON.parse(raw);
  inc.updates.push({ at: Date.now(), message: parsed.data.message });
  await c.env.ALERTS_KV.put(INCIDENT_KEY(id), JSON.stringify(inc), {
    expirationTtl: 30 * 86400,
  });
  return c.json({ ok: true, incident: inc });
});

router.post('/api/admin/observability/incidents/:id/resolve', requirePermission('observability:write'), async (c) => {
  const id = c.req.param('id');
  const raw = await c.env.ALERTS_KV.get(INCIDENT_KEY(id));
  if (!raw) return c.json({ error: 'not_found' }, 404);
  const inc = JSON.parse(raw);
  inc.resolvedAt = Date.now();
  await c.env.ALERTS_KV.put(INCIDENT_KEY(id), JSON.stringify(inc), {
    expirationTtl: 86400,
  });
  return c.json({ ok: true, incident: inc });
});

export default router;