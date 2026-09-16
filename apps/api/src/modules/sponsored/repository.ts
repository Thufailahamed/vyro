import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  sponsoredSlots,
  sponsoredPlans,
  sponsoredSubscriptions,
  sponsoredCampaigns,
  sponsoredEvents,
  sponsoredInvoices,
} from '@vyro/db/schema';

export type Surface = 'search' | 'category' | 'homepage' | 'storefront';
export type CampaignStatus =
  | 'pending_approval'
  | 'pending_payment'
  | 'approved'
  | 'live'
  | 'expired'
  | 'rejected'
  | 'revoked'
  | 'cancelled';
export type InvoiceStatus = 'pending' | 'paid' | 'waived';
export type EventType = 'impression' | 'click';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type SponsorTier = 'bronze' | 'silver' | 'gold';

export interface SlotRow {
  id: string;
  surface: Surface;
  position: number;
  categoryId: string | null;
  label: string;
  dailyRateCents: number;
  active: number;
  createdAt: number;
  updatedAt: number;
}

export interface PlanRow {
  id: string;
  tier: SponsorTier;
  name: string;
  monthlyRateCents: number;
  includedSlotCredits: number;
  active: number;
}

export interface SubscriptionRow {
  id: string;
  supplierId: string;
  planId: string;
  startsAt: number;
  endsAt: number;
  status: SubscriptionStatus;
  slotCreditsRemaining: number;
  createdAt: number;
}

export interface CampaignRow {
  id: string;
  supplierId: string;
  slotId: string;
  productId: string;
  startsAt: number;
  endsAt: number;
  status: CampaignStatus;
  paymentInvoiceId: string | null;
  adminNotes: string | null;
  pinned: number;
  createdAt: number;
  updatedAt: number;
}

export interface EventRow {
  id: string;
  campaignId: string;
  eventType: EventType;
  surface: Surface;
  occurredAt: number;
  requestId: string;
  userIdHash: string | null;
}

export interface InvoiceRow {
  id: string;
  campaignId: string;
  supplierId: string;
  amountCents: number;
  status: InvoiceStatus;
  createdAt: number;
  paidAt: number | null;
}

// ---------- Plans ----------

export async function listActivePlans(d1: D1Database): Promise<PlanRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredPlans)
    .where(eq(sponsoredPlans.active, 1))
    .all() as unknown as PlanRow[];
}

export async function listAllPlans(d1: D1Database): Promise<PlanRow[]> {
  const db = getDb(d1);
  return db.select().from(sponsoredPlans).all() as unknown as PlanRow[];
}

export async function getPlan(d1: D1Database, id: string): Promise<PlanRow | null> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredPlans).where(eq(sponsoredPlans.id, id)).get()) as
    | PlanRow
    | null;
}

export async function insertPlan(d1: D1Database, p: PlanRow): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredPlans).values(p);
}

export async function updatePlan(
  d1: D1Database,
  id: string,
  patch: Partial<Omit<PlanRow, 'id' | 'tier'>>,
): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredPlans).set(patch).where(eq(sponsoredPlans.id, id));
}

export async function deletePlan(d1: D1Database, id: string): Promise<void> {
  const db = getDb(d1);
  await db.delete(sponsoredPlans).where(eq(sponsoredPlans.id, id));
}

// ---------- Slots ----------

export async function listSlotsForSurface(
  d1: D1Database,
  surface: Surface,
  categoryId: string | null,
): Promise<SlotRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredSlots)
    .where(
      and(
        eq(sponsoredSlots.surface, surface),
        eq(sponsoredSlots.active, 1),
        categoryId === null
          ? eq(sponsoredSlots.categoryId, null as never)
          : eq(sponsoredSlots.categoryId, categoryId),
      ),
    )
    .orderBy(asc(sponsoredSlots.position))
    .all() as unknown as SlotRow[];
}

export async function listAllSlots(d1: D1Database): Promise<SlotRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredSlots)
    .orderBy(asc(sponsoredSlots.surface), asc(sponsoredSlots.position))
    .all() as unknown as SlotRow[];
}

export async function getSlot(d1: D1Database, id: string): Promise<SlotRow | null> {
  const db = getDb(d1);
  return (await db.select().from(sponsoredSlots).where(eq(sponsoredSlots.id, id)).get()) as
    | SlotRow
    | null;
}

export async function insertSlot(d1: D1Database, s: SlotRow): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredSlots).values(s);
}

