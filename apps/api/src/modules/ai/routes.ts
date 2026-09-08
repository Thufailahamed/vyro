import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireBusinessRole } from '@vyro/auth';
import { getBusinessRole } from '@vyro/auth';
import type { Role } from '@vyro/ai';
import { httpError } from '../../lib/errors';
import { rateLimit } from '../../middleware/rateLimit';
import { sseHeaders } from './stream';
import { orchestrate } from './orchestrator';
import { assertAiEnabled } from './guard';
import { loadDictionary } from './dictionary';
import { getDb } from '@vyro/db';
import { auditLogs } from '@vyro/db/schema';
import { summarizeAiCost } from './cost';
import { sql } from 'drizzle-orm';
import type { Ctx } from '../../middleware/session';
import type { Env } from '../../env';
import { newId } from '@vyro/shared';
import { writeFeedbackAudit } from './audit';

const router = new Hono<{ Bindings: Env }>();

const askSchema = z
  .object({
    prompt: z.string().min(1).max(800),
    businessId: z.string().optional(),
    /** Client-supplied correlation id; ties ask → optional later feedback. */
    requestId: z.string().min(1).max(80).optional(),
    conversation: z
      .array(
        z.object({
          role: z.enum(['system', 'user', 'assistant']),
          content: z.string().max(2000),
        }),
      )
      .max(20)
      .optional(),
    context: z
      .object({
        page: z.enum(['product', 'supplier', 'cart', 'analytics', 'orders', 'other']),
        productName: z.string().min(1).max(120).optional(),
        productId: z.string().min(1).max(120).optional(),
        supplierName: z.string().min(1).max(120).optional(),
        cartLines: z
          .array(
            z
              .object({
                product: z.string().min(1).max(120),
                quantity: z.number().int().min(1).max(100000),
              })
              .strict(),
          )
          .max(50)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const confirmItemSchema = z
  .object({
    product: z.string().min(1).max(120),
    quantity: z.number().int().min(1).max(100000),
    unit: z.string().min(1).max(20),
    priceCents: z.number().int().min(0),
    supplier: z.string().min(1).max(120),
  })
  .strict();

const confirmSchema = z
  .object({
    businessId: z.string().optional(),
    items: z.array(confirmItemSchema).min(1).max(50),
  })
  .strict();

const feedbackSchema = z
  .object({
    requestId: z.string().min(1).max(80),
    helpful: z.boolean(),
    reason: z
      .enum(['wrong_product', 'wrong_supplier', 'price_incorrect', 'not_relevant', 'other'])
      .optional(),
    intentHint: z.string().max(80).optional(),
  })
  .strict();

router.use('/ask', rateLimit({ key: 'ai-ask', limit: 30, window: 60 }));
router.use('/feedback', rateLimit({ key: 'ai-feedback', limit: 60, window: 60 }));

router.post('/feedback', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = feedbackSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid feedback body', parsed.error.flatten());

  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  // Read-only role check: feedback is observational, no write side effects.
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);

  await writeFeedbackAudit(c.env, {
    userId: ctx.userId,
    businessId,
    requestId: parsed.data.requestId,
    helpful: parsed.data.helpful,
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
    ...(parsed.data.intentHint ? { intentHint: parsed.data.intentHint } : {}),
  });
  return c.json({ ok: true });
});

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

  // Map business role to AI intent-allowlist role. owner/manager = admin,
  // staff/purchasing = member, everything else (including missing) = viewer.
  const businessRole = getBusinessRole(ctx, businessId);
  const aiRole: Role =
    businessRole === 'owner' || businessRole === 'manager'
      ? 'admin'
      : businessRole === 'staff' || businessRole === 'purchasing'
        ? 'member'
        : 'viewer';

  const dict = await loadDictionary(c.env);

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
            role: aiRole,
            dict,
            ...(parsed.data.conversation ? { conversation: parsed.data.conversation } : {}),
            ...(parsed.data.context ? { context: parsed.data.context } : {}),
          },
          parsed.data.prompt,
          parsed.data.requestId,
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

router.post('/confirm', session(), rateLimit({ key: 'ai-confirm', limit: 30, window: 60 }), async (c) => {
  assertAiEnabled(c.env);
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = confirmSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());

  const businessId = parsed.data.businessId ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);

  const idempotencyKey = c.req.header('idempotency-key') ?? newId();

  const { drizzleRepos } = await import('./intents/drizzleRepos');
  const repos = drizzleRepos(c.env);
  try {
    const { poRef, estimatedDelivery } = await repos.createDraftFromRecommendation({
      businessId,
      userId: ctx.userId,
      items: parsed.data.items,
      idempotencyKey,
    });
    const totalCents = parsed.data.items.reduce((s, it) => s + it.priceCents * it.quantity, 0);
    return c.json({
      confirmation: {
        kind: 'confirmation_card',
        id: idempotencyKey,
        data: {
          items: parsed.data.items,
          totalCents,
          estimatedDelivery,
          idempotencyKey,
          poRef,
          confirmed: true,
        },
      },
    });
  } catch (err) {
    throw httpError(400, 'CONFIRM_FAILED', err instanceof Error ? err.message : 'Failed to create draft PO');
  }
});

