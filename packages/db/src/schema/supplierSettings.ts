import { sqliteTable, text, integer, real, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { suppliers } from './suppliers';

export const supplierSettings = sqliteTable(
  'supplier_settings',
  {
    supplierId: text('supplier_id')
      .primaryKey()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    companyName: text('company_name'),
    registrationNo: text('registration_no'),
    taxId: text('tax_id'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    warehouseAddress: text('warehouse_address'),
    warehouseCity: text('warehouse_city'),
    warehouseDistrict: text('warehouse_district'),
    warehouseLat: real('warehouse_lat'),
    warehouseLng: real('warehouse_lng'),
    defaultLeadTimeDays: integer('default_lead_time_days'),
    payoutMethod: text('payout_method'),
    bankName: text('bank_name'),
    bankAccountNo: text('bank_account_no'),
    bankBranch: text('bank_branch'),
    notifyNewOrders: integer('notify_new_orders').notNull().default(1),
    notifyLowStock: integer('notify_low_stock').notNull().default(1),
    notifyPaymentReceived: integer('notify_payment_received').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    payoutMethodCheck: check(
      'supplier_settings_payout_method_check',
      sql`${t.payoutMethod} IS NULL OR ${t.payoutMethod} IN ('bank','cash')`,
    ),
  }),
);

export type SupplierSetting = typeof supplierSettings.$inferSelect;
export type NewSupplierSetting = typeof supplierSettings.$inferInsert;
