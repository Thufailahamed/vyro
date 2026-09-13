-- ============================================================================
-- 0031_payment_method.sql — buyer payment choice on each PO
-- ============================================================================
-- Default payhere preserves existing flow for all 832 tests + audit rows.
-- Cross-border (direction IN ('export','import')) POs default to 'wire' in
-- the service layer because PayHere only charges LKR locally.
ALTER TABLE `purchase_orders` ADD `payment_method` text DEFAULT 'payhere' NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `payment_initiated_at` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `payment_initiated_by_user_id` text;--> statement-breakpoint
CREATE INDEX `purchase_orders_payment_method_idx` ON `purchase_orders` (`payment_method`);
