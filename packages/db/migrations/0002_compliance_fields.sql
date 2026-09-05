ALTER TABLE users ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN deletion_scheduled_for INTEGER;
