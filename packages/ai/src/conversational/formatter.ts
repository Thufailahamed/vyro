import type { OrderDraft, TrackingInfo } from './types';

export function formatWhatsAppDraftReply(params: {
  draft: OrderDraft;
  businessName: string;
  confirmUrl: string;
}): string {
  const { draft, businessName, confirmUrl } = params;
  const lines: string[] = [];

  lines.push(`🛒 *Order Draft Ready for ${businessName}*`);
  lines.push('');

  draft.items.forEach((it, i) => {
    const rateRs = (it.unitPriceCents / 100).toLocaleString();
    const totalRs = (it.totalCents / 100).toLocaleString();
    lines.push(
      `${i + 1}. *${it.productName}* x ${it.quantity} ${it.unit}\n   Rs. ${rateRs} / ${it.unit} → *Rs. ${totalRs}* (${it.supplierName})`,
    );
  });

  lines.push('');
  if (draft.deliveryDateEstimate) {
    lines.push(`🚚 *Est. Delivery:* ${draft.deliveryDateEstimate}`);
  }
  const grandTotalRs = (draft.totalCents / 100).toLocaleString();
  lines.push(`💰 *Total Order Value:* *Rs. ${grandTotalRs}*`);
  lines.push('');
  lines.push(`👉 *Tap to Confirm Order:*\n${confirmUrl}`);
  lines.push('');
  lines.push(`_Or reply with *CONFIRM* to place order immediately._`);

  return lines.join('\n');
}

export function formatWhatsAppTrackingReply(info: TrackingInfo): string {
  const totalRs = (info.totalCents / 100).toLocaleString();
  const lines: string[] = [];
  lines.push(`📦 *Order Status: ${info.poNumber}*`);
  lines.push(`Status: *${info.status.toUpperCase()}*`);
  lines.push(`Order Total: Rs. ${totalRs}`);
  if (info.driverName) lines.push(`🚚 Assigned Driver: ${info.driverName}`);
  if (info.deliveryAddress) lines.push(`📍 Dock: ${info.deliveryAddress}`);
  return lines.join('\n');
}

export function formatWhatsAppPriceReply(params: {
  product: string;
  priceCents: number;
  unit: string;
  supplierName: string;
}): string {
  const priceRs = (params.priceCents / 100).toLocaleString();
  return `💡 *Best Wholesale Rate*\n*${params.product}*: *Rs. ${priceRs}* per ${params.unit}\nDirect from *${params.supplierName}*.\n\nReply with your required quantity to place an order!`;
}
