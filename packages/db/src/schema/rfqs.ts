import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { businesses } from './businesses';
import { suppliers } from './suppliers';
import { users } from './users';
import { products } from './products';
import { supplierProducts } from './supplierProducts';

export const rfqs = sqliteTable(
  'rfqs',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    rfqNumber: text('rfq_number').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('draft'),
    currency: text('currency').notNull().default('LKR'),
    deadline: integer('deadline'),
    deliveryLocation: text('delivery_location'),
    deliveryCity: text('delivery_city'),
    deliveryDistrict: text('delivery_district'),
    requiredDeliveryDate: integer('required_delivery_date'),
    deliveryRequirements: text('delivery_requirements'),
    paymentMethod: text('payment_method'),
    paymentTerms: text('payment_terms'),
    specifications: text('specifications'),
    packagingRequirements: text('packaging_requirements'),
    qualityRequirements: text('quality_requirements'),
    brandPreferences: text('brand_preferences'),
    notes: text('notes'),
    isOpen: integer('is_open').notNull().default(0),
    recurrenceRule: text('recurrence_rule'),
    templateId: text('template_id'),
    awardedQuoteId: text('awarded_quote_id'),
    convertedPoId: text('converted_po_id'),
    version: integer('version').notNull().default(1),
    publishedAt: integer('published_at'),
    awardedAt: integer('awarded_at'),
    closedAt: integer('closed_at'),
    cancelledAt: integer('cancelled_at'),
    expiredAt: integer('expired_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    rfqNumberUniq: uniqueIndex('rfqs_number_uniq').on(t.rfqNumber),
    businessStatusIdx: index('rfqs_business_status_idx').on(t.businessId, t.status),
    deadlineIdx: index('rfqs_deadline_idx').on(t.deadline, t.status),
  }),
);

export const rfqItems = sqliteTable(
  'rfq_items',
  {
    id: text('id').primaryKey(),
    rfqId: text('rfq_id')
      .notNull()
      .references(() => rfqs.id),
    productId: text('product_id').references(() => products.id),
    supplierProductId: text('supplier_product_id').references(() => supplierProducts.id),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unit: text('unit').notNull().default('kg'),
    targetPriceCents: integer('target_price_cents'),
    specifications: text('specifications'),
    requiredDate: integer('required_date'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    rfqIdx: index('rfq_items_rfq_idx').on(t.rfqId),
  }),
);

export const rfqSuppliers = sqliteTable(
  'rfq_suppliers',
  {
    id: text('id').primaryKey(),
    rfqId: text('rfq_id')
      .notNull()
      .references(() => rfqs.id),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    status: text('status').notNull().default('invited'),
    invitedAt: integer('invited_at').notNull(),
    viewedAt: integer('viewed_at'),
    respondedAt: integer('responded_at'),
  },
  (t) => ({
    rfqSupplierUniq: uniqueIndex('rfq_suppliers_uniq').on(t.rfqId, t.supplierId),
    supplierStatusIdx: index('rfq_suppliers_supplier_idx').on(t.supplierId, t.status),
  }),
);

