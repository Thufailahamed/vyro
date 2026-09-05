-- 0014_audit_export_schedules.sql
CREATE TABLE `audit_export_schedules` (
  `id` text PRIMARY KEY NOT NULL,
  `requested_by` text NOT NULL REFERENCES `users`(`id`),
  `frequency` text NOT NULL,
  `email` text NOT NULL,
  `format` text NOT NULL DEFAULT 'csv',
  `next_run_at` integer NOT NULL,
  `active` integer NOT NULL DEFAULT 1,
  `last_run_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `audit_export_schedules_active_idx` ON `audit_export_schedules` (`active`, `next_run_at`);--> statement-breakpoint
CREATE INDEX `audit_export_schedules_requested_by_idx` ON `audit_export_schedules` (`requested_by`);
