import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

/** Delivery address book: a business can receive at several outlets/warehouses. */
export const businessAddresses = sqliteTable(
  'business_addresses',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    label: text('label').notNull(),
    contactName: text('contact_name'),
    phone: text('phone'),
    address: text('address').notNull(),
    city: text('city').notNull(),
    district: text('district').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    bizIdx: index('business_addresses_biz_idx').on(t.businessId, t.deletedAt),
  }),
);

export type BusinessAddress = typeof businessAddresses.$inferSelect;
export type NewBusinessAddress = typeof businessAddresses.$inferInsert;
