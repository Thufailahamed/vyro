import { newId, nowMs } from '@vyro/shared';
import { getDb } from '@vyro/db';
import { users, businessTypes, businesses, businessMembers } from '@vyro/db/schema';

export async function seedBusinessType(d1: D1Database, slug = 'restaurant') {
  const db = getDb(d1);
  const id = newId();
  await db.insert(businessTypes).values({ id, slug, name: slug, active: true });
  return id;
}

export async function seedUser(d1: D1Database, email = 'a@x.example') {
  const db = getDb(d1);
  const id = newId();
  const now = nowMs();
  await db.insert(users).values({
    id,
    email,
    passwordHash: 'x',
    name: 'Test',
    phone: null,
    avatarUrl: null,
    isPlatformAdmin: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    emailVerifiedAt: null,
  });
  return id;
}

export async function seedBusinessWithOwner(
  d1: D1Database,
  userId: string,
  typeId: string,
) {
  const db = getDb(d1);
  const id = newId();
  const now = nowMs();
  await db.insert(businesses).values({
    id,
    name: 'Acme',
    businessTypeId: typeId,
    contactPerson: 'X',
    phone: '0771234567',
    email: 'b@x.example',
    address: '1 Main St',
    city: 'Colombo',
    district: 'Colombo',
    description: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await db.insert(businessMembers).values({
    id: newId(),
    businessId: id,
    userId,
    role: 'owner',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}
