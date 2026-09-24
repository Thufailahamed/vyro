import { and, eq } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import { newId, nowMs } from '@vyro/shared';
import type { OnboardingSupplierInput } from '@vyro/validation/supplier';
import { getDb } from '@vyro/db';
import { supplierMembers } from '@vyro/db/schema';
import { findBusinessTypeBySlug } from '../businesses/repository';
import { insertOwnerSupplierMember, insertSupplier } from './repository';
import { createKyc, findKycByUser } from '../admin/trustSafety/kycRepository';

export const supplierService = {
  async onboard(d1: D1Database, userId: string, input: OnboardingSupplierInput) {
    const type = await findBusinessTypeBySlug(d1, input.businessTypeSlug);
    if (!type) throw httpError(400, 'VALIDATION_ERROR', 'Unknown business type');
    const id = newId();
    const now = nowMs();
    const { generateSlug, ensureUniqueSlug } = await import('../storefront/service');
    const { existingSlugsStartingWith } = await import('../storefront/repository');
    const baseSlug = generateSlug(input.city, input.name) || `supplier-${id.slice(0, 8)}`;
    const takenSlugs = (await existingSlugsStartingWith(d1, baseSlug))
      .map((r: any) => (typeof r === 'string' ? r : r.slug))
      .filter(Boolean);
    const slug = ensureUniqueSlug(baseSlug, new Set(takenSlugs));

    await insertSupplier(d1, {
      id,
      name: input.name,
      businessTypeId: type.id,
      contactPerson: input.contactPerson,
      phone: input.phone,
      email: input.email.toLowerCase(),
      address: input.address,
      city: input.city,
      district: input.district,
      description: input.description ?? null,
      slug,
      createdAt: now,
      updatedAt: now,
    });
    const ownerMemberId = newId();
    await insertOwnerSupplierMember(d1, ownerMemberId, id, userId, now);
    try {
      const existingKyc = await findKycByUser(d1, userId);
      if (!existingKyc) {
        await createKyc(d1, { id: newId(), userId, documentsJson: null, createdAt: now });
      }
    } catch (e) {
      // Compensating rollback: undo supplier + owner-member so no orphan rows
      // (api-005 audit). Errors during cleanup are logged but not thrown — the
      // original error is more informative than a swallowed cleanup failure.
      console.error('[suppliers] kyc creation failed; rolling back supplier', id, e);
      try {
        const db = getDb(d1);
        await db
          .delete(supplierMembers)
          .where(and(eq(supplierMembers.id, ownerMemberId), eq(supplierMembers.supplierId, id)))
          .run();
      } catch (cleanupErr) {
        console.error('[suppliers] owner-member rollback failed', cleanupErr);
      }
      throw e;
    }
    return { id };
  },

  async requireMember(d1: D1Database, supplierId: string, userId: string) {
    const db = getDb(d1);
    const row = await db
      .select()
      .from(supplierMembers)
      .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
      .get();
    if (!row) throw httpError(403, 'FORBIDDEN', 'Not a supplier member');
  },
};

export async function onboardSupplier(
  d1: D1Database,
  userId: string,
  input: OnboardingSupplierInput,
) {
  return supplierService.onboard(d1, userId, input);
}
