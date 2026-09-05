-- 0010_admin_money_down.sql
-- T3 rollback.

DROP INDEX IF EXISTS `chargebacks_status_idx`;--> statement-breakpoint
DROP TABLE IF EXISTS `chargebacks`;--> statement-breakpoint
DROP INDEX IF EXISTS `payout_batches_status_idx`;--> statement-breakpoint
DROP TABLE IF EXISTS `payout_batches`;--> statement-breakpoint
DROP INDEX IF EXISTS `payouts_batch_idx`;--> statement-breakpoint
ALTER TABLE `payouts` DROP COLUMN `batch_id`;
