import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  unit: string;
  packSize: string | null;
  active: boolean;
  featured: boolean;
  moderationNotes: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ProductDetail = {
  product: ProductRow;
  offers: unknown[];
  category: { id: string; name: string } | null;
  audit: Array<{ id: string; action: string; actorId: string; createdAt: number; before: string | null; after: string | null }>;
};

export type ProductFilters = {
  q?: string;
  categoryId?: string;
  supplierId?: string;
  active?: boolean;
  featured?: boolean;
};

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  active: boolean;
  sortOrder: number;
};

export type BusinessTypeRow = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
};

export function useAdminProducts(filters: ProductFilters) {
  return useInfiniteQuery({
    queryKey: ['admin-products', filters],
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v === undefined || v === '') return;
        qs.set(k, String(v));
      });
      if (pageParam) qs.set('cursor', pageParam);
      const r = await api.get<{ items: ProductRow[]; nextCursor: string | null }>(`/admin/products?${qs}`);
      return r;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useAdminProduct(id: string | null) {
  return useQuery({
    queryKey: ['admin-product', id],
    queryFn: async () => (await api.get<ProductDetail>(`/admin/products/${id}`)) as ProductDetail,
    enabled: id !== null,
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ProductRow> & { expectedUpdatedAt?: number }) =>
      api.patch<ProductRow>(`/admin/products/${id}`, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-product', id] });
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
    },
  });
}

export function useToggleFeatured(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (featured: boolean) =>
      api.post<ProductRow>(`/admin/products/${id}/feature`, { featured }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-product', id] });
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
    },
  });
}

export function useAdminCategories() {
  return useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => (await api.get<CategoryRow[]>('/admin/categories')) as CategoryRow[],
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; name: string; parentId?: string | null }) =>
      api.post<CategoryRow>('/admin/categories', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
  });
}

export function useUpdateCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<{ name: string; parentId: string | null; sortOrder: number; active: boolean }>) =>
      api.patch<CategoryRow>(`/admin/categories/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
  });
}

export function useDeleteCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.del<CategoryRow>(`/admin/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
  });
}

export function useAdminBusinessTypes() {
  return useQuery({
    queryKey: ['admin-business-types'],
    queryFn: async () => (await api.get<BusinessTypeRow[]>('/admin/types/business')) as BusinessTypeRow[],
  });
}

export function useCreateBusinessType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { slug: string; name: string }) =>
      api.post<BusinessTypeRow>('/admin/types/business', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-business-types'] }),
  });
}

export function useUpdateBusinessType(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<{ name: string; active: boolean }>) =>
      api.patch<BusinessTypeRow>(`/admin/types/business/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-business-types'] }),
  });
}

export function useDeleteBusinessType(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => api.del<BusinessTypeRow>(`/admin/types/business/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-business-types'] }),
  });
}
