import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, products, supplierProducts } from '@vyro/db/schema';
import * as repo from './repository';
import { SponsoredError } from './errors';

const DAY_SECONDS = 86400;

export interface ResolvedSlot {
  slotId: string;
  surface: repo.Surface;
  position: number;
  campaignId: string | null;
  productId: string | null;
  supplierId: string | null;
  dailyRateCents: number;
  label: string;
}

function dailyHashInt(seed: string): number {
  const h = createHash('sha256').update(seed).digest();
  return h.readUInt32BE(0);
}

export async function resolveSlots(
  d1: D1Database,
  surface: repo.Surface,
  categoryId: string | null,
  now: number,
): Promise<ResolvedSlot[]> {
  const slots = await repo.listSlotsForSurface(d1, surface, categoryId);
  const dayBucket = Math.floor(now / DAY_SECONDS);
  const out: ResolvedSlot[] = [];
  for (const slot of slots) {
    const candidates = await repo.findLiveCandidates(d1, slot.id, now);
    let winner: repo.CampaignRow | null = null;
    if (candidates.length === 0) {
      // empty
    } else if (candidates.length === 1) {
      winner = candidates[0];
    } else {
      const pinned = candidates.find((c) => c.pinned === 1);
      if (pinned) {
        winner = pinned;
      } else {
        const ordered = [...candidates].sort((a, b) => a.createdAt - b.createdAt);
        const seed = ordered.map((c) => c.id).join('|') + ':' + dayBucket;
        const idx = dailyHashInt(seed) % ordered.length;
        winner = ordered[idx];
      }
    }
    out.push({
      slotId: slot.id,
      surface: slot.surface,
      position: slot.position,
      campaignId: winner?.id ?? null,
      productId: winner?.productId ?? null,
      supplierId: winner?.supplierId ?? null,
      dailyRateCents: slot.dailyRateCents,
      label: slot.label,
    });
  }
  return out;
}

export async function checkEligibility(
  d1: D1Database,
  supplierId: string,
  slotId: string,
): Promise<void> {
  const db = getDb(d1);
  const supplier = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!supplier) {
    throw new SponsoredError('NOT_ELIGIBLE', 'Supplier not found', { supplierId });
  }
  if ((supplier as { verificationStatus?: string }).verificationStatus !== 'verified') {
    throw new SponsoredError('NOT_ELIGIBLE', 'KYC verification required', {
      verificationStatus: (supplier as { verificationStatus?: string }).verificationStatus,
    });
  }
  // A "published product" = active product joined to a supplierProducts row for this supplier.
  const published = await db
    .select({ productId: supplierProducts.productId })
    .from(supplierProducts)
    .innerJoin(products, eq(products.id, supplierProducts.productId))
    .where(
      and(
        eq(supplierProducts.supplierId, supplierId),
        eq(products.active, true as never),
      ),
    )
    .all();
  if (published.length === 0) {
    throw new SponsoredError('NOT_ELIGIBLE', 'Supplier has no published products', { supplierId });
  }
  const slot = await repo.getSlot(d1, slotId);
  if (!slot || slot.active !== 1) {
    throw new SponsoredError('SLOT_UNAVAILABLE', 'Slot not available');
  }
}

export function computeInvoiceCents(opts: {
  dailyRateCents: number;
  startsAt: number;
  endsAt: number;
}): number {
  if (opts.endsAt <= opts.startsAt) {
    throw new SponsoredError('INVALID_DATE_RANGE', 'endsAt must be after startsAt');
  }
  const seconds = opts.endsAt - opts.startsAt;
  const days = Math.ceil(seconds / DAY_SECONDS);
  return days * opts.dailyRateCents;
}

export function proratedRefundCents(opts: {
  totalCents: number;
  startsAt: number;
  endsAt: number;
  now: number;
}): number {
  const totalSeconds = opts.endsAt - opts.startsAt;
  const elapsed = Math.max(0, Math.min(opts.now - opts.startsAt, totalSeconds));
  const remainingSeconds = totalSeconds - elapsed;
  const totalDays = Math.ceil(totalSeconds / DAY_SECONDS);
  const remainingDays = Math.ceil(remainingSeconds / DAY_SECONDS);
  return remainingDays * (opts.totalCents / totalDays);
}

export function campaignDays(startsAt: number, endsAt: number): number {
  return Math.ceil((endsAt - startsAt) / DAY_SECONDS);
}

export function newId(): string {
  return crypto.randomUUID();
}

// Disclosure content served by /api/sponsored/disclosure.
export const DISCLOSURE_BODY =
    'Sponsored placements are paid positions on Vyro. ' +
    'We label every sponsored placement with a "Sponsored" badge that links to this page. ' +
    'Pricing is a fixed daily rate per slot — there is no auction, no per-click billing, and no priority boost in organic search results. ' +
    'Suppliers must complete KYC verification and have at least one published product before they can buy a placement. ' +
    'Campaigns are reviewed by Vyro staff before going live. ' +
    'Vyro reserves the right to revoke a placement that violates marketplace rules.';
export const DISCLOSURE_VERSION = '1.0.0';
export const DISCLOSURE_TITLE = 'Sponsored content policy';
let _disclosureLastUpdated = Math.floor(Date.now() / 1000);
export function getDisclosure(): {
  version: string;
  title: string;
  body: string;
  lastUpdated: number;
} {
  return {
    version: DISCLOSURE_VERSION,
    title: DISCLOSURE_TITLE,
    body: DISCLOSURE_BODY,
    lastUpdated: _disclosureLastUpdated,
  };
}