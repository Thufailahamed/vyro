import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businessTypes } from './businessTypes';

export const businesses = sqliteTable(
  'businesses',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    businessTypeId: text('business_type_id')
      .notNull()
      .references(() => businessTypes.id),
    contactPerson: text('contact_person').notNull(),
    phone: text('phone').notNull(),
    email: text('email').notNull(),
    address: text('address').notNull(),
    city: text('city').notNull(),
    district: text('district').notNull(),
    description: text('description'),
    status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    countryCode: text('country_code').notNull().default('LK'),
    taxId: text('tax_id'),
    kycLevel: text('kyc_level', { enum: ['none', 'basic', 'enhanced'] }).notNull().default('none'),
    kycVerifiedAt: integer('kyc_verified_at'),
    kycVerifiedBy: text('kyc_verified_by'),
  },
  (t) => ({
    cityIdx: index('businesses_city_idx').on(t.city),
    countryIdx: index('businesses_country_idx').on(t.countryCode),
  }),
);

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
