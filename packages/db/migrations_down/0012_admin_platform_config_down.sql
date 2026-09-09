-- 0012_admin_platform_config_down.sql
DROP INDEX IF EXISTS `webhook_deliveries_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `webhook_deliveries_webhook_idx`;--> statement-breakpoint
DROP TABLE IF EXISTS `webhook_deliveries`;--> statement-breakpoint
DROP INDEX IF EXISTS `webhooks_active_idx`;--> statement-breakpoint
DROP TABLE IF EXISTS `webhooks`;--> statement-breakpoint
DROP TABLE IF EXISTS `config_sections`;
