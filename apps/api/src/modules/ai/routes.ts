import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireBusinessRole } from '@vyro/auth';
import { httpError } from '../../lib/errors';
import { rateLimit } from '../../middleware/rateLimit';
import { sseHeaders } from './stream';
import { orchestrate } from './orchestrator';
import { assertAiEnabled } from './guard';
import { getDb } from '@vyro/db';
import { auditLogs } from '@vyro/db/schema';
import { sql } from 'drizzle-orm';
import type { Ctx } from '../../middleware/session';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

const askSchema = z
  .object({
    prompt: z.string().min(1).max(800),
    businessId: z.string().optional(),
    conversation: z
      .array(
        z.object({
          role: z.enum(['system', 'user', 'assistant']),
          content: z.string().max(2000),
        }),
      )
      .max(20)
      .optional(),
  })
  .strict();

router.use('/ask', rateLimit({ key: 'ai-ask', limit: 30, window: 60 }));

router.post('/ask', session(), async (c) => {
  assertAiEnabled(c.env);
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = askSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());

  const businessId = parsed.data.businessId ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);

  const businessName =
    ctx.businesses.find((b) => b.businessId === businessId)?.businessName ?? 'Your business';

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        for await (const frame of orchestrate(
          c.env,
          {
            userId: ctx.userId,
            businessId,
            businessName,
            dict: { products: [], suppliers: [] },
            ...(parsed.data.conversation ? { conversation: parsed.data.conversation } : {}),
          },
          parsed.data.prompt,
        )) {
          controller.enqueue(enc.encode(frame));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
});

router.get('/suggestions', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return c.json({
    suggestions: [
      'Find my cheapest suppliers',
      'Build my usual order',
      'What should I reorder?',
      'Where can I save?',
      'How much did I spend this month?',
    ],
  });
});

export const aiAdminRouter = new Hono<{ Bindings: Env }>();
aiAdminRouter.use('*', session(), async (c, next) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx || !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
  await next();
});

aiAdminRouter.get('/usage', async (c) => {
  const days = Math.min(Number(c.req.query('days') ?? 7), 30);
  const db = getDb(c.env.DB);
  const since = Date.now() - days * 86400000;
  const logs = auditLogs as any;
  const rows = await db
    .select({
      intent: logs.intent,
      latency: sql<number>`cast(json_extract(metadata,'$.latencyMs') as integer)`,
    })
    .from(auditLogs)
    .where(sql`${auditLogs.action} = 'ai.request' and ${auditLogs.createdAt} >= ${since}`)
    .all();
  const counts = new Map<string, number>();
  let totalLatency = 0;
  for (const r of rows) {
    const key = r.intent ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalLatency += Number(r.latency ?? 0);
  }
  return c.json({
    days,
    totalRequests: rows.length,
    avgLatencyMs: rows.length ? Math.round(totalLatency / rows.length) : 0,
    byIntent: [...counts.entries()].map(([intent, count]) => ({ intent, count })),
  });
});

export default router;
