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
      createdAt: now,
      updatedAt: now,
    });
    await insertOwnerSupplierMember(d1, newId(), id, userId, now);
    const existingKyc = await findKycByUser(d1, userId);
    if (!existingKyc) {
      await createKyc(d1, { id: newId(), userId, documentsJson: null, createdAt: now });
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
