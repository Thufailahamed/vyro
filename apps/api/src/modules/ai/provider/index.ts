import type { Env } from '../../../env';
import { WorkersAIProvider } from './workersAI';
import { GeminiProvider } from './gemini';
import type { AIProvider } from './types';

export type { AIProvider, ChatOptions, ChatResult, ChatMessage } from './types';
export { AIUnavailableError } from './types';

/**
 * Task kinds drive smart model routing. Cheap, structured work stays on
 * Workers AI; only genuine reasoning escalates to Gemini.
 *
 *   classify / extract      -> Workers AI small (JSON mode, temp 0)
 *   narrate_simple          -> Workers AI (or deterministic; see narrate.ts)
 *   reasoning / narrate_complex -> Gemini when configured, else Workers AI large
 */
export type TaskKind =
  | 'classify'
  | 'extract'
  | 'narrate_simple'
  | 'narrate_complex'
  | 'reasoning';

export interface RouteDecision {
  provider: 'workersAI' | 'gemini';
  /** Why this provider was chosen — surfaced in metrics, never to users. */
  reason: string;
}

const COMPLEX_INTENTS = new Set([
  'savings',
  'usual_order',
  'supplier_recommend',
  'price_changes',
  'compare_suppliers',
]);

/** Intents whose narration benefits from genuine reasoning (Gemini). */
export function isComplexIntent(intent: string): boolean {
  return COMPLEX_INTENTS.has(intent);
}

function geminiAvailable(env: Env): boolean {
  return Boolean((env as any).GEMINI_API_KEY);
}

/**
 * routeTask: pure, configurable routing decision. No IO, fully testable.
 *
 * Config:
 * - VYRO_AI_PROVIDER=gemini forces Gemini for all LLM tasks (if key set).
 * - VYRO_AI_PROVIDER=workers forces Workers AI for everything.
 * - default (auto): Workers AI for classification/extraction/simple
 *   narration; Gemini for complex reasoning when a key is configured.
 */
export function routeTask(env: Env, kind: TaskKind): RouteDecision {
  const forced = (env as any).VYRO_AI_PROVIDER as string | undefined;
  if (forced === 'gemini' && geminiAvailable(env)) {
    return { provider: 'gemini', reason: `forced provider for ${kind}` };
  }
  if (forced === 'workers') {
    return { provider: 'workersAI', reason: `forced provider for ${kind}` };
  }
  switch (kind) {
    case 'classify':
    case 'extract':
    case 'narrate_simple':
      return { provider: 'workersAI', reason: `${kind} stays on cheap model` };
    case 'narrate_complex':
    case 'reasoning':
      if (geminiAvailable(env)) {
        return { provider: 'gemini', reason: `${kind} needs complex reasoning` };
      }
      return { provider: 'workersAI', reason: `${kind} fallback, no Gemini key` };
  }
}

/** Instantiate the provider for a task kind. Back-compat: defaults to Workers AI. */
export function providerForTask(env: Env, kind: TaskKind): AIProvider {
  const route = routeTask(env, kind);
  if (route.provider === 'gemini') return new GeminiProvider(env);
  return new WorkersAIProvider(env);
}

/**
 * providerFor: legacy entry point. Preserved for back-compat; routes the
 * default (simple) workload. Prefer providerForTask for new call sites.
 */
export function providerFor(env: Env): AIProvider {
  const e = env as any;
  if (e.VYRO_AI_PROVIDER === 'gemini' && e.GEMINI_API_KEY) {
    return new GeminiProvider(env);
  }
  return new WorkersAIProvider(env);
}
