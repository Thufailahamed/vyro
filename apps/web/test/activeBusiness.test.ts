import { describe, expect, it } from 'vitest';
import { firstBusinessId } from '../src/lib/activeBusiness';

describe('firstBusinessId', () => {
  it('returns the first membership business id', () => {
    expect(firstBusinessId({ memberships: [{ businessId: 'biz-1' }, { businessId: 'biz-2' }] })).toBe('biz-1');
  });

  it('returns undefined without memberships', () => {
    expect(firstBusinessId({ memberships: [] })).toBeUndefined();
    expect(firstBusinessId(null)).toBeUndefined();
    expect(firstBusinessId(undefined)).toBeUndefined();
  });
});
