import { describe, expect, it } from 'vitest';
import { adminUsersListQuery, adminUserIdParam } from '../src/adminUsers';

describe('admin users schemas', () => {
  it('list accepts empty query', () => {
    expect(adminUsersListQuery.parse({})).toEqual({});
  });
  it('id param rejects non-uuid', () => {
    expect(adminUserIdParam.safeParse({ id: 'x' }).success).toBe(false);
  });
});
