import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { suppliers } from './suppliers';

export const supplierTrustSignals = sqliteTable(
  'supplier_trust_signals',
  {
    supplierId: text('supplier_id').primaryKey().notNull().references(() => suppliers.id),
    kycVerified: integer('kyc_verified').notNull().default(0),
    memberSinceYear: integer('member_since_year'),
    totalCompletedPos: integer('total_completed_pos').notNull().default(0),
    onTimeCount: integer('on_time_count').notNull().default(0),
    onTimePctCached: real('on_time_pct_cached'),
    disputedSupplierFaultCount: integer('disputed_supplier_fault_count').notNull().default(0),
    computedAt: integer('computed_at').notNull(),
  },
  (t) => ({
    supplierIdx: index('supplier_trust_signals_supplier_idx').on(t.supplierId),
  }),
);

export type TrustSignalsRow = typeof supplierTrustSignals.$inferSelect;
