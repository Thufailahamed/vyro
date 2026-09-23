import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Shared admin data helpers. Every admin screen talks to the same Worker API
 * as the web (`apps/api`) with paths relative to `/api` — copy endpoints
 * straight from the matching web page under `apps/web/src/admin`.
 */

/** Simple GET query for an admin endpoint. */
export function useAdminGet<T>(key: readonly unknown[], path: string, enabled = true): UseQueryResult<T> {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<T>(path),
    enabled,
    retry: false,
  });
}

export type AdminActionMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Generic admin mutation: POST/PATCH/PUT/DELETE to `path` with `body`,
 * then invalidates every key in `invalidate`.
 */
export function useAdminAction<TRes = { ok: true }>(invalidate: readonly (readonly unknown[])[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body, method = 'POST' }: { path: string; body?: Record<string, unknown>; method?: AdminActionMethod }) => {
      if (method === 'PATCH') return api.patch<TRes>(path, body ?? {});
      if (method === 'PUT') return api.put<TRes>(path, body ?? {});
      if (method === 'DELETE') return api.del<TRes>(path, body ?? {});
      return api.post<TRes>(path, body ?? {});
    },
    onSuccess: () => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

/** Minimal row shapes shared across directory screens. */
export interface DirectoryRow {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  city?: string | null;
  district?: string | null;
  status?: string | null;
  verificationStatus?: string | null;
  createdAt?: number | null;
}

export interface AdminUserRow extends DirectoryRow {
  role?: string | null;
  isAdmin?: boolean;
  adminRole?: string | null;
  suspended?: boolean;
}
