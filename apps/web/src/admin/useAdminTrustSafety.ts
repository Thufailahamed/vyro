import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AbuseReportRow = {
  id: string;
  reporterUserId: string | null;
  targetType: 'user' | 'business' | 'supplier' | 'product' | 'review';
  targetId: string;
  reason: 'spam' | 'fraud' | 'harassment' | 'misinformation' | 'other';
  details: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
  assignedTo: string | null;
  resolutionNotes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type KycReviewRow = {
  id: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_more_info';
  documentsJson: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
};

export function useAbuseReports(opts: { status?: string; assignedTo?: string }) {
  return useQuery({
    queryKey: ['admin-abuse-reports', opts],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (opts.status) qs.set('status', opts.status);
      if (opts.assignedTo) qs.set('assignedTo', opts.assignedTo);
      const out = (await api.get<{ items: AbuseReportRow[]; nextCursor: string | null }>(
        `/admin/abuse-reports?${qs}`,
      )) as { items: AbuseReportRow[]; nextCursor: string | null };
      return out.items;
    },
  });
}

export function useClaimReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<AbuseReportRow>(`/admin/abuse-reports/${id}/claim`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-abuse-reports'] }),
  });
}

export function useAddReportNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { id: string; note: string }) =>
      api.post<{ ok: true }>(`/admin/abuse-reports/${body.id}/notes`, { note: body.note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-abuse-reports'] }),
  });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { id: string; resolution: 'resolved' | 'dismissed'; notes?: string }) =>
      api.post<AbuseReportRow>(`/admin/abuse-reports/${body.id}/resolve`, {
        resolution: body.resolution,
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-abuse-reports'] }),
  });
}

export function useTakedown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<AbuseReportRow>(`/admin/abuse-reports/${id}/takedown`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-abuse-reports'] }),
  });
}

export function useKycReviews(opts: { status?: string }) {
  return useQuery({
    queryKey: ['admin-kyc', opts],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (opts.status) qs.set('status', opts.status);
      const out = (await api.get<{ items: KycReviewRow[]; nextCursor: string | null }>(
        `/admin/kyc?${qs}`,
      )) as { items: KycReviewRow[]; nextCursor: string | null };
      return out.items;
    },
  });
}

export function useKycDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { id: string; decision: 'approved' | 'rejected' | 'needs_more_info'; notes?: string }) =>
      api.post<KycReviewRow>(`/admin/kyc/${body.id}/decision`, {
        decision: body.decision,
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-kyc'] }),
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<{ ok: true }>(`/admin/users/${id}/suspend`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useUnsuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.post<{ ok: true }>(`/admin/users/${id}/unsuspend`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}
