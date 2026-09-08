import { describe, expect, it } from 'vitest';
import { buildAiAuditRow } from '../../src/modules/ai/audit';

describe('buildAiAuditRow', () => {
  it('produces structured row without raw prompt or result content', () => {
    const row = buildAiAuditRow(
      {
        userId: 'u1',
        businessId: 'b1',
        intent: 'find_cheapest',
        provider: 'workersAI',
        model: '@cf/meta/llama-3.1-8b-instruct-fast',
        latencyMs: 120,
        tokensIn: 10,
        tokensOut: 4,
        ok: true,
        requestId: 'req-1',
        slots: { productName: 'rice' },
      },
      1700000000000,
    );
    expect(row.intent).toBe('find_cheapest');
    expect(row.actorUserId).toBe('u1');
    expect(row.action).toBe('ai.request');
    expect(row.resourceType).toBe('ai_request');
    expect(row.resourceId).toBe('req-1');
    expect(row.createdAt).toBe(1700000000000);
    expect(row.ip).toBeNull();
    expect(row.userAgent).toBeNull();
    expect(typeof row.id).toBe('string');

    const meta = JSON.parse(row.metadata);
    expect(meta.provider).toBe('workersAI');
    expect(meta.model).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
    expect(meta.ok).toBe(true);
    expect(meta.latencyMs).toBe(120);
    expect(meta.slotKeys).toEqual(['productName']);

    expect(row.metadata).not.toMatch(/prompt/i);
    expect(row.metadata).not.toMatch(/result/i);
    expect(row.metadata).not.toMatch(/"rice"/);
  });

  it('omits slotKeys when no slots provided', () => {
    const row = buildAiAuditRow(
      {
        userId: 'u2',
        intent: 'spend_summary',
        provider: 'workersAI',
        model: 'm',
        latencyMs: 50,
        ok: false,
        errorCode: 'AI_DISABLED',
        requestId: 'req-2',
      },
      0,
    );
    const meta = JSON.parse(row.metadata);
    expect(meta.ok).toBe(false);
    expect(meta.errorCode).toBe('AI_DISABLED');
    expect(meta.slotKeys).toBeUndefined();
  });
});
