import { httpError } from '../../lib/errors';
import { newId, nowMs } from '@vyro/shared';
import type { OnboardingSupplierInput } from '@vyro/validation/supplier';
import { findBusinessTypeBySlug } from '../businesses/repository';
import { insertOwnerSupplierMember, insertSupplier } from './repository';

export async function onboardSupplier(
  d1: D1Database,
  userId: string,
  input: OnboardingSupplierInput,
) {
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
  return { id };
}
