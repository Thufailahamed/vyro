-- 0037_seller_reviews_full.sql
ALTER TABLE `supplier_reviews` ADD COLUMN `edited_at` integer;
--> statement-breakpoint
ALTER TABLE `supplier_reviews` ADD COLUMN `helpful_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `supplier_review_images` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL REFERENCES `supplier_reviews`(`id`),
  `r2_key` text NOT NULL,
  `mime` text,
  `size_bytes` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_review_images_review_idx` ON `supplier_review_images` (`review_id`);
--> statement-breakpoint
CREATE TABLE `supplier_review_helpful_votes` (
  `review_id` text NOT NULL REFERENCES `supplier_reviews`(`id`),
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL,
  PRIMARY KEY (`review_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `supplier_review_helpful_review_idx` ON `supplier_review_helpful_votes` (`review_id`);
