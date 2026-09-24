import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

type Page<T> = { rows: T[]; nextCursor: string | undefined };

/**
 * Mobile port of the web's `useAdminTable`: cursor-paginated admin list with a
 * debounced `q` search and free-form filters.
 */
export function useAdminList<T>({
  endpoint,
  queryKey,
  rowKey,
  initialFilter = {},
  enabled = true,
}: {
  endpoint: string;
  queryKey: readonly unknown[];
  /** Response key holding the rows; pass fallbacks (e.g. ['users', 'items']). */
  rowKey: string | string[];
  initialFilter?: Record<string, string>;
  enabled?: boolean;
}) {
  const [filter, setFilter] = useState<Record<string, string>>(initialFilter);
  const [searchInput, setSearchInput] = useState('');
  const q = useDebounced(searchInput, 300);
  const merged = useMemo(() => ({ ...filter, q }), [filter, q]);
  const keys = useMemo(() => (Array.isArray(rowKey) ? rowKey : [rowKey]), [rowKey]);

  const query = useInfiniteQuery<Page<T>>({
    queryKey: [...queryKey, merged],
    enabled,
    queryFn: async ({ pageParam }) => {
      const data = await api.get<Record<string, unknown>>(endpoint + qs({ ...merged, cursor: pageParam as string | undefined }));
      const rows = keys.map((k) => data?.[k]).find(Array.isArray) as T[] | undefined;
      return {
        rows: rows ?? [],
        nextCursor: (data?.nextCursor as string | undefined) ?? undefined,
      };
    },
    getNextPageParam: (last) => last.nextCursor,
    initialPageParam: undefined as string | undefined,
  });

  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.rows), [query.data]);
  return {
    query,
    rows,
    loading: query.isLoading,
    error: query.isError ? query.error : null,
    fetchingMore: query.isFetchingNextPage,
    hasMore: !!query.hasNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refetch: () => query.refetch(),
    filter,
    setFilter,
    searchInput,
    setSearchInput,
  };
}

/** Unread count for the admin bell (same endpoint + key as the web). */
export function useAdminUnreadCount() {
  return useQuery({
    queryKey: ['admin', 'notifications', 'unread'],
    queryFn: async () => (await api.get<{ count: number }>('/admin/notifications/unread-count'))?.count ?? 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  });
}

/* ------------------------------- Bulk actions ------------------------------ */

export type BulkResult = {
  batchId: string;
  total: number;
  succeeded: string[];
  failed: { id: string; code: string; message: string }[];
};

/** POST /admin/bulk/<path>; invalidates every key in `invalidate` on success. */
export function useBulk<TBody extends Record<string, unknown>>(path: string, invalidate: readonly (readonly unknown[])[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TBody) => api.post<BulkResult>(`/admin/bulk/${path}`, body),
    onSuccess: () => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

/** Set-based multi-select used by list screens' select mode. */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState(false);
  return {
    mode,
    selected,
    count: selected.size,
    ids: [...selected],
    has: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    setAll: (ids: string[]) => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
    start: () => setMode(true),
    stop: () => {
      setMode(false);
      setSelected(new Set());
    },
  };
}
export type Selection = ReturnType<typeof useSelection>;
