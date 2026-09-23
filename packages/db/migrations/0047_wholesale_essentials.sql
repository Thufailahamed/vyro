-- Wholesale essentials: multi-outlet delivery addresses, saved order lists,
-- VAT/SSCL tax invoices, buyer credit dunning, and an invoice-number repair.

-- 1. Delivery address book (one business, many outlets/warehouses).
CREATE TABLE IF NOT EXISTS `business_addresses` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `label` text NOT NULL,
  `contact_name` text,
  `phone` text,
  `address` text NOT NULL,
  `city` text NOT NULL,
  `district` text NOT NULL,
  `is_default` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `deleted_at` integer,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `business_addresses_biz_idx` ON `business_addresses` (`business_id`, `deleted_at`);
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `delivery_address_id` text;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `delivery_contact_name` text;
--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD COLUMN `delivery_phone` text;
--> statement-breakpoint

-- 2. Saved order lists ("order guides") for repeat staple buying.
CREATE TABLE IF NOT EXISTS `order_lists` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `name` text NOT NULL,
  `created_by_user_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `order_lists_biz_idx` ON `order_lists` (`business_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_list_items` (
  `id` text PRIMARY KEY NOT NULL,
  `list_id` text NOT NULL,
  `supplier_product_id` text NOT NULL,
  `quantity` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`list_id`) REFERENCES `order_lists`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`supplier_product_id`) REFERENCES `supplier_products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `order_list_items_list_sp_uniq` ON `order_list_items` (`list_id`, `supplier_product_id`);
--> statement-breakpoint

-- 3. Tax registration (Sri Lanka VAT + SSCL) and invoice tax snapshot.
ALTER TABLE `supplier_settings` ADD COLUMN `vat_registered` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `supplier_settings` ADD COLUMN `vat_registration_no` text;
--> statement-breakpoint
ALTER TABLE `supplier_settings` ADD COLUMN `sscl_registered` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `vat_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `sscl_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `supplier_vat_no` text;
--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN `buyer_tax_id` text;
--> statement-breakpoint

-- 4. Buyer dunning: remember the last reminder stage sent per drawdown.
ALTER TABLE `credit_drawdowns` ADD COLUMN `last_reminder_stage` text;
--> statement-breakpoint
ALTER TABLE `credit_drawdowns` ADD COLUMN `last_reminder_at` integer;
--> statement-breakpoint

-- 5. Repair: invoice HTML snapshots were rendered before the number was
-- allocated, so printed invoices showed "pending". Substitute the real number.
UPDATE `invoices`
SET `html_snapshot` = REPLACE(
  REPLACE(`html_snapshot`, '<title>pending — ', '<title>' || `number` || ' — '),
  '<div><strong>pending</strong></div>', '<div><strong>' || `number` || '</strong></div>'
)
WHERE `html_snapshot` LIKE '%<strong>pending</strong>%';
