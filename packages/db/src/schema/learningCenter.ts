import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';

export const learningLessons = sqliteTable(
  'learning_lessons',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    track: text('track', { enum: ['onboarding', 'operations'] }).notNull(),
    orderIndex: integer('order_index').notNull(),
    isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
    isRequiredForPublish: integer('is_required_for_publish', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    trackOrderIdx: index('learning_lessons_track_order_idx').on(t.track, t.orderIndex),
    publishedIdx: index('learning_lessons_published_idx').on(t.isPublished, t.track),
  }),
);

export const learningQuizzes = sqliteTable('learning_quizzes', {
  id: text('id').primaryKey(),
  lessonId: text('lesson_id').notNull().unique().references(() => learningLessons.id, { onDelete: 'cascade' }),
  passThreshold: integer('pass_threshold').notNull().default(1),
  createdAt: integer('created_at').notNull(),
});

export const learningQuizQuestions = sqliteTable(
  'learning_quiz_questions',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id').notNull().references(() => learningQuizzes.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    prompt: text('prompt').notNull(),
  },
  (t) => ({
    quizIdx: index('learning_quiz_questions_quiz_idx').on(t.quizId, t.orderIndex),
  }),
);

export const learningQuizOptions = sqliteTable(
  'learning_quiz_options',
  {
    id: text('id').primaryKey(),
    questionId: text('question_id').notNull().references(() => learningQuizQuestions.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull(),
    label: text('label').notNull(),
    isCorrect: integer('is_correct', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => ({
    questionIdx: index('learning_quiz_options_question_idx').on(t.questionId, t.orderIndex),
  }),
);

export const learningProgress = sqliteTable(
  'learning_progress',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull().references(() => learningLessons.id, { onDelete: 'cascade' }),
    articleCompletedAt: integer('article_completed_at'),
    quizPassedAt: integer('quiz_passed_at'),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => ({
    supplierLessonUniq: uniqueIndex('learning_progress_supplier_lesson_uniq').on(t.supplierId, t.lessonId),
    supplierIdx: index('learning_progress_supplier_idx').on(t.supplierId),
  }),
);

export type LearningLesson = typeof learningLessons.$inferSelect;
export type NewLearningLesson = typeof learningLessons.$inferInsert;
export type LearningProgress = typeof learningProgress.$inferSelect;