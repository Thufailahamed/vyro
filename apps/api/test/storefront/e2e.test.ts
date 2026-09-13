import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u1', isAdmin: true });
    await next();
  },
}));

describe('storefront e2e', () => {
  it('exports expected repository surface', async () => {
    const repo = await import('../../src/modules/storefront/repository');
    expect(typeof repo.findBySlug).toBe('function');
    expect(typeof repo.listPublishedOffersBySupplierId).toBe('function');
    expect(typeof repo.updateSupplierSlug).toBe('function');
    expect(typeof repo.existingSlugsStartingWith).toBe('function');
  });

  it('exports slug helpers', async () => {
    const svc = await import('../../src/modules/storefront/service');
    expect(typeof svc.generateSlug).toBe('function');
    expect(typeof svc.ensureUniqueSlug).toBe('function');
  });

  it('generateSlug produces valid kebab', async () => {
    const svc = await import('../../src/modules/storefront/service');
    expect(svc.generateSlug('Colombo', 'Fresh Dairy')).toMatch(/^[a-z0-9-]+$/);
  });

  it('ensureUniqueSlug dedupes', async () => {
    const svc = await import('../../src/modules/storefront/service');
    expect(svc.ensureUniqueSlug('foo', new Set(['foo']))).toBe('foo-2');
  });
});
