import { sqliteTable, text, integer, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const platformSettings = sqliteTable(
  'platform_settings',
  {
    id: integer('id').primaryKey(),
    brandName: text('brand_name').notNull().default('VYRO'),
    supportEmail: text('support_email'),
    supportPhone: text('support_phone'),
    defaultCurrency: text('default_currency').notNull().default('LKR'),
    platformFeeBps: integer('platform_fee_bps').notNull().default(250),
    rfqValueThresholdCents: integer('rfq_value_threshold_cents').notNull().default(100000),
    rfqQuantityThreshold: integer('rfq_quantity_threshold').notNull().default(500),
    enableBusinessSignup: integer('enable_business_signup').notNull().default(1),
    enableSupplierSignup: integer('enable_supplier_signup').notNull().default(1),
    updatedAt: integer('updated_at').notNull(),
    updatedByUserId: text('updated_by_user_id'),
  },
  (t) => ({
    singletonCheck: check('platform_settings_singleton', sql`${t.id} = 1`),
    feeRangeCheck: check(
      'platform_settings_fee_range',
      sql`${t.platformFeeBps} >= 0 AND ${t.platformFeeBps} <= 1000`,
    ),
  }),
);

export type PlatformSetting = typeof platformSettings.$inferSelect;
export type NewPlatformSetting = typeof platformSettings.$inferInsert;
