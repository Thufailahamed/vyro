import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from './types';
import { AIUnavailableError } from './types';
import type { Env } from '../../../env';

const DEFAULT_CLASSIFY = '@cf/meta/llama-3.1-8b-instruct-fast';
const DEFAULT_NARRATE = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export class WorkersAIProvider implements AIProvider {
  readonly name = 'workersAI';
  readonly degraded: boolean;
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
    this.degraded = !env.AI;
  }

  private resolveModel(opts?: ChatOptions): string {
    if (opts?.model) return opts.model;
    if (opts?.responseFormatJson) return this.env.VYRO_AI_CLASSIFY_MODEL || DEFAULT_CLASSIFY;
    return this.env.VYRO_AI_NARRATE_MODEL || DEFAULT_NARRATE;
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
    if (this.degraded || !this.env.AI) {
      throw new AIUnavailableError('Workers AI binding not configured');
    }
    const model = this.resolveModel(opts);
    const payload: Record<string, unknown> = { messages };
    if (opts?.temperature !== undefined) payload.temperature = opts.temperature;
    if (opts?.maxTokens !== undefined) payload.max_tokens = opts.maxTokens;
    if (opts?.responseFormatJson) payload.response_format = { type: 'json_object' };

    const started = Date.now();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.env.AI!.run(model, payload);
        const latencyMs = Date.now() - started;
        return {
          content: (res as any).response ?? '',
          provider: this.name,
          model,
          latencyMs,
          tokensIn: (res as any).usage?.prompt_tokens,
          tokensOut: (res as any).usage?.completion_tokens,
        };
      } catch (err) {
        lastErr = err;
      }
    }
    throw new AIUnavailableError(
      `Workers AI call failed: ${lastErr instanceof Error ? lastErr.message : 'unknown'}`,
    );
  }
}
