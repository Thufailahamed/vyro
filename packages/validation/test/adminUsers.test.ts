import { describe, expect, it } from 'vitest';
import { adminUsersListQuery, adminUserIdParam } from '../src/adminUsers';

describe('admin users schemas', () => {
  it('list accepts empty query', () => {
    expect(adminUsersListQuery.parse({})).toEqual({});
  });
  it('id param accepts any non-empty string', () => {
    expect(adminUserIdParam.safeParse({ id: 'u-1' }).success).toBe(true);
    expect(adminUserIdParam.safeParse({ id: '' }).success).toBe(false);
  });
});
