import { purchaseOrders, fxSnapshots } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { httpError } from '../../lib/errors';
import * as fx from './fx';
const converter = fx;
import { logger } from '../../lib/logger';
import { metric } from '../../lib/metrics';
import { recordAudit } from '../supplierProducts/repository';
import { newId } from '@vyro/shared';
import type { Env } from '../../env';

export interface WireInstructions {
  poId: string;
  poNumber: string;
  paymentMethod: 'wire';
  /** Total due in LKR (the PO's settlement currency). */
  totalLkrCents: number;
  /** Optional FX-converted foreign-currency equivalents. */
  equivalents: Array<{ currency: string; amountCents: number; rateScaled: string; fetchedAt: number }>;
  /** Beneficiary block shown to buyer. */
  beneficiary: {
    name: string;
    address?: string;
    bankName: string;
    bankAddress?: string;
    accountNumber: string;
    swiftBic: string;
    iban?: string;
    intermediaryName?: string;
    intermediarySwift?: string;
    reference: string;
    memo: string;
  };
  /** Mark this PO as having initiated a wire — only allowed if cross-border. */
  initiatedAt: number;
}

/**
 * Builds wire payment instructions for a cross-border PO and stamps
 * `paymentMethod = 'wire'`, `paymentInitiatedAt`. Buyer must own the PO.
 *
 * Returns the supplier-facing instruction block; the buyer pays by card via
 * payments.lk in the response flow only when paymentMethod = 'payments_lk'.
 */
export async function buildWireInstructions(
  env: Env,
  args: { poId: string; businessId: string; userId: string },
): Promise<WireInstructions> {
  const db = getDb(env.DB);
  const [po] = await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, args.poId), eq(purchaseOrders.businessId, args.businessId)))
    .limit(1);
  if (!po) throw httpError(404, 'NOT_FOUND', 'Order not found');
  if (po.direction === 'domestic') {
    throw httpError(400, 'VALIDATION_ERROR', 'Wire instructions only apply to cross-border orders');
  }
  if (!env.VYRO_BANK_BENEFICIARY_NAME || !env.VYRO_BANK_SWIFT_BIC || !env.VYRO_BANK_ACCOUNT_NUMBER) {
    throw httpError(503, 'WIRE_INSTRUCTIONS_UNCONFIGURED' as never, 'Wire beneficiary not configured');
  }

  const now = Date.now();
  const prefix = env.VYRO_BANK_REFERENCE_PREFIX ?? 'VYRO';
  const reference = `${prefix}-${po.poNumber}`;
  const memo = `Payment for ${po.poNumber} — Vyro Wholesale`;

  // Compute equivalents for the 3 most common wire currencies.
  const targets = ['USD', 'EUR', 'GBP'] as const;
  const equivalents: WireInstructions['equivalents'] = [];
  if (po.fxSnapshotId) {
    const [snap] = await db
      .select()
      .from(fxSnapshots)
      .where(eq(fxSnapshots.id, po.fxSnapshotId))
      .limit(1);
    if (snap) {
      for (const quote of targets) {
        if (quote === snap.quoteCurrency) continue;
        const rate = await converter.getLiveRate('LKR', quote, env);
        if (rate) {
          const quoteCents = Math.round((po.totalCents * Number(rate)) / 1e8);
          equivalents.push({ currency: quote, amountCents: quoteCents, rateScaled: rate, fetchedAt: now });
        }
      }
    }
  }

  // Idempotent: re-initiating updates the timestamp.
  await db
    .update(purchaseOrders)
    .set({
      paymentMethod: 'wire',
      paymentInitiatedAt: now,
      paymentInitiatedByUserId: args.userId,
      updatedAt: now,
    })
    .where(eq(purchaseOrders.id, po.id));

  await recordAudit(env.DB, {
    actorUserId: args.userId,
    action: 'cross_border.wire_initiated',
    resourceType: 'purchase_order',
    resourceId: po.id,
    metadata: { poNumber: po.poNumber, totalLkrCents: po.totalCents, reference },
  });
  metric(env, 'cross_border.wire_initiated', 1, { direction: po.direction });

  logger.info('cross_border.wire_initiated', { poId: po.id, reference });

  const beneficiary: WireInstructions['beneficiary'] = {
    name: env.VYRO_BANK_BENEFICIARY_NAME,
    bankName: env.VYRO_BANK_NAME ?? '',
    accountNumber: env.VYRO_BANK_ACCOUNT_NUMBER,
    swiftBic: env.VYRO_BANK_SWIFT_BIC,
    reference,
    memo,
  };
  if (env.VYRO_BANK_BENEFICIARY_ADDRESS) beneficiary.address = env.VYRO_BANK_BENEFICIARY_ADDRESS;
  if (env.VYRO_BANK_ADDRESS) beneficiary.bankAddress = env.VYRO_BANK_ADDRESS;
  if (env.VYRO_BANK_IBAN) beneficiary.iban = env.VYRO_BANK_IBAN;
  if (env.VYRO_BANK_INTERMEDIARY_NAME) beneficiary.intermediaryName = env.VYRO_BANK_INTERMEDIARY_NAME;
  if (env.VYRO_BANK_INTERMEDIARY_SWIFT) beneficiary.intermediarySwift = env.VYRO_BANK_INTERMEDIARY_SWIFT;

  return {
    poId: po.id,
    poNumber: po.poNumber,
    paymentMethod: 'wire',
    totalLkrCents: po.totalCents,
    equivalents,
    beneficiary,
    initiatedAt: now,
  };
}

export function suggestReference(poNumber: string, prefix = 'VYRO'): string {
  return `${prefix}-${poNumber}`;
}

// Re-export for typecheck isolation. (Keep newId import alive even if unused
// after future refactors.)
export const _newIdRef = newId;