export const supplierQuotes = sqliteTable(
  'supplier_quotes',
  {
    id: text('id').primaryKey(),
    rfqId: text('rfq_id')
      .notNull()
      .references(() => rfqs.id),
    supplierId: text('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    quoteNumber: text('quote_number').notNull(),
    status: text('status').notNull().default('draft'),
    currency: text('currency').notNull().default('LKR'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    deliveryFeeCents: integer('delivery_fee_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    validUntil: integer('valid_until'),
    estimatedDeliveryDate: integer('estimated_delivery_date'),
    paymentTerms: text('payment_terms'),
    minimumQuantity: text('minimum_quantity'),
    availability: text('availability'),
    notes: text('notes'),
    isPartial: integer('is_partial').notNull().default(0),
    version: integer('version').notNull().default(1),
    supersedesId: text('supersedes_id'),
    submittedAt: integer('submitted_at'),
    acceptedAt: integer('accepted_at'),
    rejectedAt: integer('rejected_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    quoteNumberUniq: uniqueIndex('supplier_quotes_number_uniq').on(t.quoteNumber),
    rfqSupplierIdx: index('supplier_quotes_rfq_idx').on(t.rfqId, t.supplierId, t.status),
  }),
);

export const supplierQuoteItems = sqliteTable(
  'supplier_quote_items',
  {
    id: text('id').primaryKey(),
    quoteId: text('quote_id')
      .notNull()
      .references(() => supplierQuotes.id),
    rfqItemId: text('rfq_item_id').references(() => rfqItems.id),
    productId: text('product_id').references(() => products.id),
    supplierProductId: text('supplier_product_id').references(() => supplierProducts.id),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unit: text('unit').notNull().default('kg'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    subtotalCents: integer('subtotal_cents').notNull(),
    availableQuantity: integer('available_quantity'),
    estimatedDeliveryDate: integer('estimated_delivery_date'),
    isAlternative: integer('is_alternative').notNull().default(0),
    alternativeForRfqItemId: text('alternative_for_rfq_item_id'),
    alternativeAccepted: integer('alternative_accepted').notNull().default(0),
    specification: text('specification'),
    notes: text('notes'),
  },
  (t) => ({
    quoteIdx: index('supplier_quote_items_quote_idx').on(t.quoteId),
  }),
);

export const quotePriceTiers = sqliteTable(
  'quote_price_tiers',
  {
    id: text('id').primaryKey(),
    quoteItemId: text('quote_item_id')
      .notNull()
      .references(() => supplierQuoteItems.id),
    minQty: integer('min_qty').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    itemIdx: index('quote_price_tiers_item_idx').on(t.quoteItemId, t.minQty),
  }),
);

export const quoteVersions = sqliteTable(
  'quote_versions',
  {
    id: text('id').primaryKey(),
    quoteId: text('quote_id')
      .notNull()
      .references(() => supplierQuotes.id),
    version: integer('version').notNull(),
    changedByUserId: text('changed_by_user_id')
      .notNull()
      .references(() => users.id),
    previousTotalCents: integer('previous_total_cents'),
    newTotalCents: integer('new_total_cents').notNull(),
    changesJson: text('changes_json'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    quoteVersionIdx: index('quote_versions_quote_idx').on(t.quoteId, t.version),
  }),
);

export const quoteCounterOffers = sqliteTable(
  'quote_counter_offers',
  {
    id: text('id').primaryKey(),
    quoteId: text('quote_id')
      .notNull()
      .references(() => supplierQuotes.id),
    rfqId: text('rfq_id')
      .notNull()
      .references(() => rfqs.id),
    offeredByType: text('offered_by_type').notNull(),
    offeredByUserId: text('offered_by_user_id')
      .notNull()
      .references(() => users.id),
    proposedTotalCents: integer('proposed_total_cents').notNull(),
    proposedUnitPricesJson: text('proposed_unit_prices_json'),
    message: text('message'),
    status: text('status').notNull().default('pending'),
    respondedAt: integer('responded_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    quoteIdx: index('quote_counters_quote_idx').on(t.quoteId, t.createdAt),
  }),
);

export const quoteMessages = sqliteTable(
  'quote_messages',
  {
    id: text('id').primaryKey(),
    rfqId: text('rfq_id')
      .notNull()
      .references(() => rfqs.id),
    quoteId: text('quote_id').references(() => supplierQuotes.id),
    senderType: text('sender_type').notNull(),
    senderUserId: text('sender_user_id')
      .notNull()
      .references(() => users.id),
    message: text('message').notNull(),
    attachmentR2Key: text('attachment_r2_key'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    rfqIdx: index('quote_messages_rfq_idx').on(t.rfqId, t.createdAt),
    quoteIdx: index('quote_messages_quote_idx').on(t.quoteId, t.createdAt),
  }),
);

export const rfqEvents = sqliteTable(
  'rfq_events',
  {
    id: text('id').primaryKey(),
    rfqId: text('rfq_id')
      .notNull()
      .references(() => rfqs.id),
    quoteId: text('quote_id').references(() => supplierQuotes.id),
    actorUserId: text('actor_user_id').references(() => users.id),
    action: text('action').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    metadataJson: text('metadata_json'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    rfqIdx: index('rfq_events_rfq_idx').on(t.rfqId, t.createdAt),
  }),
);

export const rfqDocuments = sqliteTable(
  'rfq_documents',
  {
    id: text('id').primaryKey(),
    rfqId: text('rfq_id')
      .notNull()
      .references(() => rfqs.id),
    quoteId: text('quote_id').references(() => supplierQuotes.id),
    uploadedByUserId: text('uploaded_by_user_id')
      .notNull()
      .references(() => users.id),
    r2Key: text('r2_key').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    kind: text('kind').notNull().default('specification'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    rfqIdx: index('rfq_documents_rfq_idx').on(t.rfqId),
  }),
);

export const rfqTemplates = sqliteTable(
  'rfq_templates',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => businesses.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    description: text('description'),
    deliveryLocation: text('delivery_location'),
    paymentTerms: text('payment_terms'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    businessIdx: index('rfq_templates_business_idx').on(t.businessId),
  }),
);

export const rfqTemplateItems = sqliteTable(
  'rfq_template_items',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => rfqTemplates.id),
    productId: text('product_id').references(() => products.id),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    unit: text('unit').notNull().default('kg'),
    targetPriceCents: integer('target_price_cents'),
    specifications: text('specifications'),
  },
  (t) => ({
    templateIdx: index('rfq_template_items_template_idx').on(t.templateId),
  }),
);

export type Rfq = typeof rfqs.$inferSelect;
export type NewRfq = typeof rfqs.$inferInsert;
export type RfqItem = typeof rfqItems.$inferSelect;
export type SupplierQuote = typeof supplierQuotes.$inferSelect;
export type SupplierQuoteItem = typeof supplierQuoteItems.$inferSelect;