export async function updateSlot(
  d1: D1Database,
  id: string,
  patch: Partial<Omit<SlotRow, 'id'>>,
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(sponsoredSlots)
    .set({ ...patch, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(sponsoredSlots.id, id));
}

export async function deleteSlot(d1: D1Database, id: string): Promise<void> {
  const db = getDb(d1);
  await db.delete(sponsoredSlots).where(eq(sponsoredSlots.id, id));
}

// ---------- Subscriptions ----------

export async function insertSubscription(d1: D1Database, s: SubscriptionRow): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredSubscriptions).values(s);
}

export async function getSubscription(
  d1: D1Database,
  id: string,
): Promise<SubscriptionRow | null> {
  const db = getDb(d1);
  return (
    (await db
      .select()
      .from(sponsoredSubscriptions)
      .where(eq(sponsoredSubscriptions.id, id))
      .get()) as SubscriptionRow | null
  );
}

export async function cancelSubscription(
  d1: D1Database,
  id: string,
  now: number,
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(sponsoredSubscriptions)
    .set({ status: 'cancelled', endsAt: now })
    .where(eq(sponsoredSubscriptions.id, id));
}

export async function listSubscriptionsBySupplier(
  d1: D1Database,
  supplierId: string,
  status?: SubscriptionStatus,
): Promise<SubscriptionRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredSubscriptions)
    .where(
      and(
        eq(sponsoredSubscriptions.supplierId, supplierId),
        status ? eq(sponsoredSubscriptions.status, status) : undefined,
      ),
    )
    .orderBy(asc(sponsoredSubscriptions.createdAt))
    .all() as unknown as SubscriptionRow[];
}

export async function getActiveSubscriptionBySupplier(
  d1: D1Database,
  supplierId: string,
): Promise<SubscriptionRow | null> {
  const db = getDb(d1);
  return (
    (await db
      .select()
      .from(sponsoredSubscriptions)
      .where(
        and(
          eq(sponsoredSubscriptions.supplierId, supplierId),
          eq(sponsoredSubscriptions.status, 'active'),
        ),
      )
      .get()) as SubscriptionRow | null
  );
}

// ---------- Campaigns ----------

export async function insertCampaign(d1: D1Database, c: CampaignRow): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredCampaigns).values(c);
}

export async function getCampaign(d1: D1Database, id: string): Promise<CampaignRow | null> {
  const db = getDb(d1);
  return (await db
    .select()
    .from(sponsoredCampaigns)
    .where(eq(sponsoredCampaigns.id, id))
    .get()) as CampaignRow | null;
}

export async function updateCampaignStatus(
  d1: D1Database,
  id: string,
  status: CampaignStatus,
  now: number,
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(sponsoredCampaigns)
    .set({ status, updatedAt: now })
    .where(eq(sponsoredCampaigns.id, id));
}

export async function updateCampaignDates(
  d1: D1Database,
  id: string,
  startsAt: number,
  endsAt: number,
  now: number,
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(sponsoredCampaigns)
    .set({ startsAt, endsAt, updatedAt: now })
    .where(eq(sponsoredCampaigns.id, id));
}

export async function setCampaignPinned(
  d1: D1Database,
  id: string,
  pinned: number,
): Promise<void> {
  const db = getDb(d1);
  await db.update(sponsoredCampaigns).set({ pinned }).where(eq(sponsoredCampaigns.id, id));
}

export async function setCampaignInvoice(
  d1: D1Database,
  id: string,
  invoiceId: string,
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(sponsoredCampaigns)
    .set({ paymentInvoiceId: invoiceId })
    .where(eq(sponsoredCampaigns.id, id));
}

export async function setCampaignAdminNotes(
  d1: D1Database,
  id: string,
  notes: string,
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(sponsoredCampaigns)
    .set({ adminNotes: notes })
    .where(eq(sponsoredCampaigns.id, id));
}

export async function listCampaignsBySupplier(
  d1: D1Database,
  supplierId: string,
  status?: CampaignStatus,
): Promise<CampaignRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredCampaigns)
    .where(
      and(
        eq(sponsoredCampaigns.supplierId, supplierId),
        status ? eq(sponsoredCampaigns.status, status) : undefined,
      ),
    )
    .orderBy(asc(sponsoredCampaigns.createdAt))
    .all() as unknown as CampaignRow[];
}

export async function listCampaignsByStatus(
  d1: D1Database,
  status: CampaignStatus,
): Promise<CampaignRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredCampaigns)
    .where(eq(sponsoredCampaigns.status, status))
    .all() as unknown as CampaignRow[];
}

