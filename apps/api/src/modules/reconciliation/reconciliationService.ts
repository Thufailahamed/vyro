import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  purchaseOrders,
  purchaseOrderItems,
  supplierProducts,
  products,
  deliveries,
  invoiceUploads,
  invoiceLineItems,
  reconciliationExceptions,
  auditLogs,
} from '@vyro/db/schema';
import {
  matchThreeWayReconciliation,
  normalizeInvoiceAlias,
  planDeterministicMatches,
  planInvoiceAliasMatches,
  type InvoiceData,
  type MatcherInput,
  type ReconciliationClaimRequest,
  type ReconciliationRequest,
  type ThreeWayReconciliationResult,
} from '@vyro/ai';
import { providerForTask } from '../ai/provider';
import { resolveUnmatchedInvoiceLines } from './aiLineMatcher';
import type { AiLineMatchStats } from './aiLineMatcher';
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
    .select({ item: purchaseOrderItems, productUnit: products.unit, productId: products.id })
    .from(purchaseOrderItems)
    .leftJoin(supplierProducts, eq(purchaseOrderItems.supplierProductId, supplierProducts.id))
    .leftJoin(products, eq(supplierProducts.productId, products.id))
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
  let invoiceUploadId: string | undefined;

  if (!invoiceData && options.invoiceUploadId) {
    const upload = await db
      .select()
      .from(invoiceUploads)
      .where(eq(invoiceUploads.id, options.invoiceUploadId))
      .get();
    if (!upload) throw httpError(404, 'NOT_FOUND', 'Invoice upload not found');
    if (upload.businessId !== po.businessId) {
      throw httpError(403, 'FORBIDDEN', 'Invoice upload does not belong to this buyer');
    }
    if (upload.purchaseOrderId && upload.purchaseOrderId !== po.id) {
      throw httpError(403, 'FORBIDDEN', 'Invoice upload is linked to a different purchase order');
    }
    // Same-business unlinked uploads remain available to the deterministic
    // matcher, but AI matching is reserved for uploads attached to this PO.
    if (upload.purchaseOrderId === po.id) invoiceUploadId = upload.id;

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
    poItems: poItemsRows.map(({ item: r, productUnit, productId }) => ({
      id: r.id,
      productNameSnapshot: r.productNameSnapshot,
      ...(productId ? { productId } : {}),
      ...(productUnit ? { unit: productUnit } : {}),
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

  let aiMatchStats: AiLineMatchStats = {
    attempted: false,
    appliedCount: 0,
    suggestionCount: 0,
  };
  let aliasMatchesApplied = 0;
  if (invoiceUploadId) {
    try {
      const { listInvoiceProductAliases } = await import('../documents/repository');
      const normalizedDescriptions = matcherInput.invoice.items
        .map((item) => normalizeInvoiceAlias(item.description))
        .filter((alias) => alias.length > 0);
      const aliases = await listInvoiceProductAliases(env, po.businessId, po.supplierId, normalizedDescriptions);
      const aliasOverrides = planInvoiceAliasMatches(matcherInput.poItems, matcherInput.invoice.items, aliases);
      matcherInput.aliasMatchOverrides = aliasOverrides;
      aliasMatchesApplied = aliasOverrides.length;
    } catch {
      matcherInput.aliasMatchOverrides = [];
      aliasMatchesApplied = 0;
    }
  }
  if (invoiceUploadId && env.VYRO_AI_RECONCILE_MATCHING === 'true') {
    const deterministicPlan = planDeterministicMatches(
      matcherInput.poItems,
      matcherInput.invoice.items,
      matcherInput.aliasMatchOverrides ?? [],
    );
    const aiMatches = await resolveUnmatchedInvoiceLines(
      env,
      matcherInput.poItems,
      matcherInput.invoice,
      deterministicPlan,
    );
    matcherInput.aiMatchOverrides = aiMatches.overrides;
    matcherInput.aiSuggestions = aiMatches.suggestions;
    aiMatchStats = aiMatches.stats;
  }

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
        aiMatchingAttempted: aiMatchStats.attempted,
        aiMatchingModel: aiMatchStats.model ?? null,
        aiMatchingLatencyMs: aiMatchStats.latencyMs ?? null,
        aiMatchesApplied: aiMatchStats.appliedCount,
        aiSuggestions: aiMatchStats.suggestionCount,
        aliasMatchesApplied,
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
