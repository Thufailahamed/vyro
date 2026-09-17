-- Trust Signals: pre-computed trust signal cache per supplier, rebuilt by cron + webhooks.
CREATE TABLE IF NOT EXISTS `supplier_trust_signals` (
  `supplier_id` text PRIMARY KEY NOT NULL,
  `kyc_verified` integer NOT NULL DEFAULT 0,
  `member_since_year` integer,
  `total_completed_pos` integer NOT NULL DEFAULT 0,
  `on_time_count` integer NOT NULL DEFAULT 0,
  `on_time_pct_cached` real,
  `disputed_supplier_fault_count` integer NOT NULL DEFAULT 0,
  `computed_at` integer NOT NULL,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_trust_signals_supplier_idx` ON `supplier_trust_signals` (`supplier_id`);