export async function listAllCampaignsFiltered(
  d1: D1Database,
  opts: { status?: CampaignStatus; supplierId?: string; surface?: Surface },
): Promise<CampaignRow[]> {
  const db = getDb(d1);
  let whereExpr;
  if (opts.status) whereExpr = eq(sponsoredCampaigns.status, opts.status);
  if (opts.supplierId)
    whereExpr = whereExpr
      ? and(whereExpr, eq(sponsoredCampaigns.supplierId, opts.supplierId))
      : eq(sponsoredCampaigns.supplierId, opts.supplierId);
  if (opts.surface) {
    const slotIds = (
      await db
        .select({ id: sponsoredSlots.id })
        .from(sponsoredSlots)
        .where(eq(sponsoredSlots.surface, opts.surface))
        .all()
    ).map((r) => r.id);
    if (slotIds.length === 0) return [];
    whereExpr = whereExpr
      ? and(whereExpr, inArray(sponsoredCampaigns.slotId, slotIds))
      : inArray(sponsoredCampaigns.slotId, slotIds);
  }
  return db
    .select()
    .from(sponsoredCampaigns)
    .where(whereExpr)
    .orderBy(asc(sponsoredCampaigns.createdAt))
    .all() as unknown as CampaignRow[];
}

export async function findLiveCandidates(
  d1: D1Database,
  slotId: string,
  now: number,
): Promise<CampaignRow[]> {
  const db = getDb(d1);
  const rows = (await db
    .select()
    .from(sponsoredCampaigns)
    .where(
      and(
        eq(sponsoredCampaigns.slotId, slotId),
        inArray(sponsoredCampaigns.status, ['approved', 'live'] as unknown as string[]),
      ),
    )
    .orderBy(asc(sponsoredCampaigns.createdAt))
    .all()) as unknown as CampaignRow[];
  return rows.filter((r) => r.startsAt <= now && r.endsAt >= now);
}

// ---------- Events ----------

export async function insertEvent(d1: D1Database, e: EventRow): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredEvents).values(e);
}

export async function listEventsForCampaign(
  d1: D1Database,
  campaignId: string,
): Promise<EventRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredEvents)
    .where(eq(sponsoredEvents.campaignId, campaignId))
    .all() as unknown as EventRow[];
}

export async function deleteEventsOlderThan(d1: D1Database, cutoffSeconds: number): Promise<number> {
  const res = await d1
    .prepare('DELETE FROM sponsored_events WHERE occurred_at < ?')
    .bind(cutoffSeconds)
    .run();
  return res.meta?.changes ?? 0;
}

// ---------- Invoices ----------

export async function insertInvoice(d1: D1Database, inv: InvoiceRow): Promise<void> {
  const db = getDb(d1);
  await db.insert(sponsoredInvoices).values(inv);
}

export async function getInvoice(d1: D1Database, id: string): Promise<InvoiceRow | null> {
  const db = getDb(d1);
  return (await db
    .select()
    .from(sponsoredInvoices)
    .where(eq(sponsoredInvoices.id, id))
    .get()) as InvoiceRow | null;
}

export async function markInvoicePaid(
  d1: D1Database,
  id: string,
  paidAt: number,
): Promise<void> {
  const db = getDb(d1);
  await db
    .update(sponsoredInvoices)
    .set({ status: 'paid', paidAt })
    .where(eq(sponsoredInvoices.id, id));
}

export async function waiveInvoice(d1: D1Database, id: string): Promise<void> {
  const db = getDb(d1);
  await db
    .update(sponsoredInvoices)
    .set({ status: 'waived' })
    .where(eq(sponsoredInvoices.id, id));
}

export async function listInvoicesBySupplier(
  d1: D1Database,
  supplierId: string,
  status?: InvoiceStatus,
): Promise<InvoiceRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredInvoices)
    .where(
      and(
        eq(sponsoredInvoices.supplierId, supplierId),
        status ? eq(sponsoredInvoices.status, status) : undefined,
      ),
    )
    .orderBy(asc(sponsoredInvoices.createdAt))
    .all() as unknown as InvoiceRow[];
}

export async function listInvoicesByCampaign(
  d1: D1Database,
  campaignId: string,
): Promise<InvoiceRow[]> {
  const db = getDb(d1);
  return db
    .select()
    .from(sponsoredInvoices)
    .where(eq(sponsoredInvoices.campaignId, campaignId))
    .all() as unknown as InvoiceRow[];
}