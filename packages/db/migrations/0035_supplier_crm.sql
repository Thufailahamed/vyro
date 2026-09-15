-- 0035_supplier_crm.sql
-- VYRO Supplier Lead Manager / CRM: per-(rfq, supplier) tags, notes, conversion tracking.
-- Forward-only, additive. Adds columns on rfq_suppliers + new rfq_supplier_notes table.

ALTER TABLE `rfq_suppliers` ADD COLUMN `tag` text CHECK (`tag` IN ('hot','warm','cold'));
--> statement-breakpoint

ALTER TABLE `rfq_suppliers` ADD COLUMN `conversion_status` text CHECK (`conversion_status` IN ('new','contacted','quoted','won','lost'));
--> statement-breakpoint

ALTER TABLE `rfq_suppliers` ADD COLUMN `quoted_at` integer;
--> statement-breakpoint

ALTER TABLE `rfq_suppliers` ADD COLUMN `order_id` text REFERENCES `purchase_orders`(`id`);
--> statement-breakpoint

ALTER TABLE `rfq_suppliers` ADD COLUMN `order_value_cents` integer;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `rfq_suppliers_supplier_tag_idx` ON `rfq_suppliers` (`supplier_id`, `tag`, `invited_at`);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `rfq_suppliers_supplier_status_idx` ON `rfq_suppliers` (`supplier_id`, `conversion_status`, `invited_at`);
--> statement-breakpoint

CREATE TABLE `rfq_supplier_notes` (
  `id` text PRIMARY KEY NOT NULL,
  `rfq_supplier_id` text NOT NULL REFERENCES `rfq_suppliers`(`id`),
  `body` text NOT NULL CHECK (length(`body`) > 0 AND length(`body`) <= 1000),
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `rfq_supplier_notes_rfq_supplier_idx` ON `rfq_supplier_notes` (`rfq_supplier_id`, `created_at`);