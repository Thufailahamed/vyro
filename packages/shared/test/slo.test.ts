import { describe, it, expect } from 'vitest';
import { SloRuleSchema, INITIAL_RULES } from '../src/slo';

describe('SloRuleSchema', () => {
  it('parses a valid rule', () => {
    const rule = {
      name: 'api.p95_latency_ms',
      component: 'api' as const,
      description: 'p95 latency exceeds 1500ms',
      query: { kind: 'ae_sql', sql: 'SELECT 1' },
      comparator: 'gt' as const,
      threshold: 1500,
      window: '5m' as const,
      severity: 'warning' as const,
      cooldownSec: 1800,
      channels: ['slack', 'email', 'in_app'] as const,
      recipients: [{ role: 'ops' }],
    };
    expect(SloRuleSchema.parse(rule).name).toBe('api.p95_latency_ms');
  });

  it('rejects unknown component', () => {
    const rule = {
      name: 'x',
      component: 'unknown',
      description: '',
      query: { kind: 'd1_health' },
      comparator: 'eq' as const,
      threshold: 0,
      window: '1m' as const,
      severity: 'critical' as const,
      cooldownSec: 60,
      channels: [],
      recipients: [],
    };
    expect(() => SloRuleSchema.parse(rule)).toThrow();
  });

  it('rejects non-positive cooldown', () => {
    const rule = {
      name: 'x',
      component: 'api' as const,
      description: '',
      query: { kind: 'd1_health' },
      comparator: 'eq' as const,
      threshold: 0,
      window: '1m' as const,
      severity: 'critical' as const,
      cooldownSec: 0,
      channels: [],
      recipients: [],
    };
    expect(() => SloRuleSchema.parse(rule)).toThrow();
  });
});

describe('INITIAL_RULES', () => {
  it('contains unique names', () => {
    const names = INITIAL_RULES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('all rules disabled by default', () => {
    expect(INITIAL_RULES.every((r) => r.enabled === false)).toBe(true);
  });
});