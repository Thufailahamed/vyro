-- 0039_learning_center.sql
-- Supplier learning/training center: lessons, quizzes, progress, first-publish gate flag.
-- Forward-only, additive.

CREATE TABLE `learning_lessons` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL UNIQUE,
  `title` text NOT NULL,
  `summary` text NOT NULL,
  `body_markdown` text NOT NULL,
  `track` text NOT NULL CHECK(track IN ('onboarding','operations')),
  `order_index` integer NOT NULL,
  `is_published` integer NOT NULL DEFAULT 0,
  `is_required_for_publish` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX `learning_lessons_track_order_idx` ON `learning_lessons` (`track`, `order_index`);
--> statement-breakpoint

CREATE INDEX `learning_lessons_published_idx` ON `learning_lessons` (`is_published`, `track`);
--> statement-breakpoint

CREATE TABLE `learning_quizzes` (
  `id` text PRIMARY KEY NOT NULL,
  `lesson_id` text NOT NULL UNIQUE REFERENCES `learning_lessons`(`id`) ON DELETE CASCADE,
  `pass_threshold` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

CREATE TABLE `learning_quiz_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `quiz_id` text NOT NULL REFERENCES `learning_quizzes`(`id`) ON DELETE CASCADE,
  `order_index` integer NOT NULL,
  `prompt` text NOT NULL
);
--> statement-breakpoint

CREATE INDEX `learning_quiz_questions_quiz_idx` ON `learning_quiz_questions` (`quiz_id`, `order_index`);
--> statement-breakpoint

CREATE TABLE `learning_quiz_options` (
  `id` text PRIMARY KEY NOT NULL,
  `question_id` text NOT NULL REFERENCES `learning_quiz_questions`(`id`) ON DELETE CASCADE,
  `order_index` integer NOT NULL,
  `label` text NOT NULL,
  `is_correct` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint

CREATE INDEX `learning_quiz_options_question_idx` ON `learning_quiz_options` (`question_id`, `order_index`);
--> statement-breakpoint

CREATE TABLE `learning_progress` (
  `id` text PRIMARY KEY NOT NULL,
  `supplier_id` text NOT NULL REFERENCES `suppliers`(`id`) ON DELETE CASCADE,
  `lesson_id` text NOT NULL REFERENCES `learning_lessons`(`id`) ON DELETE CASCADE,
  `article_completed_at` integer,
  `quiz_passed_at` integer,
  `attempts` integer NOT NULL DEFAULT 0,
  UNIQUE(`supplier_id`, `lesson_id`)
);
--> statement-breakpoint

CREATE INDEX `learning_progress_supplier_idx` ON `learning_progress` (`supplier_id`);
--> statement-breakpoint

ALTER TABLE `suppliers` ADD COLUMN `onboarding_gate_cleared_at` integer;