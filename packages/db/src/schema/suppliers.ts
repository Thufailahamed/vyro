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
  },
  (t) => ({ cityIdx: index('suppliers_city_idx').on(t.city) }),
);

export type Supplier = typeof suppliers.$inferSelect;
