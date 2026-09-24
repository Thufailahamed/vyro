import { and, eq } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import { newId, nowMs } from '@vyro/shared';
import type { OnboardingBusinessInput } from '@vyro/validation/business';
import { getDb } from '@vyro/db';
import { businesses } from '@vyro/db/schema';
import {
  findBusinessTypeBySlug,
  insertBusiness,
  insertOwnerMember,
} from './repository';

export async function onboardBusiness(
  d1: D1Database,
  userId: string,
  input: OnboardingBusinessInput,
): Promise<{ id: string }> {
  const type = await findBusinessTypeBySlug(d1, input.businessTypeSlug);
  if (!type) throw httpError(400, 'VALIDATION_ERROR', 'Unknown business type');
  const id = newId();
  const now = nowMs();
  await insertBusiness(d1, {
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
  try {
    await insertOwnerMember(d1, newId(), id, userId, now);
  } catch (e) {
    // Compensating rollback: soft-delete the business row if the owner-member
    // insert throws (api-006 audit). Cleanup errors are logged, never thrown.
    console.error('[businesses] owner-member insert failed; rolling back business', id, e);
    try {
      const db = getDb(d1);
      await db
        .update(businesses)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(businesses.id, id))
        .run();
    } catch (cleanupErr) {
      console.error('[businesses] business soft-delete failed', cleanupErr);
    }
    throw e;
  }
  return { id };
}
