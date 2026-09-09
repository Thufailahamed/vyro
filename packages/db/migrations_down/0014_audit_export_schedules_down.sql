-- 0014_audit_export_schedules_down.sql
DROP INDEX IF EXISTS `audit_export_schedules_active_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `audit_export_schedules_requested_by_idx`;--> statement-breakpoint
DROP TABLE IF EXISTS `audit_export_schedules`;
