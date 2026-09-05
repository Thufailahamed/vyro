import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, PERMISSION_KEYS, isPermission } from './permissions';

describe('permissions', () => {
  it('exports stable key list with expected entries', () => {
    expect(PERMISSION_KEYS).toContain('user:suspend');
    expect(PERMISSION_KEYS).toContain('dispute:resolve');
    expect(PERMISSION_KEYS).toContain('admin:invite');
    expect(PERMISSION_KEYS).toContain('admin:role_change');
    expect(PERMISSION_KEYS).toContain('audit:export');
  });
  it('ALL_PERMISSIONS Set equals PERMISSION_KEYS', () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual([...PERMISSION_KEYS].sort());
  });
  it('isPermission narrows correctly', () => {
    expect(isPermission('user:suspend')).toBe(true);
    expect(isPermission('made:up')).toBe(false);
  });
  it('has no duplicates', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });
});
