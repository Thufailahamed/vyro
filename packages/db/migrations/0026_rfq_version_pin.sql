-- 0026_rfq_version_pin.sql
-- Pin the awarded quote version on the purchase order (auditability:
-- the PO references exactly the negotiated version, not "latest").
-- Plus lookup indexes for RFQ hot paths.

ALTER TABLE `purchase_orders` ADD COLUMN `quote_version` integer;--> statement-breakpoint
ALTER TABLE `rfqs` ADD COLUMN `awarded_quote_version` integer;--> statement-breakpoint
ALTER TABLE `quote_counter_offers` ADD COLUMN `proposed_delivery_fee_cents` integer;--> statement-breakpoint
ALTER TABLE `quote_counter_offers` ADD COLUMN `proposed_payment_terms` text;--> statement-breakpoint
ALTER TABLE `quote_counter_offers` ADD COLUMN `proposed_delivery_date` integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `po_quote_idx` ON `purchase_orders` (`quote_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_quotes_valid_idx` ON `supplier_quotes` (`valid_until`, `status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `rfqs_status_deadline_idx` ON `rfqs` (`status`, `deadline`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `quote_counters_status_idx` ON `quote_counter_offers` (`status`, `created_at`);
