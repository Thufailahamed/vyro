import { describe, expect, it } from 'vitest';
import type { SessionContext } from './types';
import {
  TenantAccessError,
  accessibleBusinessIds,
  accessibleSupplierIds,
  assertAdmin,
  assertBusinessAccess,
  assertSupplierAccess,
  getBusinessRole,
  getSupplierRole,
  hasBusinessAccess,
  hasSupplierAccess,
  isAdmin,
  requireBusinessRole,
  requireSupplierRole,
} from './scope';

const businessMember = (businessId: string, role = 'manager') => ({
  id: businessId,
  businessId,
  role,
  name: `Biz ${businessId}`,
  businessName: `Biz ${businessId}`,
});

const supplierMember = (supplierId: string, role = 'owner') => ({
  id: supplierId,
  supplierId,
  role,
  name: `Sup ${supplierId}`,
  supplierName: `Sup ${supplierId}`,
});

const ctx = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  userId: 'user-1',
  email: 'a@example.com',
  isAdmin: false,
  adminRole: null,
  businesses: [],
  suppliers: [],
  ...overrides,
});

describe('scope', () => {
  describe('isAdmin', () => {
    it('returns true when adminRole is set', () => {
      expect(isAdmin(ctx({ adminRole: 'super_admin' }))).toBe(true);
    });
    it('returns false when adminRole is null', () => {
      expect(isAdmin(ctx())).toBe(false);
    });
  });

  describe('hasBusinessAccess', () => {
    it('grants access to own business', () => {
      const c = ctx({ businesses: [businessMember('b1')] });
      expect(hasBusinessAccess(c, 'b1')).toBe(true);
    });
    it('denies access to other business', () => {
      const c = ctx({ businesses: [businessMember('b1')] });
      expect(hasBusinessAccess(c, 'b2')).toBe(false);
    });
    it('admins bypass membership', () => {
      const c = ctx({ adminRole: 'ops', businesses: [] });
      expect(hasBusinessAccess(c, 'any')).toBe(true);
    });
  });

  describe('hasSupplierAccess', () => {
    it('grants access to own supplier', () => {
      const c = ctx({ suppliers: [supplierMember('s1')] });
      expect(hasSupplierAccess(c, 's1')).toBe(true);
    });
    it('denies access to other supplier', () => {
      const c = ctx({ suppliers: [supplierMember('s1')] });
      expect(hasSupplierAccess(c, 's2')).toBe(false);
    });
    it('admins bypass membership', () => {
      const c = ctx({ adminRole: 'super_admin', suppliers: [] });
      expect(hasSupplierAccess(c, 'any')).toBe(true);
    });
  });

  describe('getBusinessRole / getSupplierRole', () => {
    it('returns the role when membership exists', () => {
      const c = ctx({
        businesses: [businessMember('b1', 'owner')],
        suppliers: [supplierMember('s1', 'sales')],
      });
      expect(getBusinessRole(c, 'b1')).toBe('owner');
      expect(getSupplierRole(c, 's1')).toBe('sales');
    });
    it('returns null when no membership', () => {
      const c = ctx();
      expect(getBusinessRole(c, 'b1')).toBeNull();
      expect(getSupplierRole(c, 's1')).toBeNull();
    });
  });

  describe('asserts throw TenantAccessError', () => {
    it('assertBusinessAccess throws on cross-tenant', () => {
      const c = ctx({ businesses: [businessMember('b1')] });
      expect(() => assertBusinessAccess(c, 'b2')).toThrow(TenantAccessError);
    });
    it('assertBusinessAccess passes for own business', () => {
      const c = ctx({ businesses: [businessMember('b1')] });
      expect(() => assertBusinessAccess(c, 'b1')).not.toThrow();
    });
    it('assertSupplierAccess throws on cross-supplier', () => {
      const c = ctx({ suppliers: [supplierMember('s1')] });
      expect(() => assertSupplierAccess(c, 's2')).toThrow(TenantAccessError);
    });
    it('assertAdmin throws for non-admin', () => {
      expect(() => assertAdmin(ctx())).toThrow(TenantAccessError);
    });
    it('assertAdmin passes for admin', () => {
      expect(() => assertAdmin(ctx({ adminRole: 'ops' }))).not.toThrow();
    });
  });

  describe('accessible ids', () => {
    it('returns businessIds for member', () => {
      const c = ctx({ businesses: [businessMember('b1'), businessMember('b2', 'purchasing')] });
      expect(accessibleBusinessIds(c).sort()).toEqual(['b1', 'b2']);
    });
    it('returns supplierIds for member', () => {
      const c = ctx({ suppliers: [supplierMember('s1'), supplierMember('s2')] });
      expect(accessibleSupplierIds(c).sort()).toEqual(['s1', 's2']);
    });
    it('returns empty arrays when no memberships', () => {
      expect(accessibleBusinessIds(ctx())).toEqual([]);
      expect(accessibleSupplierIds(ctx())).toEqual([]);
    });
  });

  it('TenantAccessError carries 403 status', () => {
    const err = new TenantAccessError('test');
    expect(err.status).toBe(403);
    expect(err.name).toBe('TenantAccessError');
  });
});

describe('scope: role-gated helpers', () => {
  it('requireBusinessRole passes for matching role', () => {
    const c = ctx({ businesses: [businessMember('b1', 'owner')] });
    expect(requireBusinessRole(c, 'b1', ['owner', 'manager'])).toBe('owner');
  });
  it('requireBusinessRole throws on non-matching role', () => {
    const c = ctx({ businesses: [businessMember('b1', 'purchasing')] });
    expect(() => requireBusinessRole(c, 'b1', ['owner', 'manager'])).toThrow(TenantAccessError);
  });
  it('requireBusinessRole admin bypass returns "admin"', () => {
    const c = ctx({ adminRole: 'ops', businesses: [] });
    expect(requireBusinessRole(c, 'bX', ['owner'])).toBe('admin');
  });
  it('requireSupplierRole passes for matching role', () => {
    const c = ctx({ suppliers: [supplierMember('s1', 'sales')] });
    expect(requireSupplierRole(c, 's1', ['sales', 'owner'])).toBe('sales');
  });
  it('requireSupplierRole throws for cross-supplier', () => {
    const c = ctx({ suppliers: [supplierMember('s1')] });
    expect(() => requireSupplierRole(c, 's2', ['owner'])).toThrow(TenantAccessError);
  });
  it('requireSupplierRole admin bypass returns "admin"', () => {
    const c = ctx({ adminRole: 'super_admin', suppliers: [] });
    expect(requireSupplierRole(c, 'sX', ['owner'])).toBe('admin');
  });
});
