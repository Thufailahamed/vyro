import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { rfqSuppliers } from './rfqs';
import { users } from './users';

export const rfqSupplierNotes = sqliteTable(
  'rfq_supplier_notes',
  {
    id: text('id').primaryKey(),
    rfqSupplierId: text('rfq_supplier_id')
      .notNull()
      .references(() => rfqSuppliers.id),
    body: text('body').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    rfqSupplierIdx: index('rfq_supplier_notes_rfq_supplier_idx').on(
      t.rfqSupplierId,
      t.createdAt,
    ),
  }),
);