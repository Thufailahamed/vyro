import type { Env } from '../../../env';
import { WorkersAIProvider } from './workersAI';
import { GeminiProvider } from './gemini';
import type { AIProvider } from './types';

export type { AIProvider, ChatOptions, ChatResult, ChatMessage } from './types';
export { AIUnavailableError } from './types';

export function providerFor(env: Env): AIProvider {
  const choice = (env as Env).VYRO_AI_ENABLED === 'true' ? 'on' : 'off';
  if ((env as Env).AI && choice === 'on') {
    if ((env as Env).VYRO_AI_PROVIDER === 'gemini') {
      return new GeminiProvider(env);
    }
    return new WorkersAIProvider(env);
  }
  return new WorkersAIProvider(env);
}
