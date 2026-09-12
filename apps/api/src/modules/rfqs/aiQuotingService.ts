import { eq, and } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { rfqs, rfqItems, supplierProducts, products, categories, auditLogs } from '@vyro/db/schema';
import {
  solveQuoteDraft,
  type AiQuoteDraft,
  type AiQuoteDraftRequest,
  type SolverCatalogOffer,
  type SolverInput,
  type SolverOutput,
} from '@vyro/ai';
import { providerForTask } from '../ai/provider';
import type { Env } from '../../env';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';

export function buildFallbackProposalNotes(params: {
  rfqTitle: string;
  deliveryDistrict?: string | null;
  itemCount: number;
  substitutesCount: number;
  strategy: string;
}): string {
  const districtStr = params.deliveryDistrict ? ` to ${params.deliveryDistrict}` : '';
  const subStr =
    params.substitutesCount > 0
      ? ` Note: We have included ${params.substitutesCount} high-quality alternative item(s) from our stock for your convenience.`
      : '';
  return `Thank you for the opportunity to quote on "${params.rfqTitle}". We are pleased to provide our wholesale pricing with prompt delivery${districtStr}.${subStr} All goods are sourced in compliance with Sri Lankan quality standards.`;
}

export function buildSummaryExplanation(solver: SolverOutput): string {
  const parts: string[] = [];
  parts.push(
    `Priced ${solver.items.length} line item(s) using '${solver.strategy}' strategy.`,
  );
  if (solver.matchedCount > 0) parts.push(`${solver.matchedCount} catalog match(es).`);
  if (solver.substitutesCount > 0)
    parts.push(`${solver.substitutesCount} substitute item(s) offered for low/depleted stock.`);
  if (solver.unmatchedCount > 0)
    parts.push(`${solver.unmatchedCount} item(s) require manual catalog pricing.`);
  return parts.join(' ');
}

export async function generateAiQuoteDraft(
  env: Env,
  rfqId: string,
  supplierId: string,
  options: AiQuoteDraftRequest,
): Promise<AiQuoteDraft> {
  const db = getDb(env.DB);

  // 1. Fetch RFQ
  const rfq = await db.select().from(rfqs).where(eq(rfqs.id, rfqId)).get();
  if (!rfq) throw httpError(404, 'NOT_FOUND', 'RFQ not found');
  if (rfq.status !== 'open' && rfq.status !== 'quoting' && rfq.status !== 'published') {
    throw httpError(400, 'VALIDATION_ERROR', `Cannot draft quote for RFQ in status '${rfq.status}'`);
  }

  // 2. Fetch RFQ items
  const items = await db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId)).all();
  if (items.length === 0) {
    throw httpError(400, 'VALIDATION_ERROR', 'RFQ contains no line items');
  }

  // 3. Fetch Supplier active catalog
  const catalogRows = await db
    .select({
      supplierProductId: supplierProducts.id,
      productId: supplierProducts.productId,
      name: products.name,
      category: categories.name,
      priceCents: supplierProducts.priceCents,
      availabilityStatus: supplierProducts.availabilityStatus,
      deliveryAvailable: supplierProducts.deliveryAvailable,
      minOrderQty: supplierProducts.minOrderQty,
    })
    .from(supplierProducts)
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.active, true)))
    .all();

  const catalogOffers: SolverCatalogOffer[] = catalogRows.map((r) => ({
    supplierProductId: r.supplierProductId,
    productId: r.productId,
    name: r.name,
    category: r.category,
    basePriceCents: r.priceCents,
    availabilityStatus: (r.availabilityStatus ?? 'in_stock') as 'in_stock' | 'low' | 'out_of_stock',
    deliveryAvailable: r.deliveryAvailable === true,
    minOrderQuantity: r.minOrderQty,
  }));

  // 4. Run Deterministic Solver
  const solverInput: SolverInput = {
    strategy: options.strategy,
    includeAlternatives: options.includeAlternatives,
    rfq: {
      id: rfq.id,
      rfqNumber: rfq.rfqNumber,
      title: rfq.title,
      deliveryDistrict: rfq.deliveryDistrict,
      deliveryCity: rfq.deliveryCity,
      paymentTermsRequested: rfq.paymentTerms,
    },
    rfqItems: items.map((i) => ({
      id: i.id,
      productId: i.productId,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      targetPriceCents: i.targetPriceCents,
      specifications: i.specifications,
    })),
    catalogOffers,
  };

  const solverOutput = solveQuoteDraft(solverInput);
  const summaryExplanation = buildSummaryExplanation(solverOutput);

  // 5. LLM Synthesis with circuit breaker fallback
  let notes = buildFallbackProposalNotes({
    rfqTitle: rfq.title,
    deliveryDistrict: rfq.deliveryDistrict,
    itemCount: solverOutput.items.length,
    substitutesCount: solverOutput.substitutesCount,
    strategy: options.strategy,
  });

  const startTime = Date.now();
  let llmProviderName = 'fallback';
  let tokensIn = 0;
  let tokensOut = 0;

  try {
    const aiProvider = providerForTask(env, 'narrate_complex');
    llmProviderName = aiProvider.name;

    const systemPrompt = `You are an expert wholesale trade account executive in Sri Lanka representing a wholesale supplier responding to a buyer RFQ. Draft a courteous, professional B2B quotation cover note (maximum 3-4 sentences). Mention delivery timelines and confirm wholesale stock readiness. If any substitute items were suggested, mention them politely. Return ONLY the drafted message text.`;

    const userContent = JSON.stringify({
      rfqTitle: rfq.title,
      buyerDistrict: rfq.deliveryDistrict,
      strategy: options.strategy,
      quotedItems: solverOutput.items.map((it) => ({
        description: it.description,
        isAlternative: it.isAlternative,
        notes: it.notes,
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

    if (chatRes.content && chatRes.content.trim().length > 10) {
      notes = chatRes.content.trim();
      tokensIn = chatRes.tokensIn ?? 0;
      tokensOut = chatRes.tokensOut ?? 0;
    }
  } catch (_e) {
    // Fallback notes preserved gracefully
  }

  // 6. Audit log
  try {
    await db.insert(auditLogs).values({
      id: newId(),
      action: 'ai.supplier.quote_draft',
      resourceType: 'supplier',
      resourceId: supplierId,
      metadata: JSON.stringify({
        rfqId,
        supplierId,
        strategy: options.strategy,
        itemCount: solverOutput.items.length,
        substitutesCount: solverOutput.substitutesCount,
        provider: llmProviderName,
        latencyMs: Date.now() - startTime,
        tokensIn,
        tokensOut,
      }),
      createdAt: Date.now(),
    });
  } catch (_e) {
    // non-fatal
  }

  return {
    deliveryFeeCents: solverOutput.deliveryFeeCents,
    validDays: solverOutput.validDays,
    paymentTerms: solverOutput.paymentTerms,
    notes,
    summaryExplanation,
    strategyUsed: options.strategy,
    items: solverOutput.items,
  };
}
