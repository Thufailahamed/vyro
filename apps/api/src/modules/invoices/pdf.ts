import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface InvoicePdfData {
  invoice: {
    number: string;
    type: 'receipt' | 'tax_invoice' | 'credit_note';
    currency: string;
    issuedAt: number;
    subtotalCents: number;
    vatCents: number;
    ssclCents: number;
    totalCents: number;
    supplierVatNo: string | null;
    buyerTaxId: string | null;
  };
  items: Array<{ description: string; quantity: number; unitCents: number; lineTotalCents: number }>;
  business: { name: string };
  supplier: { name: string };
  po: { poNumber: string };
}

const TITLES: Record<InvoicePdfData['invoice']['type'], string> = {
  receipt: 'RECEIPT',
  tax_invoice: 'TAX INVOICE',
  credit_note: 'CREDIT NOTE',
};

const amount = (cents: number) => (cents / 100).toFixed(2);

export async function renderInvoicePdf(data: InvoicePdfData): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let y = height - 50;

  const title = TITLES[data.invoice.type] || 'INVOICE';
  const titleWidth = fontBold.widthOfTextAtSize(title, 20);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y,
    size: 20,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 35;

  const lines = [
    `Invoice: ${data.invoice.number}`,
    `Issued: ${new Date(data.invoice.issuedAt).toISOString().slice(0, 10)}`,
    `PO: ${data.po.poNumber}`,
    `Currency: ${data.invoice.currency}`,
  ];
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 15;
  }
  y -= 10;

  const supplierLine = `Supplier: ${data.supplier.name}${data.invoice.supplierVatNo ? ` (VAT ${data.invoice.supplierVatNo})` : ''}`;
  const buyerLine = `Buyer: ${data.business.name}${data.invoice.buyerTaxId ? ` (Tax ID ${data.invoice.buyerTaxId})` : ''}`;
  page.drawText(supplierLine, { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 15;
  page.drawText(buyerLine, { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 25;

  page.drawText('Items', { x: 50, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
  y -= 18;

  for (const item of data.items) {
    const itemText = `${item.description}  qty:${item.quantity}  unit:${amount(item.unitCents)}  total:${amount(item.lineTotalCents)}`;
    page.drawText(itemText, { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
    y -= 15;
  }
  y -= 15;

  page.drawText(`Subtotal: ${amount(data.invoice.subtotalCents)}`, { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 15;
  page.drawText(`VAT: ${amount(data.invoice.vatCents)}`, { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 15;
  page.drawText(`SSCL: ${amount(data.invoice.ssclCents)}`, { x: 50, y, size: 10, font, color: rgb(0, 0, 0) });
  y -= 20;
  page.drawText(`Total: ${data.invoice.currency} ${amount(data.invoice.totalCents)}`, {
    x: 50,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  const pdfBytes = await doc.save();
  const copy = new Uint8Array(pdfBytes.byteLength);
  copy.set(pdfBytes);
  return copy.buffer as ArrayBuffer;
}
