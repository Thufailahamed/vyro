-- Allow source='admin' on notifications.
--
-- Migration 0020 added `source` with CHECK (source IN ('system','ai')), but the
-- admin notification fan-out (0022) and the drizzle schema mark admin-targeted
-- rows with source='admin'. SQLite cannot alter a CHECK constraint, so the
-- table is rebuilt: copy rows into a new table, drop the old one, rename, and
-- recreate the indexes.

CREATE TABLE `notifications_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipient_role` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`read_at` integer,
	`link` text,
	`source` text NOT NULL DEFAULT 'system' CHECK (`source` IN ('system','ai','admin')),
	`source_ref` text,
	`severity` text NOT NULL DEFAULT 'info',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `notifications_new`
	(`id`,`user_id`,`recipient_role`,`type`,`title`,`body`,`read_at`,`link`,`source`,`source_ref`,`severity`,`created_at`)
SELECT `id`,`user_id`,`recipient_role`,`type`,`title`,`body`,`read_at`,`link`,`source`,`source_ref`,`severity`,`created_at`
FROM `notifications`;
--> statement-breakpoint
DROP TABLE `notifications`;
--> statement-breakpoint
ALTER TABLE `notifications_new` RENAME TO `notifications`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_user_read_idx`
	ON `notifications` (`user_id`,`read_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_source_idx`
	ON `notifications` (`user_id`,`source`,`read_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_recipient_role_unread_idx`
	ON `notifications` (`recipient_role`,`read_at`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notifications_recipient_role_created_idx`
	ON `notifications` (`recipient_role`,`created_at`);
