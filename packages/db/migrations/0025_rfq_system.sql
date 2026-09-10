-- 0025_rfq_system.sql
-- RFQ & supplier quotation system. Normalized tables mirroring PO conventions
-- (text PKs via newId(), epoch-ms integer timestamps, money in cents).

CREATE TABLE `rfqs` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `created_by_user_id` text NOT NULL,
  `rfq_number` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text DEFAULT 'draft' NOT NULL,
  `currency` text DEFAULT 'LKR' NOT NULL,
  `deadline` integer,
  `delivery_location` text,
  `delivery_city` text,
  `delivery_district` text,
  `required_delivery_date` integer,
  `delivery_requirements` text,
  `payment_method` text,
  `payment_terms` text,
  `specifications` text,
  `packaging_requirements` text,
  `quality_requirements` text,
  `brand_preferences` text,
  `notes` text,
  `is_open` integer DEFAULT 0 NOT NULL,
  `recurrence_rule` text,
  `template_id` text,
  `awarded_quote_id` text,
  `converted_po_id` text,
  `version` integer DEFAULT 1 NOT NULL,
  `published_at` integer,
  `awarded_at` integer,
  `closed_at` integer,
  `cancelled_at` integer,
  `expired_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rfqs_number_uniq` ON `rfqs` (`rfq_number`);--> statement-breakpoint
CREATE INDEX `rfqs_business_status_idx` ON `rfqs` (`business_id`, `status`);--> statement-breakpoint
CREATE INDEX `rfqs_deadline_idx` ON `rfqs` (`deadline`, `status`);--> statement-breakpoint

CREATE TABLE `rfq_items` (
  `id` text PRIMARY KEY NOT NULL,
  `rfq_id` text NOT NULL,
  `product_id` text,
  `supplier_product_id` text,
  `description` text NOT NULL,
  `quantity` integer NOT NULL,
  `unit` text DEFAULT 'kg' NOT NULL,
  `target_price_cents` integer,
  `specifications` text,
  `required_date` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`supplier_product_id`) REFERENCES `supplier_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rfq_items_rfq_idx` ON `rfq_items` (`rfq_id`);--> statement-breakpoint

CREATE TABLE `rfq_suppliers` (
  `id` text PRIMARY KEY NOT NULL,
  `rfq_id` text NOT NULL,
  `supplier_id` text NOT NULL,
  `status` text DEFAULT 'invited' NOT NULL,
  `invited_at` integer NOT NULL,
  `viewed_at` integer,
  `responded_at` integer,
  FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rfq_suppliers_uniq` ON `rfq_suppliers` (`rfq_id`, `supplier_id`);--> statement-breakpoint
CREATE INDEX `rfq_suppliers_supplier_idx` ON `rfq_suppliers` (`supplier_id`, `status`);--> statement-breakpoint

CREATE TABLE `supplier_quotes` (
  `id` text PRIMARY KEY NOT NULL,
  `rfq_id` text NOT NULL,
  `supplier_id` text NOT NULL,
  `created_by_user_id` text NOT NULL,
  `quote_number` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `currency` text DEFAULT 'LKR' NOT NULL,
  `subtotal_cents` integer DEFAULT 0 NOT NULL,
  `delivery_fee_cents` integer DEFAULT 0 NOT NULL,
  `tax_cents` integer DEFAULT 0 NOT NULL,
  `discount_cents` integer DEFAULT 0 NOT NULL,
  `total_cents` integer DEFAULT 0 NOT NULL,
  `valid_until` integer,
  `estimated_delivery_date` integer,
  `payment_terms` text,
  `minimum_quantity` text,
  `availability` text,
  `notes` text,
  `is_partial` integer DEFAULT 0 NOT NULL,
  `version` integer DEFAULT 1 NOT NULL,
  `supersedes_id` text,
  `submitted_at` integer,
  `accepted_at` integer,
  `rejected_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_quotes_number_uniq` ON `supplier_quotes` (`quote_number`);--> statement-breakpoint
CREATE INDEX `supplier_quotes_rfq_idx` ON `supplier_quotes` (`rfq_id`, `supplier_id`, `status`);--> statement-breakpoint

CREATE TABLE `supplier_quote_items` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `rfq_item_id` text,
  `product_id` text,
  `supplier_product_id` text,
  `description` text NOT NULL,
  `quantity` integer NOT NULL,
  `unit` text DEFAULT 'kg' NOT NULL,
  `unit_price_cents` integer NOT NULL,
  `discount_cents` integer DEFAULT 0 NOT NULL,
  `subtotal_cents` integer NOT NULL,
  `available_quantity` integer,
  `estimated_delivery_date` integer,
  `is_alternative` integer DEFAULT 0 NOT NULL,
  `alternative_for_rfq_item_id` text,
  `alternative_accepted` integer DEFAULT 0 NOT NULL,
  `specification` text,
  `notes` text,
  FOREIGN KEY (`quote_id`) REFERENCES `supplier_quotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplier_quote_items_quote_idx` ON `supplier_quote_items` (`quote_id`);--> statement-breakpoint

CREATE TABLE `quote_price_tiers` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_item_id` text NOT NULL,
  `min_qty` integer NOT NULL,
  `unit_price_cents` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`quote_item_id`) REFERENCES `supplier_quote_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quote_price_tiers_item_idx` ON `quote_price_tiers` (`quote_item_id`, `min_qty`);--> statement-breakpoint

