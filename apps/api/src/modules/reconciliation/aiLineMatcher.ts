import { planDeterministicMatches } from '@vyro/ai';
import type {
  AiMatchOverride,
  AiMatchSuggestion,
  DeterministicMatchPlan,
  InvoiceData,
  PoItemInput,
} from '@vyro/ai';
import { z } from 'zod';
import type { Env } from '../../env';
import { AIUnavailableError } from '../ai/provider';
import { WorkersAIProvider } from '../ai/provider/workersAI';

/**
 * Confidence-gated AI rescue for OCR invoice lines the deterministic matcher
 * cannot identify. The provider sees descriptions and identity candidates
 * only; prices and quantities stay entirely in the deterministic matcher.
 */

const DEFAULT_MODEL = '@cf/zai-org/glm-5.3-flash';
const MAX_UNRESOLVED_LINES = 50;
const MAX_PROMPT_CHARS = 12_000;
const AUTO_MATCH_CONFIDENCE = 0.95;
const AUTO_MATCH_MARGIN = 0.15;
const AI_REQUEST_TIMEOUT_MS = 8_000;
const SYSTEM_PROMPT =
  'Match invoice product descriptions to the supplied purchase-order items by product identity only. Ignore prices and quantities. Use each PO item at most once. Return only JSON with a matches array; each entry must include invoiceItemIndex, poItemId (one supplied ID or null), confidence, alternativeConfidence (the best competing candidate confidence, or 0 if none), and a brief reason under 160 characters. If uncertain, return null for poItemId.';

const AiResponseSchema = z
  .object({
    matches: z
      .array(
        z
          .object({
            invoiceItemIndex: z.number().int().min(0),
            poItemId: z.string().nullable(),
            confidence: z.number().min(0).max(1),
            alternativeConfidence: z.number().min(0).max(1),
            reason: z.string().min(1).max(160),
          })
          .strict(),
      )
      .max(MAX_UNRESOLVED_LINES),
  })
  .strict();

export interface AiLineMatchStats {
  attempted: boolean;
  provider?: string | undefined;
  model?: string | undefined;
  latencyMs?: number | undefined;
  appliedCount: number;
  suggestionCount: number;
}

export interface AiLineMatchResult {
  overrides: AiMatchOverride[];
  suggestions: AiMatchSuggestion[];
  stats: AiLineMatchStats;
}

function skipped(): AiLineMatchResult {
  return {
    overrides: [],
    suggestions: [],
    stats: { attempted: false, appliedCount: 0, suggestionCount: 0 },
  };
}

function emptyAttempt(model: string, latencyMs: number): AiLineMatchResult {
  return {
    overrides: [],
    suggestions: [],
    stats: {
      attempted: true,
      provider: 'workersAI',
      model,
      latencyMs,
      appliedCount: 0,
      suggestionCount: 0,
    },
  };
}

