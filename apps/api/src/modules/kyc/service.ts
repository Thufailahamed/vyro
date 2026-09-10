import { randomUUID } from 'crypto';
import { getDb } from '@vyro/db';
import { kycReviews, supplierSettings } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import type { SellerKycSubmitInput } from '@vyro/validation';
import { findMemberSupplier, findMyKyc } from './repository';
import { getKyc } from '../admin/trustSafety/kycRepository';

export async function getMy(d1: D1Database, userId: string) {
  const kyc = await findMyKyc(d1, userId);
  return { kyc };
}

export async function submit(d1: D1Database, userId: string, body: SellerKycSubmitInput) {
  const membership = await findMemberSupplier(d1, body.supplierId, userId);
  if (!membership) throw httpError(403, 'FORBIDDEN', 'Not a supplier member');
  const existing = await findMyKyc(d1, userId);
  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    throw httpError(409, 'KYC_NOT_PENDING', `KYC review is ${existing.status}`);
  }
  const db = getDb(d1);
  const now = Date.now();
  const snapshot = JSON.stringify({
    registrationNo: body.registrationNo ?? null,
    taxId: body.taxId ?? null,
    bankName: body.bankName ?? null,
    bankAccountNo: body.bankAccountNo ?? null,
    bankBranch: body.bankBranch ?? null,
    bankAccountHolder: body.bankAccountHolder ?? null,
    extra: body.documentsJson ?? null,
    supplierId: body.supplierId,
  });
  const current = await db
    .select()
    .from(supplierSettings)
    .where(eq(supplierSettings.supplierId, body.supplierId))
    .get();
  if (current) {
    await db
      .update(supplierSettings)
      .set({
        registrationNo: body.registrationNo ?? current.registrationNo,
        taxId: body.taxId ?? current.taxId,
        bankName: body.bankName ?? current.bankName,
        bankAccountNo: body.bankAccountNo ?? current.bankAccountNo,
        bankBranch: body.bankBranch ?? current.bankBranch,
        bankAccountHolder: body.bankAccountHolder ?? current.bankAccountHolder,
        updatedAt: now,
      })
      .where(eq(supplierSettings.supplierId, body.supplierId))
      .run();
  } else {
    await db
      .insert(supplierSettings)
      .values({
        supplierId: body.supplierId,
        companyName: null,
        registrationNo: body.registrationNo ?? null,
        taxId: body.taxId ?? null,
        contactEmail: null,
        contactPhone: null,
        warehouseAddress: null,
        warehouseCity: null,
        warehouseDistrict: null,
        warehouseLat: null,
        warehouseLng: null,
        defaultLeadTimeDays: null,
        payoutMethod: body.bankAccountNo ? 'bank' : null,
        bankName: body.bankName ?? null,
        bankAccountNo: body.bankAccountNo ?? null,
        bankBranch: body.bankBranch ?? null,
        bankAccountHolder: body.bankAccountHolder ?? null,
        bankVerified: false,
        notifyNewOrders: 1,
        notifyLowStock: 1,
        notifyPaymentReceived: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  if (existing && (existing.status === 'rejected' || existing.status === 'needs_more_info')) {
    await db
      .update(kycReviews)
      .set({ documentsJson: snapshot, status: 'pending', notes: null, reviewedBy: null, reviewedAt: null })
      .where(eq(kycReviews.id, existing.id))
      .run();
    return (await getKyc(d1, existing.id))!;
  }
  const id = randomUUID();
  await db
    .insert(kycReviews)
    .values({
      id,
      userId,
      status: 'pending',
      documentsJson: snapshot,
      notes: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
    })
    .run();
  return (await getKyc(d1, id))!;
}
