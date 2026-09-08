import {
  ClassifyResultSchema,
  heuristicClassify,
  buildClassifyMessages,
  type ClassifyResult,
  type AIProvider,
  type AiDictionary,
} from '@vyro/ai';

export interface ClassifyContext {
  businessName: string;
  dict: AiDictionary;
}

const PROMPT_MAX = 800;

function safeParse(raw: string): ClassifyResult | null {
  try {
    const obj = JSON.parse(raw);
    return ClassifyResultSchema.parse(obj);
  } catch {
    return null;
  }
}

export async function classify(
  provider: AIProvider,
  ctx: ClassifyContext,
  prompt: string,
): Promise<ClassifyResult> {
  const trimmed = prompt.slice(0, PROMPT_MAX).trim();
  try {
    const messages = buildClassifyMessages(ctx.businessName, trimmed);
    const res = await provider.chat(messages, {
      temperature: 0,
      responseFormatJson: true,
    });
    const parsed = safeParse(res.content);
    if (parsed) return parsed;
  } catch {
    // fall through
  }
  return heuristicClassify(trimmed, ctx.dict);
}
