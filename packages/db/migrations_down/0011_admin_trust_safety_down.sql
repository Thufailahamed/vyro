-- 0011_admin_trust_safety_down.sql
-- Reversal of T4 schema additions.

DROP INDEX IF EXISTS `kyc_reviews_user_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `kyc_reviews_status_idx`;--> statement-breakpoint
DROP TABLE IF EXISTS `kyc_reviews`;--> statement-breakpoint
DROP INDEX IF EXISTS `abuse_reports_assigned_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `abuse_reports_target_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `abuse_reports_status_idx`;--> statement-breakpoint
DROP TABLE IF EXISTS `abuse_reports`;
