import { httpError } from '../../lib/errors';
import { newId, nowMs } from '@vyro/shared';
import type { OnboardingBusinessInput } from '@vyro/validation/business';
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
  await insertOwnerMember(d1, newId(), id, userId, now);
  return { id };
}
