import { describe, it, expect, vi } from 'vitest';
import { uploadCustomsDoc, getSignedDocUrl } from './docs';
import type { Env } from '../../env';
import type { Db } from '@vyro/db';

const env = {
  CROSS_BORDER_DOCS: {
    put: vi.fn().mockResolvedValue({}),
  },
} as unknown as Env;

describe('uploadCustomsDoc', () => {
  it('puts to R2 + inserts row', async () => {
    const values = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'd1', r2Path: 'cross-border-docs/o1/invoice-d1.pdf' }]),
    });
    const insert = vi.fn().mockReturnValue({ values });
    const db = { insert } as unknown as Db;
    const r = await uploadCustomsDoc({
      db,
      env,
      orderId: 'o1',
      kind: 'invoice',
      bytes: new ArrayBuffer(8),
      uploadedBy: 'u1',
    });
    expect(env.CROSS_BORDER_DOCS.put).toHaveBeenCalled();
    expect(r.id).toBe('d1');
    expect(r.r2Path).toMatch(/^cross-border-docs\/o1\/invoice-/);
  });
});

describe('getSignedDocUrl', () => {
  it('returns public url', async () => {
    const url = await getSignedDocUrl(env, 'cross-border-docs/o1/invoice.pdf');
    expect(url).toMatch(/^https:\/\/cross-border-docs\.vyro\.lk\//);
  });
});