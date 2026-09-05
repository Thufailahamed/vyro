-- 0009_admin_catalog.sql
-- T2: catalog moderation columns. Forward-only. Adds product.featured + .moderation_notes.

ALTER TABLE `products` ADD `featured` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `products` ADD `moderation_notes` text;--> statement-breakpoint
CREATE INDEX `products_featured_idx` ON `products` (`featured`) WHERE `featured` = 1;
