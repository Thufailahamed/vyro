import { describe, expect, it } from 'vitest';
import { providerFor } from '../../src/modules/ai/provider';
import { WorkersAIProvider } from '../../src/modules/ai/provider/workersAI';

const env = { VYRO_AI_ENABLED: 'true' } as any;

describe('providerFor', () => {
  it('returns WorkersAIProvider by default', () => {
    const p = providerFor(env);
    expect(p).toBeInstanceOf(WorkersAIProvider);
    expect(p.name).toBe('workersAI');
  });

  it('returns WorkersAIProvider when binding missing (degraded mode)', () => {
    const p = providerFor({} as any);
    expect(p.name).toBe('workersAI');
    expect((p as any).degraded).toBe(true);
  });
});
