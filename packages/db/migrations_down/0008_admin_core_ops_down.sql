-- 0008_admin_core_ops_down.sql
-- Rollback: drop new tables, re-add is_platform_admin boolean (defaults to 0).
-- NOTE: admin_role values are lost; super_admins must be manually re-marked after rollback.

DROP TABLE `admin_audit_logs`;--> statement-breakpoint
DROP TABLE `admin_invites`;--> statement-breakpoint
DROP INDEX `users_admin_role_idx`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `admin_role`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `admin_invited_at`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `admin_invited_by`;--> statement-breakpoint
ALTER TABLE `users` ADD `is_platform_admin` integer DEFAULT 0 NOT NULL;
