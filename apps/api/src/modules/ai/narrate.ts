import { NARRATE_SYSTEM } from '@vyro/ai';
import type { AIProvider } from './provider/types';

export interface NarrateContext {
  businessName: string;
}

export interface ToolSummary {
  name: string;
  ok: boolean;
  summary: string;
}

const MAX = 600;

function deterministic(c: NarrateContext, t: ToolSummary): string {
  const prefix = t.ok ? '' : 'Partial result: ';
  return `${prefix}${c.businessName}: ${t.name} ${t.ok ? 'completed' : 'failed'}. ${t.summary}`.slice(0, MAX);
}

export async function narrate(
  provider: AIProvider,
  ctx: NarrateContext,
  tool: ToolSummary,
): Promise<string> {
  try {
    const messages = [
      { role: 'system' as const, content: NARRATE_SYSTEM },
      { role: 'user' as const, content: `Business: ${ctx.businessName}\nTool: ${tool.name}\nResult JSON: ${tool.summary}` },
    ];
    const res = await provider.chat(messages, { temperature: 0.2 });
    return res.content.slice(0, MAX);
  } catch {
    return deterministic(ctx, tool);
  }
}
