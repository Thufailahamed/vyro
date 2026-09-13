-- 0033_supplier_reviews.sql
-- VYRO Reviews: supplier-level ratings & reviews.
-- Forward-only, additive. Supplier gets denormalized review_count, review_avg_x100, last_review_at.

CREATE TABLE `supplier_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `supplier_id` text NOT NULL,
  `order_id` text NOT NULL,
  `buyer_business_id` text NOT NULL,
  `rating` integer NOT NULL CHECK (`rating` BETWEEN 1 AND 5),
  `body` text NOT NULL,
  `status` text DEFAULT 'published' NOT NULL CHECK (`status` IN ('published','hidden_by_flag','hidden_by_dispute','removed_by_admin')),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`buyer_business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `supplier_reviews_supplier_order_uniq` ON `supplier_reviews` (`supplier_id`, `order_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_reviews_supplier_status_created_idx` ON `supplier_reviews` (`supplier_id`, `status`, `created_at`);
--> statement-breakpoint
CREATE TABLE `supplier_review_replies` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL,
  `supplier_id` text NOT NULL,
  `body` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`review_id`) REFERENCES `supplier_reviews`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `supplier_review_replies_review_uniq` ON `supplier_review_replies` (`review_id`);
--> statement-breakpoint
CREATE TABLE `supplier_review_flags` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL,
  `flagged_by` text NOT NULL CHECK (`flagged_by` IN ('buyer','supplier','admin','system')),
  `flagged_by_user_id` text,
  `reason` text NOT NULL CHECK (`reason` IN ('abuse','spam','off_topic','pii','other')),
  `note` text,
  `status` text DEFAULT 'pending' NOT NULL CHECK (`status` IN ('pending','resolved_keep','resolved_remove')),
  `created_at` integer NOT NULL,
  `resolved_at` integer,
  `resolved_by` text,
  FOREIGN KEY (`review_id`) REFERENCES `supplier_reviews`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_review_flags_status_created_idx` ON `supplier_review_flags` (`status`, `created_at`);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `review_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `review_avg_x100` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD COLUMN `last_review_at` integer;