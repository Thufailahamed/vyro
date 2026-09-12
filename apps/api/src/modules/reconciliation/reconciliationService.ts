import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  purchaseOrders,
  purchaseOrderItems,
  deliveries,
  invoiceUploads,
  invoiceLineItems,
  reconciliationExceptions,
  auditLogs,
} from '@vyro/db/schema';
import {
  matchThreeWayReconciliation,
  type InvoiceData,
  type MatcherInput,
  type ReconciliationClaimRequest,
  type ReconciliationRequest,
  type ThreeWayReconciliationResult,
} from '@vyro/ai';
import { providerForTask } from '../ai/provider';
import type { Env } from '../../env';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';

export function buildFallbackClaimNote(params: {
  poNumber: string;
  netDifferenceCents: number;
  discrepancyCount: number;
}): string {
  const diffRs = (params.netDifferenceCents / 100).toLocaleString();
  return `Regarding Purchase Order ${params.poNumber}: Our 3-way automated audit identified ${params.discrepancyCount} discrepancy(ies) totaling Rs. ${diffRs} above our approved rate. Please review the attached line item breakdown and provide an amended invoice or credit note.`;
}

export async function runThreeWayReconciliation(
  env: Env,
  orderId: string,
  options: ReconciliationRequest,
): Promise<ThreeWayReconciliationResult> {
  const db = getDb(env.DB);

  // 1. Load Purchase Order
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');

  // 2. Load PO Items
  const poItemsRows = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, orderId))
    .all();

  if (poItemsRows.length === 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'Purchase order has no line items');
  }

  // 3. Load Delivery Record
  const delivery = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.purchaseOrderId, orderId))
    .get();

  // 4. Resolve Invoice Data
  let invoiceData: InvoiceData | undefined = options.invoiceData;

  if (!invoiceData && options.invoiceUploadId) {
    const upload = await db
      .select()
      .from(invoiceUploads)
      .where(eq(invoiceUploads.id, options.invoiceUploadId))
      .get();
    if (!upload) throw httpError(404, 'NOT_FOUND', 'Invoice upload not found');

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.uploadId, upload.id))
      .all();

    if (lines.length > 0) {
      invoiceData = {
        invoiceNumber: upload.originalFilename,
        totalCents: upload.totalCents ?? lines.reduce((s, l) => s + (l.totalCents ?? 0), 0),
        items: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity ?? 1,
          unit: l.unit ?? undefined,
          unitPriceCents: l.unitPriceCents ?? 0,
          totalCents: l.totalCents ?? 0,
        })),
      };
    }
  }

  if (!invoiceData) {
    throw httpError(
      400,
      'VALIDATION_ERROR',
      'Provide either invoiceData or a valid invoiceUploadId with parsed line items',
    );
  }

  // 5. Run Pure Matcher
  const matcherInput: MatcherInput = {
    po: {
      id: po.id,
      poNumber: po.poNumber,
      subtotalCents: po.subtotalCents,
      totalCents: po.totalCents,
      deliveryFeeCents: po.deliveryFeeCents,
      status: po.status,
    },
    poItems: poItemsRows.map((r) => ({
      id: r.id,
      productNameSnapshot: r.productNameSnapshot,
      quantity: r.quantity,
      unitPriceCents: r.unitPriceCents,
      lineTotalCents: r.lineTotalCents,
    })),
    delivery: delivery
      ? {
          status: delivery.status,
          deliveredAt: delivery.deliveredAt,
          driverName: delivery.driverName,
        }
      : null,
    invoice: invoiceData,
  };

  const matchResult = matchThreeWayReconciliation(matcherInput);

  // 6. LLM Claim Note Drafter if discrepancy found
  const discrepancies = matchResult.lines.filter((l) => l.status !== 'matched');
  if (discrepancies.length > 0) {
    matchResult.draftClaimNote = buildFallbackClaimNote({
      poNumber: po.poNumber,
      netDifferenceCents: matchResult.netDifferenceCents,
      discrepancyCount: discrepancies.length,
    });

    try {
      const aiProvider = providerForTask(env, 'narrate_complex');
      const systemPrompt = `You are a corporate procurement manager in Sri Lanka. Draft a polite, professional, and clear 2-3 sentence claim note to a wholesale vendor requesting an amended invoice or credit note due to itemized price/quantity discrepancies. Return ONLY the drafted message.`;
      const userContent = JSON.stringify({
        poNumber: po.poNumber,
        netDifferenceCents: matchResult.netDifferenceCents,
        discrepancies: discrepancies.map((d) => ({
          item: d.description,
          status: d.status,
          reason: d.discrepancyReason,
          varianceCents: d.varianceCents,
        })),
      });

      const abortCtrl = new AbortController();
      const timeout = setTimeout(() => abortCtrl.abort(), 8000);
      const chatRes = await aiProvider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        { temperature: 0.3, maxTokens: 250, signal: abortCtrl.signal },
      );
      clearTimeout(timeout);

      if (chatRes.content && chatRes.content.trim().length > 15) {
        matchResult.draftClaimNote = chatRes.content.trim();
      }
    } catch (_e) {
      // Preserve fallback claim note
    }
  }

  // 7. Audit log
  try {
    await db.insert(auditLogs).values({
      id: newId(),
      action: 'ai.reconciliation.match',
      resourceType: 'order',
      resourceId: orderId,
      metadata: JSON.stringify({
        poNumber: po.poNumber,
        status: matchResult.status,
        poTotalCents: po.totalCents,
        invoiceTotalCents: invoiceData.totalCents,
        netDifferenceCents: matchResult.netDifferenceCents,
        discrepancyCount: discrepancies.length,
      }),
      createdAt: Date.now(),
    });
  } catch (_e) {
    // non-fatal
  }

  return matchResult;
}

export async function submitReconciliationClaim(
  env: Env,
  userId: string,
  orderId: string,
  data: ReconciliationClaimRequest,
): Promise<{ ok: boolean; exceptionId: string }> {
  const db = getDb(env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');

  const exceptionId = newId();
  await db.insert(reconciliationExceptions).values({
    id: exceptionId,
    kind: 'amount_mismatch',
    severity: Math.abs(data.discrepancyCents) > 500000 ? 'critical' : 'warning',
    entityType: 'order',
    entityId: orderId,
    expectedCents: po.totalCents,
    actualCents: po.totalCents + data.discrepancyCents,
    differenceCents: data.discrepancyCents,
    currency: po.currency,
    detail: JSON.stringify({
      claimMessage: data.claimMessage,
      affectedLineItems: data.affectedLineItems,
      submittedByUserId: userId,
    }),
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { ok: true, exceptionId };
}
