import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { learningApi } from '../../../lib/learningApi';
import type { LearningTrack } from '@vyro/validation';

export const learningKeys = {
  all: ['learning'] as const,
  list: (supplierId: string, track?: LearningTrack) =>
    ['learning', 'list', supplierId, track ?? 'all'] as const,
  detail: (supplierId: string, slug: string) => ['learning', 'detail', supplierId, slug] as const,
  gate: (supplierId: string) => ['learning', 'gate', supplierId] as const,
};

export function useLessons(supplierId: string | undefined, track?: LearningTrack) {
  return useQuery({
    queryKey: supplierId ? learningKeys.list(supplierId, track) : ['learning', 'list', 'none'],
    queryFn: () => learningApi.listLessons(supplierId!, track),
    enabled: !!supplierId,
  });
}

export function useLesson(supplierId: string | undefined, slug: string) {
  return useQuery({
    queryKey: supplierId ? learningKeys.detail(supplierId, slug) : ['learning', 'detail', 'none', slug],
    queryFn: () => learningApi.getLesson(supplierId!, slug),
    enabled: !!supplierId,
  });
}

export function useCompleteArticle(supplierId: string, slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => learningApi.completeArticle(supplierId, slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.detail(supplierId, slug) }),
  });
}

export function useSubmitQuiz(supplierId: string, slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: Array<{ questionId: string; optionId: string }>) =>
      learningApi.submitQuiz(supplierId, slug, answers),
    onSuccess: () => qc.invalidateQueries({ queryKey: learningKeys.detail(supplierId, slug) }),
  });
}

export function useOnboardingGate(supplierId: string | undefined) {
  return useQuery({
    queryKey: supplierId ? learningKeys.gate(supplierId) : ['learning', 'gate', 'none'],
    queryFn: () => learningApi.getGate(supplierId!),
    enabled: !!supplierId,
  });
}