import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, ADMIN_ROLES, INVITABLE_ROLES, hasPermission, isAdminRole } from './rolePermissions';
import { ALL_PERMISSIONS, type Permission } from './permissions';

const ROLES = ADMIN_ROLES;

describe('rolePermissions', () => {
  it('is frozen at runtime', () => {
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
    for (const r of ROLES) expect(Object.isFrozen(ROLE_PERMISSIONS[r])).toBe(true);
  });
  it('super_admin has all permissions', () => {
    for (const p of ALL_PERMISSIONS) {
      expect(ROLE_PERMISSIONS.super_admin.has(p)).toBe(true);
    }
  });
  it('every role includes relevant :read keys', () => {
    expect(ROLE_PERMISSIONS.ops.has('user:read')).toBe(true);
    expect(ROLE_PERMISSIONS.finance.has('user:read')).toBe(true);
    expect(ROLE_PERMISSIONS.support.has('user:read')).toBe(true);
    expect(ROLE_PERMISSIONS.ops.has('audit:read')).toBe(true);
  });
  it('non-super roles lack admin:role_change', () => {
    expect(ROLE_PERMISSIONS.ops.has('admin:role_change')).toBe(false);
    expect(ROLE_PERMISSIONS.finance.has('admin:role_change')).toBe(false);
    expect(ROLE_PERMISSIONS.support.has('admin:role_change')).toBe(false);
  });
  it('support lacks privileged write keys', () => {
    // Support is read-mostly across payments and settings but retains
    // user/business/supplier moderation per the operational matrix.
    expect(ROLE_PERMISSIONS.support.has('settings:write')).toBe(false);
    expect(ROLE_PERMISSIONS.support.has('payout:approve')).toBe(false);
    expect(ROLE_PERMISSIONS.support.has('payment:refund')).toBe(false);
    expect(ROLE_PERMISSIONS.support.has('admin:role_change')).toBe(false);
  });
  it('finance cannot freeze businesses or suppliers', () => {
    expect(ROLE_PERMISSIONS.finance.has('business:freeze')).toBe(false);
    expect(ROLE_PERMISSIONS.finance.has('supplier:freeze')).toBe(false);
    expect(ROLE_PERMISSIONS.finance.has('user:suspend')).toBe(false);
  });
  it('ops has admin:invite but cannot invite super_admin', () => {
    expect(ROLE_PERMISSIONS.ops.has('admin:invite')).toBe(true);
    expect(INVITABLE_ROLES.ops.includes('super_admin')).toBe(false);
    expect(INVITABLE_ROLES.ops.includes('ops')).toBe(true);
    expect(INVITABLE_ROLES.ops.includes('finance')).toBe(true);
    expect(INVITABLE_ROLES.ops.includes('support')).toBe(true);
  });
  it('super_admin can invite any role', () => {
    expect(INVITABLE_ROLES.super_admin.includes('super_admin')).toBe(true);
    expect(INVITABLE_ROLES.super_admin.includes('ops')).toBe(true);
  });
  it('finance and support cannot invite', () => {
    expect(INVITABLE_ROLES.finance.length).toBe(0);
    expect(INVITABLE_ROLES.support.length).toBe(0);
  });
  it('hasPermission returns correct values', () => {
    expect(hasPermission('super_admin', 'payout:approve')).toBe(true);
    expect(hasPermission('finance', 'payout:approve')).toBe(true);
    expect(hasPermission('ops', 'payout:approve')).toBe(false);
    expect(hasPermission(null, 'user:suspend')).toBe(false);
    expect(hasPermission(undefined, 'user:suspend')).toBe(false);
    expect(hasPermission('admin' as any, 'user:suspend')).toBe(true);
    expect(hasPermission('unknown_role' as any, 'user:suspend')).toBe(false);
  });
  it('isAdminRole narrows correctly', () => {
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('made_up')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
  it('matrix is internally consistent: every role references valid Permission keys', () => {
    const valid: ReadonlySet<string> = ALL_PERMISSIONS;
    for (const role of ROLES) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(valid.has(perm as string)).toBe(true);
      }
    }
  });
  it('matrix covers all Permission keys in super_admin', () => {
    const superSet = ROLE_PERMISSIONS.super_admin;
    for (const p of ALL_PERMISSIONS as ReadonlySet<Permission>) {
      expect(superSet.has(p)).toBe(true);
    }
  });
});
