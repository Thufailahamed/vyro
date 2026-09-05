import { useInfiniteQuery } from '@tanstack/react-query';

export type AuditEntry = {
  id: string;
  actorId: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: string | null;
  after: string | null;
  requestId: string;
  ip: string | null;
  createdAt: number;
};

export type AuditFilters = {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: number;
  to?: number;
};

export function useAdminAudit(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ['admin-audit', filters],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v));
      });
      if (pageParam) qs.set('cursor', pageParam);
      const r = await fetch(`/api/admin/audit?${qs.toString()}`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error('Failed');
      return (await r.json()) as { entries: AuditEntry[]; nextCursor: string | null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function auditCsvUrl(filters: AuditFilters): string {
  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  qs.set('limit', '1000');
  return `/api/admin/audit/export?${qs.toString()}`;
}
