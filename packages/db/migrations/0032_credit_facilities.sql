-- 0032_credit_facilities.sql
-- VYRO Credit: buyer facilities + per-PO drawdowns. Forward-only, additive.

CREATE TABLE `credit_facilities` (
  `business_id` text PRIMARY KEY NOT NULL,
  `limit_cents` integer NOT NULL,
  `used_cents` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `default_terms` text DEFAULT 'net30' NOT NULL,
  `auto_granted` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `credit_facilities_status_idx` ON `credit_facilities` (`status`);--> statement-breakpoint
CREATE TABLE `credit_drawdowns` (
  `id` text PRIMARY KEY NOT NULL,
  `business_id` text NOT NULL,
  `purchase_order_id` text NOT NULL UNIQUE,
  `amount_cents` integer NOT NULL,
  `repaid_cents` integer DEFAULT 0 NOT NULL,
  `terms` text NOT NULL,
  `due_at` integer NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `repaid_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `credit_drawdowns_biz_status_due_idx` ON `credit_drawdowns` (`business_id`, `status`, `due_at`);
