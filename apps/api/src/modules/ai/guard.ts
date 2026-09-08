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
 * (PII heuristic), oversize input, and prompt-injection attempts. Returns
 * the sanitized prompt with control characters stripped.
 */
export function assertPromptSafe(prompt: unknown): string {
  if (typeof prompt !== 'string') throw httpError(400, 'VALIDATION_ERROR', 'prompt required');
  if (prompt.length > PROMPT_MAX) {
    throw httpError(400, 'PROMPT_TOO_LONG', `prompt exceeds ${PROMPT_MAX} chars`);
  }
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(prompt)) {
    throw httpError(400, 'INVALID_PROMPT', 'prompt contains what looks like an email');
  }
  if (INJECTION_RX.test(prompt)) {
    throw httpError(400, 'INVALID_PROMPT', 'prompt looks like an instruction override; ask about procurement instead');
  }
  return prompt
    .slice(0, PROMPT_MAX)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/**
 * INJECTION_RX: adversarial second-pass patterns. Supplier names, product
 * descriptions and pasted documents flow into model context, so the
 * classifier input is screened for instruction-override attempts.
 * Tenant filters are applied in handlers regardless — this is defense in depth.
 */
const INJECTION_RX =
  /(ignore\s+(all\s+)?previous\s+instructions|disregard\s+(all\s+)?(prior|previous|above)|reveal\s+(your\s+)?(system|secret|internal)\s*(prompt|instructions|key)|show\s+me\s+(other|another)\s+business|list\s+all\s+businesses|bypass\s+(auth|permission)|you\s+are\s+now\s+(a|an)\s|jailbreak|do\s+anything\s+now)/i;

/**
 * costCap: sliding 60s window keyed by business AND user. Per-minute budget
 * derived from VYRO_AI_DAILY_TOKEN_CAP (capped at TOKEN_BUDGET_PER_MIN).
 * This is a soft, per-isolate guard against cost attacks; the KV-backed
 * route rate limiter (per user, 30 req/min) is the hard gate.
 */
export function costCap(
  env: Env,
  businessId: string,
  tokensRequest: number,
  userId = '',
): { ok: boolean; retryAfterSec: number } {
  const daily = Number((env as any).VYRO_AI_DAILY_TOKEN_CAP ?? '200000');
  const perMinute = Math.floor(daily / (24 * 60));
  const limit = Math.min(TOKEN_BUDGET_PER_MIN, Math.max(1, perMinute));
  const now = Date.now();
  const key = `${businessId}:${userId}`;
  const w = windows.get(key);
  if (!w || w.resetAt < now) {
    windows.set(key, { tokens: tokensRequest, resetAt: now + WINDOW_MS });
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
