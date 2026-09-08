import { describe, it, expect, vi } from 'vitest';
import { getMemory } from '../../../src/modules/ai/memory';

describe('memory service', () => {
  it('returns empty list when no prefs', async () => {
    const repo = {
      list: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    const out = await getMemory(repo, { businessId: 'biz-1' }).list();
    expect(out).toEqual([]);
  });

  it('upsert creates new row', async () => {
    const repo = {
      list: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({ id: 'p-1' }),
      delete: vi.fn(),
    };
    await getMemory(repo, { businessId: 'biz-1' }).setPreference({
      kind: 'preferred_supplier',
      key: 'sup-1',
      valueJson: '{"supplierId":"sup-1"}',
      source: 'user',
    });
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it('recordCorrection promotes inferred -> user when threshold met', async () => {
    const repo = {
      list: vi.fn().mockResolvedValue([{
        id: 'p-1',
        userId: null,
        businessId: 'biz-1',
        kind: 'preferred_supplier',
        key: 'sup-1',
        valueJson: '{}',
        source: 'inferred',
        confidence: 0.9,
        occurrences: 6,
        createdAt: 1,
        updatedAt: 1,
      }]),
      upsert: vi.fn().mockResolvedValue({ id: 'p-1' }),
      delete: vi.fn(),
    };
    const m = getMemory(repo, { businessId: 'biz-1' });
    await m.recordCorrection({ kind: 'preferred_supplier', key: 'sup-1' });
    const call = repo.upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.source).toBe('user');
    expect(call.confidence).toBe(1.0);
  });

  it('recordCorrection refuses below threshold', async () => {
    const repo = {
      list: vi.fn().mockResolvedValue([{
        id: 'p-1',
        userId: null,
        businessId: 'biz-1',
        kind: 'preferred_supplier',
        key: 'sup-1',
        valueJson: '{}',
        source: 'inferred',
        confidence: 0.5,
        occurrences: 2,
        createdAt: 1,
        updatedAt: 1,
      }]),
      upsert: vi.fn(),
      delete: vi.fn(),
    };
    const m = getMemory(repo, { businessId: 'biz-1' });
    await expect(m.recordCorrection({ kind: 'preferred_supplier', key: 'sup-1' })).rejects.toThrow('Below promotion threshold');
  });
});
