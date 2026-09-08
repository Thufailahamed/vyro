import { describe, expect, it, vi } from 'vitest';
import { WorkersAIProvider } from '../../src/modules/ai/provider/workersAI';
import { AIUnavailableError } from '../../src/modules/ai/provider';

function makeEnv(ai: any) {
  return {
    AI: ai,
    VYRO_AI_ENABLED: 'true',
    VYRO_AI_CLASSIFY_MODEL: '@cf/meta/llama-3.1-8b-instruct-fast',
    VYRO_AI_NARRATE_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  } as any;
}

describe('WorkersAIProvider', () => {
  it('calls env.AI.run with messages and JSON mode when requested', async () => {
    const run = vi.fn().mockResolvedValue({ response: '{"intent":"savings"}', usage: { prompt_tokens: 10, completion_tokens: 4 } });
    const p = new WorkersAIProvider(makeEnv({ run }));
    const r = await p.chat([{ role: 'user', content: 'hi' }], { responseFormatJson: true });
    expect(r.content).toBe('{"intent":"savings"}');
    expect(r.tokensIn).toBe(10);
    expect(r.tokensOut).toBe(4);
    expect(run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.1-8b-instruct-fast',
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    );
  });

  it('falls back to narrate model when explicit model not provided', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'ok', usage: {} });
    const p = new WorkersAIProvider(makeEnv({ run }));
    await p.chat([{ role: 'user', content: 'hi' }]);
    expect(run).toHaveBeenCalledWith('@cf/meta/llama-3.3-70b-instruct-fp8-fast', expect.any(Object));
  });

  it('retries once on transient failure then throws AIUnavailableError', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    const p = new WorkersAIProvider(makeEnv({ run }));
    await expect(p.chat([{ role: 'user', content: 'hi' }])).rejects.toBeInstanceOf(AIUnavailableError);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('degraded provider throws AIUnavailableError without binding', async () => {
    const p = new WorkersAIProvider({ VYRO_AI_ENABLED: 'true' } as any);
    await expect(p.chat([])).rejects.toBeInstanceOf(AIUnavailableError);
  });
});
