import {
  ClassifyResultSchema,
  heuristicClassify,
  buildClassifyMessages,
  type ClassifyResult,
  type AiDictionary,
} from '@vyro/ai';
import type { AIProvider } from './provider/types';
import type { ChatMessage } from '@vyro/ai';

export interface ClassifyContext {
  businessName: string;
  dict: AiDictionary;
}

const PROMPT_MAX = 800;
const CONTEXT_TURNS = 6;

function safeParse(raw: string): ClassifyResult | null {
  try {
    const obj = JSON.parse(raw);
    return ClassifyResultSchema.parse(obj);
  } catch {
    return null;
  }
}

/** Anaphoric references that mean "the thing we were just talking about". */
const ANAPHOR_RX = /\b(it|that one|this one|that supplier|this supplier|them|that product|the .{0,20} one)\b/i;
/** A bare quantity with no product, e.g. "25kg" / "the 25kg one" / "five bags". */
const BARE_QTY_RX = /^\W*(\d+|\w+)\s*(kg|g|l|ml|bottle|bottles|bag|bags|carton|cartons|box|boxes|pack|packs|packet|packets|pc|pcs)?\W*$/i;

function lastMentioned(
  conversation: ChatMessage[] | undefined,
  dict: AiDictionary,
): { productName?: string; supplierName?: string } {
  if (!conversation?.length) return {};
  const out: { productName?: string; supplierName?: string } = {};
  const recent = conversation.slice(-CONTEXT_TURNS);
  // Walk backwards so the most recent mention wins.
  for (let i = recent.length - 1; i >= 0; i--) {
    const content = recent[i]!.content.toLowerCase();
    if (!out.productName) {
      const hit = dict.products.find((p) => content.includes(p.toLowerCase()));
      if (hit) out.productName = hit;
    }
    if (!out.supplierName) {
      const hit = dict.suppliers.find((s) => content.includes(s.toLowerCase()));
      if (hit) out.supplierName = hit;
    }
    if (out.productName && out.supplierName) break;
  }
  return out;
}

/**
 * applyConversationContext: fill slots the current prompt leaves implicit.
 * "The 25kg one" after talking about rice -> productName rice. "Use that
 * one" after a recommendation -> supplierName. Only fills gaps; never
 * overrides what the model extracted. Marks inherited slots with lowered
 * confidence so handlers can clarify when unsure.
 */
export function applyConversationContext(
  result: ClassifyResult,
  prompt: string,
  conversation: ChatMessage[] | undefined,
  dict: AiDictionary,
): ClassifyResult {
  if (!conversation?.length) return result;
  const slots = { ...result.slots } as Record<string, unknown>;
  const mentioned = lastMentioned(conversation, dict);
  const hasAnaphor = ANAPHOR_RX.test(prompt);
  const isBareQty = BARE_QTY_RX.test(prompt.trim()) && !slots.productName;

  let inherited = false;
  if (!slots.productName && mentioned.productName && (hasAnaphor || isBareQty)) {
    slots.productName = mentioned.productName;
    inherited = true;
  }
  if (!slots.supplierName && mentioned.supplierName && hasAnaphor) {
    slots.supplierName = mentioned.supplierName;
    inherited = true;
  }
  if (!inherited) return result;
  // A bare "the 25kg one" classifies as clarify on its own — but with the
  // product resolved from history it is a concrete procurement request.
  const intent = result.intent === 'clarify' && slots.productName ? 'find_cheapest' : result.intent;
  return ClassifyResultSchema.parse({
    ...result,
    intent,
    slots,
    confidence: Math.min(result.confidence, 0.55),
  });
}

export async function classify(
  provider: AIProvider,
  ctx: ClassifyContext,
  prompt: string,
  conversation?: ChatMessage[],
): Promise<ClassifyResult> {
  const trimmed = prompt.slice(0, PROMPT_MAX).trim();
  try {
    const messages = buildClassifyMessages(ctx.businessName, trimmed);
    const res = await provider.chat(messages, {
      temperature: 0,
      responseFormatJson: true,
    });
    const parsed = safeParse(res.content);
    if (parsed) return applyConversationContext(parsed, trimmed, conversation, ctx.dict);
  } catch {
    // fall through
  }
  return applyConversationContext(heuristicClassify(trimmed, ctx.dict), trimmed, conversation, ctx.dict);
}
