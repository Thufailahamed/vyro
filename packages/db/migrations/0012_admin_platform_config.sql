-- 0012_admin_platform_config.sql
-- T5: feature flags + email templates section store, webhooks + delivery log.

CREATE TABLE `config_sections` (
  `section` text PRIMARY KEY NOT NULL,
  `value_json` text NOT NULL,
  `version` integer NOT NULL DEFAULT 0,
  `updated_by` text REFERENCES `users`(`id`),
  `updated_at` integer NOT NULL
);--> statement-breakpoint

CREATE TABLE `webhooks` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `url` text NOT NULL,
  `event_types_json` text NOT NULL,
  `secret` text NOT NULL,
  `active` integer NOT NULL DEFAULT 1,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `webhooks_active_idx` ON `webhooks` (`active`);--> statement-breakpoint

CREATE TABLE `webhook_deliveries` (
  `id` text PRIMARY KEY NOT NULL,
  `webhook_id` text NOT NULL REFERENCES `webhooks`(`id`),
  `event_type` text NOT NULL,
  `payload_json` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending',
  `response_status` integer,
  `response_body` text,
  `attempt_count` integer NOT NULL DEFAULT 0,
  `next_retry_at` integer,
  `created_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_webhook_idx` ON `webhook_deliveries` (`webhook_id`, `created_at` DESC);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_status_idx` ON `webhook_deliveries` (`status`);
