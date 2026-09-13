import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';

export const creditFacilities = sqliteTable(
  'credit_facilities',
  {
    businessId: text('business_id').primaryKey().references(() => businesses.id),
    limitCents: integer('limit_cents').notNull(),
    usedCents: integer('used_cents').notNull().default(0),
    status: text('status', { enum: ['active', 'suspended', 'closed'] }).notNull().default('active'),
    defaultTerms: text('default_terms', { enum: ['net14', 'net30'] }).notNull().default('net30'),
    autoGranted: integer('auto_granted').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    statusIdx: index('credit_facilities_status_idx').on(t.status),
  }),
);

export type CreditFacility = typeof creditFacilities.$inferSelect;
export type NewCreditFacility = typeof creditFacilities.$inferInsert;
