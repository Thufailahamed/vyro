import type { IntentContext, HandlerResult } from './catalog';

const DEFAULT_OPTIONS = [
  'Find cheapest suppliers',
  'Build my usual order',
  'What should I reorder?',
  'Where can I save?',
];

/**
 * clarify: emit a clarification_card with question and up to 4 short options.
 * Schema enforces `options.max(4)`.
 */
export async function clarifyHandler(ctx: IntentContext): Promise<HandlerResult> {
  const q = ctx.classify.slots.question ?? 'What do you need help with?';
  const options = ctx.classify.slots.options ?? DEFAULT_OPTIONS;
  return {
    components: [{ type: 'clarification_card', data: { question: q, options } }],
    actions: [],
    rawSummary: { question: q },
  };
}
