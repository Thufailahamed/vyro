-- Order lifecycle completion: partial fulfilment, dispute metadata, automation
-- stamps, proof of delivery + tracking, refund provenance, credit release, and
-- returns (RMA). Order statuses are unchanged; everything here is side data.

-- 1. Line-level fulfilment (partial accept).
ALTER TABLE `purchase_order_items` ADD COLUMN `requested_quantity` integer;
--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD COLUMN `fulfilment_status` text NOT NULL DEFAULT 'open';
--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD COLUMN `unavailable_reason` text;
--> statement-breakpoint
UPDATE `purchase_order_items` SET `requested_quantity` = `quantity` WHERE `requested_quantity` IS NULL;
--> statement-breakpoint

-- 2. Order-level lifecycle metadata.
ALTER TABLE `purchase_orders` ADD COLUMN `original_total_cents` integer;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `partially_fulfilled_at` integer;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `cancelled_by_role` text;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `auto_action` text;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `dispute_reason` text;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `dispute_opened_by` text;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `dispute_resolved_at` integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `purchase_orders_status_created_idx` ON `purchase_orders` (`status`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `purchase_orders_status_delivered_idx` ON `purchase_orders` (`status`, `delivered_at`);
--> statement-breakpoint

-- 3. Proof of delivery + tracking.
ALTER TABLE `deliveries` ADD COLUMN `carrier` text;
--> statement-breakpoint
ALTER TABLE `deliveries` ADD COLUMN `tracking_number` text;
--> statement-breakpoint
ALTER TABLE `deliveries` ADD COLUMN `tracking_url` text;
--> statement-breakpoint
ALTER TABLE `deliveries` ADD COLUMN `recipient_name` text;
--> statement-breakpoint
ALTER TABLE `deliveries` ADD COLUMN `pod_photo_key` text;
--> statement-breakpoint
ALTER TABLE `deliveries` ADD COLUMN `pod_note` text;
--> statement-breakpoint
ALTER TABLE `deliveries` ADD COLUMN `pod_captured_by_user_id` text;
--> statement-breakpoint
ALTER TABLE `deliveries` ADD COLUMN `pod_captured_at` integer;
--> statement-breakpoint
ALTER TABLE `deliveries` ADD COLUMN `failed_reason` text;
--> statement-breakpoint

-- 4. Refund provenance + idempotency.
ALTER TABLE `refunds` ADD COLUMN `purchase_order_id` text;
--> statement-breakpoint
ALTER TABLE `refunds` ADD COLUMN `source` text;
--> statement-breakpoint
ALTER TABLE `refunds` ADD COLUMN `source_ref_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `refunds_idempotency_uq` ON `refunds` (`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `refunds_po_idx` ON `refunds` (`purchase_order_id`);
--> statement-breakpoint

-- 5. Credit drawdown release (cancel / partial accept / return).
ALTER TABLE `credit_drawdowns` ADD COLUMN `released_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `credit_drawdowns` ADD COLUMN `released_at` integer;
--> statement-breakpoint

-- 6. Returns (RMA).
CREATE TABLE IF NOT EXISTS `order_returns` (
  `id` text PRIMARY KEY NOT NULL,
  `rma_number` text NOT NULL,
  `purchase_order_id` text NOT NULL,
  `business_id` text NOT NULL,
  `supplier_id` text NOT NULL,
  `status` text NOT NULL DEFAULT 'requested',
  `reason_code` text NOT NULL,
  `reason_note` text,
  `supplier_note` text,
  `rejection_reason` text,
  `requested_by_user_id` text NOT NULL,
  `decided_by_user_id` text,
  `received_by_user_id` text,
  `refund_cents` integer NOT NULL DEFAULT 0,
  `credit_note_invoice_id` text,
  `requested_at` integer NOT NULL,
  `decided_at` integer,
  `received_at` integer,
  `refunded_at` integer,
  `escalated_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `order_returns_rma_uq` ON `order_returns` (`rma_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_returns_po_idx` ON `order_returns` (`purchase_order_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_returns_supplier_status_idx` ON `order_returns` (`supplier_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_returns_business_status_idx` ON `order_returns` (`business_id`, `status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_return_items` (
  `id` text PRIMARY KEY NOT NULL,
  `return_id` text NOT NULL,
  `purchase_order_item_id` text NOT NULL,
  `quantity` integer NOT NULL,
  `approved_quantity` integer,
  `received_quantity` integer,
  `restock` integer NOT NULL DEFAULT 1,
  `unit_refund_cents` integer NOT NULL,
  `condition_note` text,
  FOREIGN KEY (`return_id`) REFERENCES `order_returns`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_return_items_return_idx` ON `order_return_items` (`return_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_return_items_poi_idx` ON `order_return_items` (`purchase_order_item_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_return_attachments` (
  `id` text PRIMARY KEY NOT NULL,
  `return_id` text NOT NULL,
  `r2_key` text NOT NULL,
  `content_type` text,
  `uploaded_by_user_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`return_id`) REFERENCES `order_returns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_return_attachments_return_idx` ON `order_return_attachments` (`return_id`);
--> statement-breakpoint

-- 7. Credit notes: widen the invoice `type` CHECK. SQLite cannot alter a CHECK,
--    so rebuild in an FK-safe order: new parent + new child (pointing at the new
--    parent) -> drop old child -> drop old parent -> rename (SQLite rewrites
--    the child's FK to the renamed parent).
CREATE TABLE `invoice_sequences_new` (
	`supplier_id` text NOT NULL,
	`year` integer NOT NULL,
	`type` text NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY (`supplier_id`, `year`, `type`),
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `invoice_sequences_type_check` CHECK(`type` IN ('receipt','tax_invoice','credit_note'))
);
--> statement-breakpoint
INSERT INTO `invoice_sequences_new` (`supplier_id`, `year`, `type`, `last_number`)
	SELECT `supplier_id`, `year`, `type`, `last_number` FROM `invoice_sequences`;
--> statement-breakpoint
DROP TABLE `invoice_sequences`;
--> statement-breakpoint
ALTER TABLE `invoice_sequences_new` RENAME TO `invoice_sequences`;
--> statement-breakpoint
CREATE TABLE `invoices_new` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL UNIQUE,
	`type` text NOT NULL,
	`payment_id` text,
	`purchase_order_id` text NOT NULL,
	`business_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`issued_at` integer NOT NULL,
	`due_at` integer,
	`html_snapshot` text NOT NULL,
	`pdf_generated_at` integer,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`vat_cents` integer NOT NULL DEFAULT 0,
	`sscl_cents` integer NOT NULL DEFAULT 0,
	`supplier_vat_no` text,
	`buyer_tax_id` text,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `invoices_type_check` CHECK(`type` IN ('receipt','tax_invoice','credit_note'))
);
--> statement-breakpoint
INSERT INTO `invoices_new` (`id`, `number`, `type`, `payment_id`, `purchase_order_id`, `business_id`, `supplier_id`,
	`subtotal_cents`, `tax_cents`, `total_cents`, `currency`, `issued_at`, `due_at`, `html_snapshot`, `pdf_generated_at`,
	`created_by_user_id`, `created_at`, `vat_cents`, `sscl_cents`, `supplier_vat_no`, `buyer_tax_id`)
	SELECT `id`, `number`, `type`, `payment_id`, `purchase_order_id`, `business_id`, `supplier_id`,
	`subtotal_cents`, `tax_cents`, `total_cents`, `currency`, `issued_at`, `due_at`, `html_snapshot`, `pdf_generated_at`,
	`created_by_user_id`, `created_at`, `vat_cents`, `sscl_cents`, `supplier_vat_no`, `buyer_tax_id` FROM `invoices`;
--> statement-breakpoint
CREATE TABLE `invoice_items_new` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cents` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices_new`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `invoice_items_new` (`id`, `invoice_id`, `description`, `quantity`, `unit_cents`, `line_total_cents`)
	SELECT `id`, `invoice_id`, `description`, `quantity`, `unit_cents`, `line_total_cents` FROM `invoice_items`;
--> statement-breakpoint
DROP TABLE `invoice_items`;
--> statement-breakpoint
DROP TABLE `invoices`;
--> statement-breakpoint
ALTER TABLE `invoices_new` RENAME TO `invoices`;
--> statement-breakpoint
ALTER TABLE `invoice_items_new` RENAME TO `invoice_items`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `invoices_po_idx` ON `invoices` (`purchase_order_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `invoices_supplier_issued_idx` ON `invoices` (`supplier_id`, `issued_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `invoices_business_idx` ON `invoices` (`business_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`);
