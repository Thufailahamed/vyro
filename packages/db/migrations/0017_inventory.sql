-- 0017_inventory.sql — real inventory model for supplier offers.
--
-- Adds quantity tracking (on-hand + reserved), a low-stock threshold, an
-- opt-in `track_inventory` flag (legacy rows keep manual availability), the
-- stock lifecycle stamps on purchase orders (so reserve/release/commit are
-- idempotent) and an append-only stock movement ledger.

ALTER TABLE `supplier_products` ADD COLUMN `stock_qty` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `supplier_products` ADD COLUMN `reserved_qty` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `supplier_products` ADD COLUMN `low_stock_threshold` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `supplier_products` ADD COLUMN `track_inventory` integer NOT NULL DEFAULT 0;--> statement-breakpoint

ALTER TABLE `purchase_orders` ADD COLUMN `stock_reserved_at` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `stock_released_at` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `stock_committed_at` integer;--> statement-breakpoint

CREATE TABLE `stock_movements` (
  `id` text PRIMARY KEY NOT NULL,
  `supplier_product_id` text NOT NULL REFERENCES `supplier_products`(`id`),
  `supplier_id` text NOT NULL REFERENCES `suppliers`(`id`),
  `reason` text NOT NULL,
  `qty_delta` integer NOT NULL DEFAULT 0,
  `reserved_delta` integer NOT NULL DEFAULT 0,
  `stock_qty_after` integer NOT NULL,
  `reserved_qty_after` integer NOT NULL,
  `purchase_order_id` text REFERENCES `purchase_orders`(`id`),
  `actor_user_id` text REFERENCES `users`(`id`),
  `note` text,
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `stock_movements_offer_idx` ON `stock_movements` (`supplier_product_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_supplier_idx` ON `stock_movements` (`supplier_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_po_idx` ON `stock_movements` (`purchase_order_id`);--> statement-breakpoint

CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`, `created_at`);
