import type { ChatMessage } from '@vyro/ai';
import { isIntentAllowed } from '@vyro/ai';
import { isComplexIntent, providerForTask } from './provider';
import { classify, type ClassifyContext } from './classify';
import { narrate, summarizeResult } from './narrate';
import { HANDLERS, type IntentContext } from './intents/catalog';
import { drizzleRepos } from './intents/drizzleRepos';
import { encodeEvent } from './stream';
import { buildAiAuditRow } from './audit';
import { getDb } from '@vyro/db';
import { auditLogs } from '@vyro/db/schema';
import { recordAiMetric } from './metrics';
import { assertPromptSafe, costCap } from './guard';
import type { Env } from '../../env';
import { newId } from '@vyro/shared';

export interface OrchestrateContext extends ClassifyContext {
  userId: string;
  businessId: string;
  /** AI role for intent allowlist. Defaults to 'admin' for legacy call sites; the HTTP route must always pass the real role. */
  role?: 'admin' | 'member' | 'viewer';
  conversation?: ChatMessage[];
}

/**
 * Friendly working stages per intent. The client renders these verbatim —
 * raw intent names and tool internals never reach the UI.
 */
const STAGES: Record<string, [string, string]> = {
  search_products: ['Searching VYRO products', 'Ranking best prices'],
  find_cheapest: ['Searching VYRO products', 'Comparing suppliers'],
  compare_suppliers: ['Searching VYRO products', 'Comparing suppliers'],
  supplier_recommend: ['Searching VYRO products', 'Scoring suppliers'],
  spend_summary: ['Reading your purchase history', 'Tallying spend'],
  product_spend: ['Reading your purchase history', 'Tallying spend'],
  supplier_spend: ['Reading your purchase history', 'Tallying spend'],
  savings: ['Reading your purchase history', 'Hunting savings'],
  usual_order: ['Reading your purchase history', 'Building your usual order'],
  reorder: ['Reading your purchase history', 'Checking what is due'],
  price_changes: ['Reading your purchase history', 'Analyzing price moves'],
  delivery_estimate: ['Checking availability', 'Estimating delivery'],
  clarify: ['Understanding your request', 'Preparing options'],
};