router.get('/home', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId') ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const { drizzleRepos } = await import('./intents/drizzleRepos');
  const { buildHomePayload } = await import('./home');
  return c.json(await buildHomePayload(drizzleRepos(c.env), businessId));
});

router.get('/insights', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId') ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const limit = Math.min(Number(c.req.query('limit') ?? 10), 20);
  const { drizzleRepos } = await import('./intents/drizzleRepos');
  const { buildInsightsPayload } = await import('./home');
  return c.json(await buildInsightsPayload(drizzleRepos(c.env), businessId, limit));
});

router.get('/cart-hints', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId') ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  // Viewer can read; only owner/manager/staff/purchasing can mutate cart.
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const { loadCartHintInputs, loadAvgWeeklySpendCents, buildCartHints } = await import('./cartHints');
  const { drizzleRepos } = await import('./intents/drizzleRepos');
  const lines = await loadCartHintInputs(c.env, businessId).catch(() => []);
  const avgSpend = await loadAvgWeeklySpendCents(c.env, businessId).catch(() => 0);
  const hints = await buildCartHints(drizzleRepos(c.env), lines, avgSpend);
  return c.json({ hints });
});

router.get('/cart-line-hints', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = c.req.query('businessId') ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'staff', 'purchasing']);
  const { loadCartHintInputs, buildCartLineHints } = await import('./cartHints');
  const { drizzleRepos } = await import('./intents/drizzleRepos');
  const lines = await loadCartHintInputs(c.env, businessId).catch(() => []);
  const lineHints = await buildCartLineHints(drizzleRepos(c.env), lines);
  return c.json({ hints: lineHints });
});

router.get('/suggestions', session(), async (c) => {  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const businessId = ctx.businesses[0]?.businessId;
  if (!businessId) return c.json({ prompts: defaultSuggestions() });

  // Lazy-import repos to avoid circulars
  const { drizzleRepos } = await import('./intents/drizzleRepos');
  const repos = drizzleRepos(c.env);
  const [products, intents] = await Promise.all([
    repos.topProductsLast30d({ businessId, limit: 3 }).catch(() => []),
    repos.topIntentsLast30d({ businessId, limit: 3 }).catch(() => []),
  ]);

  const prompts = [
    ...products.map((p) => ({
      kind: 'product' as const,
      label: `How is the price of ${p.name}?`,
      payload: `Find best price for ${p.name}`,
    })),
    ...intents
      .filter((i) => i.intent !== 'clarify')
      .map((i) => ({
        kind: 'intent' as const,
        label: intentLabel(String(i.intent)),
        payload: intentPrompt(String(i.intent)),
      })),
  ];

  // Always offer at least the default starter prompts if data is empty.
  return c.json({ prompts: prompts.length ? prompts : defaultSuggestions() });
});

function defaultSuggestions() {
  return [
    { kind: 'intent' as const, label: 'Find my cheapest suppliers', payload: 'find cheapest suppliers' },
    { kind: 'intent' as const, label: 'Build my usual order', payload: 'build my usual order' },
    { kind: 'intent' as const, label: 'What should I reorder?', payload: 'what should I reorder' },
    { kind: 'intent' as const, label: 'Where can I save?', payload: 'where can I save' },
    { kind: 'intent' as const, label: 'How much did I spend this month?', payload: 'how much did I spend this month' },
  ];
}

function intentLabel(intent: string): string {
  return ({
    find_cheapest: 'Find cheapest supplier',
    spend_summary: 'Show this month spending',
    savings: 'Where can I save?',
    usual_order: 'Build my usual order',
    reorder: 'What should I reorder?',
    price_changes: 'What prices moved?',
    compare_suppliers: 'Compare suppliers',
    delivery_estimate: 'Fastest delivery',
    product_spend: 'Spending on this product',
    supplier_spend: 'Spending with this supplier',
    supplier_recommend: 'Best supplier for this product',
    search_products: 'Search the catalog',
  } as Record<string, string>)[intent] ?? intent;
}

