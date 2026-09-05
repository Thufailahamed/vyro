import { describe, expect, it } from 'vitest';
import { emptyFilters, toApiFilters } from './AuditFilters';
import { auditCsvUrl } from './useAdminAudit';

describe('AuditFilters', () => {
  it('emptyFilters returns blank state', () => {
    const f = emptyFilters();
    expect(f.actorId).toBe('');
    expect(f.action).toBe('');
    expect(f.targetType).toBe('');
    expect(f.from).toBe('');
    expect(f.to).toBe('');
  });

  it('toApiFilters drops empty strings and converts numbers', () => {
    const f = toApiFilters({ actorId: 'a1', action: '', targetType: 'user', from: '100', to: '' });
    expect(f).toEqual({ actorId: 'a1', targetType: 'user', from: 100 });
  });

  it('toApiFilters returns empty object for empty state', () => {
    expect(toApiFilters(emptyFilters())).toEqual({});
  });
});

describe('auditCsvUrl', () => {
  it('produces /api/admin/audit/export with limit=1000', () => {
    const u = new URL(auditCsvUrl({}), 'http://localhost');
    expect(u.pathname).toBe('/api/admin/audit/export');
    expect(u.searchParams.get('limit')).toBe('1000');
  });

  it('includes filter params when set', () => {
    const u = new URL(auditCsvUrl({ actorId: 'u1', from: 1000 }), 'http://localhost');
    expect(u.searchParams.get('actorId')).toBe('u1');
    expect(u.searchParams.get('from')).toBe('1000');
  });

  it('drops empty values', () => {
    const u = new URL(auditCsvUrl({ actorId: '', action: 'x' }), 'http://localhost');
    expect(u.searchParams.has('actorId')).toBe(false);
    expect(u.searchParams.get('action')).toBe('x');
  });
});
