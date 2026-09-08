import { describe, expect, it } from 'vitest';
import { postLoginPath, resolveNextPath } from './RequireAuth';
import type { SessionUser } from '@/lib/auth';

function user(over: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 'u1',
    email: 'a@b.lk',
    name: 'A',
    isAdmin: false,
    memberships: [],
    supplierMemberships: [],
    ...over,
  };
}

describe('postLoginPath', () => {
  it('sends anonymous visitors to login', () => {
    expect(postLoginPath(null)).toBe('/login');
  });

  it('sends platform admins to the admin console', () => {
    expect(postLoginPath(user({ isAdmin: true }))).toBe('/admin');
  });

  it('sends supplier-only users to the supplier portal', () => {
    const u = user({
      supplierMemberships: [{ supplierId: 's1', role: 'owner', supplierName: 'S' }],
    });
    expect(postLoginPath(u)).toBe('/supplier');
  });

  it('prefers the buyer dashboard when the user has both memberships', () => {
    const u = user({
      memberships: [{ businessId: 'b1', role: 'owner', businessName: 'B' }],
      supplierMemberships: [{ supplierId: 's1', role: 'owner', supplierName: 'S' }],
    });
    expect(postLoginPath(u)).toBe('/dashboard');
  });

  it('sends users with no org to the buyer dashboard (which prompts onboarding)', () => {
    expect(postLoginPath(user())).toBe('/dashboard');
  });

  it('prefers admin over supplier when the user is both', () => {
    const u = user({
      isAdmin: true,
      supplierMemberships: [{ supplierId: 's1', role: 'owner', supplierName: 'S' }],
    });
    expect(postLoginPath(u)).toBe('/admin');
  });
});

describe('resolveNextPath', () => {
  it('honours a relative next hop', () => {
    expect(resolveNextPath('?next=%2Fcart', user())).toBe('/cart');
  });

  it('preserves query strings inside the next hop', () => {
    expect(resolveNextPath('?next=%2Fsearch%3Fq%3Drice', user())).toBe('/search?q=rice');
  });

  it('rejects absolute URLs to prevent open redirect', () => {
    expect(resolveNextPath('?next=https%3A%2F%2Fevil.example', user())).toBe('/dashboard');
  });

  it('rejects protocol-relative URLs to prevent open redirect', () => {
    expect(resolveNextPath('?next=%2F%2Fevil.example', user())).toBe('/dashboard');
  });

  it('falls back to the role landing page when next is absent', () => {
    expect(resolveNextPath('', user({ isAdmin: true }))).toBe('/admin');
  });
});
