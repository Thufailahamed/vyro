import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type SearchResults = {
  users?: Array<{ id: string; email: string; name: string; role: string }>;
  suppliers?: Array<{ id: string; name: string; email: string }>;
  businesses?: Array<{ id: string; name: string; email: string }>;
  products?: Array<{ id: string; name: string }>;
  orders?: Array<{ id: string; poNumber: string; status: string }>;
  abuseReports?: Array<{ id: string; reason: string; status: string }>;
};

export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useGlobalSearch(q: string) {
  const debouncedQ = useDebounced(q, 200);
  return useQuery({
    queryKey: ['admin-search', debouncedQ],
    queryFn: async () => {
      if (debouncedQ.length < 2) return {} as SearchResults;
      return (await api.get<SearchResults>(
        `/admin/search?q=${encodeURIComponent(debouncedQ)}`,
      )) as SearchResults;
    },
    enabled: debouncedQ.length >= 2,
    staleTime: 10000,
  });
}
