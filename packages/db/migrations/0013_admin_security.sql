-- 0013_admin_security.sql
-- T6: admin impersonations + data export requests + 2FA enforcement columns.

CREATE TABLE `admin_impersonations` (
  `id` text PRIMARY KEY NOT NULL,
  `admin_user_id` text NOT NULL REFERENCES `users`(`id`),
  `target_user_id` text NOT NULL REFERENCES `users`(`id`),
  `reason` text NOT NULL,
  `started_at` integer NOT NULL,
  `ended_at` integer,
  `ip` text,
  `user_agent` text
);--> statement-breakpoint
CREATE INDEX `admin_impersonations_admin_idx` ON `admin_impersonations` (`admin_user_id`);--> statement-breakpoint
CREATE INDEX `admin_impersonations_target_idx` ON `admin_impersonations` (`target_user_id`);--> statement-breakpoint

CREATE TABLE `data_export_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `requested_by` text NOT NULL REFERENCES `users`(`id`),
  `status` text NOT NULL DEFAULT 'pending',
  `download_url` text,
  `expires_at` integer,
  `created_at` integer NOT NULL
);--> statement-breakpoint

ALTER TABLE `users` ADD `require_2fa` integer NOT NULL DEFAULT 0;--> statement-breakpoint

ALTER TABLE `sessions` ADD `revoked_by_admin_id` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `revoked_reason` text;--> statement-breakpoint
ALTER TABLE `sessions` ADD `revoked_at` integer;
