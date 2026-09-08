import { describe, it, expect } from 'vitest';
import {
  classifyIntentTier,
  classifyTaskTier,
  defaultPolicy,
  DEFAULT_ROUTING_POLICY,
  type RoutingPolicy,
} from './routingPolicy';

describe('routingPolicy', () => {
  it('classifies savings as complex', () => {
    expect(classifyIntentTier(defaultPolicy(), 'savings')).toBe('complex');
  });

  it('classifies spend_summary as simple', () => {
    expect(classifyIntentTier(defaultPolicy(), 'spend_summary')).toBe('simple');
  });

  it('classifies narrate_complex task as complex', () => {
    expect(classifyTaskTier(defaultPolicy(), 'narrate_complex')).toBe('complex');
  });

  it('classifies classify task as simple', () => {
    expect(classifyTaskTier(defaultPolicy(), 'classify')).toBe('simple');
  });

  it('custom policy overrides defaults', () => {
    const custom: RoutingPolicy = { complexIntents: ['x'], complexTaskKinds: [] };
    expect(classifyIntentTier(custom, 'savings')).toBe('simple');
    expect(classifyIntentTier(custom, 'x')).toBe('complex');
  });

  it('default policy is exposed for downstream consumers', () => {
    expect(DEFAULT_ROUTING_POLICY.complexIntents).toContain('savings');
  });
});
