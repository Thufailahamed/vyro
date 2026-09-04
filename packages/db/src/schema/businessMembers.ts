import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { users } from './users';

export const businessMembers = sqliteTable(
  'business_members',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['owner', 'manager', 'purchasing', 'accountant'] }).notNull(),
    status: text('status', { enum: ['active', 'invited', 'suspended'] }).notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ uniq: uniqueIndex('business_members_business_user_uniq').on(t.businessId, t.userId) }),
);

export type BusinessMember = typeof businessMembers.$inferSelect;
