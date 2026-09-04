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
  },
  (t) => ({ cityIdx: index('businesses_city_idx').on(t.city) }),
);

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
