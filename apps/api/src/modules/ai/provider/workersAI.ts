import type { AIProvider, ChatMessage, ChatOptions, ChatResult } from './types';
import type { Env } from '../../../env';

export class WorkersAIProvider implements AIProvider {
  readonly name = 'workersAI';
  readonly degraded: boolean;
  private readonly env: Env;

  constructor(env: Env) {
    this.env = env;
    this.degraded = !env.AI;
  }

  async chat(_messages: ChatMessage[], _opts?: ChatOptions): Promise<ChatResult> {
    throw new Error('WorkersAIProvider.chat not implemented yet');
  }
}