export async function* orchestrate(
  env: Env,
  ctx: OrchestrateContext,
  rawPrompt: string,
): AsyncGenerator<string> {
  const requestId = newId();
  const started = Date.now();
  let ok = true;
  let errorCode: string | undefined;
  let intentName = 'clarify';
  let slots: Record<string, unknown> = {};
  let tokensIn = 0;
  let tokensOut = 0;
  const classifyProvider = providerForTask(env, 'classify');
  const providerName = classifyProvider.name;
  const modelName = (env as any).VYRO_AI_CLASSIFY_MODEL ?? 'unknown';

  let prompt: string;
  try {
    prompt = assertPromptSafe(rawPrompt);
  } catch (err) {
    ok = false;
    errorCode = 'INVALID_PROMPT';
    yield encodeEvent('error', {
      code: 'INVALID_PROMPT',
      message: err instanceof Error ? err.message : 'invalid prompt',
    });
    await safeAudit(env, {
      userId: ctx.userId, businessId: ctx.businessId, intent: intentName,
      provider: providerName, model: modelName, latencyMs: Date.now() - started,
      ok, errorCode, requestId,
    });
    return;
  }

  // Charge the cost cap with actual token usage when available, falling back
  // to a flat 200-token estimate when the classify path produced no metrics
  // (e.g. prompt-rejected or rate-limited paths that never reached classify).
  const tokensForCap = tokensIn > 0 || tokensOut > 0 ? tokensIn + tokensOut : 200;
  const cap = costCap(env, ctx.businessId, tokensForCap, ctx.userId);
  if (!cap.ok) {
    ok = false;
    errorCode = 'RATE_LIMITED';
    yield encodeEvent('error', { code: 'RATE_LIMITED', message: `AI is busy. Retry in ${cap.retryAfterSec}s` });
    await safeAudit(env, {
      userId: ctx.userId, businessId: ctx.businessId, intent: intentName,
      provider: providerName, model: modelName, latencyMs: Date.now() - started,
      ok, errorCode, requestId,
    });
    return;
  }

  yield encodeEvent('status', { stage: 'Understanding your request' });

  const repos = drizzleRepos(env);

  try {
    // Single model call per request: classification. Everything else is
    // deterministic code over repository data (faster, cheaper, grounded).
    const { result: classifyResult, tokensIn: ti, tokensOut: to } = await classify(classifyProvider, ctx, prompt, ctx.conversation);
    tokensIn = ti;
    tokensOut = to;
    intentName = classifyResult.intent;
    slots = classifyResult.slots as unknown as Record<string, unknown>;

    // Role-based intent allowlist gate. Viewers cannot trigger write actions.
    const role = ctx.role ?? 'admin';
    if (!isIntentAllowed(intentName as any, role)) {
      ok = false;
      errorCode = 'INTENT_FORBIDDEN';
      yield encodeEvent('error', {
        code: 'INTENT_FORBIDDEN',
        message: `Role ${role} cannot invoke ${intentName}`,
      });
      return;
    }
    const [stage1, stage2] = STAGES[intentName] ?? STAGES.clarify!;
    yield encodeEvent('status', { stage: stage1 });
    yield encodeEvent('tool_call', { name: classifyResult.intent, slots: classifyResult.slots });

    const handlerCtx: IntentContext = {
      env,
      businessId: ctx.businessId,
      userId: ctx.userId,
      classify: classifyResult,
    };

    let components: any[] = [];
    let actions: any[] = [];
    let rawSummary: Record<string, unknown> = {};
    try {
      yield encodeEvent('status', { stage: stage2 });
      const handlerResult = await HANDLERS[classifyResult.intent](handlerCtx, repos);
      components = handlerResult.components;
      actions = handlerResult.actions;
      rawSummary = handlerResult.rawSummary;
      yield encodeEvent('tool_result', {
        name: classifyResult.intent,
        ok: true,
        summary: JSON.stringify(rawSummary).slice(0, 200),
      });
    } catch (err) {
      ok = false;
      errorCode = 'HANDLER_FAILED';
      yield encodeEvent('tool_result', {
        name: classifyResult.intent,
        ok: false,
        summary: err instanceof Error ? err.message : 'handler failed',
      });
    }

    for (const c of components) yield encodeEvent('component', c);

    yield encodeEvent('status', { stage: 'Preparing recommendation' });

    // Deterministic narration is the default: grounded numbers, zero extra
    // model cost. Opt into LLM narration only when explicitly configured —
    // complex intents then route to Gemini, simple ones stay on Workers AI.
    let narration: string;
    const handlerResult = { components, actions, rawSummary };
    if ((env as any).VYRO_AI_NARRATE_MODE === 'llm') {
      const narrateProvider = providerForTask(
        env,
        isComplexIntent(classifyResult.intent) ? 'narrate_complex' : 'narrate_simple',
      );
      narration = await narrate(
        narrateProvider,
        { businessName: ctx.businessName },
        { name: classifyResult.intent, ok: ok && errorCode === undefined, summary: JSON.stringify(rawSummary) },
      );
    } else {
      narration = summarizeResult(classifyResult.intent, handlerResult);
    }

    yield encodeEvent('final', { summary: narration, actions });
  } catch (err) {
    ok = false;
    errorCode = 'AI_UNAVAILABLE';
    yield encodeEvent('error', {
      code: errorCode,
      message: err instanceof Error ? err.message : 'AI unavailable',
    });
  }

  const latencyMs = Date.now() - started;
  await safeAudit(env, {
    userId: ctx.userId, businessId: ctx.businessId, intent: intentName,
    provider: providerName, model: modelName, latencyMs,
    ok, ...(errorCode ? { errorCode } : {}),
    requestId, slots, toolName: intentName,
    tokensIn, tokensOut,
  });
  recordAiMetric(env, {
    businessId: ctx.businessId, userId: ctx.userId, intent: intentName,
    provider: providerName, model: modelName, latencyMs,
    ok, ...(errorCode ? { errorCode } : {}),
    tokensIn, tokensOut,
  });
}

async function safeAudit(env: Env, partial: Parameters<typeof buildAiAuditRow>[0]): Promise<void> {
  try {
    const row = buildAiAuditRow(partial);
    await getDb(env.DB).insert(auditLogs).values(row as any);
  } catch {
    // never let audit failures bubble
  }
}
