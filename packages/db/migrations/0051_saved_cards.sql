-- 0051_saved_cards.sql — cards kept on file with payments.lk (buyer convenience).
--
-- No PAN/CVV ever stored: only the provider card id + display metadata
-- (brand, last4, expiry). Charges happen off-session via the provider API
-- using the provider card id. One card per (business, provider card id).

CREATE TABLE `saved_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`payments_lk_card_id` text NOT NULL,
	`brand` text,
	`last4` text,
	`expiry_month` integer,
	`expiry_year` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `saved_cards_business_idx` ON `saved_cards` (`business_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_cards_business_card_uq` ON `saved_cards` (`business_id`, `payments_lk_card_id`);
