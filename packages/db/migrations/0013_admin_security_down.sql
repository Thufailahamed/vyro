-- 0013_admin_security_down.sql
DROP TABLE IF EXISTS `data_export_requests`;--> statement-breakpoint
DROP INDEX IF EXISTS `admin_impersonations_target_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `admin_impersonations_admin_idx`;--> statement-breakpoint
DROP TABLE IF EXISTS `admin_impersonations`;--> statement-breakpoint

-- Note: SQLite ALTER TABLE DROP COLUMN is not portable; column removals skipped in down.
