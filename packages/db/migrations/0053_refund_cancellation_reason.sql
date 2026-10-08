-- 0053_refund_cancellation_reason.sql
-- Refund withdraw/cancel: preserve why a refund was cancelled.
ALTER TABLE refunds ADD COLUMN cancellation_reason TEXT;
