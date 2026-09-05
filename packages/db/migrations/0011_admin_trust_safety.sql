-- 0011_admin_trust_safety.sql
-- T4: abuse reports + KYC review queues.

CREATE TABLE `abuse_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `reporter_user_id` text REFERENCES `users`(`id`),
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `reason` text NOT NULL,
  `details` text,
  `status` text NOT NULL DEFAULT 'open',
  `assigned_to` text REFERENCES `users`(`id`),
  `resolution_notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `abuse_reports_status_idx` ON `abuse_reports` (`status`);--> statement-breakpoint
CREATE INDEX `abuse_reports_target_idx` ON `abuse_reports` (`target_type`, `target_id`);--> statement-breakpoint
CREATE INDEX `abuse_reports_assigned_idx` ON `abuse_reports` (`assigned_to`);--> statement-breakpoint

CREATE TABLE `kyc_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `status` text NOT NULL DEFAULT 'pending',
  `documents_json` text,
  `notes` text,
  `reviewed_by` text REFERENCES `users`(`id`),
  `reviewed_at` integer,
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `kyc_reviews_status_idx` ON `kyc_reviews` (`status`);--> statement-breakpoint
CREATE INDEX `kyc_reviews_user_idx` ON `kyc_reviews` (`user_id`);
