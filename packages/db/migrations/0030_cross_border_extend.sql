-- 0030_cross_border_extend.sql
-- Cross-border trade extensions on suppliers, businesses, products, purchase_orders.
-- Forward-only migration. Additive; preserves existing data.

-- ============================================================================
-- suppliers: country + tax_id + export eligibility + default incoterms + HS
-- ============================================================================
ALTER TABLE `suppliers` ADD `country_code` text DEFAULT 'LK' NOT NULL;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `tax_id` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `is_export_eligible` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `default_incoterms` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `default_hs_code` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `default_country_of_origin` text;--> statement-breakpoint
CREATE INDEX `suppliers_country_idx` ON `suppliers` (`country_code`);--> statement-breakpoint

-- ============================================================================
-- businesses (buyers): country + tax_id + KYC
-- ============================================================================
ALTER TABLE `businesses` ADD `country_code` text DEFAULT 'LK' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `tax_id` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `kyc_level` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `kyc_verified_at` integer;--> statement-breakpoint
ALTER TABLE `businesses` ADD `kyc_verified_by` text;--> statement-breakpoint
CREATE INDEX `businesses_country_idx` ON `businesses` (`country_code`);--> statement-breakpoint

-- ============================================================================
-- products: HS code + country of origin + export-controlled flag
-- ============================================================================
ALTER TABLE `products` ADD `hs_code` text;--> statement-breakpoint
ALTER TABLE `products` ADD `country_of_origin` text;--> statement-breakpoint
ALTER TABLE `products` ADD `is_export_controlled` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `products_hs_idx` ON `products` (`hs_code`);--> statement-breakpoint

-- ============================================================================
-- purchase_orders: direction + incoterms + FX + customs + wire
-- ============================================================================
ALTER TABLE `purchase_orders` ADD `direction` text DEFAULT 'domestic' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `incoterms` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `fx_snapshot_id` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `declared_shipping_cost_cents` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `declared_duty_cents` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `commercial_invoice_no` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `customs_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `wire_ref` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `wire_received_amount_cents` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `wire_received_currency` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `wire_received_at` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `wire_received_by` text;--> statement-breakpoint
CREATE INDEX `purchase_orders_direction_idx` ON `purchase_orders` (`direction`);--> statement-breakpoint
CREATE INDEX `purchase_orders_customs_status_idx` ON `purchase_orders` (`customs_status`);