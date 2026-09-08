import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from './types';
import { AIUnavailableError } from './types';
import type { Env } from '../../../env';

const DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * GeminiProvider: calls the Generative Language API directly (REST).
 * Activated only when GEMINI_API_KEY is set — otherwise the router never
 * selects it. Never throws raw API internals; surfaces AIUnavailableError.
 *
 * NOTE: route through Cloudflare AI Gateway by setting
 * VYRO_AI_GEMINI_BASE_URL to the gateway endpoint when available.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  private get apiKey(): string | undefined {
    return (this.env as any).GEMINI_API_KEY as string | undefined;
  }

  private baseUrl(): string {
    return (
      ((this.env as any).VYRO_AI_GEMINI_BASE_URL as string | undefined) ??
      'https://generativelanguage.googleapis.com'
    ).replace(/\/$/, '');
  }

  private model(opts?: ChatOptions): string {
    return (
      opts?.model ??
      ((this.env as any).VYRO_AI_GEMINI_MODEL as string | undefined) ??
      DEFAULT_MODEL
    );
  }

  async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
    const key = this.apiKey;
    if (!key) throw new AIUnavailableError('Gemini API key not configured');
    const started = Date.now();
    const contents = messages
      .filter((m) => m.role !== 'system' || m.content)
      .map((m) => ({
        // Gemini roles are user/model; fold system into the first user turn.
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.role === 'system' ? `[System instruction]\n${m.content}` : m.content }],
      }));
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts?.maxTokens !== undefined ? { maxOutputTokens: opts.maxTokens } : {}),
        ...(opts?.responseFormatJson ? { responseMimeType: 'application/json' } : {}),
      },
    };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const init: RequestInit = {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
        };
        if (opts?.signal) init.signal = opts.signal;
        const res = await fetch(
          `${this.baseUrl()}/v1beta/models/${this.model(opts)}:generateContent`,
          init,
        );
        if (!res.ok) {
          lastErr = new Error(`Gemini HTTP ${res.status}`);
          // Retry once on transient failures only.
          if (res.status !== 429 && res.status < 500) break;
          continue;
        }
        const json = (await res.json()) as any;
        const text =
          json?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text ?? '')
            .join('') ?? '';
        const usage = json?.usageMetadata ?? {};
        return {
          content: text,
          provider: this.name,
          model: this.model(opts),
          latencyMs: Date.now() - started,
          tokensIn: usage.promptTokenCount,
          tokensOut: usage.candidatesTokenCount,
        };
      } catch (err) {
        lastErr = err;
      }
    }
    throw new AIUnavailableError(
      `Gemini call failed: ${lastErr instanceof Error ? lastErr.message : 'unknown'}`,
    );
  }
}
