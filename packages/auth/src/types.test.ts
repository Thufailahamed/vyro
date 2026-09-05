import { describe, it, expect } from 'vitest';
import type { AuthEnv, SessionContext, MembershipSummary } from './types';

describe('AuthEnv shape', () => {
  it('declares required bindings', () => {
    const env: AuthEnv = {
      DB: undefined as unknown as D1Database,
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost',
    };
    expect(env.BETTER_AUTH_SECRET.length).toBe(32);
    expect(env.BETTER_AUTH_URL).toMatch(/^https?:\/\//);
  });
});

describe('SessionContext shape', () => {
  it('carries user + memberships', () => {
    const ctx: SessionContext = {
      userId: 'u1',
      email: 'a@example.com',
      isAdmin: false,
      adminRole: null,
      businesses: [{ id: 'b1', role: 'owner' } as MembershipSummary],
      suppliers: [],
    };
    expect(ctx.businesses[0]?.role).toBe('owner');
    expect(ctx.suppliers).toEqual([]);
  });
  it('adminRole can be a non-null role', () => {
    const ctx: SessionContext = {
      userId: 'u1',
      email: 'a@example.com',
      isAdmin: true,
      adminRole: 'super_admin',
      businesses: [],
      suppliers: [],
    };
    expect(ctx.adminRole).toBe('super_admin');
    expect(ctx.isAdmin).toBe(true);
  });
});
