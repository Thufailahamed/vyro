import { NARRATE_SYSTEM } from '@vyro/ai';
import type { AIProvider } from './provider/types';
import type { HandlerResult } from './intents/catalog';

export interface NarrateContext {
  businessName: string;
}

export interface ToolSummary {
  name: string;
  ok: boolean;
  summary: string;
}

const MAX = 600;

function deterministic(c: NarrateContext, t: ToolSummary): string {
  const prefix = t.ok ? '' : 'Partial result: ';
  return `${prefix}${c.businessName}: ${t.name} ${t.ok ? 'completed' : 'failed'}. ${t.summary}`.slice(0, MAX);
}

/** Format integer cents as "Rs. 1,234.56". All math stays in backend code. */
export function formatLKR(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return `Rs. ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * summarizeResult: deterministic, grounded narration of a handler result.
 * Every number comes from the repository rows — the LLM is never asked to
 * compute or recall figures. Source attribution ("Based on N completed
 * purchase orders") is baked in so buyers can trust the answer.
 */
export function summarizeResult(intent: string, result: HandlerResult): string {
  const comp = result.components[0];
  const data = (comp?.data ?? {}) as Record<string, any>;
  const s = result.rawSummary as Record<string, any>;

  switch (intent) {
    case 'find_cheapest': {
      if (comp?.type === 'clarification_card') return String(data.question ?? 'Which product did you mean?');
      const saving = typeof s.savingVsHighestCents === 'number' && s.savingVsHighestCents > 0
        ? ` ${formatLKR(s.savingVsHighestCents)} cheaper than the priciest option.`
        : '';
      return (
        `${s.productName ?? 'That product'}: cheapest at ${s.bestSupplierName ?? 'a supplier'} ` +
        `for ${formatLKR(s.priceCents)} (${s.offerCount ?? 0} offers checked).${saving} ` +
        `Based on current supplier prices.`
      ).slice(0, MAX);
    }
    case 'compare_suppliers': {
      if (comp?.type === 'clarification_card') return String(data.question ?? 'Which product did you mean?');
      const rows: any[] = data.suppliers ?? [];
      const cheapest = rows[0];
      return (
        `Compared ${rows.length} suppliers for ${s.productName ?? data.title ?? 'that product'}. ` +
        (cheapest ? `Cheapest: ${cheapest.supplierName} at ${formatLKR(cheapest.priceCents)}. ` : '') +
        `Based on current live offers.`
      ).slice(0, MAX);
    }
    case 'supplier_recommend': {
      if (comp?.type === 'clarification_card') return String(data.question ?? 'Which product did you mean?');
      return (
        `Recommended: ${s.winnerName ?? 'a supplier'} for ${s.productName ?? 'that product'} ` +
        `at ${formatLKR(s.winnerPriceCents)}${s.focus && s.focus !== 'reliability' ? ` (optimized for ${s.focus})` : ''} ` +
        `from ${s.offerCount ?? 0} live offers. Based on current supplier prices and your recent purchasing history.`
      ).slice(0, MAX);
    }
    case 'spend_summary':
      return (
        `You spent ${formatLKR(s.totalCents)} across ${s.orderCount ?? 0} orders in the last ${s.period ?? 'month'}. ` +
        `Based on ${s.orderCount ?? 0} completed purchase orders.`
      ).slice(0, MAX);
    case 'product_spend':
      return (
        `You spent ${formatLKR(s.totalCents)} on ${s.productName ?? 'that product'} in the last ${s.period ?? 'month'}. ` +
        `Based on your completed purchase orders.`
      ).slice(0, MAX);
    case 'supplier_spend':
      return (
        `You spent ${formatLKR(s.totalCents)} with ${s.supplierName ?? 'that supplier'} in the last ${s.period ?? 'month'}. ` +
        `Based on your completed purchase orders.`
      ).slice(0, MAX);
    case 'savings': {
      const opps: any[] = data.opportunities ?? [];
      const top = opps[0];
      if (!top) return 'No savings opportunities found in your recent purchases. Based on your last 60 days of orders.';
      return (
        `Found ${opps.length} saving ${opps.length === 1 ? 'opportunity' : 'opportunities'}. ` +
        `Top pick: ${top.productName} via ${top.alternativeSupplierName} could save ${formatLKR(top.savingCents)} per unit. ` +
        `Estimated from price differences vs current offers.`
      ).slice(0, MAX);
    }
    case 'usual_order': {
      const lines: any[] = data.lines ?? [];
      return (
        lines.length
          ? `Your usual order has ${lines.length} lines, e.g. ${lines.slice(0, 3).map((l: any) => `${l.productName} (qty ${l.typicalQuantity})`).join(', ')}. Quantities averaged from your recent orders — edit before confirming.`
          : 'Not enough order history to build your usual order yet.'
      ).slice(0, MAX);
    }
    case 'reorder': {
      const lines: any[] = data.lines ?? [];
      return (
        lines.length
          ? `${lines.length} items look due for reorder, e.g. ${lines.slice(0, 3).map((l: any) => l.productName).join(', ')}. Based on days since your last purchase.`
          : 'Nothing looks due for reorder right now.'
      ).slice(0, MAX);
    }
    case 'price_changes': {
      const movers: any[] = data.movers ?? [];
      const top = movers[0];
      if (!top) return 'No significant price changes in the selected period.';
      return (
        `Largest mover: ${top.productName} ${top.pct >= 0 ? 'up' : 'down'} ${Math.abs(top.pct)}% ` +
        `(${formatLKR(top.from)} to ${formatLKR(top.to)}). Based on prices you paid across ${movers.length} products.`
      ).slice(0, MAX);
    }
    case 'delivery_estimate': {
      const rows: any[] = data.suppliers ?? [];
      const fastest = rows[0];
      if (!fastest) return String(data.question ?? 'No delivery options found.');
      return (
        `Fastest option: ${fastest.supplierName} (${fastest.leadTimeDays} day${fastest.leadTimeDays === 1 ? '' : 's'} lead). ` +
        `${rows.length} options compared. Confirm availability before ordering.`
      ).slice(0, MAX);
    }
    case 'search_products':
      return (
        s.count
          ? `Found ${s.count} matching products. Pick one to compare suppliers.`
          : 'No products matched. Try a different search term.'
      ).slice(0, MAX);
    default:
      return String(data.question ?? 'What do you need help with?').slice(0, MAX);
  }
}

export async function narrate(
  provider: AIProvider,
  ctx: NarrateContext,
  tool: ToolSummary,
): Promise<string> {
  try {
    const messages = [
      { role: 'system' as const, content: NARRATE_SYSTEM },
      { role: 'user' as const, content: `Business: ${ctx.businessName}\nTool: ${tool.name}\nResult JSON: ${tool.summary}` },
    ];
    const res = await provider.chat(messages, { temperature: 0.2 });
    return res.content.slice(0, MAX);
  } catch {
    return deterministic(ctx, tool);
  }
}
