import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learningApi } from '../../../lib/learningApi';

export const adminLearningKeys = {
  list: ['admin', 'learning', 'list'] as const,
};

export function useAdminLessons() {
  return useQuery({ queryKey: adminLearningKeys.list, queryFn: () => learningApi.adminListLessons() });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: adminLearningKeys.list }),
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
  return useMutation({ mutationFn: (input: Record<string, unknown>) => learningApi.adminReplaceQuiz(id, input) });
}