export async function resolveUnmatchedInvoiceLines(
  env: Env,
  poItems: PoItemInput[],
  invoice: InvoiceData,
  plan: DeterministicMatchPlan = planDeterministicMatches(poItems, invoice.items),
): Promise<AiLineMatchResult> {
  if (env.VYRO_AI_RECONCILE_MATCHING !== 'true' || !env.AI) return skipped();
  if (plan.unmatchedInvoiceIndexes.length === 0) return skipped();
  if (plan.unmatchedInvoiceIndexes.length > MAX_UNRESOLVED_LINES) return skipped();

  const unresolvedSet = new Set(plan.unmatchedInvoiceIndexes);
  const remainingPoIds = new Set(plan.remainingPoItemIds);
  const remainingPoItems = poItems.filter((item) => remainingPoIds.has(item.id));
  const invoiceItems = plan.unmatchedInvoiceIndexes.map((invoiceItemIndex) => {
    const item = invoice.items[invoiceItemIndex]!;
    return {
      invoiceItemIndex,
      description: item.description,
      ...(item.unit ? { unit: item.unit } : {}),
    };
  });
  const poCandidates = remainingPoItems.map((item) => ({
    poItemId: item.id,
    productName: item.productNameSnapshot,
    ...(item.unit ? { unit: item.unit } : {}),
  }));
  const requestPayload = { invoiceItems, poCandidates };
  const serialized = JSON.stringify(requestPayload);
  if (serialized.length + SYSTEM_PROMPT.length > MAX_PROMPT_CHARS) return skipped();

  const model = env.VYRO_AI_RECONCILE_MODEL || DEFAULT_MODEL;
  const startedAt = Date.now();
  let lastLatency = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const providerCall = new WorkersAIProvider(env).chat(
      [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: serialized },
      ],
      { model, responseFormatJson: true, temperature: 0, maxTokens: 1200, retry: false },
    );
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('AI line matching timed out')), AI_REQUEST_TIMEOUT_MS);
    });
    const result = await Promise.race([providerCall, timeout]);
    lastLatency = result.latencyMs;
    const jsonStart = result.content.indexOf('{');
    const jsonEnd = result.content.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) return emptyAttempt(result.model, lastLatency);
    const parsed = AiResponseSchema.safeParse(JSON.parse(result.content.slice(jsonStart, jsonEnd + 1)));
    if (!parsed.success) return emptyAttempt(result.model, lastLatency);

    const candidateById = new Map(remainingPoItems.map((item) => [item.id, item]));
    const responseIndexes = new Set<number>();
    const responsePoIds = new Set<string>();
    for (const match of parsed.data.matches) {
      if (!unresolvedSet.has(match.invoiceItemIndex) || responseIndexes.has(match.invoiceItemIndex)) {
        return emptyAttempt(result.model, lastLatency);
      }
      responseIndexes.add(match.invoiceItemIndex);
      if (match.poItemId !== null) {
        if (!candidateById.has(match.poItemId) || responsePoIds.has(match.poItemId)) {
          return emptyAttempt(result.model, lastLatency);
        }
        responsePoIds.add(match.poItemId);
      }
    }

    const acceptedIndexes = new Set<number>();
    const reservedPoIds = new Set<string>();
    const overrides: AiMatchOverride[] = [];
    const suggestions: AiMatchSuggestion[] = [];
    const candidates = parsed.data.matches
      .filter((match) => match.poItemId !== null)
      .sort((a, b) => b.confidence - a.confidence);

    for (const match of candidates) {
      // The model may repeat an invoice index or PO ID despite the prompt.
      // Keep the strongest candidate only and enforce one-to-one assignment.
      if (acceptedIndexes.has(match.invoiceItemIndex) || reservedPoIds.has(match.poItemId!)) continue;
      acceptedIndexes.add(match.invoiceItemIndex);
      reservedPoIds.add(match.poItemId!);
      const poItem = candidateById.get(match.poItemId!)!;
      const reason = match.reason.trim().slice(0, 160);
      if (
        match.confidence >= AUTO_MATCH_CONFIDENCE &&
        match.confidence - match.alternativeConfidence >= AUTO_MATCH_MARGIN
      ) {
        overrides.push({
          invoiceItemIndex: match.invoiceItemIndex,
          poItemId: match.poItemId!,
          confidence: match.confidence,
          reason,
        });
      } else {
        suggestions.push({
          invoiceItemIndex: match.invoiceItemIndex,
          poItemId: match.poItemId!,
          productName: poItem.productNameSnapshot,
          confidence: match.confidence,
          reason,
        });
      }
    }

    return {
      overrides,
      suggestions,
      stats: {
        attempted: true,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        appliedCount: overrides.length,
        suggestionCount: suggestions.length,
      },
    };
  } catch (err) {
    lastLatency = Date.now() - startedAt;
    // AI failures are a deterministic-only fallback, never a reconciliation error.
    if (err instanceof AIUnavailableError) return emptyAttempt(model, lastLatency);
    return emptyAttempt(model, lastLatency);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
