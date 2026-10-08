import type {
  AliasMatchOverride,
  AiMatchOverride,
  AiMatchSuggestion,
  DeterministicMatchPlan,
  InvoiceItemData,
  MatcherInput,
  PoItemInput,
  ReconciliationLine,
  ThreeWayReconciliationResult,
} from './types';

function tokenize(str: string): Set<string> {
  const words = str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function planDeterministicMatches(
  poItems: PoItemInput[],
  invoiceItems: InvoiceItemData[],
  aliasMatchOverrides: AliasMatchOverride[] = [],
): DeterministicMatchPlan {
  const remainingPoItems = [...poItems];
  const matches: DeterministicMatchPlan['matches'] = [];
  const matchedIndexes = new Set<number>();
  const reservedPoItemIds = new Set<string>();

  // Buyer-confirmed aliases reserve their unique PO rows before Jaccard.
  for (const aliasMatch of aliasMatchOverrides) {
    const poItemIndex = remainingPoItems.findIndex((item) => item.id === aliasMatch.poItemId);
    if (
      aliasMatch.invoiceItemIndex < 0 ||
      aliasMatch.invoiceItemIndex >= invoiceItems.length ||
      matchedIndexes.has(aliasMatch.invoiceItemIndex) ||
      poItemIndex < 0 ||
      reservedPoItemIds.has(aliasMatch.poItemId)
    ) {
      continue;
    }
    remainingPoItems.splice(poItemIndex, 1);
    reservedPoItemIds.add(aliasMatch.poItemId);
    matchedIndexes.add(aliasMatch.invoiceItemIndex);
    matches.push({
      invoiceItemIndex: aliasMatch.invoiceItemIndex,
      poItemId: aliasMatch.poItemId,
      confidence: 1,
      source: 'alias',
      reason: aliasMatch.reason,
    });
  }

  for (let invoiceItemIndex = 0; invoiceItemIndex < invoiceItems.length; invoiceItemIndex++) {
    if (matchedIndexes.has(invoiceItemIndex)) continue;
    const invoiceItem = invoiceItems[invoiceItemIndex]!;
    const invoiceTokens = tokenize(invoiceItem.description);
    let bestScore = 0;
    let bestPoIndex = -1;

    for (let i = 0; i < remainingPoItems.length; i++) {
      const poTokens = tokenize(remainingPoItems[i]!.productNameSnapshot);
      const score = jaccardSimilarity(invoiceTokens, poTokens);
      if (score > bestScore) {
        bestScore = score;
        bestPoIndex = i;
      }
    }

    if (bestPoIndex >= 0 && bestScore >= 0.35) {
      const [poItem] = remainingPoItems.splice(bestPoIndex, 1);
      matches.push({
        invoiceItemIndex,
        poItemId: poItem!.id,
        confidence: bestScore,
        source: 'deterministic',
      });
      matchedIndexes.add(invoiceItemIndex);
    }
  }

  matches.sort((a, b) => a.invoiceItemIndex - b.invoiceItemIndex);
  return {
    matches,
    unmatchedInvoiceIndexes: invoiceItems.map((_, index) => index).filter((index) => !matchedIndexes.has(index)),
    remainingPoItemIds: remainingPoItems.map((item) => item.id),
  };
}

export function matchThreeWayReconciliation(input: MatcherInput): ThreeWayReconciliationResult {
  const { po, poItems, delivery, invoice } = input;

  const isDeliveryConfirmed = delivery
    ? delivery.status === 'delivered' && delivery.deliveredAt != null
    : po.status === 'delivered' || po.status === 'completed';

  const matchPlan = planDeterministicMatches(poItems, invoice.items, input.aliasMatchOverrides);
  const plannedByIndex = new Map(
    matchPlan.matches.map((match) => [match.invoiceItemIndex, match]),
  );
  const unresolvedInvoiceIndexes = new Set(matchPlan.unmatchedInvoiceIndexes);
  const deterministicRemainingPoIds = new Set(matchPlan.remainingPoItemIds);
  const overrideByIndex = new Map(
    (input.aiMatchOverrides ?? [])
      .filter(
        (override) =>
          unresolvedInvoiceIndexes.has(override.invoiceItemIndex) &&
          deterministicRemainingPoIds.has(override.poItemId),
      )
      .map((override) => [override.invoiceItemIndex, override]),
  );
  const suggestionByIndex = new Map(
    (input.aiSuggestions ?? [])
      .filter(
        (suggestion) =>
          unresolvedInvoiceIndexes.has(suggestion.invoiceItemIndex) &&
          deterministicRemainingPoIds.has(suggestion.poItemId),
      )
      .map((suggestion) => [suggestion.invoiceItemIndex, suggestion]),
  );
  const poItemById = new Map(poItems.map((item) => [item.id, item]));
  const usedPoItemIds = new Set<string>();
  const lines: ReconciliationLine[] = [];
  let matchedCount = 0;
  let hasDiscrepancy = false;

  for (let invoiceItemIndex = 0; invoiceItemIndex < invoice.items.length; invoiceItemIndex++) {
    const invItem = invoice.items[invoiceItemIndex]!;
    const override = overrideByIndex.get(invoiceItemIndex);
    const overrideItem = override ? poItemById.get(override.poItemId) : undefined;
    const planned = plannedByIndex.get(invoiceItemIndex);
    const plannedItem = planned ? poItemById.get(planned.poItemId) : undefined;

    // The API only generates AI overrides from deterministic leftovers; this
    // extra guard also makes the pure matcher safe for direct callers/tests.
    const poItem = overrideItem && !usedPoItemIds.has(overrideItem.id)
      ? overrideItem
      : plannedItem && !usedPoItemIds.has(plannedItem.id)
        ? plannedItem
        : undefined;
    const isAiMatch = Boolean(poItem && overrideItem === poItem && override);

    if (!poItem) {
      hasDiscrepancy = true;
      const suggestion = suggestionByIndex.get(invoiceItemIndex);
      lines.push({
        description: invItem.description,
        billedQuantity: invItem.quantity,
        billedUnitPriceCents: invItem.unitPriceCents,
        billedTotalCents: invItem.totalCents,
        status: 'unexpected_item',
        varianceCents: invItem.totalCents,
        discrepancyReason: 'Line item present on invoice was not part of approved purchase order.',
        ...(suggestion
          ? {
              aiSuggestion: {
                poItemId: suggestion.poItemId,
                productName: suggestion.productName,
                confidence: suggestion.confidence,
                reason: suggestion.reason,
              },
            }
          : {}),
      });
      continue;
    }

    usedPoItemIds.add(poItem.id);
    const qtyDiff = invItem.quantity - poItem.quantity;
    const priceDiff = invItem.unitPriceCents - poItem.unitPriceCents;
    const billedTotal = invItem.totalCents;
    const poTotal = poItem.lineTotalCents;
    const varianceCents = billedTotal - poTotal;
    const matchMetadata = isAiMatch
      ? {
          matchSource: 'ai' as const,
          matchConfidence: override!.confidence,
          matchExplanation: override!.reason,
        }
      : planned?.source === 'alias'
        ? {
            matchSource: 'alias' as const,
            matchConfidence: 1,
            matchExplanation: planned.reason ?? 'Previously confirmed supplier alias.',
          }
      : {
          matchSource: 'deterministic' as const,
          matchConfidence: planned?.confidence,
        };

    if (priceDiff > 0) {
      hasDiscrepancy = true;
      lines.push({
        poItemId: poItem.id,
        description: poItem.productNameSnapshot,
        poQuantity: poItem.quantity,
        billedQuantity: invItem.quantity,
        poUnitPriceCents: poItem.unitPriceCents,
        billedUnitPriceCents: invItem.unitPriceCents,
        poTotalCents: poTotal,
        billedTotalCents: billedTotal,
        status: 'price_variance',
        varianceCents,
        discrepancyReason: `Billed rate of Rs. ${(invItem.unitPriceCents / 100).toLocaleString()} exceeds agreed PO rate of Rs. ${(poItem.unitPriceCents / 100).toLocaleString()}.`,
        ...matchMetadata,
      });
    } else if (qtyDiff > 0) {
      hasDiscrepancy = true;
      lines.push({
        poItemId: poItem.id,
        description: poItem.productNameSnapshot,
        poQuantity: poItem.quantity,
        billedQuantity: invItem.quantity,
        poUnitPriceCents: poItem.unitPriceCents,
        billedUnitPriceCents: invItem.unitPriceCents,
        poTotalCents: poTotal,
        billedTotalCents: billedTotal,
        status: 'quantity_variance',
        varianceCents,
        discrepancyReason: `Billed for ${invItem.quantity} units, but PO authorized ${poItem.quantity} units.`,
        ...matchMetadata,
      });
    } else {
      matchedCount++;
      lines.push({
        poItemId: poItem.id,
        description: poItem.productNameSnapshot,
        poQuantity: poItem.quantity,
        billedQuantity: invItem.quantity,
        poUnitPriceCents: poItem.unitPriceCents,
        billedUnitPriceCents: invItem.unitPriceCents,
        poTotalCents: poTotal,
        billedTotalCents: billedTotal,
        status: 'matched',
        varianceCents: 0,
        ...matchMetadata,
      });
    }
  }

  // Check PO items not consumed by either a deterministic or AI match.
  for (const missingPo of poItems.filter((item) => !usedPoItemIds.has(item.id))) {
    hasDiscrepancy = true;
    lines.push({
      poItemId: missingPo.id,
      description: missingPo.productNameSnapshot,
      poQuantity: missingPo.quantity,
      poUnitPriceCents: missingPo.unitPriceCents,
      poTotalCents: missingPo.lineTotalCents,
      status: 'missing_item',
      varianceCents: -missingPo.lineTotalCents,
      discrepancyReason: 'Item authorized on PO was omitted from vendor invoice.',
    });
  }

  const netDifferenceCents = invoice.totalCents - po.totalCents;
  const variancePct = po.totalCents > 0 ? Math.abs(netDifferenceCents) / po.totalCents : 1;

  let status: ThreeWayReconciliationResult['status'] = 'perfect_match';
  let recommendedAction: ThreeWayReconciliationResult['recommendedAction'] = 'approve_payment';

  if (!isDeliveryConfirmed || variancePct > 0.15) {
    status = 'critical_mismatch';
    recommendedAction = 'file_claim';
  } else if (hasDiscrepancy || Math.abs(netDifferenceCents) > 0) {
    status = 'discrepancy_detected';
    recommendedAction = 'request_amendment';
  }

  const matchConfidence = lines.length > 0 ? Math.round((matchedCount / lines.length) * 100) / 100 : 1;

  let summary = '';
  if (status === 'perfect_match') {
    summary = `Verified 3-way match across ${lines.length} items. All prices, quantities, and delivery confirmations aligned with purchase order.`;
  } else if (status === 'discrepancy_detected') {
    summary = `Identified variance of Rs. ${(netDifferenceCents / 100).toLocaleString()} across ${lines.filter((l) => l.status !== 'matched').length} line item(s).`;
  } else {
    summary = !isDeliveryConfirmed
      ? `Critical check: goods have not been confirmed delivered at loading dock, but full invoice of Rs. ${(invoice.totalCents / 100).toLocaleString()} was presented.`
      : `Critical variance: invoice total differs by ${(variancePct * 100).toFixed(1)}% (Rs. ${(netDifferenceCents / 100).toLocaleString()}) from purchase order.`;
  }

  return {
    status,
    matchConfidence,
    poTotalCents: po.totalCents,
    invoiceTotalCents: invoice.totalCents,
    netDifferenceCents,
    isDeliveryConfirmed,
    summary,
    recommendedAction,
    lines,
  };
}
