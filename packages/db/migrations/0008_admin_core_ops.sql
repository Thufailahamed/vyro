-- 0008_admin_core_ops.sql
-- T1: 4-role admin model + invites + audit log.
-- Forward-only. Backfills existing is_platform_admin=1 rows to admin_role='super_admin', then drops the boolean.

ALTER TABLE `users` ADD `admin_role` text;--> statement-breakpoint
ALTER TABLE `users` ADD `admin_invited_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `admin_invited_by` text REFERENCES `users`(`id`);--> statement-breakpoint
UPDATE `users` SET `admin_role` = 'super_admin' WHERE `is_platform_admin` = 1;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `is_platform_admin`;--> statement-breakpoint
CREATE INDEX `users_admin_role_idx` ON `users` (`admin_role`) WHERE `admin_role` IS NOT NULL;--> statement-breakpoint

CREATE TABLE `admin_invites` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `role` text NOT NULL,
  `token_hash` text NOT NULL,
  `invited_by` text NOT NULL REFERENCES `users`(`id`),
  `expires_at` integer NOT NULL,
  `accepted_at` integer,
  `revoked_at` integer,
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `admin_invites_email_idx` ON `admin_invites` (`email`);--> statement-breakpoint
CREATE INDEX `admin_invites_pending_idx` ON `admin_invites` (`expires_at`);--> statement-breakpoint

CREATE TABLE `admin_audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_id` text NOT NULL REFERENCES `users`(`id`),
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `before` text,
  `after` text,
  `request_id` text NOT NULL,
  `ip` text,
  `user_agent` text,
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `admin_audit_logs_created_idx` ON `admin_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_logs_actor_idx` ON `admin_audit_logs` (`actor_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_logs_target_idx` ON `admin_audit_logs` (`target_type`, `target_id`, `created_at`);
