import { api } from './api';
import {
  learningLessonDetailSchema,
  type LessonSummary,
  type QuizSubmissionResult,
  type OnboardingGate,
  type LearningTrack,
} from '@vyro/validation';

export const learningApi = {
  listLessons(supplierId: string, track?: LearningTrack) {
    const qs = new URLSearchParams({ supplierId });
    if (track) qs.set('track', track);
    return api.get<{ lessons: LessonSummary[] }>(`/supplier/learning?${qs.toString()}`);
  },
  getLesson(supplierId: string, slug: string) {
    const qs = new URLSearchParams({ supplierId });
    return api
      .get<unknown>(`/supplier/learning/${encodeURIComponent(slug)}?${qs.toString()}`)
      .then((raw) => learningLessonDetailSchema.parse(raw));
  },
  completeArticle(supplierId: string, slug: string) {
    const qs = new URLSearchParams({ supplierId });
    return api.post<{ ok: true }>(`/supplier/learning/${encodeURIComponent(slug)}/complete-article?${qs.toString()}`);
  },
  submitQuiz(supplierId: string, slug: string, answers: Array<{ questionId: string; optionId: string }>) {
    const qs = new URLSearchParams({ supplierId });
    return api.post<QuizSubmissionResult>(
      `/supplier/learning/${encodeURIComponent(slug)}/quiz?${qs.toString()}`,
      { answers },
    );
  },
  getGate(supplierId: string) {
    const qs = new URLSearchParams({ supplierId });
    return api.get<OnboardingGate>(`/supplier/learning/gate?${qs.toString()}`);
  },

  // Admin
  adminListLessons() {
    return api.get<{ lessons: Array<Record<string, unknown>> }>(`/admin/learning/lessons`);
  },
  adminCreateLesson(input: Record<string, unknown>) {
    return api.post<{ lesson: Record<string, unknown> }>(`/admin/learning/lessons`, input);
  },
  adminUpdateLesson(id: string, input: Record<string, unknown>) {
    return api.put<{ lesson: Record<string, unknown> }>(`/admin/learning/lessons/${id}`, input);
  },
  adminDeleteLesson(id: string) {
    return api.del<{ ok: true }>(`/admin/learning/lessons/${id}`);
  },
  adminReplaceQuiz(id: string, input: Record<string, unknown>) {
    return api.post<{ ok: true }>(`/admin/learning/lessons/${id}/quiz`, input);
  },
};