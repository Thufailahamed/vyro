import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businessTypes } from './businessTypes';

export const suppliers = sqliteTable(
  'suppliers',
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
    verificationStatus: text('verification_status', {
      enum: ['pending', 'verified', 'rejected', 'suspended'],
    })
      .notNull()
      .default('pending'),
    status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    countryCode: text('country_code').notNull().default('LK'),
    taxId: text('tax_id'),
    isExportEligible: integer('is_export_eligible', { mode: 'boolean' }).notNull().default(false),
    defaultIncoterms: text('default_incoterms', {
      enum: ['EXW', 'FOB', 'CIF', 'DDP', 'DDU'],
    }),
    defaultHsCode: text('default_hs_code'),
    defaultCountryOfOrigin: text('default_country_of_origin'),
    // Supplier rating aggregate (denormalized from supplier_reviews).
    reviewCount: integer('review_count').notNull().default(0),
    reviewAvg: integer('review_avg_x100').notNull().default(0), // 0..500; divide by 100 for display
    lastReviewAt: integer('last_review_at'),
    slug: text('slug'),
  },
  (t) => ({
    cityIdx: index('suppliers_city_idx').on(t.city),
    countryIdx: index('suppliers_country_idx').on(t.countryCode),
  }),
);

export type Supplier = typeof suppliers.$inferSelect;
