import { describe, expect, it } from 'vitest';
import { ROLE_META, ADMIN_ROLES, type AdminRole } from './lib/roles';

describe('ROLE_META', () => {
  it('covers every admin role', () => {
    for (const r of ADMIN_ROLES) {
      expect(ROLE_META[r]).toBeTruthy();
      expect(ROLE_META[r].label).toBeTruthy();
    }
  });
});

describe('RoleBadge + AdminRoleSelect modules', () => {
  it('exports are importable', async () => {
    const mod = await import('./RoleBadge');
    expect(typeof mod.RoleBadge).toBe('function');
  });
  it('AdminRoleSelect is importable', async () => {
    const mod = await import('./AdminRoleSelect');
    expect(typeof mod.AdminRoleSelect).toBe('function');
  });
  it('InviteAdminDialog is importable', async () => {
    const mod = await import('./InviteAdminDialog');
    expect(typeof mod.InviteAdminDialog).toBe('function');
  });
});

describe('INVITABLE_ROLES from @vyro/auth', () => {
  it('super_admin can grant all roles', async () => {
    const { INVITABLE_ROLES } = await import('@vyro/auth');
    expect(INVITABLE_ROLES.super_admin).toContain('super_admin');
    expect(INVITABLE_ROLES.super_admin).toContain('ops');
    expect(INVITABLE_ROLES.super_admin).toContain('finance');
    expect(INVITABLE_ROLES.super_admin).toContain('support');
  });
  it('ops cannot grant super_admin', async () => {
    const { INVITABLE_ROLES } = await import('@vyro/auth');
    expect(INVITABLE_ROLES.ops).not.toContain('super_admin');
  });
});
