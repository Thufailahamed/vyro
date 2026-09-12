import type {
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

export function matchThreeWayReconciliation(input: MatcherInput): ThreeWayReconciliationResult {
  const { po, poItems, delivery, invoice } = input;

  const isDeliveryConfirmed = delivery
    ? delivery.status === 'delivered' && delivery.deliveredAt != null
    : po.status === 'delivered' || po.status === 'completed';

  const lines: ReconciliationLine[] = [];
  const remainingPoItems: PoItemInput[] = [...poItems];
  let matchedCount = 0;
  let hasDiscrepancy = false;

  for (const invItem of invoice.items) {
    const invTokens = tokenize(invItem.description);
    let bestScore = 0;
    let bestPoIdx = -1;

    for (let i = 0; i < remainingPoItems.length; i++) {
      const poTokens = tokenize(remainingPoItems[i]!.productNameSnapshot);
      const score = jaccardSimilarity(invTokens, poTokens);
      if (score > bestScore) {
        bestScore = score;
        bestPoIdx = i;
      }
    }

    if (bestPoIdx >= 0 && bestScore >= 0.35) {
      const poItem = remainingPoItems[bestPoIdx]!;
      remainingPoItems.splice(bestPoIdx, 1);

      const qtyDiff = invItem.quantity - poItem.quantity;
      const priceDiff = invItem.unitPriceCents - poItem.unitPriceCents;
      const billedTotal = invItem.totalCents;
      const poTotal = poItem.lineTotalCents;
      const varianceCents = billedTotal - poTotal;

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
        });
      }
    } else {
      // Unexpected invoice item
      hasDiscrepancy = true;
      lines.push({
        description: invItem.description,
        billedQuantity: invItem.quantity,
        billedUnitPriceCents: invItem.unitPriceCents,
        billedTotalCents: invItem.totalCents,
        status: 'unexpected_item',
        varianceCents: invItem.totalCents,
        discrepancyReason: 'Line item present on invoice was not part of approved purchase order.',
      });
    }
  }

  // Check remaining PO items that were omitted from invoice
  for (const missingPo of remainingPoItems) {
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
