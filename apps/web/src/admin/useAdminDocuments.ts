// apps/web/src/admin/useAdminDocuments.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CaseDocument = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
};

export function useCaseDocuments(kycId: string | null) {
  return useQuery({
    queryKey: ['admin-case-docs', kycId],
    queryFn: () => api.get<{ documents: CaseDocument[] }>(`/admin/kyc/${kycId}/documents`),
    enabled: Boolean(kycId),
  });
}

export function previewUrl(id: string, download = false) {
  return `/api/admin/documents/${id}/preview${download ? '?download=1' : ''}`;
}
