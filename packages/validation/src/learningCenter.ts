import { z } from 'zod';

export const lessonTrackSchema = z.enum(['onboarding', 'operations']);

export const lessonSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  track: lessonTrackSchema,
  orderIndex: z.number().int(),
  isRequiredForPublish: z.boolean(),
  isPublished: z.boolean(),
  articleCompleted: z.boolean(),
  quizPassed: z.boolean(),
});

export const lessonDetailSchema = lessonSummarySchema.extend({
  bodyMarkdown: z.string(),
});

export const quizOptionSchema = z.object({
  id: z.string(),
  orderIndex: z.number().int(),
  label: z.string(),
}); // no isCorrect in supplier-facing payload

export const quizQuestionSchema = z.object({
  id: z.string(),
  orderIndex: z.number().int(),
  prompt: z.string(),
  options: z.array(quizOptionSchema).min(2).max(6),
});

export const quizSchema = z.object({
  id: z.string(),
  passThreshold: z.number().int().min(1),
  questions: z.array(quizQuestionSchema).min(1).max(20),
});

export const learningLessonDetailSchema = z.object({
  lesson: lessonDetailSchema,
  quiz: quizSchema.nullable(),
});

export const learningListQuerySchema = z.object({
  track: lessonTrackSchema.optional(),
});

export const submitQuizSchema = z.object({
  answers: z.array(z.object({ questionId: z.string(), optionId: z.string() })).min(1).max(50),
});

export const quizSubmissionResultSchema = z.object({
  passed: z.boolean(),
  correctCount: z.number().int(),
  total: z.number().int(),
});

export const onboardingGateSchema = z.object({
  required: z.boolean(),
  missing: z.array(z.object({ slug: z.string(), title: z.string() })),
});

export const adminUpsertLessonSchema = z.object({
  slug: z.string().min(2).max(120).regex(/^[a-z0-9-]+$/),
  title: z.string().min(2).max(200),
  summary: z.string().min(2).max(500),
  bodyMarkdown: z.string().min(10).max(100_000),
  track: lessonTrackSchema,
  orderIndex: z.number().int().min(0).max(1000),
  isPublished: z.boolean(),
  isRequiredForPublish: z.boolean(),
});

export const adminUpsertQuizSchema = z.object({
  passThreshold: z.number().int().min(1).max(10),
  questions: z
    .array(
      z.object({
        id: z.string().optional(),
        prompt: z.string().min(3).max(500),
        options: z
          .array(
            z.object({
              id: z.string().optional(),
              label: z.string().min(1).max(300),
              isCorrect: z.boolean(),
            }),
          )
          .min(2)
          .max(6)
          .refine((opts) => opts.filter((o) => o.isCorrect).length === 1, 'exactly one correct option required'),
      }),
    )
    .min(1)
    .max(20),
});

export type LearningTrack = z.infer<typeof lessonTrackSchema>;
export type LessonSummary = z.infer<typeof lessonSummarySchema>;
export type LessonDetail = z.infer<typeof lessonDetailSchema>;
export type QuizSubmissionResult = z.infer<typeof quizSubmissionResultSchema>;
export type OnboardingGate = z.infer<typeof onboardingGateSchema>;