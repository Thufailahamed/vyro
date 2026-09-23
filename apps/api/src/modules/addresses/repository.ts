import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businessAddresses, type BusinessAddress } from '@vyro/db/schema';
import { newId } from '@vyro/shared';
import type { BusinessAddressCreate, BusinessAddressPatch } from '@vyro/validation/wholesale';

export async function listAddresses(d1: D1Database, businessId: string): Promise<BusinessAddress[]> {
  return getDb(d1)
    .select()
    .from(businessAddresses)
    .where(and(eq(businessAddresses.businessId, businessId), isNull(businessAddresses.deletedAt)))
    .orderBy(desc(businessAddresses.isDefault), asc(businessAddresses.label))
    .all();
}

export async function findAddress(
  d1: D1Database,
  businessId: string,
  id: string,
): Promise<BusinessAddress | null> {
  const row = await getDb(d1)
    .select()
    .from(businessAddresses)
    .where(
      and(
        eq(businessAddresses.id, id),
        eq(businessAddresses.businessId, businessId),
        isNull(businessAddresses.deletedAt),
      ),
    )
    .get();
  return row ?? null;
}

async function clearDefault(d1: D1Database, businessId: string, now: number): Promise<void> {
  await getDb(d1)
    .update(businessAddresses)
    .set({ isDefault: false, updatedAt: now })
    .where(and(eq(businessAddresses.businessId, businessId), eq(businessAddresses.isDefault, true)))
    .run();
}

export async function createAddress(
  d1: D1Database,
  businessId: string,
  input: BusinessAddressCreate,
): Promise<BusinessAddress> {
  const now = Date.now();
  const existing = await listAddresses(d1, businessId);
  // The first address a business saves becomes its default automatically.
  const isDefault = input.isDefault ?? existing.length === 0;
  if (isDefault) await clearDefault(d1, businessId, now);
  const row: BusinessAddress = {
    id: newId(),
    businessId,
    label: input.label,
    contactName: input.contactName ?? null,
    phone: input.phone ?? null,
    address: input.address,
    city: input.city,
    district: input.district,
    isDefault,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await getDb(d1).insert(businessAddresses).values(row).run();
  return row;
}

export async function updateAddress(
  d1: D1Database,
  current: BusinessAddress,
  patch: BusinessAddressPatch,
): Promise<BusinessAddress> {
  const now = Date.now();
  if (patch.isDefault === true && !current.isDefault) await clearDefault(d1, current.businessId, now);
  const next: BusinessAddress = {
    ...current,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    updatedAt: now,
  } as BusinessAddress;
  await getDb(d1)
    .update(businessAddresses)
    .set({
      label: next.label,
      contactName: next.contactName ?? null,
      phone: next.phone ?? null,
      address: next.address,
      city: next.city,
      district: next.district,
      isDefault: next.isDefault,
      updatedAt: now,
    })
    .where(eq(businessAddresses.id, current.id))
    .run();
  return next;
}

/** Soft delete; if the default is removed, the oldest remaining address takes over. */
export async function deleteAddress(d1: D1Database, current: BusinessAddress): Promise<void> {
  const now = Date.now();
  const db = getDb(d1);
  await db
    .update(businessAddresses)
    .set({ deletedAt: now, isDefault: false, updatedAt: now })
    .where(eq(businessAddresses.id, current.id))
    .run();
  if (current.isDefault) {
    const next = await db
      .select({ id: businessAddresses.id })
      .from(businessAddresses)
      .where(and(eq(businessAddresses.businessId, current.businessId), isNull(businessAddresses.deletedAt)))
      .orderBy(asc(businessAddresses.createdAt))
      .get();
    if (next) {
      await db.update(businessAddresses).set({ isDefault: true, updatedAt: now }).where(eq(businessAddresses.id, next.id)).run();
    }
  }
}

/**
 * Where a checkout ships: the requested saved address, else the business's
 * default saved address, else the address the business registered with.
 */
export async function resolveDeliveryAddress(
  d1: D1Database,
  business: { id: string; address: string; city: string; district: string; contactPerson: string; phone: string },
  addressId?: string,
): Promise<{
  addressId: string | null;
  address: string;
  city: string;
  district: string;
  contactName: string | null;
  phone: string | null;
} | null> {
  if (addressId) {
    const a = await findAddress(d1, business.id, addressId);
    if (!a) return null;
    return { addressId: a.id, address: a.address, city: a.city, district: a.district, contactName: a.contactName, phone: a.phone };
  }
  const all = await listAddresses(d1, business.id);
  const def = all.find((a) => a.isDefault);
  if (def) {
    return { addressId: def.id, address: def.address, city: def.city, district: def.district, contactName: def.contactName, phone: def.phone };
  }
  return {
    addressId: null,
    address: business.address,
    city: business.city,
    district: business.district,
    contactName: business.contactPerson,
    phone: business.phone,
  };
}
