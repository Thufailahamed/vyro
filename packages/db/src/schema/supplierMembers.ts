import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';
import { users } from './users';

export const supplierMembers = sqliteTable(
  'supplier_members',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['owner', 'sales', 'operations'] }).notNull(),
    status: text('status', { enum: ['active', 'invited', 'suspended'] }).notNull().default('active'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ uniq: uniqueIndex('supplier_members_supplier_user_uniq').on(t.supplierId, t.userId) }),
);

export type SupplierMember = typeof supplierMembers.$inferSelect;
