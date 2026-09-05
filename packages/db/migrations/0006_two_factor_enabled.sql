-- Better-auth twoFactor plugin expects twoFactorEnabled on the user row.
ALTER TABLE `user` ADD COLUMN `two_factor_enabled` integer DEFAULT 0;