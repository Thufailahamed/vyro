-- 0007_payments_accounts.sql
-- Payments + accounts surface: gateway, refunds, payouts, ledger, invoices, idempotency.
-- Forward-only migration. All new tables, additive columns on existing tables.

-- ============================================================================
-- payments: add gateway + fee + idempotency columns
-- ============================================================================
ALTER TABLE `payments` ADD `fee_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `net_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `gateway_ref` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `gateway_payload` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `status_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_uq` ON `payments` (`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
-- Backfill net_cents for any existing rows (amount_cents - fee_cents, both integer cents)
UPDATE `payments` SET `net_cents` = `amount_cents` - `fee_cents` WHERE `net_cents` = 0;

-- ============================================================================
-- supplier_settings: bank account holder + verification flag
-- ============================================================================
ALTER TABLE `supplier_settings` ADD `bank_account_holder` text;--> statement-breakpoint
ALTER TABLE `supplier_settings` ADD `bank_verified` integer DEFAULT 0 NOT NULL;

-- ============================================================================
-- refunds
-- ============================================================================
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`reason` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`gateway_refund_id` text,
	`requested_by_user_id` text NOT NULL,
	`processed_at` integer,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `refunds_payment_idx` ON `refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `refunds_status_idx` ON `refunds` (`status`);

-- ============================================================================
-- payouts
-- ============================================================================
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`paid_at` integer,
	`paid_by_user_id` text,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `payouts_status_check` CHECK(`payouts`.`status` IN ('pending','processing','paid','failed')),
	CONSTRAINT `payouts_method_check` CHECK(`payouts`.`method` IN ('bank','cash'))
);
--> statement-breakpoint
CREATE INDEX `payouts_supplier_status_idx` ON `payouts` (`supplier_id`, `status`);--> statement-breakpoint
CREATE UNIQUE INDEX `payouts_period_uq` ON `payouts` (`supplier_id`, `period_start`, `period_end`);

-- ============================================================================
-- invoices + invoice_sequences + invoice_items
-- ============================================================================
CREATE TABLE `invoice_sequences` (
	`supplier_id` text NOT NULL,
	`year` integer NOT NULL,
	`type` text NOT NULL,
	`last_number` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY (`supplier_id`, `year`, `type`),
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `invoice_sequences_type_check` CHECK(`invoice_sequences`.`type` IN ('receipt','tax_invoice'))
);
--> statement-breakpoint
CREATE TABLE `invoices` (
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
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `invoices_type_check` CHECK(`invoices`.`type` IN ('receipt','tax_invoice'))
);
--> statement-breakpoint
CREATE INDEX `invoices_po_idx` ON `invoices` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `invoices_supplier_issued_idx` ON `invoices` (`supplier_id`, `issued_at`);--> statement-breakpoint
CREATE INDEX `invoices_business_idx` ON `invoices` (`business_id`);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cents` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoice_items_invoice_idx` ON `invoice_items` (`invoice_id`);

-- ============================================================================
-- ledger_entries
-- ============================================================================
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_type` text NOT NULL,
	`account_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`ref_type` text NOT NULL,
	`ref_id` text NOT NULL,
	`description` text NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `ledger_account_type_check` CHECK(`ledger_entries`.`account_type` IN ('supplier','business','platform')),
	CONSTRAINT `ledger_direction_check` CHECK(`ledger_entries`.`direction` IN ('debit','credit')),
	CONSTRAINT `ledger_ref_type_check` CHECK(`ledger_entries`.`ref_type` IN ('payment','refund','payout','fee','adjustment'))
);
--> statement-breakpoint
CREATE INDEX `ledger_account_idx` ON `ledger_entries` (`account_type`, `account_id`, `created_at`);--> statement-breakpoint
CREATE INDEX `ledger_ref_idx` ON `ledger_entries` (`ref_type`, `ref_id`);

-- ============================================================================
-- payment_idempotency_keys
-- ============================================================================
CREATE TABLE `payment_idempotency_keys` (
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text NOT NULL,
	`status_code` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY (`key`, `user_id`)
);
