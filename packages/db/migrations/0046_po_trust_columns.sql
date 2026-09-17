-- Trust Signal support: promise timestamp + dispute audit columns on purchase_orders.
-- These columns are added once per environment (migrations runner tracks applied sets).
ALTER TABLE `purchase_orders` ADD COLUMN `delivery_promised_at` integer;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `disputed_at` integer;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `dispute_outcome` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `po_supplier_disputed_idx` ON `purchase_orders` (`supplier_id`, `disputed_at`);
