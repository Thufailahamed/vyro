import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  LeadsListQuery,
  LeadRow,
  LeadsListResult,
  CrmSummary,
  LeadNoteRow,
  LeadTag,
  LeadConversionStatus,
  AddNoteInput,
} from '@vyro/validation';

function basePath(supplierId: string) {
  return `/supplier/crm?supplierId=${supplierId}`;
}

function withSupplierId(supplierId: string, query: Record<string, string | number | null | undefined> = {}): string {
  const params = new URLSearchParams({ supplierId });
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== '') params.set(k, String(v));
  }
  return `?${params.toString()}`;
}

export function useLeads(supplierId: string, filter: LeadsListQuery) {
  return useQuery({
    queryKey: ['crm-leads', supplierId, filter],
    queryFn: () =>
      api.get<LeadsListResult>(
        `/supplier/crm/leads${withSupplierId(supplierId, {
          tag: filter.tag,
          status: filter.status,
          from: filter.from,
          to: filter.to,
          limit: filter.limit,
          cursor: filter.cursor,
        })}`,
      ),
    enabled: !!supplierId,
    retry: false,
  });
}

export function useLead(supplierId: string, leadId: string) {
  return useQuery({
    queryKey: ['crm-lead', supplierId, leadId],
    queryFn: () => api.get<{ lead: LeadRow }>(`/supplier/crm/leads/${leadId}${withSupplierId(supplierId)}`),
    enabled: !!supplierId && !!leadId,
    retry: false,
  });
}

export function useCrmSummary(supplierId: string) {
  return useQuery({
    queryKey: ['crm-summary', supplierId],
    queryFn: () => api.get<CrmSummary>(`/supplier/crm/summary${withSupplierId(supplierId)}`),
    enabled: !!supplierId,
    retry: false,
  });
}

export function useLeadNotes(supplierId: string, leadId: string) {
  return useInfiniteQuery({
    queryKey: ['crm-lead-notes', supplierId, leadId],
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: { notes: LeadNoteRow[]; nextCursor: string | null }) =>
      lastPage.nextCursor ?? undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      api.get<{ notes: LeadNoteRow[]; nextCursor: string | null }>(
        `/supplier/crm/leads/${leadId}/notes${withSupplierId(supplierId, { cursor: pageParam, limit: 25 })}`,
      ),
    enabled: !!supplierId && !!leadId,
    retry: false,
  });
}

export function useSetLeadTag(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, tag }: { leadId: string; tag: LeadTag | null }) =>
      api.patch<{ tag: LeadTag | null }>(`/supplier/crm/leads/${leadId}/tag${withSupplierId(supplierId)}`, { tag }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['crm-leads', supplierId] });
      qc.invalidateQueries({ queryKey: ['crm-lead', supplierId, vars.leadId] });
      qc.invalidateQueries({ queryKey: ['crm-summary', supplierId] });
    },
  });
}

export function useSetLeadStatus(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: LeadConversionStatus }) =>
      api.patch<{ status: LeadConversionStatus }>(`/supplier/crm/leads/${leadId}/status${withSupplierId(supplierId)}`, { status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['crm-leads', supplierId] });
      qc.invalidateQueries({ queryKey: ['crm-lead', supplierId, vars.leadId] });
      qc.invalidateQueries({ queryKey: ['crm-summary', supplierId] });
    },
  });
}

export function useAddLeadNote(supplierId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, body }: { leadId: string; body: AddNoteInput['body'] }) =>
      api.post<{ note: LeadNoteRow }>(`/supplier/crm/leads/${leadId}/notes${withSupplierId(supplierId)}`, { body }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['crm-lead-notes', supplierId, vars.leadId] });
      qc.invalidateQueries({ queryKey: ['crm-lead', supplierId, vars.leadId] });
    },
  });
}

