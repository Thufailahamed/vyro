import { describe, expect, it, vi } from 'vitest';

// Mock useAdminAuth to return various role states
const adminRoleRef: { current: string | null } = { current: 'ops' };
vi.mock('../Shell', () => ({
  useAdminAuth: () => ({ user: { adminRole: adminRoleRef.current } }),
}));

import { usePermission, useAdminRole } from './permissions';
import { ROLE_PERMISSIONS } from '@vyro/auth';

describe('usePermission', () => {
  it('returns true for ops granted user:suspend', () => {
    adminRoleRef.current = 'ops';
    expect(usePermission('user:suspend')).toBe(true);
  });

  it('returns false for ops denied admin:role_change', () => {
    adminRoleRef.current = 'ops';
    expect(usePermission('admin:role_change')).toBe(false);
  });

  it('returns false for null role', () => {
    adminRoleRef.current = null;
    expect(usePermission('user:read')).toBe(false);
  });

  it('super_admin has audit:export', () => {
    adminRoleRef.current = 'super_admin';
    expect(usePermission('audit:export')).toBe(true);
  });

  it('ops lacks audit:export', () => {
    adminRoleRef.current = 'ops';
    expect(usePermission('audit:export')).toBe(false);
  });

  it('matches the backend ROLE_PERMISSIONS map', () => {
    adminRoleRef.current = 'finance';
    expect(usePermission('payment:refund')).toBe(ROLE_PERMISSIONS.finance.has('payment:refund'));
    expect(usePermission('user:suspend')).toBe(ROLE_PERMISSIONS.finance.has('user:suspend'));
  });
});

describe('useAdminRole', () => {
  it('returns the current role', () => {
    adminRoleRef.current = 'finance';
    expect(useAdminRole()).toBe('finance');
  });
  it('returns null when unset', () => {
    adminRoleRef.current = null;
    expect(useAdminRole()).toBe(null);
  });
});
