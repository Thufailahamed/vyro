import { describe, it, expect } from 'vitest';
import { buildFeedbackAudit, buildAiAuditRow } from '../../../src/modules/ai/audit';

describe('buildFeedbackAudit', () => {
  it('embeds helpful + omits reason when not provided', () => {
    const row = buildFeedbackAudit({
      userId: 'u1',
      businessId: 'b1',
      requestId: 'req-1',
      helpful: true,
    });
    expect(row.action).toBe('ai.feedback');
    expect(row.actorUserId).toBe('u1');
    expect(row.resourceId).toBe('req-1');
    const md = JSON.parse(row.metadata);
    expect(md.helpful).toBe(true);
    expect(md.reason).toBeUndefined();
  });

  it('includes reason + intentHint when provided', () => {
    const row = buildFeedbackAudit({
      userId: 'u1',
      businessId: 'b1',
      requestId: 'req-2',
      helpful: false,
      reason: 'wrong_product',
      intentHint: 'find_cheapest',
    });
    const md = JSON.parse(row.metadata);
    expect(md.helpful).toBe(false);
    expect(md.reason).toBe('wrong_product');
    expect(md.intentHint).toBe('find_cheapest');
  });

  it('buildAiAuditRow still emits ai.request — feedback is a separate action', () => {
    const row = buildAiAuditRow({
      userId: 'u1',
      intent: 'find_cheapest',
      provider: 'p',
      model: 'm',
      latencyMs: 12,
      ok: true,
      requestId: 'req-3',
    });
    expect(row.action).toBe('ai.request');
  });
});
