DROP INDEX IF EXISTS `notifications_recipient_role_unread_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `notifications_recipient_role_created_idx`;--> statement-breakpoint
ALTER TABLE `notifications` DROP COLUMN `recipient_role`;--> statement-breakpoint
ALTER TABLE `notifications` DROP COLUMN `source_ref`;--> statement-breakpoint
ALTER TABLE `notifications` DROP COLUMN `severity`;