function intentPrompt(intent: string): string {
  return ({
    find_cheapest: 'find cheapest',
    spend_summary: 'how much did I spend this month',
    savings: 'where can I save',
    usual_order: 'build my usual order',
    reorder: 'what should I reorder',
    price_changes: 'what prices moved',
    compare_suppliers: 'compare suppliers',
    delivery_estimate: 'fastest delivery',
    product_spend: 'how much did I spend on',
    supplier_spend: 'how much did I spend with',
    supplier_recommend: 'best supplier for',
    search_products: 'search',
  } as Record<string, string>)[intent] ?? intent;
}

export const aiAdminRouter = new Hono<{ Bindings: Env }>();
aiAdminRouter.use('*', session(), async (c, next) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx || !ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
  await next();
});

aiAdminRouter.get('/usage', async (c) => {
  const days = Math.min(Number(c.req.query('days') ?? 7), 90);
  const businessId = c.req.query('businessId');
  const fromMsRaw = c.req.query('fromMs');
  const toMsRaw = c.req.query('toMs');
  const toMs = toMsRaw ? Math.min(Math.max(Number(toMsRaw), 0), Date.now() + 86400000) : Date.now();
  const fromMs = fromMsRaw ? Math.max(Number(fromMsRaw), 0) : toMs - days * 86400000;
  const db = getDb(c.env.DB);
  const baseWhere = [
    sql`${auditLogs.action} = 'ai.request'`,
    sql`${auditLogs.createdAt} >= ${fromMs}`,
    sql`${auditLogs.createdAt} < ${toMs}`,
  ];
  if (businessId) baseWhere.push(sql`json_extract(${auditLogs.metadata}, '$.businessId') = ${businessId}`);
  const whereClause = sql.join(baseWhere, sql.raw(' AND '));
  const logs = auditLogs as any;
  const rows = await db
    .select({
      intent: sql<string>`json_extract(metadata,'$.intent')`,
      latency: sql<number>`cast(json_extract(metadata,'$.latencyMs') as integer)`,
      ok: sql<number>`cast(json_extract(metadata,'$.ok') as integer)`,
      provider: sql<string>`json_extract(metadata,'$.provider')`,
      errorCode: sql<string>`json_extract(metadata,'$.errorCode')`,
      tokensIn: sql<number>`cast(coalesce(json_extract(metadata,'$.tokensIn'), 0) as integer)`,
      tokensOut: sql<number>`cast(coalesce(json_extract(metadata,'$.tokensOut'), 0) as integer)`,
    })
    .from(auditLogs)
    .where(whereClause)
    .all();
  const counts = new Map<string, number>();
  const providers = new Map<string, number>();
  const errors = new Map<string, number>();
  let totalLatency = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let failed = 0;
  for (const r of rows) {
    const key = r.intent ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalLatency += Number(r.latency ?? 0);
    tokensIn += Number(r.tokensIn ?? 0);
    tokensOut += Number(r.tokensOut ?? 0);
    providers.set(String(r.provider ?? 'unknown'), (providers.get(String(r.provider ?? 'unknown')) ?? 0) + 1);
    if (Number(r.ok) !== 1) {
      failed++;
      const e = String(r.errorCode ?? 'UNKNOWN');
      errors.set(e, (errors.get(e) ?? 0) + 1);
    }
  }
  let cost: unknown = null;
  if (businessId) {
    cost = await summarizeAiCost(c.env, { businessId, fromMs, toMs });
  }
  return c.json({
    days,
    fromMs,
    toMs,
    totalRequests: rows.length,
    failedRequests: failed,
    failureRate: rows.length ? Math.round((failed / rows.length) * 1000) / 1000 : 0,
    avgLatencyMs: rows.length ? Math.round(totalLatency / rows.length) : 0,
    tokensIn,
    tokensOut,
    costEstimateUsd: Math.round((tokensIn * 0.00002 + tokensOut * 0.00006) * 100) / 100,
    byIntent: [...counts.entries()].map(([intent, count]) => ({ intent, count })),
    byProvider: [...providers.entries()].map(([provider, count]) => ({ provider, count })),
    byError: [...errors.entries()].map(([code, count]) => ({ code, count })),
    ...(cost ? { cost } : {}),
  });
});

export default router;
