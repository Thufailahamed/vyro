import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminAlertSeverity = 'info' | 'warning' | 'critical';

export type AdminNotificationRow = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: number | null;
  severity: AdminAlertSeverity;
  sourceRef: string | null;
  createdAt: number;
};

export type InboxFilters = {
  severity?: AdminAlertSeverity[];
  category?: string;
  unreadOnly?: boolean;
  sort?: 'createdAt-desc' | 'createdAt-asc';
};

function buildQuery(f: InboxFilters, cursor?: string): string {
  const qs = new URLSearchParams();
  if (f.severity?.length) qs.set('severity', f.severity.join(','));
  if (f.category) qs.set('category', f.category);
  if (f.unreadOnly) qs.set('unreadOnly', 'true');
  if (f.sort) qs.set('sort', f.sort);
  if (cursor) qs.set('cursor', cursor);
  return qs.toString();
}

export function useAdminNotificationInbox(filters: InboxFilters, cursor?: string) {
  const qs = buildQuery(filters, cursor);
  return useQuery({
    queryKey: ['admin', 'notifications', 'inbox', filters, cursor ?? null],
    queryFn: async () => {
      return await api.get<{ notifications: AdminNotificationRow[]; nextCursor: string | null; unreadCount: number }>(
        `/admin/notifications${qs ? `?${qs}` : ''}`,
      );
    },
  });
}

export function useAdminNotificationUnread(): UseQueryResult<number> {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'notifications', 'unread'],
    queryFn: async () => {
      const r = await api.get<{ count: number }>('/admin/notifications/unread-count');
      return r.count;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') q.refetch(); };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [qc]);
  return q;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin', 'notifications'] });
}

export function useAdminNotificationDismiss() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      api.post<{ ok: true }>(`/admin/notifications/${encodeURIComponent(id)}/read`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAdminNotificationMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      api.post<{ updated: number }>('/admin/notifications/read-all'),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useAdminNotificationBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      role: string;
      severity: AdminAlertSeverity;
      title: string;
      body: string;
      link?: string;
      sourceRef?: string;
    }) => api.post<{ recipients: number }>('/admin/notifications', input),
    onSuccess: () => invalidateAll(qc),
  });
}
