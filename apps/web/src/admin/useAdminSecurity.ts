import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AdminSessionRow = {
  id: string;
  userId: string;
  expiresAt: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  revokedAt: number | null;
  userEmail: string | null;
  userRole: string | null;
};

export type ImpersonationRow = {
  id: string;
  adminUserId: string;
  targetUserId: string;
  reason: string;
  startedAt: number;
  endedAt: number | null;
};

export type DataExportRow = {
  id: string;
  userId: string;
  requestedBy: string;
  status: 'pending' | 'ready' | 'failed' | 'expired';
  downloadUrl: string | null;
  expiresAt: number | null;
  createdAt: number;
};

export function useAdminSessions() {
  return useQuery({
    queryKey: ['admin-sessions'],
    queryFn: async () => (await api.get<AdminSessionRow[]>('/admin/sessions')) as AdminSessionRow[],
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<AdminSessionRow>(`/admin/sessions/${id}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-sessions'] }),
  });
}

export function useCurrentImpersonation() {
  return useQuery({
    queryKey: ['admin-impersonate'],
    queryFn: async () =>
      (await api.get<{ active: ImpersonationRow | null }>('/admin/impersonate')) as {
        active: ImpersonationRow | null;
      },
  });
}

export function useStartImpersonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { targetUserId: string; reason: string }) =>
      api.post<ImpersonationRow>('/admin/impersonate', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-impersonate'] }),
  });
}

export function useEndImpersonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.post<ImpersonationRow>('/admin/impersonate/end', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-impersonate'] }),
  });
}

export function useRequestDataExport() {
  return useMutation({
    mutationFn: async (userId: string) =>
      api.post<DataExportRow>('/admin/data-export', { userId }),
  });
}

export function useDataExportStatus(id: string | null) {
  return useQuery({
    queryKey: ['admin-data-export', id],
    queryFn: async () => {
      if (!id) return null;
      return (await api.get<DataExportRow>(`/admin/data-export/${id}`)) as DataExportRow;
    },
    enabled: id !== null,
    refetchInterval: 5000,
  });
}

export function useEnforce2fa() {
  return useMutation({
    mutationFn: async (userId: string) =>
      api.post<{ before: boolean; after: boolean }>(`/admin/users/${userId}/2fa/enforce`, {}),
  });
}

export function useUnenforce2fa() {
  return useMutation({
    mutationFn: async (userId: string) =>
      api.post<{ before: boolean; after: boolean }>(`/admin/users/${userId}/2fa/unenforce`, {}),
  });
}
