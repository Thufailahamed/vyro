-- 0029_cross_border_base.sql
-- Cross-border trade base tables: countries, fx_snapshots, order_customs_docs.
-- Forward-only migration. Additive; preserves existing data.

-- ============================================================================
-- countries: ISO 3166-1 alpha-2 directory with sanctions flag + FX jurisdiction
-- ============================================================================
CREATE TABLE `countries` (
  `code` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `is_sanctioned` integer DEFAULT false NOT NULL,
  `fx_jurisdiction` text DEFAULT 'INTL' NOT NULL
);--> statement-breakpoint

-- ============================================================================
-- fx_snapshots: frozen FX rate at order creation. Rate scaled by 1e8 (string,
-- no float drift). Indexed by pair + fetchedAt for fast latest-rate queries.
-- ============================================================================
CREATE TABLE `fx_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `base` text NOT NULL,
  `quote_currency` text NOT NULL,
  `rate_scaled` text NOT NULL,
  `fetched_at` integer NOT NULL,
  `provider` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `fx_snapshots_pair_fetched_idx` ON `fx_snapshots` (`base`, `quote_currency`, `fetched_at`);--> statement-breakpoint

-- ============================================================================
-- order_customs_docs: PDF + image attachments stored in R2
-- (vyro-cross-border-docs bucket). Tracks who uploaded, when, and doc kind.
-- ============================================================================
CREATE TABLE `order_customs_docs` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL,
  `kind` text NOT NULL,
  `r2_path` text NOT NULL,
  `uploaded_at` integer NOT NULL,
  `uploaded_by` text NOT NULL,
  FOREIGN KEY (`order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `order_customs_docs_order_idx` ON `order_customs_docs` (`order_id`);