CREATE TABLE `quote_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `version` integer NOT NULL,
  `changed_by_user_id` text NOT NULL,
  `previous_total_cents` integer,
  `new_total_cents` integer NOT NULL,
  `changes_json` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`quote_id`) REFERENCES `supplier_quotes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quote_versions_quote_idx` ON `quote_versions` (`quote_id`, `version`);--> statement-breakpoint

CREATE TABLE `quote_counter_offers` (
  `id` text PRIMARY KEY NOT NULL,
  `quote_id` text NOT NULL,
  `rfq_id` text NOT NULL,
  `offered_by_type` text NOT NULL,
  `offered_by_user_id` text NOT NULL,
  `proposed_total_cents` integer NOT NULL,
  `proposed_unit_prices_json` text,
  `message` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `responded_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`quote_id`) REFERENCES `supplier_quotes`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quote_counters_quote_idx` ON `quote_counter_offers` (`quote_id`, `created_at`);--> statement-breakpoint

CREATE TABLE `quote_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `rfq_id` text NOT NULL,
  `quote_id` text,
  `sender_type` text NOT NULL,
  `sender_user_id` text NOT NULL,
  `message` text NOT NULL,
  `attachment_r2_key` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quote_messages_rfq_idx` ON `quote_messages` (`rfq_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `quote_messages_quote_idx` ON `quote_messages` (`quote_id`, `created_at`);--> statement-breakpoint

CREATE TABLE `rfq_events` (
  `id` text PRIMARY KEY NOT NULL,
  `rfq_id` text NOT NULL,
  `quote_id` text,
  `actor_user_id` text,
  `action` text NOT NULL,
  `from_status` text,
  `to_status` text,
  `metadata_json` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rfq_events_rfq_idx` ON `rfq_events` (`rfq_id`, `created_at`);--> statement-breakpoint

CREATE TABLE `rfq_documents` (
  `id` text PRIMARY KEY NOT NULL,
  `rfq_id` text NOT NULL,
  `quote_id` text,
  `uploaded_by_user_id` text NOT NULL,
  `r2_key` text NOT NULL,
  `file_name` text NOT NULL,
  `mime_type` text,
  `size_bytes` integer,
  `kind` text DEFAULT 'specification' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`rfq_id`) REFERENCES `rfqs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rfq_documents_rfq_idx` ON `rfq_documents` (`rfq_id`);--> statement-breakpoint

CREATE TABLE `rfq_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `created_by_user_id` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `delivery_location` text,
  `payment_terms` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rfq_templates_business_idx` ON `rfq_templates` (`business_id`);--> statement-breakpoint

CREATE TABLE `rfq_template_items` (
  `id` text PRIMARY KEY NOT NULL,
  `template_id` text NOT NULL,
  `product_id` text,
  `description` text NOT NULL,
  `quantity` integer NOT NULL,
  `unit` text DEFAULT 'kg' NOT NULL,
  `target_price_cents` integer,
  `specifications` text,
  FOREIGN KEY (`template_id`) REFERENCES `rfq_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rfq_template_items_template_idx` ON `rfq_template_items` (`template_id`);--> statement-breakpoint

ALTER TABLE `platform_settings` ADD COLUMN `rfq_value_threshold_cents` integer DEFAULT 100000;--> statement-breakpoint
ALTER TABLE `platform_settings` ADD COLUMN `rfq_quantity_threshold` integer DEFAULT 500;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `rfq_id` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `quote_id` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `po_rfq_idx` ON `purchase_orders` (`rfq_id`);
