import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learningApi } from '../../../lib/learningApi';

export const adminLearningKeys = {
  list: ['admin', 'learning', 'list'] as const,
  detail: (id: string) => ['admin', 'learning', 'detail', id] as const,
};

export function useAdminLessons() {
  return useQuery({ queryKey: adminLearningKeys.list, queryFn: () => learningApi.adminListLessons() });
}

export function useAdminLesson(id: string | undefined) {
  return useQuery({
    queryKey: adminLearningKeys.detail(id ?? ''),
    queryFn: () => learningApi.adminGetLesson(id!),
    enabled: Boolean(id),
  });
}

export function useAdminCreateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => learningApi.adminCreateLesson(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminLearningKeys.list }),
  });
}

export function useAdminUpdateLesson(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => learningApi.adminUpdateLesson(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminLearningKeys.list });
      void qc.invalidateQueries({ queryKey: adminLearningKeys.detail(id) });
    },
  });
}

export function useAdminDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => learningApi.adminDeleteLesson(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminLearningKeys.list }),
  });
}

export function useAdminReplaceQuiz(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => learningApi.adminReplaceQuiz(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminLearningKeys.detail(id) }),
  });
}
