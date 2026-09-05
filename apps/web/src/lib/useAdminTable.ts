import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from './api';

type Page<T> = { rows: T[]; nextCursor: string | undefined };

export function useAdminTable<T>({
  endpoint,
  queryKey,
  params = {},
  rowKey,
}: {
  endpoint: string;
  queryKey: readonly unknown[];
  params?: Record<string, string>;
  rowKey: string;
}) {
  const [filter, setFilter] = useState<Record<string, string>>(params);
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setFilter((f) => ({ ...f, q: searchInput })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const q = useInfiniteQuery<Page<T>>({
    queryKey: [...queryKey, filter],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams(filter);
      if (pageParam) qs.set('cursor', String(pageParam));
      const data = await api.get<Record<string, unknown>>(`${endpoint}?${qs.toString()}`);
      const rows = (data[rowKey] as T[] | undefined) ?? [];
      const nextCursor = (data.nextCursor as string | undefined) ?? undefined;
      const out: Page<T> = { rows, nextCursor };
      return out;
    },
    getNextPageParam: (last: Page<T>) => last.nextCursor,
    initialPageParam: undefined as string | undefined,
  });

  const pages = q.data?.pages ?? [];
  const rows = pages.flatMap((p) => p.rows);
  return {
    rows,
    loading: q.isLoading,
    fetchingMore: q.isFetchingNextPage,
    hasMore: !!q.hasNextPage,
    loadMore: () => {
      if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    },
    filter,
    setFilter,
    searchInput,
    setSearchInput,
  };
}
