import type { Env } from '../../env';
import { httpError } from '../../lib/errors';

const WINDOW_MS = 60_000;
const TOKEN_BUDGET_PER_MIN = 10_000;
const windows = new Map<string, { tokens: number; resetAt: number }>();

export const PROMPT_MAX = 800;

/**
 * assertAiEnabled: throws 503 if VYRO_AI_ENABLED !== 'true'.
 */
export function assertAiEnabled(env: Env): void {
  if (env.VYRO_AI_ENABLED !== 'true') {
    throw httpError(503, 'AI_DISABLED', 'VYRO AI is currently disabled');
  }
}

/**
 * assertPromptSafe: validates and trims the user prompt. Rejects emails
 * (PII heuristic) and oversize input. Returns the sanitized prompt.
 */
export function assertPromptSafe(prompt: unknown): string {
  if (typeof prompt !== 'string') throw httpError(400, 'VALIDATION_ERROR', 'prompt required');
  if (prompt.length > PROMPT_MAX) {
    throw httpError(400, 'PROMPT_TOO_LONG', `prompt exceeds ${PROMPT_MAX} chars`);
  }
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(prompt)) {
    throw httpError(400, 'INVALID_PROMPT', 'prompt contains what looks like an email');
  }
  return prompt.slice(0, PROMPT_MAX).trim();
}

/**
 * costCap: in-memory sliding 60s window per businessId. Per-minute budget
 * derived from VYRO_AI_DAILY_TOKEN_CAP (capped at TOKEN_BUDGET_PER_MIN).
 */
export function costCap(
  env: Env,
  businessId: string,
  tokensRequest: number,
): { ok: boolean; retryAfterSec: number } {
  const daily = Number((env as any).VYRO_AI_DAILY_TOKEN_CAP ?? '200000');
  const perMinute = Math.floor(daily / (24 * 60));
  const limit = Math.min(TOKEN_BUDGET_PER_MIN, Math.max(1, perMinute));
  const now = Date.now();
  const w = windows.get(businessId);
  if (!w || w.resetAt < now) {
    windows.set(businessId, { tokens: tokensRequest, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }
  if (w.tokens + tokensRequest > limit) {
    return { ok: false, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.tokens += tokensRequest;
  return { ok: true, retryAfterSec: 0 };
}

/** test-only: reset the sliding window state */
export function __resetCostCapForTests(): void {
  windows.clear();
}
