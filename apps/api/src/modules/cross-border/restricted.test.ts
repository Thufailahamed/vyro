import { describe, it, expect } from 'vitest';
import { isProductRestricted } from './restricted';
import type { Env } from '../../env';

describe('isProductRestricted', () => {
  it('flags weapons HS code globally', async () => {
    const r = await isProductRestricted('9301.10', 'US', {} as Env);
    expect(r.restricted).toBe(true);
    expect(r.reason).toBe('military_weapons');
  });
  it('passes coffee to US', async () => {
    const r = await isProductRestricted('0901.21', 'US', {} as Env);
    expect(r.restricted).toBe(false);
  });
  it('flags radioactive HS code', async () => {
    const r = await isProductRestricted('2844.10', 'US', {} as Env);
    expect(r.restricted).toBe(true);
    expect(r.reason).toBe('radioactive_isotopes');
  });
  it('passes null HS code', async () => {
    const r = await isProductRestricted(null, 'US', {} as Env);
    expect(r.restricted).toBe(false);
  });
});