// HTML invoice template — returns string. Inline CSS only (print-friendly).
// No external assets so it works in Workers + browser print.

import type { Invoice, InvoiceItem, Business, Supplier, PurchaseOrder } from '@vyro/db/schema';

interface RenderInput {
  invoice: Invoice;
  items: InvoiceItem[];
  business: Business;
  supplier: Supplier;
  po: PurchaseOrder;
  brandName: string;
}

export function renderInvoiceHtml(input: RenderInput): string {
  const { invoice, items, business, supplier, po, brandName } = input;
  const fmt = (cents: number) =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(cents / 100);
  const dateFmt = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
  const issued = dateFmt.format(new Date(invoice.issuedAt));
  const due = invoice.dueAt ? dateFmt.format(new Date(invoice.dueAt)) : '—';

  const itemRows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e5e5;">${escapeHtml(it.description)}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #e5e5e5;">${it.quantity}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #e5e5e5;">${fmt(it.unitCents)}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #e5e5e5;">${fmt(it.lineTotalCents)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(invoice.number)} — ${escapeHtml(brandName)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 32px; background: #fff; }
  .invoice { max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .meta { text-align: right; font-size: 13px; color: #444; }
  .meta strong { color: #111; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0; }
  .party h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #888; margin: 0 0 6px; }
  .party p { margin: 0; font-size: 13px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  th { background: #f5f5f4; text-align: left; padding: 10px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #555; }
  th.num { text-align: right; }
  .totals { width: 320px; margin-left: auto; font-size: 13px; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; }
  .totals .grand { border-top: 2px solid #111; margin-top: 6px; padding-top: 10px; font-weight: 700; font-size: 15px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <div>
      <div class="brand">${escapeHtml(brandName)}</div>
      <div style="font-size:13px;color:#555;margin-top:4px;">${invoice.type === 'tax_invoice' ? 'Tax Invoice' : 'Receipt'}</div>
    </div>
    <div class="meta">
      <div><strong>${escapeHtml(invoice.number)}</strong></div>
      <div>Issued: ${issued}</div>
      <div>Due: ${due}</div>
      <div>PO: ${escapeHtml(po.poNumber)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>From</h3>
      <p><strong>${escapeHtml(supplier.name)}</strong></p>
      <p>${escapeHtml(supplier.contactPerson ?? '')}</p>
      <p>${escapeHtml(supplier.email)}</p>
      <p>${escapeHtml(supplier.phone ?? '')}</p>
    </div>
    <div class="party">
      <h3>Billed to</h3>
      <p><strong>${escapeHtml(business.name)}</strong></p>
      <p>${escapeHtml(business.contactPerson)}</p>
      <p>${escapeHtml(business.address)}</p>
      <p>${escapeHtml(business.city)}, ${escapeHtml(business.district)}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows || '<tr><td colspan="4" style="padding:16px;color:#888;">No line items</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmt(invoice.subtotalCents)}</span></div>
    <div class="row"><span>Tax</span><span>${fmt(invoice.taxCents)}</span></div>
    <div class="row grand"><span>Total</span><span>${fmt(invoice.totalCents)} ${invoice.currency}</span></div>
  </div>

  <div class="footer">
    Generated electronically by ${escapeHtml(brandName)}. This is a valid ${invoice.type === 'tax_invoice' ? 'tax invoice' : 'payment receipt'}.
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
