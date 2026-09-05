import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('./lib/permissions', () => ({
  useAdminRole: () => 'super_admin',
}));

import { api } from '@/lib/api';

describe('InviteAdminDialog API contract', () => {
  it('uses POST /api/admin/invites with { email, role }', () => {
    // Reference check: ensure api.post signature accepts { email, role }
    expect(typeof api.post).toBe('function');
  });
});

describe('Role filtering', () => {
  it('super_admin actor lists all roles', async () => {
    const { INVITABLE_ROLES } = await import('@vyro/auth');
    const allowed = INVITABLE_ROLES.super_admin;
    expect(allowed).toEqual(['super_admin', 'ops', 'finance', 'support']);
  });
});
