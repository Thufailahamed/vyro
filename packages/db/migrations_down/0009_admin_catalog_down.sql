-- 0009_admin_catalog_down.sql
-- T2 rollback.

DROP INDEX IF EXISTS `products_featured_idx`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `moderation_notes`;--> statement-breakpoint
ALTER TABLE `products` DROP COLUMN `featured`;
