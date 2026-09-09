-- 0024_payhere_states.sql
-- PayHere states: payment_events audit table + gateway_ref lookup index.
-- Note: payments.status is a TEXT enum in Drizzle (no DB CHECK), so extending
-- the TS enum to pending/confirmed/failed/cancelled/chargeback/refunded needs
-- no ALTER. This migration only adds the event table + index.

CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`provider` text NOT NULL,
	`event_type` text NOT NULL,
	`provider_payment_id` text,
	`status_code` integer,
	`payload_hash` text NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer,
	`processing_status` text DEFAULT 'received' NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_events_payment_idx` ON `payment_events` (`payment_id`, `received_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_dedupe_uq` ON `payment_events` (`payment_id`, `status_code`, `provider_payment_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payments_gateway_ref_idx` ON `payments` (`gateway_ref`);
