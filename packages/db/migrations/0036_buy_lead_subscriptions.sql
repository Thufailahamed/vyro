-- 0036_buy_lead_subscriptions.sql
-- VYRO BuyLeads: per-supplier daily email digest opt-in. 1 row per supplier.
-- Forward-only, additive.

CREATE TABLE `supplier_buy_lead_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `supplier_id` text NOT NULL REFERENCES `suppliers`(`id`),
  `enabled` integer NOT NULL DEFAULT 1,
  `category_ids_json` text NOT NULL DEFAULT '[]',
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `supplier_buy_lead_subs_supplier_uniq`
  ON `supplier_buy_lead_subscriptions` (`supplier_id`);
