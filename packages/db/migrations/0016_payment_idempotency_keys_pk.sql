-- 0016 — add composite primary key to payment_idempotency_keys
-- Required so concurrent POSTs with the same (userId, key) cannot both succeed.
-- D1 supports this directly.

CREATE TABLE IF NOT EXISTS `payment_idempotency_keys_new` (
  `key` TEXT NOT NULL,
  `user_id` TEXT NOT NULL,
  `request_hash` TEXT NOT NULL,
  `response_json` TEXT NOT NULL,
  `status_code` INTEGER NOT NULL,
  `expires_at` INTEGER NOT NULL,
  `created_at` INTEGER NOT NULL,
  PRIMARY KEY (`user_id`, `key`)
);

INSERT INTO `payment_idempotency_keys_new`
  (`key`, `user_id`, `request_hash`, `response_json`, `status_code`, `expires_at`, `created_at`)
SELECT `key`, `user_id`, `request_hash`, `response_json`, `status_code`, `expires_at`, `created_at`
FROM `payment_idempotency_keys`
WHERE 1=1
  AND `user_id` IS NOT NULL
  AND `key` IS NOT NULL;

DROP TABLE `payment_idempotency_keys`;

ALTER TABLE `payment_idempotency_keys_new` RENAME TO `payment_idempotency_keys`;
