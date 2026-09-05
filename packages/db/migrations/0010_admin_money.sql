-- 0010_admin_money.sql
-- T3: payout batches + chargebacks + payout.batch_id link.

ALTER TABLE `payouts` ADD `batch_id` text;--> statement-breakpoint
CREATE INDEX `payouts_batch_idx` ON `payouts` (`batch_id`) WHERE `batch_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `payout_batches` (
  `id` text PRIMARY KEY NOT NULL,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `approved_by` text REFERENCES `users`(`id`),
  `status` text NOT NULL DEFAULT 'pending',
  `total_cents` integer NOT NULL DEFAULT 0,
  `note` text,
  `created_at` integer NOT NULL,
  `approved_at` integer
);--> statement-breakpoint
CREATE INDEX `payout_batches_status_idx` ON `payout_batches` (`status`);--> statement-breakpoint
CREATE TABLE `chargebacks` (
  `id` text PRIMARY KEY NOT NULL,
  `payment_id` text NOT NULL,
  `reason` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `resolved_by` text REFERENCES `users`(`id`),
  `resolved_at` integer,
  `refund_id` text,
  `notes` text,
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `chargebacks_status_idx` ON `chargebacks` (`status`);
