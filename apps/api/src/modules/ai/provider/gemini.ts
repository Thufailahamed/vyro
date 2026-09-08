import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from './types';
import type { Env } from '../../../env';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  constructor(_env: Env) {}

  async chat(_messages: ChatMessage[], _opts?: ChatOptions): Promise<ChatResult> {
    throw new Error('GeminiProvider not yet implemented (Phase 2)');
  }
}
