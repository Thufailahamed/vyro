// Buyer-side KYC for cross-border. Distinct from supplier KYC (existing kyc/service.ts).
// Cross-border buyers must complete KYC before checkout. Admin reviews documents.

import { getDb } from '@vyro/db';
import { businesses } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import { recordAudit } from '../supplierProducts/repository';
import type { Env } from '../../env';

export async function submitBuyerKyc(args: {
  env: Env;
  businessId: string;
  level: 'basic' | 'enhanced';
  documentUrls: string[];
  submittedBy: string;
}): Promise<void> {
  const db = getDb(args.env.DB);
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, args.businessId)).limit(1);
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');
  // Mark business pending review; queue admin notification (manual for v1).
  await db
    .update(businesses)
    .set({
      kycLevel: 'none',
      kycVerifiedAt: null,
      kycVerifiedBy: null,
      taxId: biz.taxId ?? null, // keep existing tax id; admin can review documents externally
    })
    .where(eq(businesses.id, args.businessId));
  await recordAudit(args.env.DB, {
    actorUserId: args.submittedBy,
    action: 'cross_border.buyer_kyc_submitted',
    resourceType: 'business',
    resourceId: args.businessId,
    metadata: { level: args.level, documentCount: args.documentUrls.length },
  });
}

export async function reviewBuyerKyc(args: {
  env: Env;
  businessId: string;
  decision: 'approve' | 'reject';
  level?: 'basic' | 'enhanced';
  adminUserId: string;
}): Promise<void> {
  const db = getDb(args.env.DB);
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, args.businessId)).limit(1);
  if (!biz) throw httpError(404, 'NOT_FOUND', 'Business not found');
  if (args.decision === 'approve') {
    await db
      .update(businesses)
      .set({
        kycLevel: args.level ?? 'basic',
        kycVerifiedAt: Date.now(),
        kycVerifiedBy: args.adminUserId,
      })
      .where(eq(businesses.id, args.businessId));
  } else {
    await db
      .update(businesses)
      .set({ kycLevel: 'none' })
      .where(eq(businesses.id, args.businessId));
  }
  await recordAudit(args.env.DB, {
    actorUserId: args.adminUserId,
    action: 'cross_border.buyer_kyc_reviewed',
    resourceType: 'business',
    resourceId: args.businessId,
    metadata: { decision: args.decision, level: args.level ?? null },
  });
}

export async function listPendingKycBusinesses(env: Env): Promise<unknown[]> {
  const db = getDb(env.DB);
  // Pending = has kycLevel='none' but countryCode != 'LK' (foreign buyer who started flow).
  // In v1 the submission path always writes kycLevel='none' and stamps kycVerifiedAt=null.
  // Admin surfaces this list via /api/admin/kyc/queue.
  return db
    .select()
    .from(businesses)
    .where(eq(businesses.kycLevel, 'none'))
    .all()
    .then((rows) => rows.filter((r) => r.countryCode !== 'LK'));
}