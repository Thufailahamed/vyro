import type { ChatMessage } from '@vyro/ai';
import { providerFor } from './provider';
import { classify, type ClassifyContext } from './classify';
import { narrate } from './narrate';
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
  conversation?: ChatMessage[];
}

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
  const provider = providerFor(env);
  const providerName = provider.name;
  const modelName = (env as any).VYRO_AI_NARRATE_MODEL ?? 'unknown';

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

  const cap = costCap(env, ctx.businessId, 200);
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

  yield encodeEvent('status', { stage: 'classifying' });

  const repos = drizzleRepos(env);

  try {
    const classifyResult = await classify(provider, ctx, prompt);
    intentName = classifyResult.intent;
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

    const narration = await narrate(
      provider,
      { businessName: ctx.businessName },
      { name: classifyResult.intent, ok: ok && errorCode === undefined, summary: JSON.stringify(rawSummary) },
    );

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
    requestId,
  });
  recordAiMetric(env, {
    businessId: ctx.businessId, userId: ctx.userId, intent: intentName,
    provider: providerName, model: modelName, latencyMs,
    ok, ...(errorCode ? { errorCode } : {}),
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
