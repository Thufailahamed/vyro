-- 0038_trust_seal.sql
-- VYRO TrustSEAL: one paid subscription row per supplier, reused across renewals.
-- Forward-only, additive.

CREATE TABLE `trust_seal_subscriptions` (
  `id` text PRIMARY KEY NOT NULL,
  `supplier_id` text NOT NULL REFERENCES `suppliers`(`id`),
  `status` text NOT NULL DEFAULT 'pending',
  `started_at` integer,
  `expires_at` integer,
  `payment_id` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `trust_seal_supplier_uniq`
  ON `trust_seal_subscriptions` (`supplier_id`);
