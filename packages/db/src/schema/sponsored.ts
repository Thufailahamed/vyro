import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sponsoredSlots = sqliteTable(
  'sponsored_slots',
  {
    id: text('id').primaryKey(),
    surface: text('surface').notNull(),
    position: integer('position').notNull(),
    categoryId: text('category_id'),
    label: text('label').notNull(),
    dailyRateCents: integer('daily_rate_cents').notNull(),
    active: integer('active').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    slotUnique: uniqueIndex('sponsored_slots_surface_pos_cat_uq').on(
      t.surface,
      t.position,
      t.categoryId,
    ),
  }),
);

export const sponsoredPlans = sqliteTable(
  'sponsored_plans',
  {
    id: text('id').primaryKey(),
    tier: text('tier').notNull(),
    name: text('name').notNull(),
    monthlyRateCents: integer('monthly_rate_cents').notNull(),
    includedSlotCredits: integer('included_slot_credits').notNull().default(0),
    active: integer('active').notNull().default(1),
  },
  (t) => ({
    tierUq: uniqueIndex('sponsored_plans_tier_uq').on(t.tier),
  }),
);

export const sponsoredSubscriptions = sqliteTable(
  'sponsored_subscriptions',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id').notNull(),
    planId: text('plan_id').notNull(),
    startsAt: integer('starts_at').notNull(),
    endsAt: integer('ends_at').notNull(),
    status: text('status').notNull(),
    slotCreditsRemaining: integer('slot_credits_remaining').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    supplierIdx: index('sponsored_subs_supplier_idx').on(t.supplierId, t.status),
  }),
);

export const sponsoredCampaigns = sqliteTable(
  'sponsored_campaigns',
  {
    id: text('id').primaryKey(),
    supplierId: text('supplier_id').notNull(),
    slotId: text('slot_id').notNull(),
    productId: text('product_id').notNull(),
    startsAt: integer('starts_at').notNull(),
    endsAt: integer('ends_at').notNull(),
    status: text('status').notNull(),
    paymentInvoiceId: text('payment_invoice_id'),
    adminNotes: text('admin_notes'),
    pinned: integer('pinned').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    slotResolveIdx: index('sponsored_campaigns_slot_resolve_idx').on(
      t.slotId,
      t.status,
      t.startsAt,
      t.endsAt,
    ),
    supplierIdx: index('sponsored_campaigns_supplier_idx').on(t.supplierId, t.status),
  }),
);

export const sponsoredEvents = sqliteTable(
  'sponsored_events',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').notNull(),
    eventType: text('event_type').notNull(),
    surface: text('surface').notNull(),
    occurredAt: integer('occurred_at').notNull(),
    requestId: text('request_id').notNull(),
    userIdHash: text('user_id_hash'),
  },
  (t) => ({
    requestIdUq: uniqueIndex('sponsored_events_request_id_uq').on(t.requestId),
    campaignIdx: index('sponsored_events_campaign_idx').on(
      t.campaignId,
      t.eventType,
      t.occurredAt,
    ),
  }),
);

export const sponsoredInvoices = sqliteTable(
  'sponsored_invoices',
  {
    id: text('id').primaryKey(),
    campaignId: text('campaign_id').notNull(),
    supplierId: text('supplier_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
    paidAt: integer('paid_at'),
  },
  (t) => ({
    supplierIdx: index('sponsored_invoices_supplier_idx').on(t.supplierId, t.status),
  }),
);