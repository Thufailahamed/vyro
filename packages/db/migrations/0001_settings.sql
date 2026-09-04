CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`phone` text,
	`preferred_currency` text DEFAULT 'LKR' NOT NULL,
	`notify_order_updates` integer DEFAULT 1 NOT NULL,
	`notify_messages` integer DEFAULT 1 NOT NULL,
	`notify_marketing` integer DEFAULT 0 NOT NULL,
	`two_factor_enabled` integer DEFAULT 0 NOT NULL,
	`session_timeout_min` integer DEFAULT 1440 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`brand_name` text DEFAULT 'VYRO' NOT NULL,
	`support_email` text,
	`support_phone` text,
	`default_currency` text DEFAULT 'LKR' NOT NULL,
	`platform_fee_bps` integer DEFAULT 250 NOT NULL,
	`enable_business_signup` integer DEFAULT 1 NOT NULL,
	`enable_supplier_signup` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by_user_id` text,
	CONSTRAINT "platform_settings_singleton" CHECK("platform_settings"."id" = 1),
	CONSTRAINT "platform_settings_fee_range" CHECK("platform_settings"."platform_fee_bps" >= 0 AND "platform_settings"."platform_fee_bps" <= 1000)
);
--> statement-breakpoint
CREATE TABLE `supplier_settings` (
	`supplier_id` text PRIMARY KEY NOT NULL,
	`company_name` text,
	`registration_no` text,
	`tax_id` text,
	`contact_email` text,
	`contact_phone` text,
	`warehouse_address` text,
	`warehouse_city` text,
	`warehouse_district` text,
	`warehouse_lat` real,
	`warehouse_lng` real,
	`default_lead_time_days` integer,
	`payout_method` text,
	`bank_name` text,
	`bank_account_no` text,
	`bank_branch` text,
	`notify_new_orders` integer DEFAULT 1 NOT NULL,
	`notify_low_stock` integer DEFAULT 1 NOT NULL,
	`notify_payment_received` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "supplier_settings_payout_method_check" CHECK("supplier_settings"."payout_method" IS NULL OR "supplier_settings"."payout_method" IN ('bank','cash'))
);
--> statement-breakpoint
INSERT INTO `platform_settings` (`id`, `brand_name`, `default_currency`, `platform_fee_bps`, `enable_business_signup`, `enable_supplier_signup`, `updated_at`) VALUES (1, 'VYRO', 'LKR', 250, 1, 1, CAST(strftime('%s','now')*1000 AS INTEGER));
