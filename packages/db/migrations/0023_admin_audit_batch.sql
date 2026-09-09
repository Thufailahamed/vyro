ALTER TABLE `admin_audit_logs` ADD `batch_id` text;
CREATE INDEX IF NOT EXISTS `admin_audit_logs_batch_idx`
  ON `admin_audit_logs` (`batch_id`);
