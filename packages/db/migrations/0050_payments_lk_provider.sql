-- 0050_payments_lk_provider.sql — gateway switched from PayHere to payments.lk
--
-- New payments carry provider='payments_lk'. Historical rows keep their stored
-- provider value ('payhere') untouched — refunds for those stay on the manual
-- admin queue.
--
-- SQLite cannot ALTER a column DEFAULT in place. `payments` is FK-referenced
-- by many child tables (payment_events, payment_attempts, refunds, chargebacks,
-- payment_allocations, ...), so rebuilding it in place is high-risk and gains
-- nothing: every application insert sets `provider` explicitly and the Drizzle
-- schema default governs driver-level inserts. The DB-level default is left
-- as the historical value there.
--
-- `payment_attempts` has no children, so its default is updated via the
-- standard SQLite rebuild pattern (same as 0049 did for notifications).

CREATE TABLE `payment_attempts_new` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`provider` text DEFAULT 'payments_lk' NOT NULL,
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
);
--> statement-breakpoint
INSERT INTO `payment_attempts_new`
	(`id`,`payment_id`,`attempt_number`,`provider`,`amount_cents`,`currency`,`status`,`provider_reference`,`failure_reason`,`metadata`,`initiated_by_user_id`,`initiated_at`,`completed_at`,`created_at`)
SELECT `id`,`payment_id`,`attempt_number`,`provider`,`amount_cents`,`currency`,`status`,`provider_reference`,`failure_reason`,`metadata`,`initiated_by_user_id`,`initiated_at`,`completed_at`,`created_at`
FROM `payment_attempts`;
--> statement-breakpoint
DROP TABLE `payment_attempts`;
--> statement-breakpoint
ALTER TABLE `payment_attempts_new` RENAME TO `payment_attempts`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_attempts_payment_idx` ON `payment_attempts` (`payment_id`, `attempt_number`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_attempts_status_idx` ON `payment_attempts` (`status`);
