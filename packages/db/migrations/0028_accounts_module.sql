-- 0028_accounts_module.sql
-- Accounts / Financial Management module: payment attempts + allocations,
-- COD collections, bank transfers, commission rules, supplier earnings,
-- settlements, supplier bank accounts, financial adjustments, reconciliation
-- exceptions, and additive columns on payments/refunds/payouts/ledger.
-- Forward-only migration. Additive; preserves existing data.

-- ============================================================================
-- payments: human-readable numbers, denormalized parties, provider refs,
-- full lifecycle timestamps (spec §5). Status/method stay free-form TEXT
-- (no DB CHECK), so canonical PAYHERE/COD/BANK_TRANSFER + extended statuses
-- need no constraint change.
-- ============================================================================
ALTER TABLE `payments` ADD `payment_number` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `business_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `supplier_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `provider` text DEFAULT 'payhere' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `provider_reference` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `provider_transaction_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `initiated_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `authorized_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `failed_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `cancelled_at` integer;--> statement-breakpoint
ALTER TABLE `payments` ADD `expired_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `payments_number_uq` ON `payments` (`payment_number`) WHERE `payment_number` IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payments_business_idx` ON `payments` (`business_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payments_supplier_idx` ON `payments` (`supplier_id`);--> statement-breakpoint

-- ============================================================================
-- refunds: numbers, approval workflow, explainable accounting splits
-- (spec §17-20). No DB CHECK on status — approval states are code-level.
-- ============================================================================
ALTER TABLE `refunds` ADD `refund_number` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `currency` text DEFAULT 'LKR' NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `initiator_type` text DEFAULT 'business' NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `refund_method` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `provider_reference` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `fee_refund_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `commission_reversal_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `approved_by_user_id` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `refunds` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `completed_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `refunds_number_uq` ON `refunds` (`refund_number`) WHERE `refund_number` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `refunds_idempotency_uq` ON `refunds` (`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;

-- ============================================================================
-- payouts: rebuild to widen the status CHECK (pending/approved/processing/
-- completed/paid/failed/cancelled) and add settlement linkage + approval
-- trail (spec §22). Data-preserving: copy all existing rows.
-- ============================================================================
CREATE TABLE `__payouts_new` (
	`id` text PRIMARY KEY NOT NULL,
	`payout_number` text,
	`supplier_id` text NOT NULL,
	`settlement_id` text,
	`amount_cents` integer NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`external_reference` text,
	`bank_account_id` text,
	`batch_id` text,
	`idempotency_key` text,
	`initiated_by_user_id` text,
	`approved_by_user_id` text,
	`approved_at` integer,
	`processed_at` integer,
	`completed_at` integer,
	`paid_at` integer,
	`paid_by_user_id` text,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`paid_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `payouts_status_check` CHECK(`status` IN ('pending','approved','processing','completed','paid','failed','cancelled')),
	CONSTRAINT `payouts_method_check` CHECK(`method` IN ('bank','cash'))
);--> statement-breakpoint
INSERT INTO `__payouts_new` (`id`,`supplier_id`,`amount_cents`,`fee_cents`,`net_cents`,`currency`,`status`,`period_start`,`period_end`,`method`,`reference`,`batch_id`,`paid_at`,`paid_by_user_id`,`failure_reason`,`created_at`,`updated_at`) SELECT `id`,`supplier_id`,`amount_cents`,`fee_cents`,`net_cents`,`currency`,`status`,`period_start`,`period_end`,`method`,`reference`,`batch_id`,`paid_at`,`paid_by_user_id`,`failure_reason`,`created_at`,`updated_at` FROM `payouts`;--> statement-breakpoint
DROP TABLE `payouts`;--> statement-breakpoint
ALTER TABLE `__payouts_new` RENAME TO `payouts`;--> statement-breakpoint
CREATE INDEX `payouts_supplier_status_idx` ON `payouts` (`supplier_id`, `status`);--> statement-breakpoint
CREATE UNIQUE INDEX `payouts_period_uq` ON `payouts` (`supplier_id`, `period_start`, `period_end`);--> statement-breakpoint
CREATE INDEX `payouts_batch_idx` ON `payouts` (`batch_id`) WHERE `batch_id` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `payouts_number_uq` ON `payouts` (`payout_number`) WHERE `payout_number` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `payouts_idempotency_uq` ON `payouts` (`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payouts_settlement_idx` ON `payouts` (`settlement_id`) WHERE `settlement_id` IS NOT NULL;

-- ============================================================================
-- ledger_entries: double-entry readiness metadata (spec §25). The legacy
-- ref_type CHECK is intentionally untouched; richer event kinds live in
-- `category` + JSON `metadata`.
-- ============================================================================
ALTER TABLE `ledger_entries` ADD `category` text;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `entity_type` text;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `entity_id` text;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `metadata` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ledger_category_idx` ON `ledger_entries` (`category`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ledger_entity_idx` ON `ledger_entries` (`entity_type`, `entity_id`);

-- ============================================================================
-- payment_attempts (spec §6): append-only attempt history per payment.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `payment_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`provider` text DEFAULT 'payhere' NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`status` text DEFAULT 'initiated' NOT NULL,
	`provider_reference` text,
	`failure_reason` text,
	`metadata` text,
	`initiated_by_user_id` text,
	`initiated_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_attempts_payment_idx` ON `payment_attempts` (`payment_id`, `attempt_number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_attempts_status_idx` ON `payment_attempts` (`status`);

-- ============================================================================
-- payment_allocations (spec §13): per-supplier split of a payment.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`purchase_order_id` text,
	`gross_cents` integer NOT NULL,
	`commission_cents` integer DEFAULT 0 NOT NULL,
	`commission_bps` integer DEFAULT 0 NOT NULL,
	`fee_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_allocations_payment_idx` ON `payment_allocations` (`payment_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_allocations_supplier_idx` ON `payment_allocations` (`supplier_id`);

-- ============================================================================
-- cod_collections (spec §9): explicit cash-collection events + reconciliation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `cod_collections` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`purchase_order_id` text NOT NULL,
	`expected_cents` integer NOT NULL,
	`collected_cents` integer,
	`discrepancy_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`collector_user_id` text,
	`collector_name` text,
	`collection_method` text,
	`collection_reference` text,
	`collected_at` integer,
	`reconciliation_status` text DEFAULT 'unreconciled' NOT NULL,
	`reconciled_at` integer,
	`reconciled_by_user_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cod_collections_payment_idx` ON `cod_collections` (`payment_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cod_collections_po_idx` ON `cod_collections` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cod_collections_recon_idx` ON `cod_collections` (`reconciliation_status`);

-- ============================================================================
-- bank_transfers (spec §10-11): verification workflow + reconciliation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `bank_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`reference_number` text NOT NULL UNIQUE,
	`expected_cents` integer NOT NULL,
	`transferred_cents` integer,
	`verified_cents` integer,
	`difference_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`proof_r2_key` text,
	`proof_file_name` text,
	`proof_mime_type` text,
	`proof_uploaded_at` integer,
	`bank_reference` text,
	`verified_by_user_id` text,
	`verified_at` integer,
	`rejection_reason` text,
	`submitted_by_user_id` text,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bank_transfers_payment_idx` ON `bank_transfers` (`payment_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bank_transfers_status_idx` ON `bank_transfers` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bank_transfers_ref_idx` ON `bank_transfers` (`reference_number`);

-- ============================================================================
-- commission_rules (spec §15): precedence product > supplier > category >
-- global. Applied values are snapshotted per allocation/earning.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `commission_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`scope_id` text,
	`bps` integer NOT NULL,
	`name` text,
	`starts_at` integer,
	`ends_at` integer,
	`active` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `commission_rules_scope_idx` ON `commission_rules` (`scope`, `scope_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `commission_rules_active_idx` ON `commission_rules` (`active`);

-- ============================================================================
-- supplier_earnings (spec §14): explainable per-payment earnings breakdown.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `supplier_earnings` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`purchase_order_id` text NOT NULL,
	`allocation_id` text,
	`gross_cents` integer NOT NULL,
	`commission_bps` integer NOT NULL,
	`commission_cents` integer DEFAULT 0 NOT NULL,
	`delivery_fee_cents` integer DEFAULT 0 NOT NULL,
	`processing_fee_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`refund_cents` integer DEFAULT 0 NOT NULL,
	`adjustment_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`eligibility` text DEFAULT 'ineligible' NOT NULL,
	`held_reason` text,
	`settled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_earnings_supplier_idx` ON `supplier_earnings` (`supplier_id`, `eligibility`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `supplier_earnings_payment_uq` ON `supplier_earnings` (`payment_id`, `supplier_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_earnings_po_idx` ON `supplier_earnings` (`purchase_order_id`);

-- ============================================================================
-- settlements + settlement_items (spec §21).
-- ============================================================================
CREATE TABLE IF NOT EXISTS `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`settlement_number` text NOT NULL UNIQUE,
	`supplier_id` text NOT NULL,
	`gross_cents` integer DEFAULT 0 NOT NULL,
	`commission_cents` integer DEFAULT 0 NOT NULL,
	`refund_cents` integer DEFAULT 0 NOT NULL,
	`adjustment_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`idempotency_key` text UNIQUE,
	`created_by_user_id` text,
	`approved_by_user_id` text,
	`approved_at` integer,
	`processed_at` integer,
	`completed_at` integer,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `settlements_supplier_status_idx` ON `settlements` (`supplier_id`, `status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `settlement_items` (
	`id` text PRIMARY KEY NOT NULL,
	`settlement_id` text NOT NULL,
	`earning_id` text NOT NULL,
	`net_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`settlement_id`) REFERENCES `settlements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`earning_id`) REFERENCES `supplier_earnings`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `settlement_items_settlement_idx` ON `settlement_items` (`settlement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `settlement_items_earning_uq` ON `settlement_items` (`earning_id`);

-- ============================================================================
-- supplier_bank_accounts (spec §23): masked storage + verification trail.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `supplier_bank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`bank_name` text NOT NULL,
	`account_holder` text NOT NULL,
	`account_number_last4` text NOT NULL,
	`account_number_hash` text NOT NULL,
	`branch` text,
	`account_type` text,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`verified_by_user_id` text,
	`verified_at` integer,
	`is_default` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_bank_accounts_supplier_idx` ON `supplier_bank_accounts` (`supplier_id`);

-- ============================================================================
-- financial_adjustments (spec §58): corrections as new rows, never edits.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `financial_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`adjustment_number` text NOT NULL UNIQUE,
	`kind` text NOT NULL,
	`account_type` text NOT NULL,
	`account_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`idempotency_key` text UNIQUE,
	`created_by_user_id` text,
	`approved_by_user_id` text,
	`approved_at` integer,
	`applied_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `financial_adjustments_account_idx` ON `financial_adjustments` (`account_type`, `account_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `financial_adjustments_status_idx` ON `financial_adjustments` (`status`);

-- ============================================================================
-- reconciliation_exceptions (spec §57): every unexplained rupee, flagged.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `reconciliation_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'warning' NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`expected_cents` integer,
	`actual_cents` integer,
	`difference_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'LKR' NOT NULL,
	`detail` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	`resolution_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reconciliation_exceptions_status_idx` ON `reconciliation_exceptions` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reconciliation_exceptions_kind_idx` ON `reconciliation_exceptions` (`kind`);
