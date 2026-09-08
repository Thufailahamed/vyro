import type { ChatMessage } from '@vyro/ai';

export type { ChatMessage };

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormatJson?: boolean;
  signal?: AbortSignal;
  model?: string;
}

export interface ChatResult {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
}

export class AIUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AIUnavailableError';
  }
}

export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
  degraded?: boolean;
}
