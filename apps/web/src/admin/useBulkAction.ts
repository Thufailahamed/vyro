import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type BulkResult = {
  batchId: string;
  total: number;
  succeeded: string[];
  failed: Array<{ id: string; code: string; message: string }>;
};

export type AdminRole = 'super_admin' | 'ops' | 'finance' | 'support';

function postBulk<TBody, TResult = BulkResult>(
  path: string,
  qc: ReturnType<typeof useQueryClient>,
  invalidateKey: readonly unknown[],
) {
  return useMutation({
    mutationFn: async (body: TBody) =>
      api.post<TResult>(`/admin/bulk/${path}`, body as Record<string, unknown>),
    onSuccess: () => qc.invalidateQueries({ queryKey: invalidateKey }),
  });
}

export function useBulkUsersSuspend(qc: ReturnType<typeof useQueryClient>): UseMutationResult<BulkResult, Error, { ids: string[] }> {
  return postBulk<{ ids: string[] }>('users/suspend', qc, ['admin', 'users']);
}
export function useBulkUsersUnsuspend(qc: ReturnType<typeof useQueryClient>): UseMutationResult<BulkResult, Error, { ids: string[] }> {
  return postBulk<{ ids: string[] }>('users/unsuspend', qc, ['admin', 'users']);
}
export function useBulkUsersRole(qc: ReturnType<typeof useQueryClient>): UseMutationResult<BulkResult, Error, { ids: string[]; role: AdminRole }> {
  return postBulk<{ ids: string[]; role: AdminRole }>('users/role', qc, ['admin', 'users']);
}
export function useBulkBusinessesSuspend(qc: ReturnType<typeof useQueryClient>): UseMutationResult<BulkResult, Error, { ids: string[] }> {
  return postBulk<{ ids: string[] }>('businesses/suspend', qc, ['admin', 'businesses']);
}
export function useBulkBusinessesUnsuspend(qc: ReturnType<typeof useQueryClient>): UseMutationResult<BulkResult, Error, { ids: string[] }> {
  return postBulk<{ ids: string[] }>('businesses/unsuspend', qc, ['admin', 'businesses']);
}
