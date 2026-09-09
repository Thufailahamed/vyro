-- Admin notification fan-out columns
-- Pragmatic deviation from spec: keep userId NOT NULL.
-- Each admin-targeted row is inserted per-recipient with that admin's userId
-- plus recipientRole metadata for inbox grouping + filtering.

ALTER TABLE `notifications` ADD `recipient_role` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `source_ref` text;--> statement-breakpoint
ALTER TABLE `notifications` ADD `severity` text NOT NULL DEFAULT 'info';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_recipient_role_unread_idx`
  ON `notifications` (`recipient_role`, `read_at`, `created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_recipient_role_created_idx`
  ON `notifications` (`recipient_role`, `created_at`);
