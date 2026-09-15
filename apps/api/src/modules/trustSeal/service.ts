import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers } from '@vyro/db/schema';
import { newId, isTrustSealed, memberSinceYear, TRUST_SEAL_PRICE_CENTS } from '@vyro/shared';
import { httpError } from '../../lib/errors';
import { trustSealRepository } from './repository';
import { resolveGateway } from '@vyro/payments';

async function loadSupplier(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  return db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
}

export const trustSealService = {
  _loadSupplier: loadSupplier,
  _loadSub: (d1: D1Database, sid: string) => trustSealRepository.getBySupplier(d1, sid),

  async getStatus(d1: D1Database, supplierId: string) {
    const sup = await (this as any)._loadSupplier(d1, supplierId);
    if (!sup) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
    const sub = await (this as any)._loadSub(d1, supplierId);
    const now = Date.now();
    const active = isTrustSealed(
      { verificationStatus: (sup as any).verificationStatus, status: (sup as any).status },
      sub ? { status: sub.status, expiresAt: sub.expiresAt } : null,
      now,
    );
    return {
      active,
      status: sub?.status ?? 'none',
      expiresAt: sub?.expiresAt ?? null,
      memberSinceYear: memberSinceYear(sub?.startedAt ?? null),
    };
  },

  async startCheckout(d1: D1Database, supplierId: string, env: any) {
    const sup: any = await (this as any)._loadSupplier(d1, supplierId);
    if (!sup) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
    if (sup.verificationStatus !== 'verified') throw httpError(403, 'FORBIDDEN', 'NEEDS_KYC: verify KYC before TrustSEAL');
    const paymentId = `ts_${newId()}`;
    await trustSealRepository.upsertPending(d1, supplierId, paymentId);
    const { adapter } = resolveGateway(env);
    const webOrigin = env?.WEB_ORIGIN ?? '';
    const notifyBase = env?.BETTER_AUTH_URL ?? env?.WEB_ORIGIN ?? '';
    const out = await adapter.startCheckout({
      paymentId,
      purchaseOrderId: paymentId,
      amountCents: TRUST_SEAL_PRICE_CENTS,
      currency: 'LKR',
      description: 'VYRO TrustSEAL annual verification (12 months)',
      returnUrl: `${webOrigin}/supplier/verification?trustseal=return`,
      cancelUrl: `${webOrigin}/supplier/verification?trustseal=cancelled`,
      notifyUrl: `${notifyBase}/api/payments/webhook/payhere`,
      businessName: sup.name ?? 'Supplier',
      businessEmail: sup.email ?? 'supplier@vyro.lk',
      businessPhone: sup.phone ?? '',
      supplierName: sup.name ?? 'Supplier',
    });
    return { redirectUrl: out.redirectUrl, subscriptionPaymentId: paymentId };
  },
};
